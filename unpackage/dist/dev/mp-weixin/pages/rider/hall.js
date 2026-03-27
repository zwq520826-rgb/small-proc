"use strict";
const common_vendor = require("../../common/vendor.js");
const store_riderTask = require("../../store/riderTask.js");
const utils_orderTags = require("../../utils/orderTags.js");
if (!Math) {
  TheTabBar();
}
const TheTabBar = () => "../../components/TheTabBar.js";
const _sfc_main = {
  __name: "hall",
  setup(__props) {
    const store = store_riderTask.useRiderTaskStore();
    const levelInfo = common_vendor.ref(null);
    const isLoading = common_vendor.ref(true);
    const loadError = common_vendor.ref("");
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
        const requiredGender = (_a = o.content) == null ? void 0 : _a.requiredRiderGender;
        const visualTags = utils_orderTags.buildVisualTags({
          rawTags: o.tags,
          content: o.content,
          requiredGender
        });
        return {
          ...o,
          pickupDistance: o.pickupDistance || 1,
          pickup: o.pickupLocation || o.pickup || "取件点",
          delivery,
          visualTags
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
    const goLevelTable = () => {
      common_vendor.index.navigateTo({ url: "/pages/rider/levels" });
    };
    const viewDetail = (task) => {
      const taskId = task.id || task._id;
      if (!taskId) {
        common_vendor.index.showToast({ title: "订单ID不存在", icon: "none" });
        return;
      }
      common_vendor.index.navigateTo({
        url: `/pages/rider/tasks/detail?id=${taskId}`,
        fail: (err) => {
          common_vendor.index.__f__("error", "at pages/rider/hall.vue:196", "跳转失败:", err);
          common_vendor.index.showToast({ title: "页面不存在，请重新编译", icon: "none" });
        }
      });
    };
    const previewCloudImages = async (images = []) => {
      if (!images || images.length === 0) {
        common_vendor.index.showToast({ title: "暂无取件凭证", icon: "none" });
        return;
      }
      let urls = [...images];
      const hasCloudFile = urls.some((url) => url && url.startsWith("cloud://"));
      if (hasCloudFile) {
        try {
          const res = await common_vendor._r.getTempFileURL({
            fileList: urls
          });
          urls = (res.fileList || []).map((item) => item.tempFileURL || item.download_url || item.fileID).filter(Boolean);
        } catch (e) {
          common_vendor.index.__f__("error", "at pages/rider/hall.vue:224", "获取临时文件 URL 失败:", e);
          common_vendor.index.showToast({ title: "图片加载失败，请稍后重试", icon: "none" });
          return;
        }
      }
      common_vendor.index.previewImage({
        urls,
        current: urls[0]
      });
    };
    const viewPickupInfo = async (task) => {
      var _a;
      const images = ((_a = task.content) == null ? void 0 : _a.images) || [];
      await previewCloudImages(images);
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
    const refreshPageData = async (force = false, options = {}) => {
      if (pageRefreshing)
        return;
      pageRefreshing = true;
      if (options.showSkeleton) {
        isLoading.value = true;
      }
      loadError.value = "";
      try {
        const shouldForce = force || store.statsRefreshNeeded;
        await store.loadFromStorage(shouldForce, { sortBy: activeFilter.value });
        levelInfo.value = store.riderStats || null;
        store.setStatsRefreshNeeded(false);
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/rider/hall.vue:274", "[rider-hall] refresh failed", e);
        loadError.value = (e == null ? void 0 : e.message) || "大厅数据加载失败，请稍后重试";
      } finally {
        isLoading.value = false;
        pageRefreshing = false;
      }
    };
    const retryHall = () => {
      refreshPageData(true, { showSkeleton: true });
    };
    common_vendor.onShow(async () => {
      common_vendor.index.hideHomeButton();
      try {
        await refreshPageData(false, { showSkeleton: isLoading.value });
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/rider/hall.vue:291", "页面刷新失败:", e);
      }
    });
    common_vendor.onPullDownRefresh(async () => {
      if (pulling)
        return;
      pulling = true;
      try {
        await refreshPageData(true);
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/rider/hall.vue:301", "下拉刷新失败:", e);
      } finally {
        pulling = false;
        common_vendor.index.stopPullDownRefresh();
      }
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: isLoading.value
      }, isLoading.value ? {
        b: common_vendor.f(3, (i, k0, i0) => {
          return {
            a: `hall-skeleton-${i}`
          };
        })
      } : loadError.value ? {
        d: common_vendor.t(loadError.value),
        e: common_vendor.o(retryHall, "c7")
      } : common_vendor.e({
        f: displayLevel.value
      }, displayLevel.value ? common_vendor.e({
        g: common_vendor.o(goLevelTable, "67"),
        h: common_vendor.t(displayLevel.value.name),
        i: common_vendor.t(displayLevel.value.totalOrders),
        j: displayLevel.value.needMore > 0
      }, displayLevel.value.needMore > 0 ? {
        k: common_vendor.t(displayLevel.value.needMore)
      } : {}) : {}, {
        l: common_vendor.t(stats.value.orders),
        m: common_vendor.t(stats.value.income.toFixed(1)),
        n: displayLevel.value
      }, displayLevel.value ? {
        o: common_vendor.t(displayLevel.value.currentRate.toFixed(0))
      } : {}, {
        p: displayLevel.value && displayLevel.value.nextRate !== null
      }, displayLevel.value && displayLevel.value.nextRate !== null ? {
        q: common_vendor.t(displayLevel.value.nextRate.toFixed(0))
      } : {}, {
        r: common_vendor.f(filteredTasks.value, (task, k0, i0) => {
          return common_vendor.e({
            a: task.visualTags && task.visualTags.length
          }, task.visualTags && task.visualTags.length ? {
            b: common_vendor.f(task.visualTags, (tag, k1, i1) => {
              return common_vendor.e({
                a: tag.icon
              }, tag.icon ? {
                b: common_vendor.t(tag.icon)
              } : {}, {
                c: common_vendor.t(tag.text),
                d: tag.key,
                e: common_vendor.n(`tag-${tag.type}`)
              });
            })
          } : {}, {
            c: common_vendor.t(task.delivery),
            d: common_vendor.t(Number(task.price || 0).toFixed(2)),
            e: common_vendor.o(($event) => viewPickupInfo(task), task.id),
            f: common_vendor.o(($event) => grab(task), task.id),
            g: task.id,
            h: common_vendor.o(($event) => viewDetail(task), task.id)
          });
        })
      }), {
        c: loadError.value
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-7d101352"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/rider/hall.js.map
