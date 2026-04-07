"use strict";
const common_vendor = require("../../../common/vendor.js");
const common_assets = require("../../../common/assets.js");
const store_clientOrder = require("../../../store/clientOrder.js");
const utils_orderTags = require("../../../utils/orderTags.js");
if (!Math) {
  TheTabBar();
}
const TheTabBar = () => "../../../components/TheTabBar.js";
const _sfc_main = {
  __name: "list",
  setup(__props) {
    const store = store_clientOrder.useClientOrderStore();
    const orderService = common_vendor._r.importObject("order-service");
    const tabs = [
      { label: "全部", status: "all" },
      { label: "待接单", status: "pending_accept" },
      { label: "进行中", status: "delivering" },
      { label: "已完成", status: "completed" },
      { label: "异常单", status: "abnormal" }
    ];
    const statusMap = {
      pending_accept: "待接单",
      pending_pickup: "待取货",
      delivering: "配送中",
      completed: "已完成",
      cancelled: "已取消",
      abnormal: "异常单"
    };
    const currentTab = common_vendor.ref(0);
    const pageSize = common_vendor.ref(20);
    const loadStatus = common_vendor.ref("more");
    const unreadByOrder = common_vendor.ref({});
    const unreadByStatus = common_vendor.ref({});
    const unreadTotal = common_vendor.ref(0);
    const PRIMARY_TAG_TYPES = /* @__PURE__ */ new Set(["urgent", "delivery"]);
    const splitTags = (tags = []) => {
      const primary = [];
      const secondary = [];
      tags.forEach((tag) => {
        if (PRIMARY_TAG_TYPES.has(tag == null ? void 0 : tag.type)) {
          primary.push(tag);
        } else {
          secondary.push(tag);
        }
      });
      return { primary, secondary };
    };
    const resolveRemark = (order) => {
      const content = (order == null ? void 0 : order.content) || {};
      const remark = content.remark || "";
      const desc = content.description || "";
      return String(remark || desc || "").trim();
    };
    const displayList = common_vendor.computed(() => {
      const status = tabs[currentTab.value].status;
      const list = store.ordersByStatus(status);
      return list.map((o) => {
        var _a;
        const visualTags = utils_orderTags.buildVisualTags({
          rawTags: o.tags,
          content: o.content,
          requiredGender: (_a = o.content) == null ? void 0 : _a.requiredRiderGender
        });
        const { primary, secondary } = splitTags(visualTags);
        return {
          ...o,
          primaryTags: primary,
          secondaryTags: secondary,
          remarkText: resolveRemark(o)
        };
      });
    });
    const refreshLoadStatus = () => {
      const paging = store.getPaging();
      if (paging.loading) {
        loadStatus.value = "loading";
        return;
      }
      loadStatus.value = paging.hasMore ? "more" : "noMore";
    };
    const loadData = async () => {
      if (loadStatus.value === "loading")
        return;
      loadStatus.value = "loading";
      await store.reloadOrders({ pageSize: pageSize.value });
      await loadUnreadSummary();
      refreshLoadStatus();
    };
    const loadUnreadSummary = async () => {
      try {
        const res = await orderService.getMyOrderChatUnreadSummary({ role: "user" });
        if ((res == null ? void 0 : res.code) !== 0 || !res.data)
          return;
        unreadByOrder.value = res.data.byOrder || {};
        unreadByStatus.value = res.data.byStatus || {};
        unreadTotal.value = Number(res.data.total || 0);
      } catch (e) {
        common_vendor.index.__f__("warn", "at pages/client/orders/list.vue:228", "加载聊天未读失败:", e);
      }
    };
    const getOrderUnread = (orderId) => {
      var _a;
      return Number(((_a = unreadByOrder.value) == null ? void 0 : _a[orderId]) || 0);
    };
    const getTabUnread = (status) => {
      var _a, _b, _c;
      if (status === "all")
        return unreadTotal.value;
      if (status === "delivering") {
        return Number(((_a = unreadByStatus.value) == null ? void 0 : _a.pending_pickup) || 0) + Number(((_b = unreadByStatus.value) == null ? void 0 : _b.delivering) || 0);
      }
      return Number(((_c = unreadByStatus.value) == null ? void 0 : _c[status]) || 0);
    };
    const formatUnread = (count) => {
      const n = Number(count || 0);
      if (n <= 0)
        return "";
      return n > 99 ? "99+" : String(n);
    };
    const onTabChange = (index) => {
      currentTab.value = index;
    };
    const handleReachBottom = () => {
      if (loadStatus.value === "loading")
        return;
      if (loadStatus.value === "noMore")
        return;
      loadStatus.value = "loading";
      store.loadNextPage().finally(() => {
        refreshLoadStatus();
      });
    };
    const reloadCurrent = async () => {
      await store.reloadOrders({ pageSize: pageSize.value });
      refreshLoadStatus();
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
      await loadUnreadSummary();
      common_vendor.index.stopPullDownRefresh();
    });
    common_vendor.onShow(async () => {
      await loadUnreadSummary();
    });
    common_vendor.onLoad(async () => {
      await loadData();
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: common_vendor.f(tabs, (tab, index, i0) => {
          return common_vendor.e({
            a: common_vendor.t(tab.label),
            b: getTabUnread(tab.status) > 0
          }, getTabUnread(tab.status) > 0 ? {
            c: common_vendor.t(formatUnread(getTabUnread(tab.status)))
          } : {}, {
            d: index,
            e: currentTab.value === index ? 1 : "",
            f: common_vendor.o(($event) => onTabChange(index), index)
          });
        }),
        b: displayList.value.length === 0
      }, displayList.value.length === 0 ? {
        c: common_assets._imports_0
      } : {}, {
        d: common_vendor.f(displayList.value, (order, k0, i0) => {
          return common_vendor.e({
            a: common_vendor.t(order.typeLabel),
            b: common_vendor.n(order.type),
            c: order.primaryTags && order.primaryTags.length
          }, order.primaryTags && order.primaryTags.length ? {
            d: common_vendor.f(order.primaryTags, (tag, k1, i1) => {
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
            e: getOrderUnread(order.id) > 0
          }, getOrderUnread(order.id) > 0 ? {
            f: common_vendor.t(formatUnread(getOrderUnread(order.id)))
          } : {}, {
            g: common_vendor.t(statusMap[order.status]),
            h: common_vendor.n(order.status),
            i: common_vendor.t(order.pickupLocation),
            j: common_vendor.t(order.deliveryLocation || order.address),
            k: order.secondaryTags && order.secondaryTags.length
          }, order.secondaryTags && order.secondaryTags.length ? {
            l: common_vendor.f(order.secondaryTags, (tag, k1, i1) => {
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
            m: common_vendor.t(order.remarkText || "无"),
            n: common_vendor.t(Number(order.price || 0).toFixed(2)),
            o: common_vendor.t(order.publishedAt || order.createTime),
            p: order.status === "completed"
          }, order.status === "completed" ? {
            q: common_vendor.o(($event) => handleViewPhotos(order), order.id)
          } : {}, {
            r: order.status === "pending_accept" || order.status === "pending_pickup" || order.status === "delivering"
          }, order.status === "pending_accept" || order.status === "pending_pickup" || order.status === "delivering" ? {
            s: common_vendor.o(($event) => handleCancel(order.id), order.id)
          } : {}, {
            t: order.status === "completed"
          }, order.status === "completed" ? {
            v: common_vendor.o(($event) => handleDelete(order.id), order.id)
          } : {}, {
            w: order.id,
            x: common_vendor.o(($event) => goDetail(order.id), order.id)
          });
        }),
        e: loadStatus.value === "loading"
      }, loadStatus.value === "loading" ? {} : loadStatus.value === "noMore" ? {} : {}, {
        f: loadStatus.value === "noMore",
        g: common_vendor.o(handleReachBottom, "4a")
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-5857953e"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/client/orders/list.js.map
