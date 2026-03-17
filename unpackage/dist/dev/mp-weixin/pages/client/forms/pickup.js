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
  __name: "pickup",
  setup(__props) {
    const images = common_vendor.ref([]);
    const quantities = common_vendor.ref({ small: 0, medium: 0, large: 0 });
    const rates = common_vendor.ref({ small: 1.5, medium: 2, large: 3 });
    const isUrgent = common_vendor.ref(false);
    const isDelivery = common_vendor.ref(false);
    const dormNumber = common_vendor.ref("");
    const deliveryDormType = common_vendor.ref("");
    const addressStore = store_address.useAddressStore();
    const store = store_clientOrder.useClientOrderStore();
    const walletStore = store_wallet.useWalletStore();
    const showPayPopup = common_vendor.ref(false);
    const balance = common_vendor.computed(() => walletStore.balance);
    const toFen = (yuan) => Math.round(Number(yuan || 0) * 100);
    const fromFen = (fen) => Number(fen || 0) / 100;
    const sizeOptions = common_vendor.computed(() => [
      { key: "small", label: "小件（手机壳、饰品等）", price: fromFen(toFen(rates.value.small)).toFixed(2) },
      { key: "medium", label: "中件（衣服、鞋子等）", price: fromFen(toFen(rates.value.medium)).toFixed(2) },
      { key: "large", label: "大件（床上用品、架子等）", price: fromFen(toFen(rates.value.large)).toFixed(2) }
    ]);
    const currentAddress = common_vendor.computed(() => {
      return addressStore.selectedAddress || null;
    });
    const goodsPriceFen = common_vendor.computed(() => {
      const q = quantities.value;
      const smallFen = q.small * toFen(rates.value.small);
      const mediumFen = q.medium * toFen(rates.value.medium);
      const largeFen = q.large * toFen(rates.value.large);
      return smallFen + mediumFen + largeFen;
    });
    const totalPriceFen = common_vendor.computed(() => {
      let fen = goodsPriceFen.value;
      if (isUrgent.value)
        fen += toFen(1);
      if (isDelivery.value)
        fen += toFen(1);
      return fen;
    });
    const totalPrice = common_vendor.computed(() => {
      return fromFen(totalPriceFen.value).toFixed(2);
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
          common_vendor.index.__f__("error", "at pages/client/forms/pickup.vue:205", "选择图片失败:", err);
        }
      });
    };
    const removeImage = (idx) => {
      images.value.splice(idx, 1);
    };
    const increase = (key) => {
      quantities.value[key] = Math.max(0, quantities.value[key] + 1);
    };
    const decrease = (key) => {
      quantities.value[key] = Math.max(0, quantities.value[key] - 1);
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
    const handlePayClick = () => {
      if (!currentAddress.value) {
        common_vendor.index.showToast({ title: "请选择收货地址", icon: "none" });
        return;
      }
      if (!images.value.length) {
        common_vendor.index.showToast({ title: "请上传至少一张取件凭证", icon: "none" });
        return;
      }
      if (goodsPriceFen.value <= 0) {
        common_vendor.index.showToast({ title: "请选择代取物品数量", icon: "none" });
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
      const amount = Number(totalPrice.value).toFixed(2);
      common_vendor.index.showActionSheet({
        itemList: [`余额支付 ¥${amount}`, "微信支付"],
        success: (res) => {
          const index = res.tapIndex;
          if (index === 0) {
            onPayConfirm("balance");
          } else if (index === 1) {
            onPayConfirm("wechat");
          }
        }
      });
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
          cloudPath: `orders/pickup/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
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
        const uploadedImages = await uploadImages(images.value);
        if (!uploadedImages.length) {
          common_vendor.index.hideLoading();
          common_vendor.index.showToast({ title: "请上传取件凭证", icon: "none" });
          return;
        }
        const amount = Number(totalPrice.value);
        const addr = currentAddress.value || {};
        const deliveryLocation = addr.schoolArea ? `${addr.schoolArea}・${addr.detail}` : addr.detail;
        const payload = {
          type: "pickup",
          typeLabel: "快递代取",
          price: amount,
          pickupLocation: "",
          // 不再使用“待指定”，改为通过取件凭证照片识别取件点
          deliveryLocation,
          address: `${addr.name || ""} ${addr.phone || ""}
${deliveryLocation}`,
          content: {
            phone: addr.phone || "",
            // 单独存储用户电话，方便骑手拨打
            name: addr.name || "",
            // 单独存储用户姓名
            images: uploadedImages,
            quantities: quantities.value,
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
        common_vendor.index.__f__("error", "at pages/client/forms/pickup.vue:384", "支付流程失败:", error);
        common_vendor.index.showToast({ title: "支付失败，请重试", icon: "none" });
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
    common_vendor.onLoad(async () => {
      try {
        const configService = common_vendor.tr.importObject("config-service");
        const res = await configService.getPickupRates();
        if (res && res.code === 0 && res.data) {
          rates.value = {
            small: Number(res.data.small) || rates.value.small,
            medium: Number(res.data.medium) || rates.value.medium,
            large: Number(res.data.large) || rates.value.large
          };
        }
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/client/forms/pickup.vue:411", "加载快递代取价格失败，将使用默认价格:", e);
      }
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
        g: common_vendor.f(images.value, (img, idx, i0) => {
          return {
            a: img,
            b: common_vendor.o(($event) => removeImage(idx), idx),
            c: idx
          };
        }),
        h: images.value.length < 9
      }, images.value.length < 9 ? {
        i: common_vendor.o(chooseImage)
      } : {}, {
        j: common_vendor.f(sizeOptions.value, (item, k0, i0) => {
          return {
            a: common_vendor.t(item.label),
            b: common_vendor.t(item.price),
            c: common_vendor.o(($event) => decrease(item.key), item.key),
            d: common_vendor.t(quantities.value[item.key]),
            e: common_vendor.o(($event) => increase(item.key), item.key),
            f: item.key
          };
        }),
        k: common_assets._imports_0$1,
        l: isUrgent.value,
        m: common_vendor.o((e) => isUrgent.value = e.detail.value),
        n: common_assets._imports_1,
        o: isDelivery.value,
        p: common_vendor.o(onDeliveryToggle),
        q: isDelivery.value
      }, isDelivery.value ? {
        r: deliveryDormType.value === "male" ? 1 : "",
        s: common_vendor.o(($event) => deliveryDormType.value = "male"),
        t: deliveryDormType.value === "female" ? 1 : "",
        v: common_vendor.o(($event) => deliveryDormType.value = "female"),
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
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-0e9c11e7"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/client/forms/pickup.js.map
