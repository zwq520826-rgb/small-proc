"use strict";
const common_vendor = require("../../../common/vendor.js");
const common_assets = require("../../../common/assets.js");
const store_address = require("../../../store/address.js");
const store_clientOrder = require("../../../store/clientOrder.js");
const store_wallet = require("../../../store/wallet.js");
const store_pay = require("../../../store/pay.js");
if (!Math) {
  PaymentPopup();
}
const PaymentPopup = () => "../../../components/PaymentPopup.js";
const _sfc_main = {
  __name: "errand",
  setup(__props) {
    const description = common_vendor.ref("");
    const runnerFee = common_vendor.ref(2);
    const images = common_vendor.ref([]);
    const isUrgent = common_vendor.ref(false);
    const isDelivery = common_vendor.ref(false);
    const dormNumber = common_vendor.ref("");
    const showPayPopup = common_vendor.ref(false);
    const walletStore = store_wallet.useWalletStore();
    const balance = common_vendor.computed(() => walletStore.balance);
    const addressStore = store_address.useAddressStore();
    const store = store_clientOrder.useClientOrderStore();
    const currentAddress = common_vendor.computed(() => {
      return addressStore.selectedAddress || addressStore.addressList.find((item) => item.isDefault) || null;
    });
    const totalPrice = common_vendor.computed(() => {
      let price = runnerFee.value;
      if (isUrgent.value)
        price += 1;
      if (isDelivery.value)
        price += 1;
      return price.toFixed(2);
    });
    const chooseImage = () => {
      common_vendor.wx$1.chooseMedia({
        count: 9 - images.value.length,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success: (res) => {
          const files = res.tempFiles || [];
          const paths = files.map((item) => item.tempFilePath).filter(Boolean);
          images.value = images.value.concat(paths);
        },
        fail: (err) => {
          common_vendor.index.__f__("error", "at pages/client/forms/errand.vue:161", "选择图片失败:", err);
        }
      });
    };
    const removeImage = (idx) => {
      images.value.splice(idx, 1);
    };
    const increaseFee = () => {
      runnerFee.value = Math.max(2, runnerFee.value + 0.5);
    };
    const decreaseFee = () => {
      runnerFee.value = Math.max(2, runnerFee.value - 0.5);
    };
    const goSelectAddress = () => {
      common_vendor.index.navigateTo({ url: "/pages/common/address/list?source=select" });
    };
    const formatPhone = (phone = "") => {
      if (!phone)
        return "";
      return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
    };
    const handlePayClick = () => {
      if (!currentAddress.value) {
        common_vendor.index.showToast({ title: "请选择收货地址", icon: "none" });
        return;
      }
      if (!description.value.trim()) {
        common_vendor.index.showToast({ title: "请填写任务描述", icon: "none" });
        return;
      }
      if (isDelivery.value && !dormNumber.value.trim()) {
        common_vendor.index.showToast({ title: "请填写寝室号", icon: "none" });
        return;
      }
      showPayPopup.value = true;
    };
    const uploadImages = async (list = []) => {
      const uploaded = [];
      for (const path of list) {
        if (!path)
          continue;
        if (path.startsWith("cloud://") || path.startsWith("https://")) {
          uploaded.push(path);
          continue;
        }
        const res = await common_vendor.tr.uploadFile({
          filePath: path,
          cloudPath: `orders/errand/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
        });
        const fileID = (res == null ? void 0 : res.fileID) || (res == null ? void 0 : res.fileId);
        if (fileID)
          uploaded.push(fileID);
      }
      return uploaded;
    };
    const onPayConfirm = async (method = "balance") => {
      showPayPopup.value = false;
      common_vendor.index.showLoading({ title: "处理中..." });
      try {
        const uploadedImages = await uploadImages(images.value || []);
        const amount = Number(totalPrice.value);
        const addr = currentAddress.value || {};
        const deliveryLocation = addr.schoolArea ? `${addr.schoolArea}・${addr.detail}` : addr.detail;
        const payload = {
          type: "errand",
          typeLabel: "跑腿代购",
          price: amount,
          status: "pending_accept",
          pickupLocation: description.value || "待指定",
          deliveryLocation,
          address: `${addr.name || ""} ${addr.phone || ""}
${deliveryLocation}`,
          content: {
            phone: addr.phone || "",
            // 单独存储用户电话，方便骑手拨打
            name: addr.name || "",
            // 单独存储用户姓名
            description: description.value,
            images: uploadedImages,
            runnerFee: runnerFee.value,
            isUrgent: isUrgent.value,
            isDelivery: isDelivery.value,
            dormNumber: dormNumber.value
          },
          tags: [
            isUrgent.value ? "加急" : "",
            isDelivery.value ? "送货上门" : ""
          ].filter(Boolean),
          createTime: (/* @__PURE__ */ new Date()).toLocaleString()
        };
        const order = await store.addOrder(payload);
        if (!order) {
          common_vendor.index.hideLoading();
          common_vendor.index.showToast({ title: "创建订单失败", icon: "none" });
          return;
        }
        const orderId = order.id || order._id;
        const payResult = await store_pay.payForOrder({
          method,
          orderId,
          amount
        });
        common_vendor.index.hideLoading();
        if (payResult.success) {
          common_vendor.index.showToast({ title: "支付成功", icon: "success" });
          setTimeout(() => {
            common_vendor.index.reLaunch({ url: "/pages/client/orders/list" });
          }, 500);
        } else {
          await store.cancelOrder(orderId);
          common_vendor.index.showToast({
            title: payResult.reason || "支付失败，订单已取消",
            icon: "none",
            duration: 2e3
          });
        }
      } catch (error) {
        common_vendor.index.hideLoading();
        common_vendor.index.__f__("error", "at pages/client/forms/errand.vue:307", "支付流程失败:", error);
        common_vendor.index.showToast({ title: "支付失败，请重试", icon: "none" });
      }
    };
    common_vendor.onLoad(() => {
    });
    common_vendor.onShow(() => {
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: currentAddress.value
      }, currentAddress.value ? {
        b: common_vendor.t(currentAddress.value.schoolArea),
        c: common_vendor.t(currentAddress.value.detail),
        d: common_vendor.t(currentAddress.value.name),
        e: common_vendor.t(formatPhone(currentAddress.value.phone))
      } : {}, {
        f: common_vendor.o(goSelectAddress),
        g: description.value,
        h: common_vendor.o(($event) => description.value = $event.detail.value),
        i: common_vendor.f(images.value, (img, idx, i0) => {
          return {
            a: img,
            b: common_vendor.o(($event) => removeImage(idx), idx),
            c: idx
          };
        }),
        j: images.value.length < 9
      }, images.value.length < 9 ? {
        k: common_vendor.o(chooseImage)
      } : {}, {
        l: common_vendor.o(decreaseFee),
        m: common_vendor.t(runnerFee.value.toFixed(2)),
        n: common_vendor.o(increaseFee),
        o: common_assets._imports_0$1,
        p: isUrgent.value,
        q: common_vendor.o((e) => isUrgent.value = e.detail.value),
        r: common_assets._imports_1,
        s: isDelivery.value,
        t: common_vendor.o((e) => isDelivery.value = e.detail.value),
        v: isDelivery.value
      }, isDelivery.value ? {
        w: dormNumber.value,
        x: common_vendor.o(($event) => dormNumber.value = $event.detail.value)
      } : {}, {
        y: common_vendor.t(totalPrice.value),
        z: common_vendor.o(handlePayClick),
        A: common_vendor.o(onPayConfirm),
        B: common_vendor.o(($event) => showPayPopup.value = $event),
        C: common_vendor.p({
          amount: Number(totalPrice.value),
          balance: balance.value,
          show: showPayPopup.value
        })
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-01dc5f43"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/client/forms/errand.js.map
