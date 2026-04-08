"use strict";
const common_vendor = require("../common/vendor.js");
const orderService = common_vendor.tr.importObject("order-service");
const state = common_vendor.reactive({
  orders: []
});
function resolveTypeLabel(type, typeLabel) {
  if (typeLabel)
    return typeLabel;
  if (type === "pickup")
    return "快递代取";
  if (type === "errand")
    return "跑腿服务";
  return "订单";
}
const pagingState = common_vendor.reactive({
  page: 1,
  pageSize: 20,
  total: 0,
  hasMore: true,
  loading: false
});
let inited = false;
let initPromise = null;
function formatOrderFromDB(order) {
  return {
    id: order._id,
    _id: order._id,
    type: order.type,
    typeLabel: resolveTypeLabel(order.type, order.type_label),
    pickupLocation: order.pickup_location || "",
    deliveryLocation: order.delivery_location || "",
    address: order.address || order.delivery_location || "",
    status: order.status,
    abnormal_reason: order.abnormal_reason || "",
    abnormal_remark: order.abnormal_remark || "",
    photo_feedback_count: Number(order.photo_feedback_count || 0),
    need_customer_service: !!order.need_customer_service,
    price: order.price,
    content: order.content || {},
    tags: order.tags || [],
    createTime: order.create_time ? new Date(order.create_time).toLocaleString() : "",
    create_time: order.create_time
  };
}
function formatOrderToDB(orderData) {
  let deliveryLocation = orderData.deliveryLocation || "";
  const addr = orderData.address || "";
  if (!deliveryLocation && addr) {
    const addrLines = addr.split("\n");
    deliveryLocation = addrLines.length > 1 ? addrLines.slice(1).join("\n") : addrLines[0];
  }
  return {
    type: orderData.type,
    type_label: orderData.typeLabel || "",
    subscribe_result: orderData.subscribeResult || orderData.subscribe_result || {},
    price: Number(orderData.price),
    pickup_location: orderData.pickupLocation || "",
    delivery_location: deliveryLocation,
    address: addr,
    content: orderData.content || {},
    tags: orderData.tags || []
  };
}
async function fetchOrdersFromCloud({ page = 1, pageSize = 20, append = false } = {}) {
  try {
    pagingState.loading = true;
    const res = await orderService.getOrderList({
      status: "all",
      page,
      pageSize
    });
    if (res.code === 0) {
      const mapped = (res.data || []).map(formatOrderFromDB);
      if (append) {
        const seen = new Set(state.orders.map((o) => o.id || o._id));
        const incoming = mapped.filter((o) => !seen.has(o.id || o._id));
        state.orders = state.orders.concat(incoming);
      } else {
        state.orders = mapped;
      }
      const total = Number(res.total || 0);
      pagingState.page = page;
      pagingState.pageSize = pageSize;
      pagingState.total = total;
      pagingState.hasMore = state.orders.length < total;
      inited = true;
      return true;
    }
    common_vendor.index.__f__("error", "at store/clientOrder.js:113", "加载订单失败:", res.message);
    if (res.code !== "NO_LOGIN") {
      common_vendor.index.showToast({
        title: res.message || "加载失败",
        icon: "none"
      });
    }
    return false;
  } catch (error) {
    common_vendor.index.__f__("error", "at store/clientOrder.js:123", "加载订单失败:", error);
    return false;
  } finally {
    pagingState.loading = false;
  }
}
async function loadOrdersFromCloud({ force = false, page = 1, pageSize = 20, append = false } = {}) {
  if (inited && !force)
    return true;
  if (initPromise)
    return initPromise;
  initPromise = fetchOrdersFromCloud({ page, pageSize, append }).finally(() => {
    initPromise = null;
  });
  return initPromise;
}
async function loadNextPage() {
  if (pagingState.loading || !pagingState.hasMore)
    return false;
  const next = pagingState.page + 1;
  return fetchOrdersFromCloud({ page: next, pageSize: pagingState.pageSize, append: true });
}
async function reloadOrders({ pageSize = 20 } = {}) {
  pagingState.page = 1;
  pagingState.pageSize = pageSize;
  pagingState.total = 0;
  pagingState.hasMore = true;
  return fetchOrdersFromCloud({ page: 1, pageSize, append: false });
}
async function addOrder(payload) {
  try {
    const orderData = formatOrderToDB(payload);
    const res = await orderService.createOrder(orderData);
    if (res.code === 0) {
      const created = res.data ? formatOrderFromDB(res.data) : null;
      if (created) {
        const existingIdx = state.orders.findIndex((o) => o.id === created.id || o._id === created._id);
        if (existingIdx >= 0)
          state.orders.splice(existingIdx, 1, created);
        else
          state.orders.unshift(created);
      }
      return created;
    } else {
      common_vendor.index.showToast({
        title: res.message || "创建失败",
        icon: "none"
      });
      return null;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/clientOrder.js:184", "创建订单失败:", error);
    common_vendor.index.showToast({
      title: "网络错误，请稍后重试",
      icon: "none"
    });
    return null;
  }
}
async function cancelOrder(id) {
  try {
    const res = await orderService.cancelOrder(id);
    if (res.code === 0) {
      common_vendor.index.showToast({
        title: res.message || "取消成功",
        icon: "none"
      });
      const idx = state.orders.findIndex((o) => o.id === id || o._id === id);
      if (idx >= 0) {
        state.orders[idx] = {
          ...state.orders[idx],
          status: "cancelled"
        };
      }
      return true;
    } else {
      common_vendor.index.showToast({
        title: res.message || "取消失败",
        icon: "none"
      });
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/clientOrder.js:224", "取消订单失败:", error);
    common_vendor.index.showToast({
      title: "网络错误，请稍后重试",
      icon: "none"
    });
    return false;
  }
}
async function deleteOrder(id) {
  try {
    const res = await orderService.deleteOrder(id);
    if (res.code === 0) {
      const idx = state.orders.findIndex((o) => o.id === id || o._id === id);
      if (idx >= 0)
        state.orders.splice(idx, 1);
      return true;
    } else {
      common_vendor.index.showToast({
        title: res.message || "删除失败",
        icon: "none"
      });
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/clientOrder.js:253", "删除订单失败:", error);
    common_vendor.index.showToast({
      title: "网络错误，请稍后重试",
      icon: "none"
    });
    return false;
  }
}
async function reportDeliveryIssue(id, reason = "") {
  var _a, _b, _c;
  try {
    const callApi = orderService.reportDeliveryIssue || orderService.reportWrongDeliveryPhoto;
    const res = await callApi.call(orderService, { orderId: id, reason });
    if (res.code === 0) {
      const idx = state.orders.findIndex((o) => o.id === id || o._id === id);
      if (idx >= 0) {
        const old = state.orders[idx];
        state.orders[idx] = {
          ...old,
          status: "abnormal",
          abnormal_reason: "delivery_issue",
          abnormal_remark: String(reason || "").trim(),
          photo_feedback_count: Number(((_a = res.data) == null ? void 0 : _a.feedbackCount) || old.photo_feedback_count || 0),
          need_customer_service: !!((_b = res.data) == null ? void 0 : _b.contactRequired),
          content: {
            ...old.content || {},
            pending_redelivery_upload: !((_c = res.data) == null ? void 0 : _c.contactRequired)
          }
        };
      }
      return { success: true, data: res.data || {} };
    }
    common_vendor.index.showToast({ title: res.message || "反馈失败", icon: "none" });
    return { success: false, data: res.data || {} };
  } catch (error) {
    common_vendor.index.__f__("error", "at store/clientOrder.js:289", "提交异常反馈失败:", error);
    common_vendor.index.showToast({ title: "网络错误，请稍后重试", icon: "none" });
    return { success: false };
  }
}
async function reportWrongDeliveryPhoto(id, reason = "") {
  return reportDeliveryIssue(id, reason);
}
function ordersByStatus(status) {
  if (status === "all")
    return state.orders;
  if (status === "delivering") {
    return state.orders.filter(
      (o) => o.status === "pending_pickup" || o.status === "delivering"
    );
  }
  return state.orders.filter((o) => o.status === status);
}
function getOrderById(id) {
  return state.orders.find((o) => o.id === id || o._id === id) || null;
}
function useClientOrderStore() {
  if (!inited && !initPromise) {
    initPromise = loadOrdersFromCloud({ force: false, page: 1, pageSize: pagingState.pageSize, append: false }).finally(() => {
      initPromise = null;
    });
  }
  return {
    get orders() {
      return state.orders;
    },
    ordersByStatus,
    getOrderById,
    addOrder,
    cancelOrder,
    deleteOrder,
    reportDeliveryIssue,
    reportWrongDeliveryPhoto,
    loadFromStorage: (force = true) => loadOrdersFromCloud({ force, page: 1, pageSize: pagingState.pageSize, append: false }),
    reloadOrders,
    loadNextPage,
    getPaging() {
      return pagingState;
    }
  };
}
exports.useClientOrderStore = useClientOrderStore;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/clientOrder.js.map
