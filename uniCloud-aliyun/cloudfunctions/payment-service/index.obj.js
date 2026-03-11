/**
 * 微信支付云对象：payment-service
 * 职责：
 *  - createJsapiOrder：创建 JSAPI/小程序支付订单，返回 wx.requestPayment 所需参数
 *  - queryOrder：查询微信侧订单状态
 *  - closeOrder：关闭未支付订单（可选）
 *
 * 注意：
 *  - 商户配置从 uni-config-center 下的 wechat-pay.json 加载
 *  - 仅作为统一支付网关，不直接修改业务字段以外的逻辑
 */
'use strict'

const uniID = require('uni-id-common')
const db = uniCloud.database()
const dbCmd = db.command
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const createConfig = require('uni-config-center')

// ====== 工具函数 ======

function checkAuth(ctx) {
  if (!ctx || !ctx.uid) {
    return {
      code: 'NO_LOGIN',
      message: '请先登录'
    }
  }
  return { uid: ctx.uid }
}

let payConfigCache = null
let privateKeyCache = null

// 使用 uni-config-center 加载配置
const payConfigCenter = createConfig({
  pluginId: 'pay'
})

function loadPayConfig() {
  if (payConfigCache) return payConfigCache
  try {
    // 使用 uni-config-center 的标准方式加载配置
    // config() 不传参数会返回整个配置对象（对应 pay/wechat-pay.json 的内容）
    payConfigCache = payConfigCenter.config()
    
    // 如果配置为空，尝试直接读取文件（兼容旧方式）
    if (!payConfigCache || Object.keys(payConfigCache).length === 0) {
      const configPath = payConfigCenter.resolve('wechat-pay.json')
      console.log('尝试从路径加载配置:', configPath)
      if (fs.existsSync(configPath)) {
        const json = fs.readFileSync(configPath, 'utf8')
        payConfigCache = JSON.parse(json)
      } else {
        throw new Error('配置文件不存在: ' + configPath)
      }
    }
    
    console.log('加载的支付配置 private_key_path:', payConfigCache.private_key_path)
    return payConfigCache
  } catch (e) {
    console.error('加载 wechat-pay.json 失败:', e)
    throw new Error('微信支付配置文件加载失败，请检查路径和 JSON 格式: ' + e.message)
  }
}

function loadPrivateKey() {
  if (privateKeyCache) return privateKeyCache
  const cfg = loadPayConfig()
  if (!cfg.private_key_path) {
    throw new Error('微信支付配置缺少 private_key_path')
  }
  
  console.log('配置中的 private_key_path:', cfg.private_key_path)
  
  let keyPath
  // 如果是绝对路径（Windows: G:/ 或 C:/，Unix: /），说明配置错误
  if (cfg.private_key_path.startsWith('/') || /^[A-Za-z]:/.test(cfg.private_key_path)) {
    console.error('检测到绝对路径:', cfg.private_key_path)
    throw new Error('private_key_path 不能使用绝对路径，请使用相对路径（如：certs/apiclient_key.pem）')
  }
  
  // 相对路径，从云函数目录解析
  keyPath = path.resolve(__dirname, cfg.private_key_path)
  console.log('解析后的私钥路径:', keyPath)
  console.log('__dirname:', __dirname)
  
  try {
    if (!fs.existsSync(keyPath)) {
      console.error('私钥文件不存在，尝试的路径:', keyPath)
      throw new Error(`私钥文件不存在: ${keyPath}`)
    }
    privateKeyCache = fs.readFileSync(keyPath, 'utf8')
    console.log('成功加载私钥文件')
    return privateKeyCache
  } catch (e) {
    console.error('读取微信商户私钥失败:', e)
    console.error('尝试的路径:', keyPath)
    throw new Error('读取微信商户私钥失败，请检查 private_key_path 路径是否正确。提示：私钥文件需要放在云函数目录中，不能使用本地绝对路径。')
  }
}

