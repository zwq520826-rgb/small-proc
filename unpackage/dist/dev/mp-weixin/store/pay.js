"use strict";
const common_vendor = require("../common/vendor.js");
const store_wallet = require("./wallet.js");
const paymentService = common_vendor.tr.importObject("payment-service");
async function payForOrder({ method, orderId, amount }) {
  if (!method || !orderId) {
    return {
      success: false,
      reason: "支付方式和订单ID不能为空"
    };
  }
  try {
    if (method === "balance") {
      const walletStore = store_wallet.useWalletStore();
      const payRes = await walletStore.pay(amount || 0, orderId);
      if (!(payRes == null ? void 0 : payRes.success)) {
        return {
          success: false,
          reason: (payRes == null ? void 0 : payRes.reason) || "余额不足"
        };
      }
      return {
        success: true
      };
    } else if (method === "wechat") {
      common_vendor.index.showLoading({ title: "正在调起支付..." });
      try {
        const res = await paymentService.createJsapiOrder({ orderId });
        if (res.code !== 0) {
          common_vendor.index.hideLoading();
          return {
            success: false,
            reason: res.message || "创建支付订单失败"
          };
        }
        const { appId, timeStamp, nonceStr, package: packageValue, signType, paySign } = res.data;
        return new Promise((resolve) => {
          common_vendor.index.requestPayment({
            provider: "wxpay",
            appId,
            timeStamp,
            nonceStr,
            package: packageValue,
            signType,
            paySign,
            success: async (payRes) => {
              common_vendor.index.__f__("log", "at store/pay.js:74", "微信支付成功:", payRes);
              common_vendor.index.hideLoading();
              common_vendor.index.showToast({
                title: "支付处理中...",
                icon: "none",
                duration: 2e3
              });
              try {
                await paymentService.confirmPaid({ outTradeNo: res.data.outTradeNo });
              } catch (e) {
                common_vendor.index.__f__("warn", "at store/pay.js:90", "confirmPaid 失败（可忽略，等待回调）:", e);
              }
              resolve({
                success: true,
                reason: "支付成功，订单处理中"
              });
            },
            fail: (err) => {
              common_vendor.index.__f__("error", "at store/pay.js:98", "微信支付失败:", err);
              common_vendor.index.hideLoading();
              if (err.errMsg && err.errMsg.includes("cancel")) {
                resolve({
                  success: false,
                  reason: "用户取消支付"
                });
              } else {
                resolve({
                  success: false,
                  reason: err.errMsg || "支付失败，请重试"
                });
              }
            }
          });
        });
      } catch (error) {
        common_vendor.index.hideLoading();
        common_vendor.index.__f__("error", "at store/pay.js:118", "微信支付异常:", error);
        return {
          success: false,
          reason: error.message || "支付失败，请重试"
        };
      }
    } else {
      return {
        success: false,
        reason: `不支持的支付方式: ${method}`
      };
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/pay.js:131", "payForOrder 异常:", error);
    return {
      success: false,
      reason: error.message || "支付失败，请重试"
    };
  }
}
exports.payForOrder = payForOrder;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/pay.js.map
