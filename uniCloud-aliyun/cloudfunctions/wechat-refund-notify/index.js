/**
 * 微信退款结果通知 HTTP 云函数
 * 文档：退款结果通知（服务商/Partner）
 * - 验签（平台证书，支持自动拉取）
 * - 解密 resource
 * - 幂等更新本地退款流水 transactions(type='refund', channel='wechat')
 * - 更新订单 orders.refund_status/refund_time
 */
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const securityKit = require('./security-kit')
const db = uniCloud.database()
const createConfig = require('uni-config-center')

// ====== 配置加载 ======
let payConfigCache = null
const payConfigCenter = createConfig({ pluginId: 'pay' })

function loadPayConfig() {
  if (payConfigCache) return payConfigCache
  payConfigCache = payConfigCenter.config()
  if (!payConfigCache || Object.keys(payConfigCache).length === 0) {
    const configPath = payConfigCenter.resolve('wechat-pay.json')
    const json = fs.readFileSync(configPath, 'utf8')
    payConfigCache = JSON.parse(json)
  }
  return payConfigCache
}

// ====== 商户私钥（用于拉取平台证书）=====
let mchPrivateKeyCache = null
function loadMchPrivateKey() {
  if (mchPrivateKeyCache) return mchPrivateKeyCache
  const cfg = loadPayConfig()
  if (!cfg.private_key_path) throw new Error('微信支付配置缺少 private_key_path')
  const keyPath = path.resolve(__dirname, cfg.private_key_path)
  if (!fs.existsSync(keyPath)) throw new Error(`商户私钥文件不存在: ${keyPath}`)
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

function decryptAESGCM({ ciphertext, nonce, associated_data }, apiV3Key) {
  if (!ciphertext || !nonce) throw new Error('resource 字段缺少 ciphertext/nonce')
  const cipherBuffer = Buffer.from(ciphertext, 'base64')
  const authTag = cipherBuffer.slice(cipherBuffer.length - 16)
  const data = cipherBuffer.slice(0, cipherBuffer.length - 16)
  const nonceBuffer = Buffer.from(nonce, 'utf8')
  const keyBuffer = Buffer.from(apiV3Key, 'utf8')
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonceBuffer)
  if (associated_data) decipher.setAAD(Buffer.from(associated_data, 'utf8'))
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(data, null, 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// ====== 平台证书（验签）=====
let platformCertCache = null

function safeReadFile(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
  } catch (e) {}
  return null
}

function loadPlatformCertFromFile(serialNo) {
  if (platformCertCache && platformCertCache.serialNo === serialNo) return platformCertCache.cert
  const candidates = [
    path.resolve(__dirname, '../../certs/wechatpay_platform/apiclient_cert.pem'),
    path.resolve(__dirname, '../../certs/wechatpay_platform/wechatpay_platform_cert.pem'),
    path.resolve(__dirname, '../../certs/wechatpay_platform_cert.pem')
  ]
  for (const p of candidates) {
    const cert = safeReadFile(p)
    if (cert) {
      platformCertCache = { serialNo, cert }
      return cert
    }
  }
  return null
}

function decryptCertificate(resource, apiV3Key) {
  return decryptAESGCM(resource, apiV3Key)
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
      headers: { Authorization: authorization, 'User-Agent': 'uniCloud-wechat-refund-notify' },
      timeout: 8000
    }
  )

  if (wxRes.statusCode !== 200) {
    throw new Error('拉取平台证书失败')
  }

  const list = (wxRes.data && wxRes.data.data) || []
  const item = list.find(x => x && x.serial_no === serialNo)
  if (!item) throw new Error('未找到平台证书序列号: ' + serialNo)
  const pem = decryptCertificate(item.encrypt_certificate, cfg.api_v3_key)
  platformCertCache = { serialNo, cert: pem }
  return pem
}

async function verifySignature({ signature, timestamp, nonce, body, serialNo }) {
  const message = `${timestamp}\n${nonce}\n${body}\n`
  let platformCert = loadPlatformCertFromFile(serialNo)
  if (!platformCert) {
    platformCert = await fetchPlatformCertBySerial(serialNo)
  }
  const verify = crypto.createVerify('RSA-SHA256')
  verify.update(message)
  return verify.verify(platformCert, signature, 'base64')
}

