/**
 * 微信支付结果回调 HTTP 云函数
 * 职责：
 *  - 接收微信支付异步通知
 *  - 验证签名
 *  - 解密 resource 字段
 *  - 更新订单和交易状态
 *  - 返回应答（确保幂等性）
 */
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const db = uniCloud.database()
const dbCmd = db.command
const createConfig = require('uni-config-center')

// ====== 配置加载 ======

let payConfigCache = null

// 使用 uni-config-center 加载配置
const payConfigCenter = createConfig({
  pluginId: 'pay'
})

function loadPayConfig() {
  if (payConfigCache) return payConfigCache
  try {
    // 使用 uni-config-center 的标准方式加载配置
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
    console.error('加载 wechat-pay.json 失败:', e)
    throw new Error('微信支付配置文件加载失败: ' + e.message)
  }
}

// ====== 平台证书加载 ======
// 注意：平台证书需要从微信商户平台下载，或通过 API 获取
// 证书获取方式：
//   1. 登录微信商户平台 → API安全 → 平台证书 → 下载证书（.pem 格式）
//   2. 将证书文件放到：uniCloud-aliyun/certs/wechatpay_platform/apiclient_cert.pem
//   3. 或者通过 API 动态获取（需要实现 getPlatformCert API 调用）
//
// 证书序列号需要与回调请求头中的 Wechatpay-Serial 匹配

let platformCertCache = null

function safeReadFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8')
    }
  } catch (e) {
    console.warn('读取证书文件失败:', filePath, e && e.message)
  }
  return null
}

function loadPlatformCertFromFile(serialNo) {
  // 优先使用缓存（如果序列号匹配）
  if (platformCertCache && platformCertCache.serialNo === serialNo) {
    return platformCertCache.cert
  }

  // 尝试从文件加载（兼容多个放置位置/文件名）
  const candidates = [
    // 推荐：项目根 uniCloud-aliyun/certs/wechatpay_platform/*.pem
    path.resolve(__dirname, '../../certs/wechatpay_platform/apiclient_cert.pem'),
    path.resolve(__dirname, '../../certs/wechatpay_platform/wechatpay_platform_cert.pem'),
    path.resolve(__dirname, '../../certs/wechatpay_platform_cert.pem'),
    // 兼容旧路径（曾写错层级）
    path.resolve(__dirname, '../certs/wechatpay_platform/apiclient_cert.pem')
  ]
  for (const p of candidates) {
    const cert = safeReadFile(p)
    if (cert) {
      platformCertCache = { serialNo, cert }
      console.log('已从文件加载平台证书，序列号:', serialNo, 'path:', p)
      return cert
    }
  }

  // 如果文件不存在，返回 null
  // TODO: 可以扩展为通过 API 动态获取证书
  // 参考：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay5_1.shtml
  console.warn('未找到平台证书文件（将尝试从微信侧拉取证书）')
  return null
}

// ====== 自动拉取平台证书（推荐：避免手动放 pem）======

let mchPrivateKeyCache = null

function loadMchPrivateKey() {
  if (mchPrivateKeyCache) return mchPrivateKeyCache
  const cfg = loadPayConfig()
  if (!cfg.private_key_path) {
    throw new Error('微信支付配置缺少 private_key_path')
  }
  // 相对路径，从云函数目录解析
  const keyPath = path.resolve(__dirname, cfg.private_key_path)
  if (!fs.existsSync(keyPath)) {
    throw new Error(`商户私钥文件不存在: ${keyPath}`)
  }
  mchPrivateKeyCache = fs.readFileSync(keyPath, 'utf8')
  return mchPrivateKeyCache
}

function buildAuthorizationHeaderForWechatpay({ method, url, body, mchid, serial_no }) {
  const cfg = loadPayConfig()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = crypto.randomBytes(16).toString('hex')
  const bodyString = body ? JSON.stringify(body) : ''

  const message = `${method}\n${url}\n${timestamp}\n${nonceStr}\n${bodyString}\n`
  const privateKey = loadMchPrivateKey()

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  sign.end()
  const signature = sign.sign(privateKey, 'base64')

  const serial = serial_no || cfg.serial_no
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serial}",signature="${signature}"`
  return { authorization, bodyString }
}

