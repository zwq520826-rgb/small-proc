"use strict";
const common_vendor = require("../../common/vendor.js");
if (!Array) {
  const _easycom_uni_captcha2 = common_vendor.resolveComponent("uni-captcha");
  _easycom_uni_captcha2();
}
const _easycom_uni_captcha = () => "../../uni_modules/uni-captcha/components/uni-captcha/uni-captcha.js";
if (!Math) {
  _easycom_uni_captcha();
}
const _sfc_main = {
  __name: "verify",
  setup(__props) {
    const riderService = common_vendor.tr.importObject("rider-service");
    const form = common_vendor.ref({
      name: "",
      student_no: "",
      college_class: "",
      id_card: "",
      mobile: "",
      captcha: ""
    });
    const profile = common_vendor.ref(null);
    const focusCaptchaInput = common_vendor.ref(false);
    const captchaRef = common_vendor.ref(null);
    const loadProfile = async () => {
      const res = await riderService.getMyProfile();
      if (res && res.code === 0 && res.data) {
        profile.value = res.data;
        form.value.name = res.data.name || "";
        form.value.student_no = res.data.student_no || "";
        form.value.college_class = res.data.college_class || "";
        form.value.id_card = res.data.id_card || "";
        form.value.mobile = res.data.mobile || "";
      }
    };
    const requestRiderSubscribeAuth = async () => {
      try {
        const cfgRes = await riderService.getSubscribeNotifyConfig();
        const cfg = (cfgRes == null ? void 0 : cfgRes.data) || {};
        if ((cfgRes == null ? void 0 : cfgRes.code) !== 0 || cfg.enable === false)
          return {};
        const tmplIds = [cfg.template_submit_id, cfg.template_pass_id].filter(Boolean);
        if (!tmplIds.length)
          return {};
        const reqRes = await new Promise((resolve) => {
          common_vendor.index.requestSubscribeMessage({
            tmplIds,
            success: (res) => resolve(res || {}),
            fail: () => resolve({})
          });
        });
        return reqRes || {};
      } catch (e) {
        return {};
      }
    };
    const submit = async () => {
      var _a;
      if (!form.value.captcha || form.value.captcha.length !== 4) {
        focusCaptchaInput.value = true;
        common_vendor.index.showToast({ title: "请先输入图形验证码", icon: "none" });
        return;
      }
      try {
        const subscribeResult = await requestRiderSubscribeAuth();
        common_vendor.index.showLoading({ title: "提交中..." });
        const res = await riderService.submitApplication({
          ...form.value,
          subscribeResult
        });
        common_vendor.index.hideLoading();
        if (res.code === 0) {
          common_vendor.index.showToast({
            title: res.message || "验证成功",
            icon: "success",
            // 让跳转不被 toast 持续时间“看起来卡住”
            duration: 800
          });
          common_vendor.index.switchTab({
            url: "/pages/mine/index",
            fail: () => {
              common_vendor.index.reLaunch({ url: "/pages/mine/index" });
            }
          });
        } else {
          common_vendor.index.showToast({ title: res.message || "提交失败", icon: "none" });
          if (res.code === "CAPTCHA_ERROR" || ((_a = res.message) == null ? void 0 : _a.includes("验证码"))) {
            form.value.captcha = "";
            if (captchaRef.value) {
              captchaRef.value.getImageCaptcha();
            }
            focusCaptchaInput.value = true;
          }
        }
      } catch (e) {
        common_vendor.index.hideLoading();
        common_vendor.index.__f__("error", "at pages/rider/verify.vue:150", "提交失败:", e);
        common_vendor.index.showToast({ title: "提交失败", icon: "none" });
        form.value.captcha = "";
        if (captchaRef.value) {
          captchaRef.value.getImageCaptcha();
        }
      }
    };
    common_vendor.onLoad(() => {
      loadProfile();
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: form.value.name,
        b: common_vendor.o(($event) => form.value.name = $event.detail.value),
        c: form.value.student_no,
        d: common_vendor.o(($event) => form.value.student_no = $event.detail.value),
        e: form.value.college_class,
        f: common_vendor.o(($event) => form.value.college_class = $event.detail.value),
        g: form.value.id_card,
        h: common_vendor.o(($event) => form.value.id_card = $event.detail.value),
        i: form.value.mobile,
        j: common_vendor.o(($event) => form.value.mobile = $event.detail.value),
        k: common_vendor.sr(captchaRef, "df7b148f-0", {
          "k": "captchaRef"
        }),
        l: common_vendor.o(($event) => form.value.captcha = $event),
        m: common_vendor.p({
          scene: "rider-verify",
          focus: focusCaptchaInput.value,
          modelValue: form.value.captcha
        }),
        n: profile.value
      }, profile.value ? common_vendor.e({
        o: profile.value.status === "approved"
      }, profile.value.status === "approved" ? {} : profile.value.status === "pending" ? {} : {}, {
        p: profile.value.status === "pending"
      }) : {}, {
        q: common_vendor.o(submit)
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-df7b148f"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/rider/verify.js.map