// ====== 业务处理：退款结果 ======
async function processRefundNotification(decryptedData) {
  const {
    out_refund_no,
    refund_status,
    refund_id,
    out_trade_no,
    transaction_id,
    success_time
  } = decryptedData || {}

  if (!out_refund_no) throw new Error('缺少 out_refund_no')

  // 1) 查本地退款流水（幂等）
  const txRes = await db.collection('transactions')
    .where({ type: 'refund', channel: 'wechat', out_refund_no })
    .limit(1)
    .get()

  if (!txRes.data || !txRes.data.length) {
    // 没找到也返回成功，避免微信反复通知，但记录日志便于排查
    console.warn('未找到本地退款流水:', out_refund_no)
    return { message: '未找到本地退款流水，已忽略' }
  }

  const tx = txRes.data[0]
  if (tx.status === 'success' && refund_status === 'SUCCESS') {
    return { message: '已处理，跳过（幂等）' }
  }

  const now = Date.now()
  const isSuccess = refund_status === 'SUCCESS'
  const isFail = refund_status === 'CLOSED' || refund_status === 'ABNORMAL'

  await db.collection('transactions').doc(tx._id).update({
    status: isSuccess ? 'success' : (isFail ? 'failed' : 'pending'),
    refund_id: refund_id || tx.refund_id || '',
    out_trade_no: out_trade_no || tx.out_trade_no || '',
    transaction_id: transaction_id || tx.transaction_id || '',
    remark: `微信退款结果：${refund_status}`,
    update_time: now
  })

  // 2) 更新订单退款状态
  if (tx.order_id) {
    await db.collection('orders').doc(tx.order_id).update({
      refund_status: isSuccess ? 'refunded_to_wechat' : (isFail ? 'refund_failed' : 'refunding_wechat'),
      refund_time: success_time ? Date.parse(success_time) : now,
      update_time: now
    })
  }

  return { message: '退款结果已处理' }
}

exports.main = async (event, context) => {
  const requestId = securityKit.resolveRequestId({
    headers: event.headers || {},
    fallback: (context && (context.requestId || context.request_id)) || ''
  })
  const ip = (event && event.requestContext && event.requestContext.sourceIp) ||
    (event && event.headers && (event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For'])) || ''
  const logger = securityKit.createLogger({
    service: 'wechat-refund-notify',
    api: 'notify',
    ip,
    requestId
  })
  const response = (code, message) => ({
    statusCode: 200,
    body: JSON.stringify({ code, message, requestId })
  })

  try {
    const rate = await securityKit.checkRateLimit({
      service: 'wechat-refund-notify',
      api: 'notify',
      ip,
      uid: '',
      ipRule: { limit: 600, windowSec: 60 }
    })
    if (!rate.allowed) {
      logger.warn({ event: 'rate_limited', retryAfter: rate.retryAfterSec || 1 })
      return response('RATE_LIMITED', '请求过于频繁，请稍后重试')
    }

    let body = event.body
    if (event.isBase64Encoded) {
      body = Buffer.from(body, 'base64').toString('utf8')
    }
    if (!body) {
      return response('FAIL', '请求体为空')
    }

    const headers = event.headers || {}
    const signature = headers['wechatpay-signature'] || headers['Wechatpay-Signature']
    const timestamp = headers['wechatpay-timestamp'] || headers['Wechatpay-Timestamp']
    const nonce = headers['wechatpay-nonce'] || headers['Wechatpay-Nonce']
    const serialNo = headers['wechatpay-serial'] || headers['Wechatpay-Serial']

    if (!signature || !timestamp || !nonce || !serialNo) {
      return response('FAIL', '缺少签名头')
    }

    const ok = await verifySignature({ signature, timestamp, nonce, body, serialNo })
    if (!ok) {
      return response('FAIL', '签名验证失败')
    }

    const cfg = loadPayConfig()
    const parsed = JSON.parse(body)
    if (!parsed.resource) {
      return response('FAIL', '缺少 resource')
    }

    const decryptedText = decryptAESGCM(parsed.resource, cfg.api_v3_key)
    const decryptedData = JSON.parse(decryptedText)

    const result = await processRefundNotification(decryptedData)
    return response('SUCCESS', result.message || '成功')
  } catch (e) {
    logger.error({ event: 'refund_notify_failed', message: e && e.message })
    // 仍返回 200，避免微信反复重试导致风暴
    return response('FAIL', e.message || '处理失败')
  }
}