function decryptCertificate(resource, apiV3Key) {
  // resource: { associated_data, nonce, ciphertext }
  const { ciphertext, nonce, associated_data } = resource || {}
  if (!ciphertext || !nonce) throw new Error('证书解密字段缺失')

  const cipherBuffer = Buffer.from(ciphertext, 'base64')
  const nonceBuffer = Buffer.from(nonce, 'utf8')
  const keyBuffer = Buffer.from(apiV3Key, 'utf8')

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonceBuffer)
  if (associated_data) {
    decipher.setAAD(Buffer.from(associated_data, 'utf8'))
  }
  // 微信证书 ciphertext 末尾 16 bytes 为 authTag
  const authTag = cipherBuffer.slice(cipherBuffer.length - 16)
  const data = cipherBuffer.slice(0, cipherBuffer.length - 16)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(data, null, 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

async function fetchPlatformCertBySerial(serialNo) {
  const cfg = loadPayConfig()
  if (!cfg.mchid || !cfg.serial_no || !cfg.api_v3_key) {
    throw new Error('微信支付配置缺少 mchid/serial_no/api_v3_key')
  }

  const urlPath = '/v3/certificates'
  const { authorization } = buildAuthorizationHeaderForWechatpay({
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
        'User-Agent': 'uniCloud-wechat-pay-notify'
      },
      timeout: 8000
    }
  )

  if (wxRes.statusCode !== 200) {
    throw new Error('拉取平台证书失败: ' + (wxRes.data && (wxRes.data.message || wxRes.data.code) || wxRes.statusCode))
  }

  const list = (wxRes.data && wxRes.data.data) || []
  const item = list.find(x => x && x.serial_no === serialNo)
  if (!item) {
    throw new Error('未在微信侧证书列表中找到序列号: ' + serialNo)
  }
  const pem = decryptCertificate(item.encrypt_certificate, cfg.api_v3_key)
  platformCertCache = { serialNo, cert: pem }
  console.log('已从微信侧拉取并缓存平台证书，序列号:', serialNo)
  return pem
}

// ====== 签名验证 ======

async function verifySignature({
  signature,
  timestamp,
  nonce,
  body,
  serialNo
}) {
  const cfg = loadPayConfig()

  // 构建签名字符串
  const message = `${timestamp}\n${nonce}\n${body}\n`

  // 加载平台证书：先读文件；读不到则自动从微信侧拉取
  let platformCert = loadPlatformCertFromFile(serialNo)
  if (!platformCert) {
    try {
      platformCert = await fetchPlatformCertBySerial(serialNo)
    } catch (e) {
      console.error('平台证书获取失败，无法验签:', e && e.message)
      return false
    }
  }

  try {
    // 使用平台证书公钥验证签名
    const verify = crypto.createVerify('RSA-SHA256')
    verify.update(message)
    const isValid = verify.verify(platformCert, signature, 'base64')
    return isValid
  } catch (e) {
    console.error('签名验证过程出错:', e)
    return false
  }
}

// ====== AES-GCM 解密 ======

function decryptResource(resource, apiV3Key) {
  try {
    const { ciphertext, nonce, associated_data } = resource

    if (!ciphertext || !nonce) {
      throw new Error('resource 字段缺少 ciphertext/nonce')
    }

    // 微信支付回调：ciphertext 为 base64，末尾 16 bytes 为 authTag
    const cipherBuffer = Buffer.from(ciphertext, 'base64')
    const authTag = cipherBuffer.slice(cipherBuffer.length - 16)
    const data = cipherBuffer.slice(0, cipherBuffer.length - 16)

    // nonce / associated_data 为普通字符串（utf8）
    const nonceBuffer = Buffer.from(nonce, 'utf8')
    const keyBuffer = Buffer.from(apiV3Key, 'utf8')

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonceBuffer)
    if (associated_data) {
      decipher.setAAD(Buffer.from(associated_data, 'utf8'))
    }
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(data, null, 'utf8')
    decrypted += decipher.final('utf8')
    return JSON.parse(decrypted)
  } catch (e) {
    console.error('AES-GCM 解密失败:', e)
    throw new Error('解密失败: ' + e.message)
  }
}

// ====== 业务处理 ======

