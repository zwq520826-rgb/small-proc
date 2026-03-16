"use strict";
const common_vendor = require("../common/vendor.js");
const orderService = common_vendor.tr.importObject("order-service");
const state = common_vendor.reactive({
  orders: []
});
function formatOrderFromDB(order) {
  return {
    id: order._id,
    _id: order._id,
    type: order.type,
    typeLabel: order.type_label || "",
    pickupLocation: order.pickup_location || "",
    deliveryLocation: order.delivery_location || "",
    address: order.address || order.delivery_location || "",
    status: order.status,
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
    price: Number(orderData.price),
    pickup_location: orderData.pickupLocation || "",
    delivery_location: deliveryLocation,
    address: addr,
    content: orderData.content || {},
    tags: orderData.tags || []
  };
}
async function loadOrdersFromCloud() {
  try {
    const res = await orderService.getOrderList({
      status: "all",
      page: 1,
      pageSize: 100
    });
    if (res.code === 0) {
      state.orders = (res.data || []).map(formatOrderFromDB);
      return true;
    } else {
      common_vendor.index.__f__("error", "at store/clientOrder.js:74", "加载订单失败:", res.message);
      if (res.code !== "NO_LOGIN") {
        common_vendor.index.showToast({
          title: res.message || "加载失败",
          icon: "none"
        });
      }
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/clientOrder.js:85", "加载订单失败:", error);
    return false;
  }
}
async function addOrder(payload) {
  try {
    const orderData = formatOrderToDB(payload);
    const res = await orderService.createOrder(orderData);
    if (res.code === 0) {
      await loadOrdersFromCloud();
      return res.data ? formatOrderFromDB(res.data) : null;
    } else {
      common_vendor.index.showToast({
        title: res.message || "创建失败",
        icon: "none"
      });
      return null;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/clientOrder.js:114", "创建订单失败:", error);
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
      await loadOrdersFromCloud();
      return true;
    } else {
      common_vendor.index.showToast({
        title: res.message || "取消失败",
        icon: "none"
      });
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/clientOrder.js:147", "取消订单失败:", error);
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
      await loadOrdersFromCloud();
      return true;
    } else {
      common_vendor.index.showToast({
        title: res.message || "删除失败",
        icon: "none"
      });
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/clientOrder.js:175", "删除订单失败:", error);
    common_vendor.index.showToast({
      title: "网络错误，请稍后重试",
      icon: "none"
    });
    return false;
  }
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
  loadOrdersFromCloud();
  return {
    get orders() {
      return state.orders;
    },
    ordersByStatus,
    getOrderById,
    addOrder,
    cancelOrder,
    deleteOrder,
    loadFromStorage: loadOrdersFromCloud
    // 保持接口一致，但实际是从云端加载
  };
}
exports.useClientOrderStore = useClientOrderStore;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/clientOrder.js.map
