'use strict'

const crypto = require('crypto')
const db = uniCloud.database()

const RATE_LIMIT_COLLECTION = 'security_rate_limits'
const MAINTENANCE_COLLECTION = 'maintenance_settings'
const MAINTENANCE_DOC_ID = 'runtime_flags'

function generateRequestId() {
  const ts = Date.now().toString(36)
  const rand = crypto.randomBytes(4).toString('hex')
  return `req_${ts}_${rand}`
}

function getHeader(headers = {}, key = '') {
  if (!headers || !key) return ''
  return headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || ''
}

function resolveRequestId({ headers = {}, fallback = '' } = {}) {
  return String(
    getHeader(headers, 'x-request-id') ||
    getHeader(headers, 'X-Request-Id') ||
    fallback ||
    generateRequestId()
  )
}

function hashIp(ip = '') {
  if (!ip) return ''
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16)
}

function maskSensitive(value) {
  const str = String(value || '')
  if (!str) return ''
  if (str.length <= 4) return '****'
  return `${str.slice(0, 2)}****${str.slice(-2)}`
}

function sanitizeForLog(input) {
  if (input == null) return input
  if (typeof input === 'string') {
    if (input.length > 400) return `${input.slice(0, 200)}...[truncated]`
    return input
  }
  if (typeof input !== 'object') return input

  const loweredSensitiveKeys = [
    'mobile', 'phone', 'idcard', 'id_card', 'password', 'token', 'authorization',
    'signature', 'ciphertext', 'nonce', 'api_v3_key', 'appsecret', 'private_key', 'body'
  ]

  if (Array.isArray(input)) {
    return input.slice(0, 20).map((item) => sanitizeForLog(item))
  }

  const out = {}
  for (const key of Object.keys(input)) {
    const raw = input[key]
    const lowered = key.toLowerCase()
    const isSensitive = loweredSensitiveKeys.some((k) => lowered.includes(k))
    out[key] = isSensitive ? maskSensitive(raw) : sanitizeForLog(raw)
  }
  return out
}

function createLogger({ service = 'unknown', api = '', uid = '', ip = '', requestId = '' } = {}) {
  const base = {
    time: new Date().toISOString(),
    service,
    api,
    uid: uid || '',
    ip_hash: hashIp(ip),
    requestId: requestId || generateRequestId()
  }

  function emit(level, payload = {}) {
    const record = {
      ...base,
      time: new Date().toISOString(),
      level,
      ...sanitizeForLog(payload)
    }
    if (level === 'error') {
      console.error(JSON.stringify(record))
    } else if (level === 'warn') {
      console.warn(JSON.stringify(record))
    } else {
      console.log(JSON.stringify(record))
    }
  }

  return {
    info(payload) { emit('info', payload) },
    warn(payload) { emit('warn', payload) },
    error(payload) { emit('error', payload) }
  }
}

function buildRateKey(dimension, service, api, identity, windowSec) {
  return `${dimension}:${service}:${api}:${identity}:w${windowSec}`
}

async function checkOneRateLimit({ dimension, service, api, identity, limit, windowSec, now }) {
  if (!identity || !limit || limit <= 0 || !windowSec || windowSec <= 0) {
    return { allowed: true }
  }

  const key = buildRateKey(dimension, service, api, identity, windowSec)
  const coll = db.collection(RATE_LIMIT_COLLECTION)
  const cutoff = now - windowSec * 1000

  const docRes = await coll.doc(key).get()
  const row = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data
  const hits = Array.isArray(row?.hits)
    ? row.hits.filter((ts) => Number.isFinite(ts) && ts >= cutoff)
    : []

  if (hits.length >= limit) {
    const earliest = Math.min(...hits)
    const retryAfterSec = Math.max(1, Math.ceil((earliest + windowSec * 1000 - now) / 1000))
    return {
      allowed: false,
      retryAfterSec,
      remaining: 0,
      used: hits.length,
      limit
    }
  }

  hits.push(now)
  await coll.doc(key).set({
    dimension,
    service,
    api,
    identity,
    window_sec: windowSec,
    limit,
    hits,
    update_time: now,
    expire_at: now + windowSec * 1000 * 2
  })

  return {
    allowed: true,
    remaining: Math.max(0, limit - hits.length),
    used: hits.length,
    limit
  }
}

async function checkRateLimit({ service, api, ip = '', uid = '', ipRule, uidRule }) {
  const now = Date.now()
  const checks = []

  if (ipRule && ip) {
    checks.push(checkOneRateLimit({
      dimension: 'ip',
      service,
      api,
      identity: hashIp(ip),
      limit: Number(ipRule.limit || 0),
      windowSec: Number(ipRule.windowSec || 0),
      now
    }))
  }
  if (uidRule && uid) {
    checks.push(checkOneRateLimit({
      dimension: 'uid',
      service,
      api,
      identity: String(uid),
      limit: Number(uidRule.limit || 0),
      windowSec: Number(uidRule.windowSec || 0),
      now
    }))
  }

  if (!checks.length) return { allowed: true }
  const results = await Promise.all(checks)
  const blocked = results.find((r) => !r.allowed)
  if (blocked) return blocked
  return { allowed: true }
}

function rateLimitedError({ requestId, retryAfterSec = 1 }) {
  return {
    code: 'RATE_LIMITED',
    errCode: 'RATE_LIMITED',
    message: '请求过于频繁，请稍后重试',
    statusCode: 429,
    retryAfter: retryAfterSec,
    requestId
  }
}

let maintenanceCache = {
  at: 0,
  value: {}
}

async function getRuntimeFlags({ ttlMs = 3000 } = {}) {
  const now = Date.now()
  if (maintenanceCache.at && now - maintenanceCache.at < ttlMs) {
    return maintenanceCache.value
  }
  try {
    const res = await db.collection(MAINTENANCE_COLLECTION).doc(MAINTENANCE_DOC_ID).get()
    const row = Array.isArray(res.data) ? res.data[0] : res.data
    maintenanceCache = { at: now, value: row || {} }
    return maintenanceCache.value
  } catch (e) {
    return maintenanceCache.value || {}
  }
}

function withRequestId(result, requestId) {
  if (!result || typeof result !== 'object') return result
  if (result.requestId) return result
  return { ...result, requestId }
}

module.exports = {
  resolveRequestId,
  hashIp,
  sanitizeForLog,
  createLogger,
  checkRateLimit,
  rateLimitedError,
  getRuntimeFlags,
  withRequestId
}
