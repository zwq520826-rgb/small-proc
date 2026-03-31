'use strict'

let external = null
try {
  external = require('../common/wechat-subscribe')
} catch (e) {}

if (external) {
  module.exports = external
} else {
  module.exports = {
    async sendSubscribeMessage() {
      return {
        ok: false,
        errcode: 'MODULE_NOT_FOUND',
        errmsg: 'wechat-subscribe 模块不可用'
      }
    }
  }
}
