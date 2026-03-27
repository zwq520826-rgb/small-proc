"use strict";
const common_vendor = require("../../../common/vendor.js");
const store_riderTask = require("../../../store/riderTask.js");
const _sfc_main = {
  __name: "detail",
  setup(__props) {
    const store = store_riderTask.useRiderTaskStore();
    const task = common_vendor.ref(null);
    const cancelPopupVisible = common_vendor.ref(false);
    const cancelReasonType = common_vendor.ref("rider_personal");
    const cancelReasonText = common_vendor.ref("");
    common_vendor.onLoad(async (options) => {
      if (options.id) {
        await store.loadFromStorage();
        const found = store.getTaskById(options.id);
        if (found) {
          task.value = found;
          const openCancel = String(options.openCancel || "").toLowerCase() === "1";
          if (openCancel)
            openCancelPopup();
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
    const openCancelPopup = () => {
      if (!task.value)
        return;
      cancelPopupVisible.value = true;
      cancelReasonText.value = "";
      cancelReasonType.value = "rider_personal";
    };
    const closeCancelPopup = () => {
      cancelPopupVisible.value = false;
    };
    const onChangeReasonMode = (e) => {
      var _a;
      cancelReasonType.value = (_a = e == null ? void 0 : e.detail) == null ? void 0 : _a.value;
    };
    const confirmCancel = async () => {
      if (!task.value)
        return;
      if (!cancelReasonText.value || cancelReasonText.value.trim().length < 6 || cancelReasonText.value.trim().length > 30) {
        common_vendor.index.showToast({ title: "取消原因需在 6~30 字之间", icon: "none" });
        return;
      }
      const reasonType = cancelReasonType.value;
      const reasonText = cancelReasonText.value.trim();
      if (reasonType === "user_illegal") {
        common_vendor.index.showLoading({ title: "取消中..." });
        const res2 = await store.riderCancelOrder(task.value.id || task.value._id, {
          reasonType: "user_illegal",
          reasonText
        });
        common_vendor.index.hideLoading();
        if (res2 == null ? void 0 : res2.success) {
          common_vendor.index.showToast({ title: "已触发全额退款", icon: "success" });
          setTimeout(() => common_vendor.index.navigateBack(), 800);
        }
        return;
      }
      common_vendor.index.showLoading({ title: "取消中..." });
      const res = await store.riderCancelOrder(task.value.id || task.value._id, {
        reasonType: "rider_personal",
        reasonText
      });
      common_vendor.index.hideLoading();
      if (res == null ? void 0 : res.success) {
        common_vendor.index.showToast({ title: "已回到大厅", icon: "success" });
        setTimeout(() => common_vendor.index.navigateBack(), 800);
      }
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
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u;
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
        i: (_a = task.value.content) == null ? void 0 : _a.description
      }, ((_b = task.value.content) == null ? void 0 : _b.description) ? {
        j: common_vendor.t((_c = task.value.content) == null ? void 0 : _c.description)
      } : {}, {
        k: (_d = task.value.content) == null ? void 0 : _d.remark
      }, ((_e = task.value.content) == null ? void 0 : _e.remark) ? {
        l: common_vendor.t((_f = task.value.content) == null ? void 0 : _f.remark)
      } : {}, {
        m: !((_g = task.value.content) == null ? void 0 : _g.description) && !((_h = task.value.content) == null ? void 0 : _h.remark)
      }, !((_i = task.value.content) == null ? void 0 : _i.description) && !((_j = task.value.content) == null ? void 0 : _j.remark) ? {} : {}, {
        n: ((_l = (_k = task.value.content) == null ? void 0 : _k.images) == null ? void 0 : _l.length) || ((_n = (_m = task.value.content) == null ? void 0 : _m.pickupImages) == null ? void 0 : _n.length)
      }, ((_p = (_o = task.value.content) == null ? void 0 : _o.images) == null ? void 0 : _p.length) || ((_r = (_q = task.value.content) == null ? void 0 : _q.pickupImages) == null ? void 0 : _r.length) ? {
        o: common_vendor.f(task.value.content.images || task.value.content.pickupImages || [], (img, idx, i0) => {
          return {
            a: idx,
            b: img,
            c: common_vendor.o(($event) => previewImage(img, task.value.content.images || task.value.content.pickupImages || []), idx)
          };
        })
      } : {}, {
        p: ((_s = task.value.content) == null ? void 0 : _s.phone) || task.value.phone
      }, ((_t = task.value.content) == null ? void 0 : _t.phone) || task.value.phone ? {
        q: common_vendor.t(((_u = task.value.content) == null ? void 0 : _u.phone) || task.value.phone || ""),
        r: common_vendor.o(handleCall, "48")
      } : {}) : {
        s: common_vendor.o(goBack, "49")
      }, {
        t: task.value && task.value.status !== "completed"
      }, task.value && task.value.status !== "completed" ? common_vendor.e({
        v: task.value.status === "pending_accept"
      }, task.value.status === "pending_accept" ? {
        w: common_vendor.o(handleGrab, "61")
      } : {}, {
        x: task.value.status === "pending_pickup"
      }, task.value.status === "pending_pickup" ? {
        y: common_vendor.o(handleConfirmPickup, "a9"),
        z: common_vendor.o(openCancelPopup, "60")
      } : {}, {
        A: task.value.status === "delivering"
      }, task.value.status === "delivering" ? {
        B: common_vendor.o(handleConfirmDelivery, "41"),
        C: common_vendor.o(openCancelPopup, "ea")
      } : {}) : {}, {
        D: cancelPopupVisible.value
      }, cancelPopupVisible.value ? {
        E: common_vendor.o(onChangeReasonMode, "28"),
        F: cancelReasonType.value,
        G: cancelReasonText.value,
        H: common_vendor.o(($event) => cancelReasonText.value = $event.detail.value, "bb"),
        I: common_vendor.o(closeCancelPopup, "ca"),
        J: common_vendor.o(confirmCancel, "c0"),
        K: common_vendor.o(() => {
        }, "e7"),
        L: common_vendor.o(closeCancelPopup, "e0")
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-163fccdb"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/rider/tasks/detail.js.map
