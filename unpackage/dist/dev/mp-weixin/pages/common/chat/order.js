"use strict";
const common_vendor = require("../../../common/vendor.js");
const _sfc_main = {
  __name: "order",
  setup(__props) {
    const orderService = common_vendor._r.importObject("order-service");
    const orderId = common_vendor.ref("");
    const role = common_vendor.ref("user");
    const messages = common_vendor.ref([]);
    const draft = common_vendor.ref("");
    const sending = common_vendor.ref(false);
    const scrollToId = common_vendor.ref("");
    let timer = null;
    common_vendor.onLoad(async (options) => {
      orderId.value = String((options == null ? void 0 : options.orderId) || "");
      role.value = String((options == null ? void 0 : options.role) || "user");
      if (!orderId.value) {
        common_vendor.index.showToast({ title: "订单ID缺失", icon: "none" });
        setTimeout(() => common_vendor.index.navigateBack(), 800);
        return;
      }
      await loadMessages();
      timer = setInterval(loadMessages, 8e3);
    });
    common_vendor.onUnload(() => {
      if (timer)
        clearInterval(timer);
      timer = null;
    });
    const loadMessages = async () => {
      var _a;
      try {
        const res = await orderService.listOrderChatMessages({ orderId: orderId.value, page: 1, pageSize: 100 });
        if ((res == null ? void 0 : res.code) !== 0)
          return;
        messages.value = ((_a = res.data) == null ? void 0 : _a.list) || [];
        jumpToBottom();
        await orderService.markOrderChatRead({ orderId: orderId.value });
      } catch (e) {
        common_vendor.index.__f__("warn", "at pages/common/chat/order.vue:69", "加载聊天消息失败:", e);
      }
    };
    const jumpToBottom = () => {
      if (!messages.value.length)
        return;
      const last = messages.value[messages.value.length - 1];
      scrollToId.value = `msg-${last._id}`;
    };
    const send = async () => {
      const content = String(draft.value || "").trim();
      if (!content || sending.value)
        return;
      sending.value = true;
      try {
        const res = await orderService.sendOrderChatMessage({ orderId: orderId.value, content });
        if ((res == null ? void 0 : res.code) !== 0) {
          common_vendor.index.showToast({ title: (res == null ? void 0 : res.message) || "发送失败", icon: "none" });
          return;
        }
        draft.value = "";
        messages.value = [...messages.value, res.data];
        jumpToBottom();
        await orderService.markOrderChatRead({ orderId: orderId.value });
      } catch (e) {
        common_vendor.index.showToast({ title: "发送失败，请重试", icon: "none" });
      } finally {
        sending.value = false;
      }
    };
    const formatTime = (ts) => {
      if (!ts)
        return "";
      const d = new Date(ts);
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return `${h}:${m}`;
    };
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: !messages.value.length
      }, !messages.value.length ? {} : {}, {
        b: common_vendor.f(messages.value, (item, k0, i0) => {
          return {
            a: common_vendor.t(item.content),
            b: common_vendor.t(formatTime(item.create_time)),
            c: item._id,
            d: `msg-${item._id}`,
            e: common_vendor.n(item.sender_role === role.value ? "self" : "peer")
          };
        }),
        c: scrollToId.value,
        d: common_vendor.o(send, "8a"),
        e: draft.value,
        f: common_vendor.o(($event) => draft.value = $event.detail.value, "f2"),
        g: sending.value,
        h: common_vendor.o(send, "0f")
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-6cd7e410"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/common/chat/order.js.map
