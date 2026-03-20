"use strict";
const common_vendor = require("../../../common/vendor.js");
const common_assets = require("../../../common/assets.js");
const store_clientOrder = require("../../../store/clientOrder.js");
if (!Math) {
  TheTabBar();
}
const TheTabBar = () => "../../../components/TheTabBar.js";
const _sfc_main = {
  __name: "list",
  setup(__props) {
    const store = store_clientOrder.useClientOrderStore();
    const tabs = [
      { label: "全部", status: "all" },
      { label: "待接单", status: "pending_accept" },
      { label: "进行中", status: "delivering" },
      { label: "已完成", status: "completed" }
    ];
    const statusMap = {
      pending_accept: "待接单",
      delivering: "配送中",
      completed: "已完成",
      cancelled: "已取消"
    };
    const currentTab = common_vendor.ref(0);
    common_vendor.ref(1);
    common_vendor.ref(5);
    const loadStatus = common_vendor.ref("more");
    const displayList = common_vendor.computed(() => {
      const status = tabs[currentTab.value].status;
      const list = store.ordersByStatus(status);
      return list.map((o) => {
        var _a, _b;
        const tags = (o.tags && o.tags.length ? o.tags : [
          ((_a = o.content) == null ? void 0 : _a.isUrgent) ? "加急处理" : "",
          ((_b = o.content) == null ? void 0 : _b.isDelivery) ? "送货上门" : ""
        ].filter(Boolean)) || [];
        return {
          ...o,
          tags
        };
      });
    });
    const onTabChange = (index) => {
      currentTab.value = index;
    };
    const handleReachBottom = () => {
      loadStatus.value = "noMore";
    };
    const reloadCurrent = async () => {
      await store.loadFromStorage();
    };
    const handleCancel = async (id) => {
      common_vendor.index.showModal({
        title: "确认取消",
        content: "确定要取消该订单吗？",
        success: async (res) => {
          if (res.confirm) {
            common_vendor.index.showLoading({ title: "处理中..." });
            const ok = await store.cancelOrder(id);
            common_vendor.index.hideLoading();
            if (ok) {
              common_vendor.index.showToast({ title: "已取消", icon: "success" });
            }
          }
        }
      });
    };
    const handleDelete = async (id) => {
      common_vendor.index.showModal({
        title: "确认删除",
        content: "删除后无法恢复，是否继续？",
        success: async (res) => {
          if (res.confirm) {
            common_vendor.index.showLoading({ title: "处理中..." });
            const ok = await store.deleteOrder(id);
            common_vendor.index.hideLoading();
            if (ok) {
              common_vendor.index.showToast({ title: "已删除", icon: "success" });
            }
          }
        }
      });
    };
    const handleViewPhotos = (order) => {
      var _a, _b;
      const urls = ((_a = order.content) == null ? void 0 : _a.delivery_images) || ((_b = order.content) == null ? void 0 : _b.deliveryImages) || order.deliveryImages || (order.deliveryImage ? [order.deliveryImage] : []);
      if (!urls || !urls.length) {
        common_vendor.index.showToast({ title: "暂无送达照片", icon: "none" });
        return;
      }
      common_vendor.index.previewImage({ urls });
    };
    const goDetail = (id) => {
      common_vendor.index.navigateTo({ url: `/pages/client/orders/detail?id=${id}` });
    };
    common_vendor.onPullDownRefresh(async () => {
      await reloadCurrent();
      common_vendor.index.stopPullDownRefresh();
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: common_vendor.f(tabs, (tab, index, i0) => {
          return {
            a: common_vendor.t(tab.label),
            b: index,
            c: currentTab.value === index ? 1 : "",
            d: common_vendor.o(($event) => onTabChange(index), index)
          };
        }),
        b: displayList.value.length === 0
      }, displayList.value.length === 0 ? {
        c: common_assets._imports_0
      } : {}, {
        d: common_vendor.f(displayList.value, (order, k0, i0) => {
          var _a;
          return common_vendor.e({
            a: common_vendor.t(order.typeLabel),
            b: common_vendor.n(order.type),
            c: common_vendor.t(statusMap[order.status]),
            d: common_vendor.n(order.status),
            e: common_vendor.t(order.pickupLocation),
            f: common_vendor.t(order.deliveryLocation || order.address),
            g: order.tags && order.tags.length
          }, order.tags && order.tags.length ? {
            h: common_vendor.f(order.tags, (tag, k1, i1) => {
              return {
                a: common_vendor.t(tag),
                b: tag,
                c: tag.includes("加急") ? 1 : "",
                d: tag.includes("送货上门") ? 1 : ""
              };
            })
          } : {}, {
            i: common_vendor.t(((_a = order.content) == null ? void 0 : _a.description) || "订单详情"),
            j: common_vendor.t(Number(order.price || 0).toFixed(2)),
            k: common_vendor.t(order.publishedAt || order.createTime),
            l: order.status === "completed"
          }, order.status === "completed" ? {
            m: common_vendor.o(($event) => handleViewPhotos(order), order.id)
          } : {}, {
            n: order.status === "pending_accept"
          }, order.status === "pending_accept" ? {
            o: common_vendor.o(($event) => handleCancel(order.id), order.id)
          } : {}, {
            p: order.status === "completed"
          }, order.status === "completed" ? {
            q: common_vendor.o(($event) => handleDelete(order.id), order.id)
          } : {}, {
            r: order.id,
            s: common_vendor.o(($event) => goDetail(order.id), order.id)
          });
        }),
        e: loadStatus.value === "loading"
      }, loadStatus.value === "loading" ? {} : loadStatus.value === "noMore" ? {} : {}, {
        f: loadStatus.value === "noMore",
        g: common_vendor.o(handleReachBottom)
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-5857953e"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/client/orders/list.js.map
