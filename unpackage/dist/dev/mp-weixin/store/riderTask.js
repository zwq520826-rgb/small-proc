"use strict";
const common_vendor = require("../common/vendor.js");
const orderService = common_vendor.tr.importObject("order-service");
const state = common_vendor.reactive({
  hallTasks: [],
  myTasks: [],
  // 只在“送达完成”等关键事件后才触发统计刷新，避免 onShow 高频打 stats
  statsRefreshNeeded: false
});
let inited = false;
let initPromise = null;
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
      common_vendor.index.__f__("error", "at store/riderTask.js:57", "加载大厅任务失败:", res.message);
      if (res.code !== "NO_LOGIN") {
        common_vendor.index.showToast({
          title: res.message || "加载失败",
          icon: "none"
        });
      }
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:67", "加载大厅任务失败:", error);
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
      common_vendor.index.__f__("error", "at store/riderTask.js:89", "加载我的任务失败:", res.message);
      if (res.code !== "NO_LOGIN") {
        common_vendor.index.showToast({
          title: res.message || "加载失败",
          icon: "none"
        });
      }
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:99", "加载我的任务失败:", error);
    common_vendor.index.hideLoading();
    return false;
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
    common_vendor.index.__f__("error", "at store/riderTask.js:162", "抢单失败:", error);
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
    common_vendor.index.__f__("error", "at store/riderTask.js:223", "确认取货失败:", error);
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
    common_vendor.index.__f__("error", "at store/riderTask.js:266", "确认送达失败:", error);
    common_vendor.index.showToast({
      title: "网络错误，请稍后重试",
      icon: "none"
    });
    return false;
  }
}
async function initMock() {
  const [hallOk, myOk] = await Promise.all([
    loadHallTasksFromCloud(),
    loadMyTasksFromCloud("all")
  ]);
  if (hallOk || myOk)
    inited = true;
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
    loadFromStorage: (force = true) => {
      if (!force && inited)
        return Promise.resolve(true);
      return initMock();
    }
  };
}
exports.useRiderTaskStore = useRiderTaskStore;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/riderTask.js.map
