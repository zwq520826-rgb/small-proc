"use strict";
const common_vendor = require("../../../common/vendor.js");
const store_riderTask = require("../../../store/riderTask.js");
const _sfc_main = {
  __name: "detail",
  setup(__props) {
    const store = store_riderTask.useRiderTaskStore();
    const task = common_vendor.ref(null);
    common_vendor.onLoad(async (options) => {
      if (options.id) {
        await store.loadFromStorage();
        const found = store.getTaskById(options.id);
        if (found) {
          task.value = found;
        } else {
          common_vendor.index.showToast({ title: "任务不存在", icon: "none" });
          setTimeout(() => {
            common_vendor.index.navigateBack();
          }, 1500);
        }
      }
    });
    const statusText = common_vendor.computed(() => {
      var _a, _b;
      const map = {
        pending_accept: "待接单",
        pending_pickup: "待取货",
        delivering: "配送中",
        completed: "已送达"
      };
      return map[(_a = task.value) == null ? void 0 : _a.status] || ((_b = task.value) == null ? void 0 : _b.status);
    });
    const statusDesc = common_vendor.computed(() => {
      var _a, _b, _c, _d;
      if (((_a = task.value) == null ? void 0 : _a.status) === "pending_accept")
        return "点击下方按钮立即抢单";
      if (((_b = task.value) == null ? void 0 : _b.status) === "pending_pickup")
        return "请前往取货点取货";
      if (((_c = task.value) == null ? void 0 : _c.status) === "delivering")
        return "请尽快送达客户手中";
      if (((_d = task.value) == null ? void 0 : _d.status) === "completed")
        return "任务已完成";
      return "";
    });
    const goBack = () => common_vendor.index.navigateBack();
    const handleCall = () => {
      var _a, _b, _c;
      const phone = ((_b = (_a = task.value) == null ? void 0 : _a.content) == null ? void 0 : _b.phone) || ((_c = task.value) == null ? void 0 : _c.phone) || "";
      if (!phone) {
        common_vendor.index.showToast({ title: "暂无客户电话", icon: "none" });
        return;
      }
      common_vendor.index.makePhoneCall({ phoneNumber: phone.replace(/\*/g, "") });
    };
    const handleGrab = async () => {
      common_vendor.index.showModal({
        title: "确认抢单",
        content: "确定要接这个订单吗？",
        success: async (res) => {
          if (res.confirm) {
            common_vendor.index.showLoading({ title: "抢单中..." });
            const result = await store.grabTask(task.value.id || task.value._id);
            common_vendor.index.hideLoading();
            if (result.success) {
              common_vendor.index.showToast({ title: "抢单成功", icon: "success" });
              await store.loadFromStorage();
              const updatedTask = store.getTaskById(task.value.id || task.value._id);
              if (updatedTask) {
                task.value = updatedTask;
              }
            } else {
              common_vendor.index.showToast({ title: result.msg || "抢单失败", icon: "none" });
            }
          }
        }
      });
    };
    const previewImage = (url, urls) => {
      common_vendor.index.previewImage({
        urls: urls || [url],
        current: url
      });
    };
    const handleConfirmPickup = () => {
      common_vendor.index.showModal({
        title: "确认取货",
        content: "确认已拿到物品？",
        success: async (res) => {
          if (res.confirm) {
            common_vendor.index.showLoading({ title: "处理中..." });
            const success = await store.confirmPickup(task.value.id, null);
            common_vendor.index.hideLoading();
            if (success) {
              common_vendor.index.showToast({ title: "操作成功", icon: "success" });
              await store.loadFromStorage();
              const updatedTask = store.myTasks.find((t) => t.id === task.value.id || t._id === task.value.id);
              if (updatedTask) {
                task.value = updatedTask;
              }
            }
          }
        }
      });
    };
    const handleConfirmDelivery = () => {
      common_vendor.index.chooseImage({
        count: 1,
        success: async (res) => {
          const path = res.tempFilePaths[0];
          common_vendor.index.showLoading({ title: "上传中..." });
          const success = await store.confirmDelivery(task.value.id, [path]);
          common_vendor.index.hideLoading();
          if (success) {
            common_vendor.index.showToast({ title: "已送达", icon: "success" });
            await store.loadFromStorage();
            const updatedTask = store.myTasks.find((t) => t.id === task.value.id || t._id === task.value.id);
            if (updatedTask) {
              task.value = updatedTask;
            }
          }
          task.value = store.getTaskById(task.value.id);
          setTimeout(() => common_vendor.index.navigateBack(), 1500);
        }
      });
    };
    return (_ctx, _cache) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
      return common_vendor.e({
        a: task.value
      }, task.value ? common_vendor.e({
        b: common_vendor.t(statusText.value),
        c: common_vendor.t(statusDesc.value),
        d: common_vendor.n(task.value.status),
        e: common_vendor.t(task.value.deliveryLocation || task.value.address || "未指定送达点"),
        f: common_vendor.t(task.value.id),
        g: common_vendor.t(task.value.typeLabel || "配送"),
        h: common_vendor.t(Number(task.value.price || 0).toFixed(2)),
        i: common_vendor.t(((_a = task.value.content) == null ? void 0 : _a.description) || "无备注"),
        j: ((_c = (_b = task.value.content) == null ? void 0 : _b.images) == null ? void 0 : _c.length) || ((_e = (_d = task.value.content) == null ? void 0 : _d.pickupImages) == null ? void 0 : _e.length)
      }, ((_g = (_f = task.value.content) == null ? void 0 : _f.images) == null ? void 0 : _g.length) || ((_i = (_h = task.value.content) == null ? void 0 : _h.pickupImages) == null ? void 0 : _i.length) ? {
        k: common_vendor.f(task.value.content.images || task.value.content.pickupImages || [], (img, idx, i0) => {
          return {
            a: idx,
            b: img,
            c: common_vendor.o(($event) => previewImage(img, task.value.content.images || task.value.content.pickupImages || []), idx)
          };
        })
      } : {}, {
        l: ((_j = task.value.content) == null ? void 0 : _j.phone) || task.value.phone
      }, ((_k = task.value.content) == null ? void 0 : _k.phone) || task.value.phone ? {
        m: common_vendor.t(((_l = task.value.content) == null ? void 0 : _l.phone) || task.value.phone || ""),
        n: common_vendor.o(handleCall)
      } : {}) : {
        o: common_vendor.o(goBack)
      }, {
        p: task.value && task.value.status !== "completed"
      }, task.value && task.value.status !== "completed" ? common_vendor.e({
        q: task.value.status === "pending_accept"
      }, task.value.status === "pending_accept" ? {
        r: common_vendor.o(handleGrab)
      } : {}, {
        s: task.value.status === "pending_pickup"
      }, task.value.status === "pending_pickup" ? {
        t: common_vendor.o(handleConfirmPickup)
      } : {}, {
        v: task.value.status === "delivering"
      }, task.value.status === "delivering" ? {
        w: common_vendor.o(handleConfirmDelivery)
      } : {}) : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-163fccdb"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/rider/tasks/detail.js.map
