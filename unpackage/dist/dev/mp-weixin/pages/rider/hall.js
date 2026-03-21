"use strict";
const common_vendor = require("../../common/vendor.js");
const store_riderTask = require("../../store/riderTask.js");
if (!Math) {
  TheTabBar();
}
const TheTabBar = () => "../../components/TheTabBar.js";
const _sfc_main = {
  __name: "hall",
  setup(__props) {
    const store = store_riderTask.useRiderTaskStore();
    const levelInfo = common_vendor.ref(null);
    let pulling = false;
    let pageRefreshing = false;
    const activeFilter = common_vendor.ref("distance");
    const stats = common_vendor.computed(() => {
      const completed = store.myTasks.filter((t) => t.status === "completed");
      const income = completed.reduce((sum, t) => sum + Number(t.price || 0), 0);
      return {
        orders: completed.length,
        income
      };
    });
    const filteredTasks = common_vendor.computed(() => {
      const list = store.hallTasksSorted ? store.hallTasksSorted(activeFilter.value) : [...store.hallTasks];
      return list.map((o) => {
        var _a, _b;
        let delivery = o.deliveryLocation || o.delivery || "";
        if (!delivery && o.address) {
          const lines = o.address.split("\n");
          if (lines.length > 1) {
            delivery = lines.slice(1).join("\n");
          } else {
            delivery = lines[0];
          }
        }
        if (!delivery) {
          delivery = "送达地址";
        }
        const dorm = (_a = o.content) == null ? void 0 : _a.dormNumber;
        const requiredGender = (_b = o.content) == null ? void 0 : _b.requiredRiderGender;
        const rawTags = o.tags || [];
        const tags = rawTags.map((tag) => {
          if (tag.includes("送货上门") && dorm) {
            return `${tag} ${dorm}`;
          }
          return tag;
        });
        if (requiredGender === "male") {
          tags.push("限男骑手");
        } else if (requiredGender === "female") {
          tags.push("限女骑手");
        }
        return {
          ...o,
          pickupDistance: o.pickupDistance || 1,
          pickup: o.pickupLocation || o.pickup || "取件点",
          delivery,
          tags
        };
      });
    });
    const displayLevel = common_vendor.computed(() => {
      if (!levelInfo.value)
        return null;
      const info = levelInfo.value;
      const currentRate = (info.current_commission_rate || 0) * 100;
      const nextRate = info.next_commission_rate != null ? info.next_commission_rate * 100 : null;
      return {
        name: info.level_name || info.level || "未知等级",
        totalOrders: info.total_completed_orders || 0,
        needMore: info.need_more_orders || 0,
        currentRate,
        nextRate
      };
    });
    const viewDetail = (task) => {
      const taskId = task.id || task._id;
      if (!taskId) {
        common_vendor.index.showToast({ title: "订单ID不存在", icon: "none" });
        return;
      }
      common_vendor.index.navigateTo({
        url: `/pages/rider/tasks/detail?id=${taskId}`,
        fail: (err) => {
          common_vendor.index.__f__("error", "at pages/rider/hall.vue:177", "跳转失败:", err);
          common_vendor.index.showToast({ title: "页面不存在，请重新编译", icon: "none" });
        }
      });
    };
    const grab = async (task) => {
      common_vendor.index.showLoading({ title: "抢单中..." });
      const res = await store.grabTask(task.id);
      common_vendor.index.hideLoading();
      if (!res.success) {
        common_vendor.index.showToast({ title: res.msg || "抢单失败", icon: "none" });
        return;
      }
      common_vendor.index.showToast({ title: "抢单成功", icon: "success" });
    };
    const refreshPageData = async (force = false) => {
      if (pageRefreshing)
        return;
      pageRefreshing = true;
      try {
        const shouldForce = force || store.statsRefreshNeeded;
        await store.loadFromStorage(shouldForce, { sortBy: activeFilter.value });
        levelInfo.value = store.riderStats || null;
        store.setStatsRefreshNeeded(false);
      } finally {
        pageRefreshing = false;
      }
    };
    common_vendor.onShow(async () => {
      common_vendor.index.hideHomeButton();
      try {
        await refreshPageData(false);
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/rider/hall.vue:260", "页面刷新失败:", e);
      }
    });
    common_vendor.onPullDownRefresh(async () => {
      if (pulling)
        return;
      pulling = true;
      try {
        await refreshPageData(true);
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/rider/hall.vue:270", "下拉刷新失败:", e);
      } finally {
        pulling = false;
        common_vendor.index.stopPullDownRefresh();
      }
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: displayLevel.value
      }, displayLevel.value ? common_vendor.e({
        b: common_vendor.t(displayLevel.value.name),
        c: common_vendor.t(displayLevel.value.totalOrders),
        d: displayLevel.value.needMore > 0
      }, displayLevel.value.needMore > 0 ? {
        e: common_vendor.t(displayLevel.value.needMore)
      } : {}) : {}, {
        f: common_vendor.t(stats.value.orders),
        g: common_vendor.t(stats.value.income.toFixed(1)),
        h: displayLevel.value
      }, displayLevel.value ? {
        i: common_vendor.t(displayLevel.value.currentRate.toFixed(0))
      } : {}, {
        j: displayLevel.value && displayLevel.value.nextRate !== null
      }, displayLevel.value && displayLevel.value.nextRate !== null ? {
        k: common_vendor.t(displayLevel.value.nextRate.toFixed(0))
      } : {}, {
        l: common_vendor.f(filteredTasks.value, (task, k0, i0) => {
          return {
            a: common_vendor.f(task.tags, (tag, k1, i1) => {
              return {
                a: common_vendor.t(tag),
                b: tag
              };
            }),
            b: common_vendor.t(task.delivery),
            c: common_vendor.t(task.price.toFixed(1)),
            d: common_vendor.o(($event) => grab(task), task.id),
            e: task.id,
            f: common_vendor.o(($event) => viewDetail(task), task.id)
          };
        })
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-7d101352"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/rider/hall.js.map
