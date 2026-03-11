"use strict";
const common_vendor = require("../common/vendor.js");
if (!Array) {
  const _easycom_uni_popup2 = common_vendor.resolveComponent("uni-popup");
  _easycom_uni_popup2();
}
const _easycom_uni_popup = () => "../uni_modules/uni-popup/components/uni-popup/uni-popup.js";
if (!Math) {
  _easycom_uni_popup();
}
const _sfc_main = {
  __name: "PaymentPopup",
  props: {
    show: {
      type: Boolean,
      default: false
    },
    amount: {
      type: Number,
      default: 0
    },
    balance: {
      type: Number,
      default: 0
    }
  },
  emits: ["update:show", "confirm"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emit = __emit;
    const innerShow = common_vendor.ref(props.show);
    common_vendor.watch(
      () => props.show,
      (val) => {
        innerShow.value = val;
      }
    );
    common_vendor.watch(innerShow, (val) => {
      emit("update:show", val);
    });
    const handleCancel = () => {
      innerShow.value = false;
    };
    const handleConfirm = () => {
      emit("confirm", "balance");
    };
    return (_ctx, _cache) => {
      return {
        a: common_vendor.t(__props.amount.toFixed(2)),
        b: common_vendor.t(__props.balance.toFixed(2)),
        c: common_vendor.o(handleCancel),
        d: common_vendor.o(handleConfirm),
        e: common_vendor.sr("popup", "9d891b99-0"),
        f: common_vendor.o(($event) => innerShow.value = $event),
        g: common_vendor.p({
          type: "bottom",
          ["mask-click"]: false,
          show: innerShow.value
        })
      };
    };
  }
};
const Component = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-9d891b99"]]);
wx.createComponent(Component);
//# sourceMappingURL=../../.sourcemap/mp-weixin/components/PaymentPopup.js.map
