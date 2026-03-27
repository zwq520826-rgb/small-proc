/**
 * 校验并可选刷新token
 * @tutorial https://uniapp.dcloud.net.cn/uniCloud/uni-id-pages.html#check-token
 */
module.exports = async function () {
  const uniIdToken = this.getUniversalUniIdToken()
  if (!uniIdToken) {
    return {
      code: 30202,
      errCode: 'uni-id-check-token-failed',
      message: this.t('uni-id-check-token-failed')
    }
  }

  const payload = await this.uniIdCommon.checkToken(uniIdToken)

  if (payload.errCode) {
    return {
      code: payload.code || (payload.errCode === 'uni-id-token-expired' ? 30203 : 30202),
      errCode: payload.errCode,
      message: payload.errMsg || this.t(payload.errCode, payload.errMsgValue)
    }
  }

  if (payload.token) {
    this.response.newToken = {
      token: payload.token,
      tokenExpired: payload.tokenExpired
    }
  }

  return {
    code: payload.code ?? 0,
    uid: payload.uid,
    role: payload.role,
    permission: payload.permission,
    token: payload.token,
    tokenExpired: payload.tokenExpired
  }
}
