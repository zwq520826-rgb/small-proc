"use strict";
const common_vendor = require("../common/vendor.js");
const uniIdCo = common_vendor.tr.importObject("uni-id-co", { customUI: true });
let checkingPromise = null;
const LOGIN_PAGE = "/uni_modules/uni-id-pages/pages/login/login-withoutpwd";
function hasLoginToken() {
  return !!common_vendor.index.getStorageSync("uni_id_token");
}
function clearLoginToken() {
  common_vendor.index.removeStorageSync("uni_id_token");
  common_vendor.index.removeStorageSync("uni_id_token_expired");
}
function goLogin(options = {}) {
  const { toast = "请先登录" } = options;
  if (toast) {
    common_vendor.index.showToast({ title: toast, icon: "none" });
  }
  setTimeout(() => {
    common_vendor.index.navigateTo({ url: LOGIN_PAGE });
  }, 120);
}
function requireLogin(options = {}) {
  if (hasLoginToken())
    return true;
  goLogin(options);
  return false;
}
async function ensureSessionAlive(options = {}) {
  if (checkingPromise)
    return checkingPromise;
  const { silent = false } = options;
  checkingPromise = (async () => {
    try {
      const token = common_vendor.index.getStorageSync("uni_id_token");
      if (!token)
        return false;
      const res = await uniIdCo.checkToken();
      if (!res || res.code !== 0) {
        handleTokenExpired();
        if (!silent) {
          common_vendor.index.showToast({ title: (res == null ? void 0 : res.message) || "登录状态已过期，请先登录", icon: "none" });
        }
        return false;
      }
      return true;
    } catch (err) {
      common_vendor.index.__f__("warn", "at utils/auth.js:49", "[auth] checkToken failed", err);
      if (!silent) {
        common_vendor.index.showToast({ title: "登录状态检查失败", icon: "none" });
      }
      return false;
    } finally {
      checkingPromise = null;
    }
  })();
  return checkingPromise;
}
function handleTokenExpired() {
  clearLoginToken();
}
exports.ensureSessionAlive = ensureSessionAlive;
exports.requireLogin = requireLogin;
//# sourceMappingURL=../../.sourcemap/mp-weixin/utils/auth.js.map
