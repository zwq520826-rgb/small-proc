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
        var _a;
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
        const rawTags = o.tags || [];
        const tags = rawTags.map((tag) => {
          if (tag.includes("送货上门") && dorm) {
            return `${tag} ${dorm}`;
          }
          return tag;
        });
        return {
          ...o,
          pickupDistance: o.pickupDistance || 1,
          pickup: o.pickupLocation || o.pickup || "取件点",
          delivery,
          tags
        };
      });
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
          common_vendor.index.__f__("error", "at pages/rider/hall.vue:133", "跳转失败:", err);
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
    common_vendor.onShow(async () => {
      common_vendor.index.hideHomeButton();
      try {
        await store.loadFromStorage();
      } catch (error) {
        common_vendor.index.__f__("error", "at pages/rider/hall.vue:217", "加载任务失败:", error);
        common_vendor.index.hideLoading();
      }
    });
    return (_ctx, _cache) => {
      return {
        a: common_vendor.t(stats.value.orders),
        b: common_vendor.t(stats.value.income.toFixed(1)),
        c: common_vendor.f(filteredTasks.value, (task, k0, i0) => {
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
      };
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-7d101352"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/rider/hall.js.map
