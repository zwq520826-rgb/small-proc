"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const common_vendor = require("./common/vendor.js");
const uni_modules_uniIdPages_init = require("./uni_modules/uni-id-pages/init.js");
const utils_auth = require("./utils/auth.js");
if (!Math) {
  "./pages/client/home.js";
  "./pages/client/orders/list.js";
  "./pages/client/orders/detail.js";
  "./pages/client/forms/pickup.js";
  "./pages/client/forms/post.js";
  "./pages/client/forms/errand.js";
  "./pages/client/forms/print.js";
  "./pages/common/address/list.js";
  "./pages/common/address/edit.js";
  "./pages/common/wallet/index.js";
  "./pages/common/feedback/index.js";
  "./pages/mine/index.js";
  "./pages/rider/hall.js";
  "./pages/rider/tasks/list.js";
  "./pages/rider/tasks/detail.js";
  "./pages/rider/verify.js";
  "./pages/rider/levels.js";
  "./uni_modules/uni-id-pages/pages/userinfo/deactivate/deactivate.js";
  "./uni_modules/uni-id-pages/pages/userinfo/userinfo.js";
  "./uni_modules/uni-id-pages/pages/userinfo/bind-mobile/bind-mobile.js";
  "./uni_modules/uni-id-pages/pages/login/login-withoutpwd.js";
  "./uni_modules/uni-id-pages/pages/login/login-withpwd.js";
  "./uni_modules/uni-id-pages/pages/login/login-smscode.js";
  "./uni_modules/uni-id-pages/pages/register/register.js";
  "./uni_modules/uni-id-pages/pages/register/register-by-email.js";
  "./uni_modules/uni-id-pages/pages/retrieve/retrieve.js";
  "./uni_modules/uni-id-pages/pages/retrieve/retrieve-by-email.js";
  "./uni_modules/uni-id-pages/pages/common/webview/webview.js";
  "./uni_modules/uni-id-pages/pages/userinfo/change_pwd/change_pwd.js";
  "./uni_modules/uni-id-pages/pages/userinfo/set-pwd/set-pwd.js";
  "./uni_modules/uni-id-pages/pages/userinfo/realname-verify/realname-verify.js";
}
const _sfc_main = {
  onLaunch: async function() {
    await uni_modules_uniIdPages_init.uniIdPageInit();
    utils_auth.ensureSessionAlive({ silent: true });
  },
  onShow: function() {
    utils_auth.ensureSessionAlive({ silent: true });
  },
  onHide: function() {
  }
};
function createApp() {
  const app = common_vendor.createSSRApp(_sfc_main);
  return {
    app
  };
}
createApp().app.mount("#app");
exports.createApp = createApp;
//# sourceMappingURL=../.sourcemap/mp-weixin/app.js.map
