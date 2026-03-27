"use strict";
const common_vendor = require("../../../common/vendor.js");
const uni_modules_uniIdPages_common_store = require("../../../uni_modules/uni-id-pages/common/store.js");
const _sfc_main = {
  __name: "index",
  setup(__props) {
    const feedbackKind = common_vendor.ref("complaint");
    const content = common_vendor.ref("");
    const localImages = common_vendor.ref([]);
    const submitting = common_vendor.ref(false);
    const chooseImages = () => {
      const remain = 6 - localImages.value.length;
      if (remain <= 0)
        return;
      common_vendor.index.chooseImage({
        count: remain,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
        success: (res) => {
          const paths = res.tempFilePaths || [];
          paths.forEach((p) => {
            if (localImages.value.length >= 6)
              return;
            localImages.value.push(p);
          });
        }
      });
    };
    const removeImg = (idx) => {
      localImages.value.splice(idx, 1);
    };
    const preview = (idx) => {
      common_vendor.index.previewImage({ urls: localImages.value, current: idx });
    };
    const submit = async () => {
      const uid = uni_modules_uniIdPages_common_store.store.userInfo && uni_modules_uniIdPages_common_store.store.userInfo._id;
      if (!uid) {
        common_vendor.index.showToast({ title: "请先登录", icon: "none" });
        return;
      }
      const text = content.value.trim();
      if (!text) {
        common_vendor.index.showToast({ title: "请填写说明", icon: "none" });
        return;
      }
      submitting.value = true;
      common_vendor.index.showLoading({ title: "提交中…", mask: true });
      try {
        const fileIds = [];
        for (let i = 0; i < localImages.value.length; i++) {
          const p = localImages.value[i];
          const ext = p.match(/\.(\w+)$/) ? RegExp.$1 : "jpg";
          const cloudPath = `complaints/${uid}/${Date.now()}_${i}.${ext}`;
          const up = await common_vendor._r.uploadFile({ filePath: p, cloudPath });
          if (up.fileID)
            fileIds.push(up.fileID);
        }
        const db = common_vendor._r.database();
        await db.collection("complaints").add({
          user_id: uid,
          type: feedbackKind.value === "complaint" ? "service" : "other",
          content: text,
          feedback_kind: feedbackKind.value,
          images: fileIds,
          status: "pending"
        });
        common_vendor.index.hideLoading();
        common_vendor.index.showToast({ title: "提交成功", icon: "success" });
        setTimeout(() => common_vendor.index.navigateBack(), 1200);
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/common/feedback/index.vue:126", e);
        common_vendor.index.hideLoading();
        common_vendor.index.showToast({ title: e.message || "提交失败", icon: "none" });
      } finally {
        submitting.value = false;
      }
    };
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: feedbackKind.value === "complaint" ? 1 : "",
        b: common_vendor.o(($event) => feedbackKind.value = "complaint", "2d"),
        c: feedbackKind.value === "suggestion" ? 1 : "",
        d: common_vendor.o(($event) => feedbackKind.value = "suggestion", "b0"),
        e: feedbackKind.value === "complaint" ? "请描述您遇到的问题…" : "请写下您的建议…",
        f: content.value,
        g: common_vendor.o(($event) => content.value = $event.detail.value, "dc"),
        h: common_vendor.t(content.value.length),
        i: common_vendor.f(localImages.value, (img, idx, i0) => {
          return {
            a: img,
            b: common_vendor.o(($event) => preview(idx), idx),
            c: common_vendor.o(($event) => removeImg(idx), idx),
            d: idx
          };
        }),
        j: localImages.value.length < 6
      }, localImages.value.length < 6 ? {
        k: common_vendor.o(chooseImages, "f0")
      } : {}, {
        l: submitting.value,
        m: common_vendor.o(submit, "7f")
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-1401ccd0"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/common/feedback/index.js.map
