"use strict";
const common_vendor = require("../common/vendor.js");
const orderService = common_vendor.tr.importObject("order-service");
const walletService = common_vendor.tr.importObject("wallet-service");
const state = common_vendor.reactive({
  hallTasks: [],
  myTasks: []
});
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
      pageSize: 100
    });
    if (res.code === 0) {
      state.hallTasks = (res.data || []).map(formatTaskFromDB);
      return true;
    } else {
      common_vendor.index.__f__("error", "at store/riderTask.js:54", "加载大厅任务失败:", res.message);
      if (res.code !== "NO_LOGIN") {
        common_vendor.index.showToast({
          title: res.message || "加载失败",
          icon: "none"
        });
      }
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:64", "加载大厅任务失败:", error);
    common_vendor.index.hideLoading();
    return false;
  }
}
async function loadMyTasksFromCloud(status = "all") {
  try {
    const res = await orderService.getMyTasks({
      status,
      page: 1,
      pageSize: 100
    });
    if (res.code === 0) {
      state.myTasks = (res.data || []).map(formatTaskFromDB);
      return true;
    } else {
      common_vendor.index.__f__("error", "at store/riderTask.js:86", "加载我的任务失败:", res.message);
      if (res.code !== "NO_LOGIN") {
        common_vendor.index.showToast({
          title: res.message || "加载失败",
          icon: "none"
        });
      }
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:96", "加载我的任务失败:", error);
    common_vendor.index.hideLoading();
    return false;
  }
}
function hallTasksSorted(sortBy) {
  const list = [...state.hallTasks];
  if (sortBy === "price") {
    list.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else {
    list.sort((a, b) => (a.pickupDistance || 0) - (b.pickupDistance || 0));
  }
  return list;
}
async function grabTask(id) {
  try {
    const res = await orderService.grabTask(id);
    if (res.code === 0) {
      await Promise.all([
        loadHallTasksFromCloud(),
        loadMyTasksFromCloud("all")
      ]);
      return { success: true };
    } else {
      return {
        success: false,
        msg: res.message || "抢单失败"
      };
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:137", "抢单失败:", error);
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
      await loadMyTasksFromCloud("all");
      return true;
    } else {
      common_vendor.index.showToast({
        title: res.message || "确认失败",
        icon: "none"
      });
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:186", "确认取货失败:", error);
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
      try {
        const task = state.myTasks.find((t) => t._id === id || t.id === id);
        const price = task ? Number(task.price || 0) : 0;
        if (price > 0) {
          await walletService.addIncome(price, id);
        }
      } catch (e) {
        common_vendor.index.__f__("warn", "at store/riderTask.js:211", "入账失败，但送达已成功", e);
      }
      await loadMyTasksFromCloud("all");
      return true;
    } else {
      common_vendor.index.showToast({
        title: res.message || "确认失败",
        icon: "none"
      });
      return false;
    }
  } catch (error) {
    common_vendor.index.__f__("error", "at store/riderTask.js:224", "确认送达失败:", error);
    common_vendor.index.showToast({
      title: "网络错误，请稍后重试",
      icon: "none"
    });
    return false;
  }
}
async function initMock() {
  await Promise.all([
    loadHallTasksFromCloud(),
    loadMyTasksFromCloud("all")
  ]);
}
function useRiderTaskStore() {
  initMock();
  return {
    get hallTasks() {
      return state.hallTasks;
    },
    get myTasks() {
      return state.myTasks;
    },
    initMock,
    hallTasksSorted,
    grabTask,
    tasksByStatus,
    getTaskById,
    confirmPickup,
    confirmDelivery,
    loadFromStorage: initMock
    // 保持接口一致
  };
}
exports.useRiderTaskStore = useRiderTaskStore;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/riderTask.js.map
