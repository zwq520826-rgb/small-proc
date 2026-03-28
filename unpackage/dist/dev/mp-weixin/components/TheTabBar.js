"use strict";
const common_vendor = require("../common/vendor.js");
const utils_auth = require("../utils/auth.js");
const _sfc_main = {
  __name: "TheTabBar",
  setup(__props) {
    const clientTabs = [
      {
        key: "home",
        text: "首页",
        icon: "/static/tabbar/home-active-new.png",
        iconType: "image",
        pagePath: "/pages/client/home",
        requiresLogin: false
      },
      {
        key: "orders",
        text: "订单",
        icon: "/static/tabbar/dindan.png",
        iconType: "image",
        pagePath: "/pages/client/orders/list",
        requiresLogin: true
      },
      {
        key: "mine",
        text: "我的",
        icon: "/static/tabbar/wode.png",
        iconType: "image",
        pagePath: "/pages/mine/index",
        requiresLogin: true
      }
    ];
    const riderTabs = [
      {
        key: "hall",
        text: "大厅",
        icon: "/static/tabbar/home-active-new.png",
        iconType: "image",
        pagePath: "/pages/rider/hall",
        requiresLogin: true
      },
      {
        key: "tasks",
        text: "任务",
        icon: "/static/tabbar/renwu.png",
        iconType: "image",
        pagePath: "/pages/rider/tasks/list",
        requiresLogin: true
      },
      {
        key: "mine",
        text: "我的",
        icon: "/static/tabbar/wode.png",
        iconType: "image",
        pagePath: "/pages/mine/index",
        requiresLogin: true
      }
    ];
    const currentRoute = common_vendor.ref("");
    const userMode = common_vendor.ref("client");
    function getCurrentMode() {
      const savedMode = common_vendor.index.getStorageSync("user_mode");
      return savedMode === "rider" ? "rider" : "client";
    }
    function updateState() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1] || {};
      currentRoute.value = (currentPage.route || "").replace(/^\//, "");
      userMode.value = getCurrentMode();
    }
    const displayTabs = common_vendor.computed(() => {
      return userMode.value === "rider" ? riderTabs : clientTabs;
    });
    function isActive(tab) {
      if (!tab || !currentRoute.value)
        return false;
      const cleanPath = tab.pagePath.replace(/^\//, "");
      return cleanPath === currentRoute.value;
    }
    function handleClick(tab) {
      if (!tab || !tab.pagePath)
        return;
      if (tab.requiresLogin && !utils_auth.requireLogin({ toast: "请先登录后使用该功能" })) {
        return;
      }
      const cleanPath = tab.pagePath.replace(/^\//, "");
      if (cleanPath === currentRoute.value)
        return;
      common_vendor.index.switchTab({
        url: tab.pagePath,
        fail: (err) => {
          common_vendor.index.__f__("warn", "at components/TheTabBar.vue:132", "switchTab failed, use reLaunch:", err);
          common_vendor.index.reLaunch({ url: tab.pagePath });
        }
      });
    }
    common_vendor.onShow(() => {
      updateState();
    });
    common_vendor.onMounted(() => {
      updateState();
    });
    return (_ctx, _cache) => {
      return {
        a: common_vendor.f(displayTabs.value, (item, index, i0) => {
          return common_vendor.e({
            a: item.iconType === "image"
          }, item.iconType === "image" ? {
            b: item.icon
          } : {
            c: common_vendor.t(item.icon)
          }, {
            d: common_vendor.t(item.text),
            e: item.key,
            f: isActive(item) ? 1 : "",
            g: common_vendor.o(($event) => handleClick(item), item.key)
          });
        })
      };
    };
  }
};
const Component = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-212a6ec9"]]);
wx.createComponent(Component);
//# sourceMappingURL=../../.sourcemap/mp-weixin/components/TheTabBar.js.map
