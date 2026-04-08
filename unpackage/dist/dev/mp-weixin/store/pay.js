"use strict";
const common_vendor = require("../common/vendor.js");
const paymentService = common_vendor.tr.importObject("payment-service");
async function payForOrder({ method, orderId, amount }) {
  if (!method || !orderId) {
    return {
      success: false,
      reason: "支付方式和订单ID不能为空"
    };
  }
  try {
    if (method === "wechat") {
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
        if (res.data && res.data.skipPayment) {
          common_vendor.index.hideLoading();
          return {
            success: true,
            reason: res.message || "支付成功"
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
            success: async () => {
              common_vendor.index.hideLoading();
              common_vendor.index.showToast({
                title: "支付处理中...",
                icon: "none",
                duration: 2e3
              });
              try {
                await paymentService.confirmPaid({ outTradeNo: res.data.outTradeNo });
              } catch (e) {
                common_vendor.index.__f__("warn", "at store/pay.js:73", "confirmPaid 失败（可忽略，等待回调）:", e);
              }
              resolve({
                success: true,
                reason: "支付成功，订单处理中"
              });
            },
            fail: (err) => {
              common_vendor.index.__f__("error", "at store/pay.js:81", "微信支付失败:", err);
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
        common_vendor.index.__f__("error", "at store/pay.js:101", "微信支付异常:", error);
        return {
          success: false,
          reason: error.message || "支付失败，请重试"
        };
      }
    }
    return {
      success: false,
      reason: `不支持的支付方式: ${method}`
    };
  } catch (error) {
    common_vendor.index.__f__("error", "at store/pay.js:113", "payForOrder 异常:", error);
    return {
      success: false,
      reason: error.message || "支付失败，请重试"
    };
  }
}
exports.payForOrder = payForOrder;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/pay.js.map
