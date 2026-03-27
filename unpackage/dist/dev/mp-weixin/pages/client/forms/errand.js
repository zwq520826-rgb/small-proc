"use strict";
const common_vendor = require("../../../common/vendor.js");
const common_assets = require("../../../common/assets.js");
const store_address = require("../../../store/address.js");
const store_clientOrder = require("../../../store/clientOrder.js");
const store_pay = require("../../../store/pay.js");
const _sfc_main = {
  __name: "errand",
  setup(__props) {
    const description = common_vendor.ref("");
    const runnerFee = common_vendor.ref(2);
    const images = common_vendor.ref([]);
    const isUrgent = common_vendor.ref(false);
    const isDelivery = common_vendor.ref(false);
    const dormNumber = common_vendor.ref("");
    const extraRemark = common_vendor.ref("");
    const deliveryDormType = common_vendor.ref("");
    const addressStore = store_address.useAddressStore();
    const store = store_clientOrder.useClientOrderStore();
    const currentAddress = common_vendor.computed(() => {
      return addressStore.selectedAddress || null;
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
          common_vendor.index.__f__("error", "at pages/client/forms/errand.vue:183", "选择图片失败:", err);
        }
      });
    };
    const removeImage = (idx) => {
      images.value.splice(idx, 1);
    };
    const normalizeRunnerFee = () => {
      let v = Number(runnerFee.value || 0);
      if (!Number.isFinite(v) || v < 2)
        v = 2;
      runnerFee.value = Math.round(v);
    };
    const increaseFee = () => {
      runnerFee.value = Math.max(2, runnerFee.value + 1);
    };
    const decreaseFee = () => {
      runnerFee.value = Math.max(2, runnerFee.value - 1);
    };
    const onDeliveryToggle = (e) => {
      var _a;
      const checked = (_a = e == null ? void 0 : e.detail) == null ? void 0 : _a.value;
      isDelivery.value = !!checked;
      if (!isDelivery.value) {
        dormNumber.value = "";
        deliveryDormType.value = "";
      }
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
      if (isDelivery.value) {
        if (!deliveryDormType.value) {
          common_vendor.index.showToast({ title: "请选择男女宿舍", icon: "none" });
          return;
        }
        if (!dormNumber.value.trim()) {
          common_vendor.index.showToast({ title: "请填写寝室号", icon: "none" });
          return;
        }
      }
      onPayConfirm("wechat");
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
        const res = await common_vendor._r.uploadFile({
          filePath: path,
          cloudPath: `orders/errand/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
        });
        const fileID = (res == null ? void 0 : res.fileID) || (res == null ? void 0 : res.fileId);
        if (fileID)
          uploaded.push(fileID);
      }
      return uploaded;
    };
    const onPayConfirm = async (method = "wechat") => {
      common_vendor.index.showLoading({ title: "处理中..." });
      try {
        const uploadedImages = await uploadImages(images.value || []);
        const amount = Number(totalPrice.value);
        const addr = currentAddress.value || {};
        const deliveryLocation = addr.schoolArea ? `${addr.schoolArea}・${addr.detail}` : addr.detail;
        const remarkText = extraRemark.value.trim();
        const payload = {
          type: "errand",
          typeLabel: "跑腿代购",
          price: amount,
          pickupLocation: "",
          // 不再使用“待指定”，改为由图片说明取件信息
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
            dormNumber: dormNumber.value,
            // 送货上门时要求的骑手性别（male/female）
            requiredRiderGender: isDelivery.value ? deliveryDormType.value || "" : ""
          },
          tags: [
            isUrgent.value ? "加急" : "",
            isDelivery.value ? deliveryDormType.value === "male" ? "男生宿舍送货上门" : deliveryDormType.value === "female" ? "女生宿舍送货上门" : "送货上门" : ""
          ].filter(Boolean),
          createTime: (/* @__PURE__ */ new Date()).toLocaleString()
        };
        if (remarkText) {
          payload.content.remark = remarkText;
        }
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
        common_vendor.index.__f__("error", "at pages/client/forms/errand.vue:362", "支付流程失败:", error);
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
        f: common_vendor.o(goSelectAddress, "f8"),
        g: description.value,
        h: common_vendor.o(($event) => description.value = $event.detail.value, "55"),
        i: common_vendor.f(images.value, (img, idx, i0) => {
          return {
            a: img,
            b: common_vendor.o(($event) => removeImage(idx), idx),
            c: idx
          };
        }),
        j: images.value.length < 9
      }, images.value.length < 9 ? {
        k: common_vendor.o(chooseImage, "e9")
      } : {}, {
        l: common_vendor.o(decreaseFee, "f4"),
        m: common_vendor.o(normalizeRunnerFee, "fb"),
        n: runnerFee.value,
        o: common_vendor.o(common_vendor.m(($event) => runnerFee.value = $event.detail.value, {
          number: true
        }), "e5"),
        p: common_vendor.o(increaseFee, "1b"),
        q: common_assets._imports_0$1,
        r: isUrgent.value,
        s: common_vendor.o((e) => isUrgent.value = e.detail.value, "c7"),
        t: common_assets._imports_1,
        v: isDelivery.value,
        w: common_vendor.o(onDeliveryToggle, "ce"),
        x: isDelivery.value
      }, isDelivery.value ? {
        y: deliveryDormType.value === "male" ? 1 : "",
        z: common_vendor.o(($event) => deliveryDormType.value = "male", "0d"),
        A: deliveryDormType.value === "female" ? 1 : "",
        B: common_vendor.o(($event) => deliveryDormType.value = "female", "77"),
        C: dormNumber.value,
        D: common_vendor.o(($event) => dormNumber.value = $event.detail.value, "d4")
      } : {}, {
        E: extraRemark.value,
        F: common_vendor.o(($event) => extraRemark.value = $event.detail.value, "4a"),
        G: common_vendor.t(totalPrice.value),
        H: common_vendor.o(handlePayClick, "bd")
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-01dc5f43"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/client/forms/errand.js.map
