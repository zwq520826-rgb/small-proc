"use strict";
const common_vendor = require("../../../common/vendor.js");
const store_clientOrder = require("../../../store/clientOrder.js");
const FEEDBACK_LIMIT = 3;
const _sfc_main = {
  __name: "detail",
  setup(__props) {
    const store = store_clientOrder.useClientOrderStore();
    const order = common_vendor.ref(null);
    const detailContact = common_vendor.ref(null);
    const illegalOrder = common_vendor.ref(null);
    const illegalOrderPromise = common_vendor.ref(null);
    const db = common_vendor._r.database();
    const orderService = common_vendor._r.importObject("order-service");
    const timelineSteps = [
      { label: "已支付", status: "paid" },
      { label: "已接单", status: "accepted" },
      { label: "配送中", status: "delivering" },
      { label: "已送达", status: "completed" }
    ];
    const shouldShowRider = common_vendor.computed(() => {
      return order.value && (order.value.status === "pending_pickup" || order.value.status === "delivering" || order.value.status === "completed" || order.value.status === "abnormal") && order.value.rider;
    });
    const riderPhone = common_vendor.computed(() => {
      var _a, _b, _c, _d;
      return ((_b = (_a = detailContact.value) == null ? void 0 : _a.rider_contact) == null ? void 0 : _b.phone) || ((_d = (_c = order.value) == null ? void 0 : _c.rider) == null ? void 0 : _d.phone) || "";
    });
    const riderDisplayName = common_vendor.computed(() => {
      var _a, _b, _c, _d;
      return ((_b = (_a = detailContact.value) == null ? void 0 : _a.rider_contact) == null ? void 0 : _b.name) || ((_d = (_c = order.value) == null ? void 0 : _c.rider) == null ? void 0 : _d.name) || "";
    });
    const feedbackDisabled = common_vendor.computed(() => {
      if (!order.value)
        return true;
      return Number(order.value.photo_feedback_count || 0) >= FEEDBACK_LIMIT || !!order.value.need_customer_service;
    });
    const getStatusTitle = () => {
      if (!order.value)
        return "加载中...";
      const statusMap = {
        pending_accept: "等待骑手接单",
        pending_pickup: "骑手已接单，等待取货",
        delivering: "骑手正在配送中",
        completed: "订单已完成",
        abnormal: "异常单待处理",
        cancelled: "订单已取消"
      };
      return statusMap[order.value.status] || "订单处理中";
    };
    const getStatusSubtitle = () => {
      if (!order.value)
        return "";
      if (order.value.status === "delivering") {
        return "预计 10 分钟送达";
      } else if (order.value.status === "pending_pickup") {
        return "骑手已接单，正在前往取件";
      } else if (order.value.status === "pending_accept") {
        return "正在为您匹配骑手";
      } else if (order.value.status === "completed") {
        return "感谢您的使用";
      } else if (order.value.status === "abnormal") {
        return "已通知骑手重传送达照片";
      }
      return "";
    };
    const isStepActive = (stepStatus) => {
      if (!order.value)
        return false;
      const statusMapping = {
        pending_accept: "accepted",
        pending_pickup: "accepted",
        delivering: "delivering",
        completed: "completed",
        abnormal: "completed"
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
          pending_pickup: "accepted",
          delivering: "delivering",
          completed: "completed",
          abnormal: "completed"
        };
        return mapping[currentStatus] === s;
      });
      const stepIndex = statusOrder.indexOf(stepStatus);
      return stepIndex < currentIndex || stepIndex === currentIndex && currentStatus !== "pending_accept";
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
      if (!riderPhone.value) {
        common_vendor.index.showToast({ title: "暂无骑手电话", icon: "none" });
        return;
      }
      common_vendor.index.makePhoneCall({
        phoneNumber: riderPhone.value.replace(/\*/g, ""),
        fail: (err) => {
          common_vendor.index.__f__("error", "at pages/client/orders/detail.vue:360", "拨打电话失败:", err);
          common_vendor.index.showToast({ title: "拨打电话失败", icon: "none" });
        }
      });
    };
    const openOrderChat = () => {
      var _a;
      if (!((_a = order.value) == null ? void 0 : _a.id))
        return;
      common_vendor.index.navigateTo({
        url: `/pages/common/chat/order?orderId=${encodeURIComponent(String(order.value.id))}&role=user`
      });
    };
    const loadOrderDetailContact = async (orderId) => {
      try {
        const res = await orderService.getOrderDetail(orderId);
        if ((res == null ? void 0 : res.code) === 0 && res.data) {
          detailContact.value = {
            rider_contact: res.data.rider_contact || null,
            user_contact: res.data.user_contact || null
          };
        }
      } catch (e) {
        common_vendor.index.__f__("warn", "at pages/client/orders/detail.vue:383", "加载订单联系人失败:", e);
      }
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
          common_vendor.index.__f__("warn", "at pages/client/orders/detail.vue:432", "加载 illegal-order 失败:", e);
          illegalOrder.value = null;
        }).finally(() => {
          illegalOrderPromise.value = null;
        });
        return illegalOrderPromise.value;
      } catch (e) {
        common_vendor.index.__f__("warn", "at pages/client/orders/detail.vue:441", "加载 illegal-order 异常:", e);
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
            common_vendor.index.showActionSheet({
              itemList: ["微信支付 ¥1.00"],
              success: (sheetRes) => {
                if (sheetRes.tapIndex === 0) {
                  doUrgentPay();
                }
              }
            });
          }
        }
      });
    };
    const doUrgentPay = async (method) => {
      var _a;
      common_vendor.index.showLoading({ title: "处理中..." });
      try {
        let createRes;
        try {
          createRes = await orderService.createUrgentOrder({
            orderId: order.value.id || order.value._id,
            amount: 1
          });
        } catch (innerErr) {
          const errMsg = String((innerErr == null ? void 0 : innerErr.message) || innerErr || "");
          if (errMsg.includes("createUrgentOrder")) {
            common_vendor.index.hideLoading();
            common_vendor.index.showToast({ title: "云端未实现 createUrgentOrder，请先部署 order-service", icon: "none" });
            return;
          }
          throw innerErr;
        }
        if (createRes.code !== 0) {
          common_vendor.index.hideLoading();
          common_vendor.index.showToast({ title: createRes.message || "创建加急订单失败", icon: "none" });
          return;
        }
        const urgentOrderId = (_a = createRes.data) == null ? void 0 : _a.orderId;
        const paymentService = common_vendor._r.importObject("payment-service");
        const payRes = await paymentService.createJsapiOrder({ orderId: urgentOrderId });
        if (payRes.code !== 0) {
          common_vendor.index.hideLoading();
          common_vendor.index.showToast({ title: payRes.message || "支付失败", icon: "none" });
          return;
        }
        const { appId, timeStamp, nonceStr, package: packageValue, signType, paySign } = payRes.data;
        common_vendor.index.requestPayment({
          provider: "wxpay",
          appId,
          timeStamp,
          nonceStr,
          package: packageValue,
          signType,
          paySign,
          success: async () => {
            try {
              await paymentService.confirmPaid({ outTradeNo: payRes.data.outTradeNo });
            } catch (e) {
            }
            common_vendor.index.hideLoading();
            common_vendor.index.showToast({ title: "加急成功", icon: "success" });
            loadOrder();
          },
          fail: (err) => {
            var _a2;
            common_vendor.index.hideLoading();
            if ((_a2 = err.errMsg) == null ? void 0 : _a2.includes("cancel")) {
              common_vendor.index.showToast({ title: "已取消支付", icon: "none" });
            } else {
              common_vendor.index.showToast({ title: "支付失败", icon: "none" });
            }
          }
        });
      } catch (e) {
        common_vendor.index.hideLoading();
        common_vendor.index.__f__("error", "at pages/client/orders/detail.vue:541", "加急支付异常:", e);
        common_vendor.index.showToast({ title: "加急失败，请稍后重试", icon: "none" });
      }
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
    const handleWrongPhotoFeedback = () => {
      var _a;
      if (!((_a = order.value) == null ? void 0 : _a.id))
        return;
      if (feedbackDisabled.value) {
        common_vendor.index.showModal({
          title: "请联系客服",
          content: "该订单反馈次数已达上限，请联系客服人工处理。",
          showCancel: false
        });
        return;
      }
      common_vendor.index.showModal({
        title: "提交异常反馈",
        editable: true,
        placeholderText: "请输入异常说明（例如：图片不是我宿舍门口）",
        content: "请填写备注说明，提交后会通知骑手重新上传送达凭证。",
        success: async (res) => {
          var _a2, _b;
          if (!res.confirm)
            return;
          const reason = String(res.content || "").trim();
          if (!reason) {
            common_vendor.index.showToast({ title: "请填写异常说明", icon: "none" });
            return;
          }
          common_vendor.index.showLoading({ title: "提交中..." });
          const ret = await store.reportDeliveryIssue(order.value.id, reason);
          common_vendor.index.hideLoading();
          if (!(ret == null ? void 0 : ret.success))
            return;
          const feedbackCount = Number(((_a2 = ret == null ? void 0 : ret.data) == null ? void 0 : _a2.feedbackCount) || 0);
          const needCS = !!((_b = ret == null ? void 0 : ret.data) == null ? void 0 : _b.contactRequired);
          if (order.value) {
            order.value = {
              ...order.value,
              status: "abnormal",
              abnormal_remark: reason,
              photo_feedback_count: feedbackCount,
              need_customer_service: needCS
            };
          }
          common_vendor.index.showToast({
            title: needCS ? "已转客服介入" : "已通知骑手重传",
            icon: "none"
          });
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
          await loadOrderDetailContact(updatedOrder.id);
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
          await loadOrderDetailContact(foundOrder.id);
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
          await loadOrderDetailContact(updatedOrder.id);
          await loadIllegalOrderForCurrentOrder();
        }
      }
    });
    return (_ctx, _cache) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$, _aa, _ba, _ca, _da, _ea, _fa, _ga, _ha, _ia, _ja, _ka;
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
        i: common_vendor.t(riderDisplayName.value || "未知骑手"),
        j: common_vendor.t(riderPhone.value || "暂无电话"),
        k: common_vendor.o(handleCallRider, "d3"),
        l: common_vendor.o(openOrderChat, "7c")
      }) : {}, {
        m: common_vendor.t(((_d = order.value) == null ? void 0 : _d.typeLabel) || "订单"),
        n: common_vendor.n((_e = order.value) == null ? void 0 : _e.type),
        o: common_vendor.t(Number(((_f = order.value) == null ? void 0 : _f.price) || 0).toFixed(2)),
        p: ((_g = order.value) == null ? void 0 : _g.type) === "pickup" && ((_j = (_i = (_h = order.value) == null ? void 0 : _h.content) == null ? void 0 : _i.images) == null ? void 0 : _j.length)
      }, ((_k = order.value) == null ? void 0 : _k.type) === "pickup" && ((_n = (_m = (_l = order.value) == null ? void 0 : _l.content) == null ? void 0 : _m.images) == null ? void 0 : _n.length) ? {
        q: common_vendor.f(order.value.content.images, (img, idx, i0) => {
          return {
            a: idx,
            b: img,
            c: common_vendor.o(($event) => previewImages(idx), idx)
          };
        })
      } : {}, {
        r: ((_p = (_o = order.value) == null ? void 0 : _o.content) == null ? void 0 : _p.description) || ((_r = (_q = order.value) == null ? void 0 : _q.content) == null ? void 0 : _r.remark)
      }, ((_t = (_s = order.value) == null ? void 0 : _s.content) == null ? void 0 : _t.description) || ((_v = (_u = order.value) == null ? void 0 : _u.content) == null ? void 0 : _v.remark) ? common_vendor.e({
        s: (_x = (_w = order.value) == null ? void 0 : _w.content) == null ? void 0 : _x.description
      }, ((_z = (_y = order.value) == null ? void 0 : _y.content) == null ? void 0 : _z.description) ? {
        t: common_vendor.t(order.value.content.description)
      } : {}, {
        v: (_B = (_A = order.value) == null ? void 0 : _A.content) == null ? void 0 : _B.remark
      }, ((_D = (_C = order.value) == null ? void 0 : _C.content) == null ? void 0 : _D.remark) ? {
        w: common_vendor.t(order.value.content.remark)
      } : {}) : {}, {
        x: common_vendor.t(((_E = order.value) == null ? void 0 : _E.address) || ((_F = order.value) == null ? void 0 : _F.deliveryLocation) || "未指定"),
        y: common_vendor.t(formatTime(((_G = order.value) == null ? void 0 : _G.createTime) || ((_H = order.value) == null ? void 0 : _H.publishedAt))),
        z: (_I = order.value) == null ? void 0 : _I.rider
      }, ((_J = order.value) == null ? void 0 : _J.rider) ? {
        A: common_vendor.t(formatTime(order.value.createTime))
      } : {}, {
        B: ((_K = order.value) == null ? void 0 : _K.status) === "cancelled" && illegalOrder.value
      }, ((_L = order.value) == null ? void 0 : _L.status) === "cancelled" && illegalOrder.value ? {
        C: common_vendor.t(getIllegalReasonText()),
        D: common_vendor.t(formatQty((_N = (_M = illegalOrder.value) == null ? void 0 : _M.rider_quantities) == null ? void 0 : _N.small)),
        E: common_vendor.t(formatQty((_P = (_O = illegalOrder.value) == null ? void 0 : _O.rider_quantities) == null ? void 0 : _P.medium)),
        F: common_vendor.t(formatQty((_R = (_Q = illegalOrder.value) == null ? void 0 : _Q.rider_quantities) == null ? void 0 : _R.large))
      } : {}, {
        G: ((_S = order.value) == null ? void 0 : _S.status) === "abnormal"
      }, ((_T = order.value) == null ? void 0 : _T.status) === "abnormal" ? common_vendor.e({
        H: common_vendor.t(Number(((_U = order.value) == null ? void 0 : _U.photo_feedback_count) || 0)),
        I: common_vendor.t(FEEDBACK_LIMIT),
        J: (_V = order.value) == null ? void 0 : _V.need_customer_service
      }, ((_W = order.value) == null ? void 0 : _W.need_customer_service) ? {} : {}, {
        K: (_X = order.value) == null ? void 0 : _X.abnormal_remark
      }, ((_Y = order.value) == null ? void 0 : _Y.abnormal_remark) ? {
        L: common_vendor.t(order.value.abnormal_remark)
      } : {}) : {}, {
        M: ((_Z = order.value) == null ? void 0 : _Z.status) === "pending_accept"
      }, ((__ = order.value) == null ? void 0 : __.status) === "pending_accept" ? common_vendor.e({
        N: common_vendor.o(handleCancelOrder, "aa"),
        O: !((_aa = (_$ = order.value) == null ? void 0 : _$.content) == null ? void 0 : _aa.isUrgent)
      }, !((_ca = (_ba = order.value) == null ? void 0 : _ba.content) == null ? void 0 : _ca.isUrgent) ? {
        P: common_vendor.o(handleUrgent, "3c")
      } : {}) : {}, {
        Q: ((_da = order.value) == null ? void 0 : _da.status) === "pending_pickup"
      }, ((_ea = order.value) == null ? void 0 : _ea.status) === "pending_pickup" ? {
        R: common_vendor.o(handleCancelOrder, "c1")
      } : {}, {
        S: ((_fa = order.value) == null ? void 0 : _fa.status) === "delivering"
      }, ((_ga = order.value) == null ? void 0 : _ga.status) === "delivering" ? {
        T: common_vendor.o(handleConfirmDelivery, "a1"),
        U: common_vendor.o(handleCancelOrder, "20")
      } : {}, {
        V: ((_ha = order.value) == null ? void 0 : _ha.status) === "completed" || ((_ia = order.value) == null ? void 0 : _ia.status) === "abnormal"
      }, ((_ja = order.value) == null ? void 0 : _ja.status) === "completed" || ((_ka = order.value) == null ? void 0 : _ka.status) === "abnormal" ? {
        W: common_vendor.o(handleDeleteOrder, "c0"),
        X: common_vendor.t(feedbackDisabled.value ? "请联系客服" : "异常反馈"),
        Y: feedbackDisabled.value,
        Z: common_vendor.o(handleWrongPhotoFeedback, "d4")
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-00b5e79f"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/client/orders/detail.js.map
