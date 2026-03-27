"use strict";
const common_vendor = require("../common/vendor.js");
const orderService = common_vendor._r.importObject("order-service");
const state = common_vendor.reactive({
  hallTasks: [],
  myTasks: [],
  riderStats: null,
  // 只在“送达完成”等关键事件后才触发统计刷新，避免 onShow 高频打 stats
  statsRefreshNeeded: false
});
let inited = false;
let initPromise = null;
let refreshPromise = null;
let lastLoadAt = 0;
const CACHE_TTL_MS = 2e4;
const MIN_REQ_INTERVAL_MS = 3e3;
function formatTaskFromDB(task) {
  return {
    id: task._id,
    _id: task._id,
    type: task.type,
    typeLabel: task.type_label || "",
    price: task.price,
    pickupLocation: task.pickup_location || "",
    pickupDistance: task.pickup_distance || 0,
    deliveryLocation: task.delivery_location || "",
    address: task.address || task.delivery_location || "",
    status: task.status,
    content: task.content || {},
    tags: task.tags || [],
    rider_id: task.rider_id,
    user_id: task.user_id,
    accept_time: task.accept_time,
    pickup_time: task.pickup_time,
    complete_time: task.complete_time,
    completedAt: task.complete_time
  };
}
async function loadHallTasksFromCloud(sortBy = "distance") {
  try {
    const res = await orderService.getHallTasks({
      sortBy,
      page: 1,
      pageSize: 7
    });
    if (res.code === 0) {
      state.hallTasks = (res.data || []).map(formatTaskFromDB);
      return true;
    } else {
      common_vendor.index.__f__("error", "at store/riderTask.js:62", "加载大厅任务失败:", res.message);
      if (res.code !== "NO_LOGIN") {
        common_vendor.index.showToast({
          title: res.message || "加载失败",
          icon: "none"
        });
      }
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:72", "加载大厅任务失败:", error);
    common_vendor.index.hideLoading();
    return false;
  }
}
async function loadMyTasksFromCloud(status = "all") {
  try {
    const res = await orderService.getMyTasks({
      status,
      page: 1,
      pageSize: 7
    });
    if (res.code === 0) {
      state.myTasks = (res.data || []).map(formatTaskFromDB);
      return true;
    } else {
      common_vendor.index.__f__("error", "at store/riderTask.js:94", "加载我的任务失败:", res.message);
      if (res.code !== "NO_LOGIN") {
        common_vendor.index.showToast({
          title: res.message || "加载失败",
          icon: "none"
        });
      }
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:104", "加载我的任务失败:", error);
    common_vendor.index.hideLoading();
    return false;
  }
}
async function loadRiderDashboardFromCloud(sortBy = "distance") {
  var _a, _b, _c;
  try {
    const res = await orderService.getRiderDashboard({
      sortBy,
      page: 1,
      pageSize: 7,
      myStatus: "all",
      myPage: 1,
      myPageSize: 7
    });
    if (res.code === 0) {
      state.hallTasks = (((_a = res.data) == null ? void 0 : _a.hallTasks) || []).map(formatTaskFromDB);
      state.myTasks = (((_b = res.data) == null ? void 0 : _b.myTasks) || []).map(formatTaskFromDB);
      state.riderStats = ((_c = res.data) == null ? void 0 : _c.riderStats) || null;
      return true;
    }
    common_vendor.index.__f__("warn", "at store/riderTask.js:132", "聚合接口失败，回退到分接口:", res.message);
    const [hallOk, myOk] = await Promise.all([
      loadHallTasksFromCloud(sortBy),
      loadMyTasksFromCloud("all")
    ]);
    return !!(hallOk || myOk);
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:139", "加载骑手聚合数据失败:", error);
    const [hallOk, myOk] = await Promise.all([
      loadHallTasksFromCloud(sortBy),
      loadMyTasksFromCloud("all")
    ]);
    return !!(hallOk || myOk);
  }
}
function hallTasksSorted(sortBy) {
  const list = [...state.hallTasks];
  list.sort((a, b) => {
    const aUrgent = !!(a.content && a.content.isUrgent);
    const bUrgent = !!(b.content && b.content.isUrgent);
    if (aUrgent !== bUrgent) {
      return aUrgent ? -1 : 1;
    }
    if (sortBy === "price") {
      return (b.price || 0) - (a.price || 0);
    } else {
      return (a.pickupDistance || 0) - (b.pickupDistance || 0);
    }
  });
  return list;
}
async function grabTask(id) {
  try {
    const res = await orderService.grabTask(id);
    if (res.code === 0) {
      const idx = state.hallTasks.findIndex((t) => t.id === id || t._id === id);
      if (idx >= 0) {
        const task = state.hallTasks[idx];
        state.hallTasks.splice(idx, 1);
        const moved = {
          ...task,
          status: "pending_pickup",
          accept_time: Date.now()
        };
        const myIdx = state.myTasks.findIndex((t) => t.id === id || t._id === id);
        if (myIdx >= 0)
          state.myTasks.splice(myIdx, 1, moved);
        else
          state.myTasks.unshift(moved);
      }
      return { success: true };
    } else {
      return {
        success: false,
        msg: res.message || "抢单失败"
      };
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:204", "抢单失败:", error);
    common_vendor.index.hideLoading();
    return {
      success: false,
      msg: "网络错误，请稍后重试"
    };
  }
}
function tasksByStatus(status) {
  return state.myTasks.filter((t) => t.status === status);
}
function getTaskById(id) {
  let task = state.myTasks.find((t) => t.id === id || t._id === id);
  if (task)
    return task;
  task = state.hallTasks.find((t) => t.id === id || t._id === id);
  return task || null;
}
async function confirmPickup(id, images = []) {
  try {
    const res = await orderService.confirmPickup(id, images);
    if (res.code === 0) {
      const idx = state.myTasks.findIndex((t) => t.id === id || t._id === id);
      if (idx >= 0) {
        const old = state.myTasks[idx];
        state.myTasks[idx] = {
          ...old,
          status: "delivering",
          pickup_time: Date.now(),
          content: {
            ...old.content || {},
            ...images && images.length ? { pickup_images: images } : {}
          }
        };
      }
      return true;
    } else {
      common_vendor.index.showToast({
        title: res.message || "确认失败",
        icon: "none"
      });
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:265", "确认取货失败:", error);
    common_vendor.index.showToast({
      title: "网络错误，请稍后重试",
      icon: "none"
    });
    return false;
  }
}
async function confirmDelivery(id, images) {
  try {
    const res = await orderService.confirmDelivery(id, images);
    if (res.code === 0) {
      const idx = state.myTasks.findIndex((t) => t.id === id || t._id === id);
      if (idx >= 0) {
        const old = state.myTasks[idx];
        state.myTasks[idx] = {
          ...old,
          status: "completed",
          complete_time: Date.now(),
          completedAt: Date.now(),
          content: {
            ...old.content || {},
            delivery_images: images
          }
        };
      }
      state.statsRefreshNeeded = true;
      return true;
    } else {
      common_vendor.index.showToast({
        title: res.message || "确认失败",
        icon: "none"
      });
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:308", "确认送达失败:", error);
    common_vendor.index.showToast({
      title: "网络错误，请稍后重试",
      icon: "none"
    });
    return false;
  }
}
async function riderCancelOrder(id, payload = {}) {
  try {
    const res = await orderService.riderCancelOrder(id, payload);
    if (res.code !== 0) {
      common_vendor.index.showToast({
        title: res.message || "取消失败",
        icon: "none"
      });
      return { success: false, msg: res.message || "取消失败" };
    }
    const reasonType = payload && payload.reasonType ? String(payload.reasonType) : "";
    const idx = state.myTasks.findIndex((t) => t.id === id || t._id === id);
    const task = idx >= 0 ? state.myTasks[idx] : null;
    if (idx >= 0)
      state.myTasks.splice(idx, 1);
    if (reasonType === "rider_personal" && task) {
      const moved = {
        ...task,
        status: "pending_accept",
        rider_id: null
      };
      state.hallTasks.unshift(moved);
    }
    return { success: true };
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:352", "取消订单失败:", error);
    common_vendor.index.showToast({
      title: "网络错误，请稍后重试",
      icon: "none"
    });
    return { success: false, msg: "网络错误" };
  }
}
async function initMock() {
  const ok = await loadRiderDashboardFromCloud("distance");
  if (ok) {
    inited = true;
    lastLoadAt = Date.now();
  }
  return ok;
}
function useRiderTaskStore() {
  if (!inited && !initPromise) {
    initPromise = initMock().finally(() => {
      initPromise = null;
    });
  }
  return {
    get hallTasks() {
      return state.hallTasks;
    },
    get myTasks() {
      return state.myTasks;
    },
    get statsRefreshNeeded() {
      return state.statsRefreshNeeded;
    },
    get riderStats() {
      return state.riderStats;
    },
    setStatsRefreshNeeded: (v) => {
      state.statsRefreshNeeded = !!v;
    },
    initMock,
    hallTasksSorted,
    grabTask,
    tasksByStatus,
    getTaskById,
    confirmPickup,
    confirmDelivery,
    riderCancelOrder,
    loadFromStorage: (force = false, options = {}) => {
      const now = Date.now();
      const sortBy = options.sortBy || "distance";
      const hasFreshCache = inited && now - lastLoadAt < CACHE_TTL_MS;
      if (!force && hasFreshCache)
        return Promise.resolve(true);
      if (refreshPromise)
        return refreshPromise;
      if (!force && now - lastLoadAt < MIN_REQ_INTERVAL_MS)
        return Promise.resolve(true);
      refreshPromise = loadRiderDashboardFromCloud(sortBy).then((ok) => {
        if (ok) {
          inited = true;
          lastLoadAt = Date.now();
        }
        return ok;
      }).finally(() => {
        refreshPromise = null;
      });
      return refreshPromise;
    }
  };
}
exports.useRiderTaskStore = useRiderTaskStore;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/riderTask.js.map
