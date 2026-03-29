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
const securityKit = require('./security-kit')
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

const RATE_LIMIT_RULES = {
  createJsapiOrder: {
    ipRule: { limit: 20, windowSec: 60 },
    uidRule: { limit: 10, windowSec: 60 }
  },
  queryOrder: {
    ipRule: { limit: 120, windowSec: 60 },
    uidRule: { limit: 60, windowSec: 60 }
  },
  confirmPaid: {
    ipRule: { limit: 30, windowSec: 60 },
    uidRule: { limit: 15, windowSec: 60 }
  },
  refundOrder: {
    ipRule: { limit: 10, windowSec: 300 },
    uidRule: { limit: 5, windowSec: 300 }
  },
  closeOrder: {
    ipRule: { limit: 30, windowSec: 60 },
    uidRule: { limit: 20, windowSec: 60 }
  }
}

async function enforceRateLimit(ctx, apiName) {
  const rule = RATE_LIMIT_RULES[apiName]
  if (!rule) return null
  const hit = await securityKit.checkRateLimit({
    service: 'payment-service',
    api: apiName,
    ip: ctx.clientIP || '',
    uid: ctx.uid || '',
    ipRule: rule.ipRule,
    uidRule: rule.uidRule
  })
  if (hit.allowed) return null
  return securityKit.rateLimitedError({ requestId: ctx.requestId, retryAfterSec: hit.retryAfterSec || 1 })
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
      if (fs.existsSync(configPath)) {
        const json = fs.readFileSync(configPath, 'utf8')
        payConfigCache = JSON.parse(json)
      } else {
        throw new Error('配置文件不存在: ' + configPath)
      }
    }
    
    return payConfigCache
  } catch (e) {
    console.error('加载 wechat-pay.json 失败:', e && e.message)
    throw new Error('微信支付配置文件加载失败，请检查路径和 JSON 格式: ' + e.message)
  }
}

