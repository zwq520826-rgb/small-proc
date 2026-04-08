const WxAccount = require('./weixin/account/index')
const QQAccount = require('./qq/account/index')
const AliAccount = require('./alipay/account/index')
const AppleAccount = require('./apple/account/index')

const createApi = require('./share/create-api')

module.exports = {
  initWeixin: function () {
    const oauthConfig = this.configUtils.getOauthConfig({ provider: 'weixin' })
    // 强制使用新的 AppSecret
    const appid = 'wxca61ef4bea4c9884'
    const appsecret = '774e1e2a6d3c087ad9e42df277b09575'

    console.log('=== 2026-04-08 23:35 强制使用新密钥 ===')
    console.log('微信配置 - AppID:', appid)
    console.log('微信配置 - AppSecret:', appsecret)
    console.log('微信配置 - AppSecret 长度:', appsecret ? appsecret.length : 0)

    return createApi(WxAccount, {
      appId: appid,
      secret: appsecret
    })
  },
  initQQ: function () {
    const oauthConfig = this.configUtils.getOauthConfig({ provider: 'qq' })
    return createApi(QQAccount, {
      appId: oauthConfig.appid,
      secret: oauthConfig.appsecret
    })
  },
  initAlipay: function () {
    const oauthConfig = this.configUtils.getOauthConfig({ provider: 'alipay' })
    return createApi(AliAccount, {
      appId: oauthConfig.appid,
      privateKey: oauthConfig.privateKey
    })
  },
  initApple: function () {
    const oauthConfig = this.configUtils.getOauthConfig({ provider: 'apple' })
    return createApi(AppleAccount, {
      bundleId: oauthConfig.bundleId
    })
  }
}
