'use strict'

let external = null
try {
  external = require('../common/security-kit')
} catch (e) {}

if (external) {
  module.exports = external
} else {

const crypto = require('crypto')
const db = uniCloud.database()

function generateRequestId() {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

function resolveRequestId({ headers = {}, fallback = '' } = {}) {
  return String(headers['x-request-id'] || headers['X-Request-Id'] || fallback || generateRequestId())
}

function hashIp(ip = '') {
  if (!ip) return ''
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 16)
}

function createLogger({ service = 'unknown', api = '', uid = '', ip = '', requestId = '' } = {}) {
  const base = { service, api, uid: uid || '', ip_hash: hashIp(ip), requestId: requestId || generateRequestId() }
  return {
    info(payload = {}) { console.log(JSON.stringify({ time: new Date().toISOString(), level: 'info', ...base, ...payload })) },
    warn(payload = {}) { console.warn(JSON.stringify({ time: new Date().toISOString(), level: 'warn', ...base, ...payload })) },
    error(payload = {}) { console.error(JSON.stringify({ time: new Date().toISOString(), level: 'error', ...base, ...payload })) }
  }
}

async function checkRateLimit({ service, api, ip = '', uid = '', ipRule, uidRule }) {
  const coll = db.collection('security_rate_limits')
  const now = Date.now()
  const checks = []
  const run = async (dimension, identity, rule) => {
    if (!identity || !rule || !rule.limit || !rule.windowSec) return { allowed: true }
    const key = `${dimension}:${service}:${api}:${identity}:w${rule.windowSec}`
    const cutoff = now - rule.windowSec * 1000
    const docRes = await coll.doc(key).get()
    const row = Array.isArray(docRes.data) ? docRes.data[0] : docRes.data
    const hits = Array.isArray(row?.hits) ? row.hits.filter((ts) => Number.isFinite(ts) && ts >= cutoff) : []
    if (hits.length >= rule.limit) {
      const retryAfterSec = Math.max(1, Math.ceil((Math.min(...hits) + rule.windowSec * 1000 - now) / 1000))
      return { allowed: false, retryAfterSec }
    }
    hits.push(now)
    await coll.doc(key).set({
      dimension,
      service,
      api,
      identity,
      window_sec: rule.windowSec,
      limit: rule.limit,
      hits,
      update_time: now,
      expire_at: now + rule.windowSec * 2000
    })
    return { allowed: true }
  }
  if (ipRule && ip) checks.push(run('ip', hashIp(ip), ipRule))
  if (uidRule && uid) checks.push(run('uid', String(uid), uidRule))
  if (!checks.length) return { allowed: true }
  const res = await Promise.all(checks)
  return res.find((x) => !x.allowed) || { allowed: true }
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

let cache = { at: 0, value: {} }
async function getRuntimeFlags({ ttlMs = 3000 } = {}) {
  const now = Date.now()
  if (cache.at && now - cache.at < ttlMs) return cache.value
  try {
    const res = await db.collection('maintenance_settings').doc('runtime_flags').get()
    const row = Array.isArray(res.data) ? res.data[0] : res.data
    cache = { at: now, value: row || {} }
    return cache.value
  } catch (e) {
    return cache.value || {}
  }
}

function withRequestId(result, requestId) {
  if (!result || typeof result !== 'object') return result
  if (result.requestId) return result
  return { ...result, requestId }
}

  module.exports = {
    resolveRequestId,
    createLogger,
    checkRateLimit,
    rateLimitedError,
    getRuntimeFlags,
    withRequestId
  }
}