function loadPrivateKey() {
  if (privateKeyCache) return privateKeyCache
  const cfg = loadPayConfig()
  if (!cfg.private_key_path) {
    throw new Error('微信支付配置缺少 private_key_path')
  }
  
  let keyPath
  // 如果是绝对路径（Windows: G:/ 或 C:/，Unix: /），说明配置错误
  if (cfg.private_key_path.startsWith('/') || /^[A-Za-z]:/.test(cfg.private_key_path)) {
    throw new Error('private_key_path 不能使用绝对路径，请使用相对路径（如：certs/apiclient_key.pem）')
  }
  
  // 相对路径，从云函数目录解析
  keyPath = path.resolve(__dirname, cfg.private_key_path)
  
  try {
    if (!fs.existsSync(keyPath)) {
      throw new Error(`私钥文件不存在: ${keyPath}`)
    }
    privateKeyCache = fs.readFileSync(keyPath, 'utf8')
    return privateKeyCache
  } catch (e) {
    console.error('读取微信商户私钥失败:', e && e.message)
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

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatYMDByTs(ts = Date.now()) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

async function incDashboardMetrics({ ts = Date.now(), paidInc = 0, gmvInc = 0 } = {}) {
  if (!paidInc && !gmvInc) return
  const now = Date.now()
  const ymd = formatYMDByTs(ts)

  const dailyIncDoc = {
    update_time: now
  }
  if (paidInc) dailyIncDoc.paid_order_count = dbCmd.inc(paidInc)
  if (gmvInc) dailyIncDoc.gmv = dbCmd.inc(Number(gmvInc) || 0)

  try {
    const upRes = await db.collection('daily_stats').where({ stat_date: ymd }).update(dailyIncDoc)
    if (!upRes || !upRes.updated) {
      await db.collection('daily_stats').add({
        stat_date: ymd,
        order_count: 0,
        paid_order_count: Math.max(0, Number(paidInc || 0)),
        completed_order_count: 0,
        gmv: Number(gmvInc || 0),
        status_list: [],
        type_list: [],
        income_trend_7d: [],
        order_trend_7d: [],
        rider_rank_7d: [],
        hourly: [],
        update_time: now
      })
    }
  } catch (e) {
    console.warn('[payment-service] daily_stats inc failed:', e.message)
  }

  const totalIncDoc = {
    update_time: now
  }
  if (paidInc) totalIncDoc.total_paid_order_count = dbCmd.inc(paidInc)
  if (gmvInc) totalIncDoc.total_gmv = dbCmd.inc(Number(gmvInc) || 0)

  try {
    await db.collection('dashboard_counters').doc('orders').update(totalIncDoc)
  } catch (e) {
    try {
      await db.collection('dashboard_counters').add({
        _id: 'orders',
        total_order_count: 0,
        total_paid_order_count: Math.max(0, Number(paidInc || 0)),
        total_completed_order_count: 0,
        total_gmv: Number(gmvInc || 0),
        update_time: now
      })
    } catch (ee) {
      console.warn('[payment-service] dashboard_counters inc failed:', ee.message)
    }
  }
}

function buildOutRefundNo(prefix = 'RF') {
  const now = new Date()
  const yyyy = now.getFullYear()
  const MM = pad2(now.getMonth() + 1)
  const dd = pad2(now.getDate())
  const HH = pad2(now.getHours())
  const mm = pad2(now.getMinutes())
  const ss = pad2(now.getSeconds())
  const rand = crypto.randomBytes(4).toString('hex')
  return `${prefix}${yyyy}${MM}${dd}${HH}${mm}${ss}${rand}`
}

async function markParentOrderUrgent(parentOrderId, addonOrder = {}) {
  if (!parentOrderId) return
  try {
    const parentRes = await db.collection('orders').doc(parentOrderId).get()
    if (!parentRes.data.length) return
    const parent = parentRes.data[0]
    const now = Date.now()
    const tags = Array.isArray(parent.tags) ? parent.tags.filter(Boolean) : []
    if (!tags.includes('加急')) tags.push('加急')

    const updateData = {
      update_time: now,
      tags
    }
    updateData['content.isUrgent'] = true
    updateData['content.urgent_fee'] = Number(addonOrder.price || 0)
    updateData['content.urgent_paid'] = true
    updateData['content.urgent_paid_time'] = now
    if (addonOrder._id) {
      updateData['content.urgent_addon_id'] = addonOrder._id
    }

    await db.collection('orders').doc(parentOrderId).update(updateData)
  } catch (e) {
    console.error('更新主订单加急状态失败:', e)
  }
}

async function queryWechatOrderByOutTradeNo(outTradeNo, cfg) {
  const urlPath =
    `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}` +
    `?mchid=${encodeURIComponent(cfg.mchid)}`

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

  const statusCode = wxRes.statusCode || wxRes.status
  if (statusCode !== 200) {
    console.error('查询微信订单失败:', statusCode, wxRes.data)
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
}

module.exports = {
  /**
   * 通用预处理器：校验登录、加载配置
   */
  async _before() {
    const clientInfo = this.getClientInfo()
    this.clientIP = clientInfo.clientIP || ''
    this.requestId = securityKit.resolveRequestId({
      headers: (clientInfo && clientInfo.headers) || {},
      fallback: this.getUniCloudRequestId ? this.getUniCloudRequestId() : ''
    })
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
      console.error('[payment-service] pay config error:', e && e.message)
      this.payConfigError = e.message
    }

    this.logger = securityKit.createLogger({
      service: 'payment-service',
      uid: this.uid || '',
      ip: this.clientIP,
      requestId: this.requestId
    })
  },

  _after(error, result) {
    if (error) throw error
    return securityKit.withRequestId(result, this.requestId)
  },

	/**
   * 创建 JSAPI/小程序支付订单
   * @param {Object} payload
   * @param {String} payload.orderId 业务订单ID（orders._id）
   */
  async createJsapiOrder(payload = {}) {
    const limitErr = await enforceRateLimit(this, 'createJsapiOrder')
    if (limitErr) return limitErr
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

      if (order.pay_status === 'paid') {
        return {
          code: 'ORDER_ALREADY_PAID',
          message: '订单已支付，无需重复支付'
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

      // 4. 写入/更新订单中的支付相关字段（强制回到“待支付且不进大厅”，避免未支付先被抢）
      await db.collection('orders').doc(orderId).update({
        out_trade_no: outTradeNo,
        pay_method: 'wechat',
        pay_status: 'unpaid',
        status: 'pending_pay',
        hall_visible: false,
        update_time: Date.now()
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
        console.error('调用微信支付 API 异常:', httpError && httpError.message)
        return {
          code: 'HTTP_REQUEST_ERROR',
          message: `网络请求失败: ${httpError.message || '未知错误'}`,
          requestId: this.requestId
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
        return {
          code: 'INVALID_RESPONSE',
          message: '微信支付 API 响应格式异常，请稍后重试',
          raw: wxRes
        }
      }

      if (statusCode !== 200 && statusCode !== 201) {
        console.error('微信下单失败 - 状态码:', statusCode)
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
    const limitErr = await enforceRateLimit(this, 'queryOrder')
    if (limitErr) return limitErr
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

    try {
      const cfg = this.payConfig
      return await queryWechatOrderByOutTradeNo(outTradeNo, cfg)
    } catch (e) {
      console.error('queryOrder 异常:', e)
      return {
        code: 'INTERNAL_ERROR',
        message: '查询微信订单失败：' + e.message
      }
    }
  },

  /**
   * 支付成功后主动确认并推进订单状态（用于前端 requestPayment success 后的兜底）
   * @param {Object} payload
   * @param {String} payload.outTradeNo 商户订单号
   */
  async confirmPaid(payload = {}) {
    const limitErr = await enforceRateLimit(this, 'confirmPaid')
    if (limitErr) return limitErr
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
      return { code: 'INVALID_PARAM', message: 'outTradeNo 不能为空' }
    }

    // 1) 先向微信侧查询最终状态（防止前端误判）
    const q = await queryWechatOrderByOutTradeNo(outTradeNo, this.payConfig)
    if (q.code !== 0 || !q.data) {
      return { code: 'WECHAT_QUERY_ERROR', message: q.message || '查询支付状态失败' }
    }
    if (q.data.trade_state !== 'SUCCESS') {
      return { code: 'PAY_NOT_SUCCESS', message: '微信支付未成功' , data: { trade_state: q.data.trade_state } }
    }

    const orderRes = await db.collection('orders')
      .where({ out_trade_no: outTradeNo })
      .limit(1)
      .get()

    if (!orderRes.data.length) {
      return { code: 'ORDER_NOT_FOUND', message: '订单不存在或已被删除' }
    }

    const order = orderRes.data[0]
    const isAddon = order.order_class === 'urgent_addon'
    const now = Date.now()

    const updateData = {
      pay_status: 'paid',
      pay_time: now,
      update_time: now
    }

    if (isAddon) {
      updateData.status = 'completed'
      updateData.hall_visible = false
      updateData.complete_time = now
    } else {
      updateData.status = 'pending_accept'
      updateData.hall_visible = true
    }

    // 2) 原子推进订单：只允许从 unpaid -> paid
    const updateRes = await db.collection('orders')
      .where({
        _id: order._id,
        pay_status: 'unpaid'
      })
      .update(updateData)

    // 3) 同步交易记录：把 pending 的 pay 交易置为 success（幂等）
    await db.collection('transactions')
      .where({ out_trade_no: outTradeNo, channel: 'wechat', type: 'pay', status: 'pending' })
      .update({
        status: 'success',
        update_time: now
      })

    if (updateRes.updated === 0) {
      return { code: 'ORDER_ALREADY_UPDATED', message: '订单已更新或无需更新' }
    }

    if (!isAddon) {
      await incDashboardMetrics({ paidInc: 1, gmvInc: Number(order.price || 0) })
    }

    if (isAddon && order.parent_order_id) {
      await markParentOrderUrgent(order.parent_order_id, { _id: order._id, price: order.price })
    }

    return { code: 0, message: '订单支付状态已确认并更新' }
  },

  /**
   * 发起退款（原路退微信）
   * - 对应文档：POST /v3/refund/domestic/refunds
   * - 退款最终结果需要依赖“退款结果通知”或“查询退款”来确认
   *
   * @param {Object} payload
   * @param {String} payload.orderId 业务订单ID（orders._id）
   * @param {String} payload.reason 退款原因（可选）
   * @param {Number} payload.amount 退款金额（可选，不传默认全额）
   */
  async refundOrder(payload = {}) {
    const limitErr = await enforceRateLimit(this, 'refundOrder')
    if (limitErr) return limitErr
    // 兼容两种调用方式：
    // 1) 客户端直调：有登录态 this.uid
    // 2) 服务端内部调用（例如 order-service.cancelOrder）：通过 payload.userId 传入
    // 目的：避免服务端内部调用时出现“请先登录”
    const uid = this && this.uid ? this.uid : (payload.userId || '')
    if (!uid) {
      return { code: 'NO_LOGIN', message: '请先登录' }
    }

    if (this.payConfigError) {
      return { code: 'PAY_CONFIG_ERROR', message: this.payConfigError }
    }

    const { orderId, reason = '', amount } = payload
    if (!orderId) return { code: 'INVALID_PARAM', message: 'orderId 不能为空' }

    const cfg = this.payConfig

    // 1) 读取订单并校验归属/支付状态
    const orderRes = await db.collection('orders').doc(orderId).get()
    if (!orderRes.data || !orderRes.data.length) {
      return { code: 'ORDER_NOT_FOUND', message: '订单不存在' }
    }
    const order = orderRes.data[0]
    if (order.user_id !== uid) {
      return { code: 'NO_PERMISSION', message: '无权退款此订单' }
    }
    if (order.pay_status !== 'paid') {
      return { code: 'NOT_PAID', message: '订单未支付，无法退款' }
    }
    // 已退款成功则直接返回（幂等）
    if (order.refund_status === 'refunded_to_wechat') {
      return { code: 0, message: '已退款（幂等）' }
    }

    const totalYuan = Number(order.price || 0)
    const refundYuan = typeof amount === 'number' ? Number(amount) : totalYuan
    if (!totalYuan || totalYuan <= 0 || refundYuan <= 0 || refundYuan - totalYuan > 0.0001) {
      return { code: 'INVALID_AMOUNT', message: '退款金额不合法' }
    }

    const totalFen = Math.round(totalYuan * 100)
    const refundFen = Math.round(refundYuan * 100)

    // 优先用订单 out_trade_no；若缺失则从支付流水补（兼容老数据/异常写入）
    let outTradeNo = order.out_trade_no
    if (!outTradeNo) {
      const payTx = await db.collection('transactions')
        .where({
          user_id: uid,
          type: 'pay',
          channel: 'wechat',
          status: 'success',
          order_id: orderId
        })
        .orderBy('create_time', 'desc')
        .limit(1)
        .get()
      if (payTx.data && payTx.data.length && payTx.data[0].out_trade_no) {
        outTradeNo = payTx.data[0].out_trade_no
        // 把 out_trade_no 回写到订单，后续逻辑更稳定
        await db.collection('orders').doc(orderId).update({
          out_trade_no: outTradeNo,
          pay_method: 'wechat',
          update_time: Date.now()
        })
      }
    }
    if (!outTradeNo) {
      return { code: 'MISSING_OUT_TRADE_NO', message: '订单缺少 out_trade_no，无法发起微信退款（请检查支付下单是否写入 out_trade_no）' }
    }

    // 2) 幂等：同一订单若已有“微信退款处理中/成功”的流水，复用 out_refund_no
    const existedRefund = await db.collection('transactions')
      .where({
        user_id: uid,
        type: 'refund',
        channel: 'wechat',
        order_id: orderId,
        status: dbCmd.in(['pending', 'success'])
      })
      .orderBy('create_time', 'desc')
      .limit(1)
      .get()

    const outRefundNo = (existedRefund.data && existedRefund.data[0] && existedRefund.data[0].out_refund_no)
      ? existedRefund.data[0].out_refund_no
      : buildOutRefundNo('RF')

    const now = Date.now()

    // 3) 写入/更新本地退款流水（pending）
    if (!existedRefund.data || !existedRefund.data.length) {
      await db.collection('transactions').add({
        user_id: uid,
        type: 'refund',
        amount: refundYuan,
        balance_before: 0,
        balance_after: 0,
        order_id: orderId,
        status: 'pending',
        channel: 'wechat',
        out_trade_no: outTradeNo,
        out_refund_no: outRefundNo,
        remark: reason ? `微信原路退款：${reason}` : '微信原路退款',
        create_time: now,
        update_time: now
      })
    }

    // 4) 更新订单退款状态为“退款中”
    await db.collection('orders').doc(orderId).update({
      refund_status: 'refunding_wechat',
      refund_time: now,
      update_time: now
    })

    // 5) 调用微信退款申请接口
    const body = {
      out_trade_no: outTradeNo,
      out_refund_no: outRefundNo,
      reason: (reason || '').slice(0, 80),
      amount: {
        refund: refundFen,
        total: totalFen,
        currency: 'CNY'
      }
    }

    // 服务商(Partner)模式：若配置了 sub_mchid，则按文档传入
    if (cfg.sub_mchid) {
      body.sub_mchid = cfg.sub_mchid
    }
    // 可选：自定义退款回调地址
    if (cfg.refund_notify_url) {
      body.notify_url = cfg.refund_notify_url
    }

    const urlPath = '/v3/refund/domestic/refunds'
    const { authorization, bodyString } = buildAuthorizationHeader({
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
            Accept: 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: authorization,
            'User-Agent': 'uniCloud-payment-service'
          },
          timeout: 10000
        }
      )
    } catch (e) {
      console.error('微信退款申请请求异常:', e)
      return { code: 'HTTP_REQUEST_ERROR', message: '微信退款申请失败：' + (e.message || '网络错误') }
    }

    const statusCode = wxRes.statusCode || wxRes.status
    if (statusCode !== 200) {
      console.error('微信退款申请失败:', statusCode, wxRes.data)
      // 标记流水失败（不改变幂等 out_refund_no，便于重试复用）
      await db.collection('transactions')
        .where({ user_id: uid, type: 'refund', channel: 'wechat', out_refund_no: outRefundNo })
        .update({ status: 'failed', remark: '微信退款申请失败', update_time: Date.now() })
      await db.collection('orders').doc(orderId).update({
        refund_status: 'refund_failed',
        refund_time: Date.now(),
        update_time: Date.now()
      })
      return {
        code: 'WECHAT_REFUND_ERROR',
        message: (wxRes.data && (wxRes.data.message || wxRes.data.code)) || '微信退款申请失败',
        raw: wxRes.data
      }
    }

    // 退款申请受理成功：返回 out_refund_no，最终结果等通知/查询
    const data = wxRes.data || {}
    await db.collection('transactions')
      .where({ user_id: uid, type: 'refund', channel: 'wechat', out_refund_no: outRefundNo })
      .update({
        refund_id: data.refund_id || '',
        update_time: Date.now()
      })

    return {
      code: 0,
      message: '退款已受理，请等待退款结果通知',
      data: {
        out_refund_no: outRefundNo,
        refund_id: data.refund_id || '',
        status: data.status || ''
      }
    }
  },

  /**
   * 关闭未支付订单（可选）
   * @param {Object} payload
   * @param {String} payload.outTradeNo 商户订单号
   */
  async closeOrder(payload = {}) {
    const limitErr = await enforceRateLimit(this, 'closeOrder')
    if (limitErr) return limitErr
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
