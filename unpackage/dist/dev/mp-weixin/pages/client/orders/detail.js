"use strict";
const common_vendor = require("../../../common/vendor.js");
const store_clientOrder = require("../../../store/clientOrder.js");
const _sfc_main = {
  __name: "detail",
  setup(__props) {
    const store = store_clientOrder.useClientOrderStore();
    const order = common_vendor.ref(null);
    const illegalOrder = common_vendor.ref(null);
    const illegalOrderPromise = common_vendor.ref(null);
    const db = common_vendor.tr.database();
    const timelineSteps = [
      { label: "已支付", status: "paid" },
      { label: "已接单", status: "accepted" },
      { label: "配送中", status: "delivering" },
      { label: "已送达", status: "completed" }
    ];
    const shouldShowRider = common_vendor.computed(() => {
      return order.value && (order.value.status === "delivering" || order.value.status === "completed") && order.value.rider;
    });
    const getStatusTitle = () => {
      if (!order.value)
        return "加载中...";
      const statusMap = {
        pending_accept: "等待骑手接单",
        delivering: "骑手正在配送中",
        completed: "订单已完成",
        cancelled: "订单已取消"
      };
      return statusMap[order.value.status] || "订单处理中";
    };
    const getStatusSubtitle = () => {
      if (!order.value)
        return "";
      if (order.value.status === "delivering") {
        return "预计 10 分钟送达";
      } else if (order.value.status === "pending_accept") {
        return "正在为您匹配骑手";
      } else if (order.value.status === "completed") {
        return "感谢您的使用";
      }
      return "";
    };
    const isStepActive = (stepStatus) => {
      if (!order.value)
        return false;
      const statusMapping = {
        pending_accept: "accepted",
        delivering: "delivering",
        completed: "completed"
      };
      return statusMapping[order.value.status] === stepStatus;
    };
    const isStepCompleted = (stepStatus) => {
      if (!order.value)
        return false;
      const statusOrder = ["paid", "accepted", "delivering", "completed"];
      const currentStatus = order.value.status;
      const currentIndex = statusOrder.findIndex((s) => {
        const mapping = {
          pending_accept: "accepted",
          delivering: "delivering",
          completed: "completed"
        };
        return mapping[currentStatus] === s;
      });
      const stepIndex = statusOrder.indexOf(stepStatus);
      return stepIndex < currentIndex || stepIndex === currentIndex && currentStatus !== "pending_accept";
    };
    const getOrderDescription = () => {
      var _a;
      if (!order.value)
        return "";
      if ((_a = order.value.content) == null ? void 0 : _a.description) {
        return order.value.content.description;
      }
      if (order.value.type === "pickup") {
        return `从 ${order.value.pickupLocation} 代取快递到 ${order.value.deliveryLocation}`;
      }
      return order.value.typeLabel || "订单详情";
    };
    const getRiderInitial = () => {
      var _a, _b;
      if (!((_b = (_a = order.value) == null ? void 0 : _a.rider) == null ? void 0 : _b.name))
        return "?";
      return order.value.rider.name.charAt(0).toUpperCase();
    };
    const formatTime = (timeStr) => {
      if (!timeStr)
        return "未知时间";
      return timeStr;
    };
    const previewImages = (currentIndex) => {
      var _a, _b, _c;
      if (!((_c = (_b = (_a = order.value) == null ? void 0 : _a.content) == null ? void 0 : _b.images) == null ? void 0 : _c.length))
        return;
      common_vendor.index.previewImage({
        urls: order.value.content.images,
        current: order.value.content.images[currentIndex]
      });
    };
    const handleCallRider = () => {
      var _a, _b;
      if (!((_b = (_a = order.value) == null ? void 0 : _a.rider) == null ? void 0 : _b.phone)) {
        common_vendor.index.showToast({ title: "暂无骑手电话", icon: "none" });
        return;
      }
      common_vendor.index.makePhoneCall({
        phoneNumber: order.value.rider.phone,
        fail: (err) => {
          common_vendor.index.__f__("error", "at pages/client/orders/detail.vue:299", "拨打电话失败:", err);
          common_vendor.index.showToast({ title: "拨打电话失败", icon: "none" });
        }
      });
    };
    const handleCancelOrder = () => {
      common_vendor.index.showModal({
        title: "确认取消",
        content: "确定要取消这个订单吗？",
        success: async (res) => {
          if (res.confirm) {
            common_vendor.index.showLoading({ title: "处理中..." });
            const success = await store.cancelOrder(order.value.id);
            common_vendor.index.hideLoading();
            if (success) {
              common_vendor.index.showToast({ title: "订单已取消", icon: "success" });
              setTimeout(() => {
                common_vendor.index.navigateBack();
              }, 1500);
            }
          }
        }
      });
    };
    const loadIllegalOrderForCurrentOrder = async () => {
      var _a;
      if (!((_a = order.value) == null ? void 0 : _a.id) || order.value.status !== "cancelled") {
        illegalOrder.value = null;
        return;
      }
      const orderId = order.value.id;
      try {
        if (illegalOrderPromise.value)
          return illegalOrderPromise.value;
        illegalOrderPromise.value = db.collection("illegal-order").where({ order_id: orderId }).limit(1).get().then((res) => {
          illegalOrder.value = res.data && res.data.length ? res.data[0] : null;
        }).catch((e) => {
          common_vendor.index.__f__("warn", "at pages/client/orders/detail.vue:350", "加载 illegal-order 失败:", e);
          illegalOrder.value = null;
        }).finally(() => {
          illegalOrderPromise.value = null;
        });
        return illegalOrderPromise.value;
      } catch (e) {
        common_vendor.index.__f__("warn", "at pages/client/orders/detail.vue:359", "加载 illegal-order 异常:", e);
        illegalOrder.value = null;
        return null;
      }
    };
    const formatQty = (n) => {
      const v = Number(n || 0);
      return Number.isFinite(v) ? v : 0;
    };
    const getIllegalReasonText = () => {
      var _a;
      const text = (_a = illegalOrder.value) == null ? void 0 : _a.reason_text;
      return text ? text : "未记录原因";
    };
    const handleUrgent = () => {
      common_vendor.index.showModal({
        title: "加急服务",
        content: "加急服务将额外收取 ¥1.00，是否确认？",
        success: (res) => {
          if (res.confirm) {
            common_vendor.index.showToast({ title: "加急成功", icon: "success" });
          }
        }
      });
    };
    const handleConfirmDelivery = () => {
      common_vendor.index.showModal({
        title: "确认送达",
        content: "确认订单已送达？",
        success: (res) => {
          if (res.confirm) {
            const success = store.confirmComplete ? store.confirmComplete(order.value.id) : false;
            if (success) {
              common_vendor.index.showToast({ title: "确认成功", icon: "success" });
              loadOrder();
            } else {
              common_vendor.index.showToast({ title: "确认失败", icon: "none" });
            }
          }
        }
      });
    };
    const handleDeleteOrder = () => {
      common_vendor.index.showModal({
        title: "确认删除",
        content: "确定要删除这个订单吗？删除后无法恢复",
        success: async (res) => {
          if (res.confirm) {
            common_vendor.index.showLoading({ title: "处理中..." });
            const success = await store.deleteOrder(order.value.id);
            common_vendor.index.hideLoading();
            if (success) {
              common_vendor.index.showToast({ title: "删除成功", icon: "success" });
              setTimeout(() => {
                common_vendor.index.navigateBack();
              }, 1500);
            }
          }
        }
      });
    };
    const loadOrder = async () => {
      var _a;
      if ((_a = order.value) == null ? void 0 : _a.id) {
        await store.loadFromStorage();
        const updatedOrder = store.getOrderById(order.value.id);
        if (updatedOrder) {
          order.value = updatedOrder;
          await loadIllegalOrderForCurrentOrder();
        }
      }
    };
    common_vendor.onLoad(async (options) => {
      if (options.id) {
        await store.loadFromStorage();
        const foundOrder = store.getOrderById(options.id);
        if (foundOrder) {
          order.value = foundOrder;
          await loadIllegalOrderForCurrentOrder();
        } else {
          common_vendor.index.showToast({ title: "订单不存在", icon: "none" });
          setTimeout(() => {
            common_vendor.index.navigateBack();
          }, 1500);
        }
      } else {
        common_vendor.index.showToast({ title: "订单ID缺失", icon: "none" });
        setTimeout(() => {
          common_vendor.index.navigateBack();
        }, 1500);
      }
    });
    common_vendor.onShow(async () => {
      var _a;
      if ((_a = order.value) == null ? void 0 : _a.id) {
        await store.loadFromStorage();
        const updatedOrder = store.getOrderById(order.value.id);
        if (updatedOrder) {
          order.value = updatedOrder;
          await loadIllegalOrderForCurrentOrder();
        }
      }
    });
    return (_ctx, _cache) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J;
      return common_vendor.e({
        a: common_vendor.t(getStatusTitle()),
        b: common_vendor.t(getStatusSubtitle()),
        c: common_vendor.n((_a = order.value) == null ? void 0 : _a.status),
        d: common_vendor.f(timelineSteps, (step, index, i0) => {
          return common_vendor.e({
            a: isStepCompleted(step.status)
          }, isStepCompleted(step.status) ? {} : {}, {
            b: common_vendor.t(step.label),
            c: index < timelineSteps.length - 1
          }, index < timelineSteps.length - 1 ? {} : {}, {
            d: index,
            e: isStepActive(step.status) ? 1 : "",
            f: isStepCompleted(step.status) ? 1 : ""
          });
        }),
        e: shouldShowRider.value
      }, shouldShowRider.value ? common_vendor.e({
        f: (_b = order.value.rider) == null ? void 0 : _b.avatar
      }, ((_c = order.value.rider) == null ? void 0 : _c.avatar) ? {
        g: order.value.rider.avatar
      } : {
        h: common_vendor.t(getRiderInitial())
      }, {
        i: common_vendor.t(((_d = order.value.rider) == null ? void 0 : _d.name) || "未知骑手"),
        j: common_vendor.t(((_e = order.value.rider) == null ? void 0 : _e.phone) || "暂无电话"),
        k: common_vendor.o(handleCallRider)
      }) : {}, {
        l: common_vendor.t(((_f = order.value) == null ? void 0 : _f.typeLabel) || "订单"),
        m: common_vendor.n((_g = order.value) == null ? void 0 : _g.type),
        n: common_vendor.t(Number(((_h = order.value) == null ? void 0 : _h.price) || 0).toFixed(2)),
        o: ((_i = order.value) == null ? void 0 : _i.type) === "pickup" && ((_l = (_k = (_j = order.value) == null ? void 0 : _j.content) == null ? void 0 : _k.images) == null ? void 0 : _l.length)
      }, ((_m = order.value) == null ? void 0 : _m.type) === "pickup" && ((_p = (_o = (_n = order.value) == null ? void 0 : _n.content) == null ? void 0 : _o.images) == null ? void 0 : _p.length) ? {
        p: common_vendor.f(order.value.content.images, (img, idx, i0) => {
          return {
            a: idx,
            b: img,
            c: common_vendor.o(($event) => previewImages(idx), idx)
          };
        })
      } : {}, {
        q: common_vendor.t(getOrderDescription()),
        r: common_vendor.t(((_q = order.value) == null ? void 0 : _q.address) || ((_r = order.value) == null ? void 0 : _r.deliveryLocation) || "未指定"),
        s: common_vendor.t(formatTime(((_s = order.value) == null ? void 0 : _s.createTime) || ((_t = order.value) == null ? void 0 : _t.publishedAt))),
        t: (_u = order.value) == null ? void 0 : _u.rider
      }, ((_v = order.value) == null ? void 0 : _v.rider) ? {
        v: common_vendor.t(formatTime(order.value.createTime))
      } : {}, {
        w: ((_w = order.value) == null ? void 0 : _w.status) === "cancelled" && illegalOrder.value
      }, ((_x = order.value) == null ? void 0 : _x.status) === "cancelled" && illegalOrder.value ? {
        x: common_vendor.t(getIllegalReasonText()),
        y: common_vendor.t(formatQty((_z = (_y = illegalOrder.value) == null ? void 0 : _y.rider_quantities) == null ? void 0 : _z.small)),
        z: common_vendor.t(formatQty((_B = (_A = illegalOrder.value) == null ? void 0 : _A.rider_quantities) == null ? void 0 : _B.medium)),
        A: common_vendor.t(formatQty((_D = (_C = illegalOrder.value) == null ? void 0 : _C.rider_quantities) == null ? void 0 : _D.large))
      } : {}, {
        B: ((_E = order.value) == null ? void 0 : _E.status) === "pending_accept"
      }, ((_F = order.value) == null ? void 0 : _F.status) === "pending_accept" ? {
        C: common_vendor.o(handleCancelOrder),
        D: common_vendor.o(handleUrgent)
      } : {}, {
        E: ((_G = order.value) == null ? void 0 : _G.status) === "delivering"
      }, ((_H = order.value) == null ? void 0 : _H.status) === "delivering" ? {
        F: common_vendor.o(handleConfirmDelivery)
      } : {}, {
        G: ((_I = order.value) == null ? void 0 : _I.status) === "completed"
      }, ((_J = order.value) == null ? void 0 : _J.status) === "completed" ? {
        H: common_vendor.o(handleDeleteOrder)
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-00b5e79f"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/client/orders/detail.js.map
