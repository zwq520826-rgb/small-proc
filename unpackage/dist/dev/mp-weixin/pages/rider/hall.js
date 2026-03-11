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
    const filterOptions = [
      { label: "距离最近", value: "distance" },
      { label: "金额最高", value: "price" }
    ];
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
        return {
          ...o,
          pickupDistance: o.pickupDistance || 1,
          pickup: o.pickupLocation || o.pickup || "取件点",
          delivery,
          tags: o.tags || []
        };
      });
    });
    const refresh = () => {
      common_vendor.index.showToast({ title: "已刷新定位", icon: "none" });
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
          common_vendor.index.__f__("error", "at pages/rider/hall.vue:130", "跳转失败:", err);
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
          const res = await common_vendor.tr.getTempFileURL({
            fileList: urls
          });
          urls = (res.fileList || []).map((item) => item.tempFileURL || item.download_url || item.fileID).filter(Boolean);
        } catch (e) {
          common_vendor.index.__f__("error", "at pages/rider/hall.vue:158", "获取临时文件 URL 失败:", e);
          common_vendor.index.showToast({ title: "图片加载失败，请稍后重试", icon: "none" });
          return;
        }
      }
      common_vendor.index.showModal({
        title: "图片调试链接",
        content: urls[0] || "无可用图片 URL",
        confirmText: "预览",
        cancelText: "复制",
        success: (res) => {
          if (res.confirm) {
            common_vendor.index.previewImage({
              urls,
              current: urls[0]
            });
          } else if (res.cancel && urls[0]) {
            common_vendor.index.setClipboardData({
              data: urls[0]
            });
          }
        }
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
    common_vendor.onShow(async () => {
      common_vendor.index.hideHomeButton();
      try {
        await store.loadFromStorage();
      } catch (error) {
        common_vendor.index.__f__("error", "at pages/rider/hall.vue:214", "加载任务失败:", error);
        common_vendor.index.hideLoading();
      }
    });
    return (_ctx, _cache) => {
      return {
        a: common_vendor.t(stats.value.orders),
        b: common_vendor.t(stats.value.income.toFixed(1)),
        c: common_vendor.o(refresh),
        d: common_vendor.f(filterOptions, (item, k0, i0) => {
          return {
            a: common_vendor.t(item.label),
            b: item.value,
            c: item.value === activeFilter.value ? 1 : "",
            d: common_vendor.o(($event) => activeFilter.value = item.value, item.value)
          };
        }),
        e: common_vendor.f(filteredTasks.value, (task, k0, i0) => {
          return {
            a: common_vendor.f(task.tags, (tag, k1, i1) => {
              return {
                a: common_vendor.t(tag),
                b: tag
              };
            }),
            b: common_vendor.t(task.delivery),
            c: common_vendor.t(task.price.toFixed(1)),
            d: common_vendor.t(task.countdown || 30),
            e: common_vendor.o(($event) => viewPickupInfo(task), task.id),
            f: common_vendor.o(($event) => grab(task), task.id),
            g: task.id,
            h: common_vendor.o(($event) => viewDetail(task), task.id)
          };
        })
      };
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-7d101352"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/rider/hall.js.map
