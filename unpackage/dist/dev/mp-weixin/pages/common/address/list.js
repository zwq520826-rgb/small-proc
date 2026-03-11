"use strict";
const common_vendor = require("../../../common/vendor.js");
const store_address = require("../../../store/address.js");
const _sfc_main = {
  __name: "list",
  setup(__props) {
    const addressStore = store_address.useAddressStore();
    const addressList = common_vendor.computed(() => addressStore.addressList);
    const query = { source: "" };
    common_vendor.onLoad((options) => {
      query.source = (options == null ? void 0 : options.source) || "";
    });
    const setDefault = async (id) => {
      const ok = await addressStore.setSelected(id);
      if (ok && query.source === "select") {
        common_vendor.index.navigateBack();
      }
    };
    const editAddress = (id) => {
      common_vendor.index.navigateTo({
        url: `/pages/common/address/edit?id=${id}`
      });
    };
    const remove = (id) => {
      common_vendor.index.showModal({
        content: "确定删除该地址吗？",
        confirmText: "删除",
        cancelText: "取消",
        success: async (res) => {
          if (res.confirm) {
            const ok = await addressStore.removeAddress(id);
            if (ok) {
              common_vendor.index.showToast({ title: "已删除", icon: "success" });
            }
          }
        }
      });
    };
    const addNew = () => {
      common_vendor.index.navigateTo({
        url: "/pages/common/address/edit"
      });
    };
    const handleCardClick = (id) => {
      if (query.source === "select") {
        addressStore.setSelected(id).then((ok) => {
          if (ok) {
            common_vendor.index.navigateBack();
          }
        });
      }
    };
    return (_ctx, _cache) => {
      return {
        a: common_vendor.f(addressList.value, (item, k0, i0) => {
          return common_vendor.e({
            a: common_vendor.t(item.name),
            b: common_vendor.t(item.phone),
            c: item.isDefault
          }, item.isDefault ? {} : {}, {
            d: common_vendor.o(($event) => editAddress(item.id), item.id),
            e: common_vendor.o(($event) => remove(item.id), item.id),
            f: common_vendor.t(item.schoolArea),
            g: common_vendor.t(item.detail),
            h: !item.isDefault
          }, !item.isDefault ? {
            i: common_vendor.o(($event) => setDefault(item.id), item.id)
          } : {}, {
            j: item.id,
            k: common_vendor.o(($event) => handleCardClick(item.id), item.id)
          });
        }),
        b: common_vendor.o(addNew)
      };
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-39d0c0e9"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/common/address/list.js.map
