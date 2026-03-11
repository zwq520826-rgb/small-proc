"use strict";
const common_vendor = require("../common/vendor.js");
const STORAGE_KEY = "user_mode";
const USER_MODE = {
  CLIENT: "client",
  // 用户端
  RIDER: "rider"
  // 骑手端
};
function getUserMode() {
  const mode = common_vendor.index.getStorageSync(STORAGE_KEY);
  return mode === USER_MODE.RIDER ? USER_MODE.RIDER : USER_MODE.CLIENT;
}
function setUserMode(mode) {
  if (mode !== USER_MODE.CLIENT && mode !== USER_MODE.RIDER) {
    common_vendor.index.__f__("warn", "at store/user.js:29", "Invalid user mode, default to client");
    mode = USER_MODE.CLIENT;
  }
  common_vendor.index.setStorageSync(STORAGE_KEY, mode);
  return mode;
}
function switchToRider() {
  return setUserMode(USER_MODE.RIDER);
}
function switchToClient() {
  return setUserMode(USER_MODE.CLIENT);
}
function isRiderMode() {
  return getUserMode() === USER_MODE.RIDER;
}
exports.isRiderMode = isRiderMode;
exports.switchToClient = switchToClient;
exports.switchToRider = switchToRider;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/user.js.map
