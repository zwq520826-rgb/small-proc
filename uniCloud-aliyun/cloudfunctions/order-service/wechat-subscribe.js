'use strict'

const createConfig = require('uni-config-center')

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token'
const SEND_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send'

let tokenCache = {
  appid: '',
  token: '',
  expireAt: 0
}

function pickWechatOauthConfig() {
  const center = createConfig({ pluginId: 'uni-id' })
  const cfg = center.config() || {}
  const mpCfg = cfg['mp-weixin'] || {}
  const oauth = mpCfg.oauth || {}
  const wx = oauth.weixin || {}
  // 强制使用正确的配置
  const appid = 'wxca61ef4bea4c9884'
  const appsecret = '774e1e2a6d3c087ad9e42df277b09575'
  return { appid, appsecret }
}

async function getAccessToken() {
  const now = Date.now()
  if (tokenCache.token && tokenCache.expireAt > now + 10000) {
    return {
      ok: true,
      access_token: tokenCache.token
    }
  }

  const { appid, appsecret } = pickWechatOauthConfig()
  if (!appid || !appsecret) {
    return {
      ok: false,
      errcode: 'CONFIG_ERROR',
      errmsg: 'uni-id mp-weixin appid/appsecret 未配置'
    }
  }

  const tokenRes = await uniCloud.httpclient.request(TOKEN_URL, {
    method: 'GET',
    dataType: 'json',
    data: {
      grant_type: 'client_credential',
      appid,
      secret: appsecret
    },
    timeout: 10000
  })

  const data = tokenRes && tokenRes.data ? tokenRes.data : {}
  if (!data.access_token) {
    return {
      ok: false,
      errcode: data.errcode || 'GET_TOKEN_FAILED',
      errmsg: data.errmsg || '获取 access_token 失败'
    }
  }

  const expiresInSec = Number(data.expires_in || 7200)
  tokenCache = {
    appid,
    token: data.access_token,
    expireAt: now + Math.max(60, expiresInSec - 120) * 1000
  }
  return {
    ok: true,
    access_token: data.access_token
  }
}

async function sendSubscribeMessage({
  touser,
  template_id,
  page = '/pages/mine/index',
  data = {},
  miniprogram_state = 'formal',
  lang = 'zh_CN'
} = {}) {
  const openid = String(touser || '').trim()
  const tplId = String(template_id || '').trim()
  if (!openid || !tplId) {
    return {
      ok: false,
      errcode: 'INVALID_PARAM',
      errmsg: 'touser/template_id 不能为空'
    }
  }

  const tokenRes = await getAccessToken()
  if (!tokenRes.ok) return tokenRes

  const body = {
    touser: openid,
    template_id: tplId,
    page: String(page || '/pages/mine/index'),
    data,
    miniprogram_state,
    lang
  }

  const sendRes = await uniCloud.httpclient.request(
    `${SEND_URL}?access_token=${tokenRes.access_token}`,
    {
      method: 'POST',
      data: JSON.stringify(body),
      dataType: 'json',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      timeout: 10000
    }
  )

  const resp = sendRes && sendRes.data ? sendRes.data : {}
  if (Number(resp.errcode || 0) !== 0) {
    return {
      ok: false,
      errcode: resp.errcode || 'SEND_FAILED',
      errmsg: resp.errmsg || '发送订阅消息失败'
    }
  }

  return {
    ok: true,
    msgid: resp.msgid || ''
  }
}

module.exports = {
  sendSubscribeMessage
}
