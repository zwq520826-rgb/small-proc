"use strict";
const common_vendor = require("../../../common/vendor.js");
const store_address = require("../../../store/address.js");
const _sfc_main = {
  __name: "edit",
  setup(__props) {
    const addressStore = store_address.useAddressStore();
    common_vendor._r.importObject("order-service");
    const id = common_vendor.ref("");
    const name = common_vendor.ref("");
    const phone = common_vendor.ref("");
    const detail = common_vendor.ref("");
    const isDefault = common_vendor.ref(false);
    common_vendor.onLoad((options) => {
      id.value = (options == null ? void 0 : options.id) || "";
      if (id.value) {
        const existing = addressStore.addressList.find((a) => a.id === id.value || a._id === id.value);
        if (existing) {
          name.value = existing.name || "";
          phone.value = existing.phone || "";
          detail.value = existing.detail || "";
          isDefault.value = !!existing.isDefault;
        }
      }
    });
    const onDefaultChange = (e) => {
      isDefault.value = e.detail.value;
    };
    const saveAddress = async () => {
      if (!name.value.trim()) {
        common_vendor.index.showToast({ title: "请填写联系人", icon: "none" });
        return;
      }
      if (!phone.value.trim()) {
        common_vendor.index.showToast({ title: "请填写手机号", icon: "none" });
        return;
      }
      if (!detail.value.trim()) {
        common_vendor.index.showToast({ title: "请填写详细地址", icon: "none" });
        return;
      }
      const payload = {
        name: name.value.trim(),
        phone: phone.value.trim(),
        detail: detail.value.trim(),
        // 不再固定写死校区字段，统一只用 detail 保存完整地址
        isDefault: isDefault.value
      };
      try {
        let ok = false;
        if (id.value) {
          ok = await addressStore.updateAddress(id.value, payload);
        } else {
          ok = await addressStore.addAddress(payload);
        }
        if (!ok)
          return;
        common_vendor.index.showToast({ title: "保存成功", icon: "success" });
        setTimeout(() => {
          common_vendor.index.navigateBack();
        }, 400);
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/common/address/edit.vue:117", "保存地址失败:", e);
        common_vendor.index.showToast({ title: "网络错误，请稍后重试", icon: "none" });
      }
    };
    return (_ctx, _cache) => {
      return {
        a: name.value,
        b: common_vendor.o(($event) => name.value = $event.detail.value, "f1"),
        c: phone.value,
        d: common_vendor.o(($event) => phone.value = $event.detail.value, "73"),
        e: detail.value,
        f: common_vendor.o(($event) => detail.value = $event.detail.value, "da"),
        g: isDefault.value,
        h: common_vendor.o(onDefaultChange, "80"),
        i: common_vendor.o(saveAddress, "33")
      };
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-a2b295fa"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/common/address/edit.js.map