function buildAuthorizationHeader({ method, url, body, mchid, serial_no }) {
  const cfg = loadPayConfig()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = crypto.randomBytes(16).toString('hex')
  const bodyString = body ? JSON.stringify(body) : ''

  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${bodyString}\n`

  const privateKey = loadPrivateKey()
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  sign.end()
  const signature = sign.sign(privateKey, 'base64')

  const serial = serial_no || cfg.serial_no

  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serial}",signature="${signature}"`

  return {
    authorization,
    timestamp,
    nonceStr,
    bodyString
  }
}

function buildOutTradeNo(mchid) {
  const now = Date.now()
  const rand = crypto.randomBytes(4).toString('hex')
  return `${mchid}${now}${rand}`
}

module.exports = {
  /**
   * 通用预处理器：校验登录、加载配置
   */
  async _before() {
    const clientInfo = this.getClientInfo()
    this.uniID = uniID.createInstance({
      clientInfo
    })

    const token = this.getUniIdToken()
    if (token) {
      try {
        const payload = await this.uniID.checkToken(token)
        if (payload.code === 0) {
          this.uid = payload.uid
          this.authInfo = payload
        } else {
          this.uid = null
          this.authInfo = null
        }
      } catch (e) {
        console.error('Token 验证失败:', e)
        this.uid = null
        this.authInfo = null
      }
    } else {
      this.uid = null
      this.authInfo = null
    }

    // 提前校验一次配置是否可用，避免每次调用时重复报错
    try {
      this.payConfig = loadPayConfig()
    } catch (e) {
      console.error(e)
      this.payConfigError = e.message
    }
  },

	/**
   * 创建 JSAPI/小程序支付订单
   * @param {Object} payload
   * @param {String} payload.orderId 业务订单ID（orders._id）
   */
  async createJsapiOrder(payload = {}) {
    const auth = checkAuth(this)
    if (auth.code) return auth
    const uid = auth.uid

    if (this.payConfigError) {
      return {
        code: 'PAY_CONFIG_ERROR',
        message: this.payConfigError
      }
    }

    const { orderId } = payload
    if (!orderId) {
      return {
        code: 'INVALID_PARAM',
        message: 'orderId 不能为空'
      }
    }

    const cfg = this.payConfig

    try {
      // 1. 查询订单
      const orderRes = await db.collection('orders').doc(orderId).get()
      if (!orderRes.data.length) {
        return {
          code: 'ORDER_NOT_FOUND',
          message: '订单不存在'
        }
      }
      const order = orderRes.data[0]

      if (order.user_id !== uid) {
        return {
          code: 'NO_PERMISSION',
          message: '无权支付此订单'
        }
      }

      const amountYuan = Number(order.price || 0)
      if (!amountYuan || amountYuan <= 0) {
        return {
          code: 'INVALID_AMOUNT',
          message: '订单金额不合法'
        }
      }

      // 2. 获取用户 openid（小程序端）
      const userRes = await db.collection('uni-id-users').doc(uid).get()
      if (!userRes.data.length) {
        return {
          code: 'USER_NOT_FOUND',
          message: '用户信息不存在'
        }
      }
      const user = userRes.data[0]
      const openid = user.wx_openid && user.wx_openid.mp
      if (!openid) {
        return {
          code: 'NO_WECHAT_OPENID',
          message: '当前账号未绑定微信小程序 openid，请使用微信登录后再尝试支付'
        }
      }

      // 3. 生成商户订单号
      const outTradeNo = order.out_trade_no || buildOutTradeNo(cfg.mchid)

      // 4. 写入/更新订单中的支付相关字段
      await db.collection('orders').doc(orderId).update({
        out_trade_no: outTradeNo,
        pay_type: 'wechat',
        pay_status: order.pay_status || 'unpaid'
      })

      // 5. 写入一条交易记录（pending）
      await db.collection('transactions').add({
        user_id: uid,
        type: 'pay',
        amount: amountYuan,
        balance_before: 0,
        balance_after: 0,
        order_id: orderId,
        status: 'pending',
        channel: 'wechat',
        out_trade_no: outTradeNo,
        remark: '微信小程序支付',
        create_time: Date.now()
      })

      // 6. 调用微信 JSAPI 下单接口
      const totalFee = Math.round(amountYuan * 100) // 元转分
      const body = {
        appid: cfg.appid,
        mchid: cfg.mchid,
        description: order.type_label || '校园跑腿订单',
        out_trade_no: outTradeNo,
        notify_url: cfg.notify_url,
        amount: {
          total: totalFee,
          currency: 'CNY'
        },
        payer: {
          openid
        }
      }

      const urlPath = '/v3/pay/transactions/jsapi'
      const { authorization, timestamp, nonceStr, bodyString } =
        buildAuthorizationHeader({
          method: 'POST',
          url: urlPath,
          body,
          mchid: cfg.mchid,
          serial_no: cfg.serial_no
        })

      let wxRes
      try {
        wxRes = await uniCloud.httpclient.request(
          'https://api.mch.weixin.qq.com' + urlPath,
          {
            method: 'POST',
            data: bodyString,
            dataType: 'json',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              Authorization: authorization,
              'User-Agent': 'uniCloud-payment-service'
            },
            timeout: 10000
          }
        )
      } catch (httpError) {
        console.error('调用微信支付 API 异常:', httpError)
        console.error('请求 URL:', 'https://api.mch.weixin.qq.com' + urlPath)
        console.error('请求体:', JSON.stringify(body, null, 2))
        return {
          code: 'HTTP_REQUEST_ERROR',
          message: `网络请求失败: ${httpError.message || '未知错误'}`,
          raw: httpError
        }
      }

      // 检查响应对象是否存在
      if (!wxRes) {
        console.error('微信支付 API 返回空响应')
        return {
          code: 'EMPTY_RESPONSE',
          message: '微信支付 API 返回空响应，请检查网络连接'
        }
      }

      // 检查状态码
      const statusCode = wxRes.statusCode || wxRes.status
      if (!statusCode) {
        console.error('微信支付 API 响应缺少状态码')
        console.error('完整响应对象:', JSON.stringify(wxRes, null, 2))
        return {
          code: 'INVALID_RESPONSE',
          message: '微信支付 API 响应格式异常，请稍后重试',
          raw: wxRes
        }
      }

      if (statusCode !== 200 && statusCode !== 201) {
        console.error('微信下单失败 - 状态码:', statusCode)
        console.error('微信下单失败 - 响应数据:', JSON.stringify(wxRes.data, null, 2))
        console.error('微信下单失败 - 请求体:', JSON.stringify(body, null, 2))
        return {
          code: 'WECHAT_PAY_ERROR',
          message:
            (wxRes.data && (wxRes.data.message || wxRes.data.code)) ||
            `微信下单失败 (状态码: ${statusCode})`,
          raw: wxRes.data
        }
      }

      const prepayId = wxRes.data && wxRes.data.prepay_id
      if (!prepayId) {
        console.error('微信下单成功但未返回 prepay_id:', wxRes.data)
        return {
          code: 'NO_PREPAY_ID',
          message: '未获取到微信预支付单号'
        }
      }

      // 7. 生成前端 wx.requestPayment 参数
      const payTimestamp = Math.floor(Date.now() / 1000).toString()
      const payNonceStr = crypto.randomBytes(16).toString('hex')
      const payPackage = `prepay_id=${prepayId}`
      const signMessage =
        cfg.appid + '\n' + payTimestamp + '\n' + payNonceStr + '\n' + payPackage + '\n'

      const privateKey = loadPrivateKey()
      const paySign = crypto
        .createSign('RSA-SHA256')
        .update(signMessage)
        .sign(privateKey, 'base64')

      return {
        code: 0,
        message: 'OK',
        data: {
          appId: cfg.appid,
          timeStamp: payTimestamp,
          nonceStr: payNonceStr,
          package: payPackage,
          signType: 'RSA',
          paySign,
          outTradeNo
        }
      }
    } catch (e) {
      console.error('createJsapiOrder 异常:', e)
      return {
        code: 'INTERNAL_ERROR',
        message: '创建微信支付订单失败：' + e.message
      }
    }
  },

  /**
   * 查询微信订单状态
   * @param {Object} payload
   * @param {String} payload.outTradeNo 商户订单号
   */
  async queryOrder(payload = {}) {
    const auth = checkAuth(this)
    if (auth.code) return auth

    if (this.payConfigError) {
      return {
        code: 'PAY_CONFIG_ERROR',
        message: this.payConfigError
      }
    }

    const { outTradeNo } = payload
    if (!outTradeNo) {
      return {
        code: 'INVALID_PARAM',
        message: 'outTradeNo 不能为空'
      }
    }

    const cfg = this.payConfig
    const urlPath =
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}` +
      `?mchid=${encodeURIComponent(cfg.mchid)}`

    try {
      const { authorization } = buildAuthorizationHeader({
        method: 'GET',
        url: urlPath,
        body: '',
        mchid: cfg.mchid,
        serial_no: cfg.serial_no
      })

      const wxRes = await uniCloud.httpclient.request(
        'https://api.mch.weixin.qq.com' + urlPath,
        {
          method: 'GET',
          dataType: 'json',
          headers: {
            Authorization: authorization,
            'User-Agent': 'uniCloud-payment-service'
          },
          timeout: 8000
        }
      )

      if (wxRes.statusCode !== 200) {
        console.error('查询微信订单失败:', wxRes.statusCode, wxRes.data)
        return {
          code: 'WECHAT_QUERY_ERROR',
          message:
            (wxRes.data && (wxRes.data.message || wxRes.data.code)) ||
            '查询微信订单失败',
          raw: wxRes.data
        }
      }

      return {
        code: 0,
        message: 'OK',
        data: wxRes.data
      }
    } catch (e) {
      console.error('queryOrder 异常:', e)
      return {
        code: 'INTERNAL_ERROR',
        message: '查询微信订单失败：' + e.message
      }
    }
  },

  /**
   * 关闭未支付订单（可选）
   * @param {Object} payload
   * @param {String} payload.outTradeNo 商户订单号
   */
  async closeOrder(payload = {}) {
    const auth = checkAuth(this)
    if (auth.code) return auth

    if (this.payConfigError) {
      return {
        code: 'PAY_CONFIG_ERROR',
        message: this.payConfigError
      }
    }

    const { outTradeNo } = payload
    if (!outTradeNo) {
      return {
        code: 'INVALID_PARAM',
        message: 'outTradeNo 不能为空'
      }
    }

    const cfg = this.payConfig
    const urlPath =
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`

    const body = {
      mchid: cfg.mchid
    }

    try {
      const { authorization, bodyString } = buildAuthorizationHeader({
        method: 'POST',
        url: urlPath,
        body,
        mchid: cfg.mchid,
        serial_no: cfg.serial_no
      })

      const wxRes = await uniCloud.httpclient.request(
        'https://api.mch.weixin.qq.com' + urlPath,
        {
          method: 'POST',
          data: bodyString,
          dataType: 'json',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: authorization,
            'User-Agent': 'uniCloud-payment-service'
          },
          timeout: 8000
        }
      )

      if (wxRes.statusCode !== 204) {
        console.error('关闭微信订单失败:', wxRes.statusCode, wxRes.data)
			return {
          code: 'WECHAT_CLOSE_ERROR',
          message:
            (wxRes.data && (wxRes.data.message || wxRes.data.code)) ||
            '关闭微信订单失败',
          raw: wxRes.data
			}
		}

      // 同步本地订单与交易记录状态
      await db.collection('orders').where({ out_trade_no: outTradeNo }).update({
        status: dbCmd.set('cancelled'),
        pay_status: 'unpaid'
      })

      await db
        .collection('transactions')
        .where({ out_trade_no: outTradeNo })
        .update({
          status: 'failed',
          remark: '微信订单已关闭'
        })

      return {
        code: 0,
        message: '订单已关闭'
      }
    } catch (e) {
      console.error('closeOrder 异常:', e)
		return {
        code: 'INTERNAL_ERROR',
        message: '关闭微信订单失败：' + e.message
      }
    }
  },

  /**
   * 退款接口（预留，暂未实现具体业务）
   */
  async refund() {
    return {
      code: 'NOT_IMPLEMENTED',
      message: '退款接口暂未实现，请后续根据业务需求补充'
		}
	}
}
