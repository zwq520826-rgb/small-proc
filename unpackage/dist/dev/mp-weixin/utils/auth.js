"use strict";
const common_vendor = require("../common/vendor.js");
const uniIdCo = common_vendor._r.importObject("uni-id-co", { customUI: true });
let checkingPromise = null;
let showingExpiryModal = false;
const LOGIN_PAGE = "/uni_modules/uni-id-pages/pages/login/login-withoutpwd";
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
        await handleTokenExpired((res == null ? void 0 : res.message) || "登录状态已过期，请重新登录");
        return false;
      }
      return true;
    } catch (err) {
      common_vendor.index.__f__("warn", "at utils/auth.js:22", "[auth] checkToken failed", err);
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
async function handleTokenExpired(message) {
  if (showingExpiryModal)
    return;
  showingExpiryModal = true;
  try {
    common_vendor.index.removeStorageSync("uni_id_token");
    common_vendor.index.removeStorageSync("uni_id_token_expired");
    await new Promise((resolve) => {
      common_vendor.index.showModal({
        title: "登录状态失效",
        content: message || "请重新登录后继续使用",
        showCancel: false,
        success: () => {
          common_vendor.index.reLaunch({ url: LOGIN_PAGE });
          resolve();
        },
        fail: resolve
      });
    });
  } finally {
    showingExpiryModal = false;
  }
}
exports.ensureSessionAlive = ensureSessionAlive;
//# sourceMappingURL=../../.sourcemap/mp-weixin/utils/auth.js.map