async function processPaymentNotification(decryptedData) {
  const { out_trade_no, transaction_id, trade_state, amount } = decryptedData

  if (!out_trade_no) {
    throw new Error('缺少 out_trade_no')
  }

  // 1. 查询交易记录
  const transRes = await db
    .collection('transactions')
    .where({
      out_trade_no: out_trade_no,
      channel: 'wechat'
    })
    .limit(1)
    .get()

  if (transRes.data.length === 0) {
    throw new Error(`未找到交易记录: ${out_trade_no}`)
  }

  const transaction = transRes.data[0]

  // 2. 检查是否已处理（幂等性）
  if (transaction.status === 'success') {
    console.log('交易已处理，跳过:', out_trade_no)
    return {
      success: true,
      message: '交易已处理',
      skipped: true
    }
  }

  // 3. 校验金额（分转元）
  const amountYuan = amount.total / 100
  if (Math.abs(transaction.amount - amountYuan) > 0.01) {
    throw new Error(
      `金额不一致: 本地=${transaction.amount}, 微信=${amountYuan}`
    )
  }

  // 4. 检查交易状态
  if (trade_state !== 'SUCCESS') {
    // 如果不是成功状态，只更新交易记录，不更新订单
    await db.collection('transactions').doc(transaction._id).update({
      status: 'failed',
      transaction_id: transaction_id || '',
      remark: `微信支付状态: ${trade_state}`,
      update_time: Date.now()
    })
    return {
      success: true,
      message: `交易状态: ${trade_state}`,
      tradeState: trade_state
    }
  }

  // 5. 更新交易记录
  await db.collection('transactions').doc(transaction._id).update({
    status: 'success',
    transaction_id: transaction_id,
    update_time: Date.now()
  })

  // 6. 更新订单状态
  if (transaction.order_id) {
    const orderRes = await db
      .collection('orders')
      .doc(transaction.order_id)
      .get()

    if (orderRes.data.length > 0) {
      const order = orderRes.data[0]
      const isAddon = order.order_class === 'urgent_addon'
      const nowTs = Date.now()
      const updateData = {
        pay_status: 'paid',
        pay_time: nowTs,
        hall_visible: isAddon ? false : true,
        update_time: nowTs
      }

      // 如果订单状态是 pending_pay，则更新为 pending_accept
      if (isAddon) {
        updateData.status = 'completed'
        updateData.complete_time = nowTs
      } else if (order.status === 'pending_pay') {
        updateData.status = 'pending_accept'
      }

      await db.collection('orders').doc(transaction.order_id).update(updateData)

      if (isAddon && order.parent_order_id) {
        await markParentOrderUrgent(order.parent_order_id, order)
      }
    }
  }

  return {
    success: true,
    message: '支付成功，订单已更新',
    outTradeNo: out_trade_no,
    transactionId: transaction_id
  }
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
    console.error('回调中更新加急状态失败:', e)
  }
}

// ====== 主函数 ======

exports.main = async (event, context) => {
  console.log('收到微信支付回调:', {
    method: event.method,
    path: event.path,
    headers: Object.keys(event.headers || {}),
    bodyLength: event.body ? event.body.length : 0,
    isBase64Encoded: event.isBase64Encoded
  })

  try {
    // 1. 处理请求体（可能是 base64 编码）
    let body = event.body
    if (event.isBase64Encoded) {
      body = Buffer.from(body, 'base64').toString('utf8')
    }

    if (!body) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'FAIL',
          message: '请求体为空'
        })
      }
    }

    // 2. 解析 JSON
    let callbackData
    try {
      callbackData = JSON.parse(body)
    } catch (e) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'FAIL',
          message: '请求体 JSON 解析失败: ' + e.message
        })
      }
    }

    // 3. 读取请求头
    const headers = event.headers || {}
    const signature = headers['wechatpay-signature'] || headers['Wechatpay-Signature']
    const timestamp = headers['wechatpay-timestamp'] || headers['Wechatpay-Timestamp']
    const nonce = headers['wechatpay-nonce'] || headers['Wechatpay-Nonce']
    const serialNo = headers['wechatpay-serial'] || headers['Wechatpay-Serial']

    if (!signature || !timestamp || !nonce || !serialNo) {
      console.error('缺少必要的签名头信息:', { signature: !!signature, timestamp: !!timestamp, nonce: !!nonce, serialNo: !!serialNo })
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'FAIL',
          message: '缺少必要的签名头信息'
        })
      }
    }

    // 4. 验证签名
    const isValid = await verifySignature({
      signature,
      timestamp,
      nonce,
      body,
      serialNo
    })

    if (!isValid) {
      console.error('签名验证失败')
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'FAIL',
          message: '签名验证失败'
        })
      }
    }

    // 5. 解密 resource 字段
    const cfg = loadPayConfig()
    if (!callbackData.resource) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'FAIL',
          message: '缺少 resource 字段'
        })
      }
    }

    let decryptedData
    try {
      decryptedData = decryptResource(callbackData.resource, cfg.api_v3_key)
    } catch (e) {
      console.error('解密失败:', e)
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: 'FAIL',
          message: '解密失败: ' + e.message
        })
      }
    }

    console.log('解密后的数据:', {
      out_trade_no: decryptedData.out_trade_no,
      trade_state: decryptedData.trade_state,
      transaction_id: decryptedData.transaction_id
    })

    // 6. 处理业务逻辑
    const result = await processPaymentNotification(decryptedData)

    // 7. 返回成功应答
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'SUCCESS',
        message: result.message || '成功'
      })
    }
  } catch (error) {
    // 错误处理：即使失败也返回 200，避免微信重复通知
    console.error('处理支付回调时出错:', error)
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'FAIL',
        message: error.message || '处理失败'
      })
    }
  }
}
