"use strict";
const common_vendor = require("../common/vendor.js");
const addressService = common_vendor.tr.importObject("address-service");
const state = common_vendor.reactive({
  selectedAddress: null,
  addressList: []
});
let inited = false;
function normalize(doc) {
  const id = doc._id || doc.id;
  return {
    ...doc,
    id,
    schoolArea: doc.school_area ?? doc.schoolArea ?? "",
    isDefault: doc.is_default ?? doc.isDefault ?? false
  };
}
async function loadFromCloud() {
  try {
    const res = await addressService.getAddressList();
    if (res && res.code === 0 && Array.isArray(res.data)) {
      state.addressList = res.data.map(normalize);
      if (state.selectedAddress) {
        const selId = state.selectedAddress.id || state.selectedAddress._id;
        const stillExists = state.addressList.find((a) => (a.id || a._id) === selId);
        state.selectedAddress = stillExists || null;
      }
      save();
      return true;
    }
  } catch (e) {
    common_vendor.index.__f__("warn", "at store/address.js:39", "load address from cloud failed", e);
  }
  return false;
}
async function ensureInit() {
  if (inited)
    return;
  inited = true;
  const ok = await loadFromCloud();
  if (ok)
    return;
  try {
    const data = common_vendor.index.getStorageSync("client-address-list");
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        state.addressList = parsed.map(normalize);
        if (state.selectedAddress) {
          const selId = state.selectedAddress.id || state.selectedAddress._id;
          const stillExists = state.addressList.find((a) => (a.id || a._id) === selId);
          state.selectedAddress = stillExists || null;
        }
      }
    }
  } catch (e) {
    common_vendor.index.__f__("warn", "at store/address.js:68", "load address failed", e);
  }
}
function save() {
  try {
    common_vendor.index.setStorageSync("client-address-list", JSON.stringify(state.addressList));
  } catch (e) {
    common_vendor.index.__f__("warn", "at store/address.js:76", "save address failed", e);
  }
}
function useAddressStore() {
  ensureInit();
  const reloadFromCloud = async () => {
    await loadFromCloud();
  };
  const selectLocal = (id) => {
    const target = state.addressList.find((a) => a.id === id || a._id === id);
    if (!target)
      return false;
    state.selectedAddress = target;
    return true;
  };
  const setSelected = async (id) => {
    const target = state.addressList.find((a) => a.id === id || a._id === id);
    if (!target)
      return;
    try {
      const res = await addressService.setDefaultAddress(target._id || target.id);
      if (res && res.code !== 0) {
        common_vendor.index.showToast({ title: res.message || "设置默认失败", icon: "none" });
        return;
      }
      await reloadFromCloud();
    } catch (e) {
      common_vendor.index.__f__("warn", "at store/address.js:112", "set default address failed", e);
      common_vendor.index.showToast({ title: "设置默认失败", icon: "none" });
    }
  };
  const addAddress = async (payload) => {
    try {
      const res = await addressService.addAddress(payload);
      if (res && res.code !== 0) {
        common_vendor.index.showToast({ title: res.message || "保存失败", icon: "none" });
        return false;
      }
      await reloadFromCloud();
      return true;
    } catch (e) {
      common_vendor.index.__f__("warn", "at store/address.js:127", "add address failed", e);
      common_vendor.index.showToast({ title: "保存失败", icon: "none" });
      return false;
    }
  };
  const updateAddress = async (id, payload) => {
    const target = state.addressList.find((a) => a.id === id || a._id === id);
    if (!target)
      return false;
    try {
      const res = await addressService.updateAddress(target._id || target.id, payload);
      if (res && res.code !== 0) {
        common_vendor.index.showToast({ title: res.message || "保存失败", icon: "none" });
        return false;
      }
      await reloadFromCloud();
      return true;
    } catch (e) {
      common_vendor.index.__f__("warn", "at store/address.js:145", "update address failed", e);
      common_vendor.index.showToast({ title: "保存失败", icon: "none" });
      return false;
    }
  };
  const removeAddress = async (id) => {
    const target = state.addressList.find((a) => a.id === id || a._id === id);
    if (!target)
      return false;
    try {
      const res = await addressService.deleteAddress(target._id || target.id);
      if (res && res.code !== 0) {
        common_vendor.index.showToast({ title: res.message || "删除失败", icon: "none" });
        return false;
      }
      await reloadFromCloud();
      return true;
    } catch (e) {
      common_vendor.index.__f__("warn", "at store/address.js:163", "delete address failed", e);
      common_vendor.index.showToast({ title: "删除失败", icon: "none" });
      return false;
    }
  };
  return {
    get selectedAddress() {
      return state.selectedAddress;
    },
    get addressList() {
      return state.addressList;
    },
    // 下单页选择地址：只本地选中
    selectLocal,
    setSelected,
    addAddress,
    updateAddress,
    removeAddress,
    reloadFromCloud
  };
}
exports.useAddressStore = useAddressStore;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/address.js.map
