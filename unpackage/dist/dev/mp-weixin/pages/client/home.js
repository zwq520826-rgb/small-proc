"use strict";
const common_vendor = require("../../common/vendor.js");
if (!Math) {
  TheTabBar();
}
const TheTabBar = () => "../../components/TheTabBar.js";
const _sfc_main = {
  __name: "home",
  setup(__props) {
    const isLoading = common_vendor.ref(true);
    const slides = [
      { title: "校园兼职内推", desc: "社团、助教、勤工俭学信息速递", cta: "查看更多", type: "job" },
      { title: "新学期寄件优惠", desc: "快递代取满 10 单立减 5 元", cta: "立即参与", type: "promo" },
      { title: "品牌赞助位", desc: "欢迎校内商家合作投放", cta: "联系运营", type: "ad" }
    ];
    const features = [
      { icon: "/static/tabbar/kuaididaiqu.png", text: "快递代取", path: "/pages/client/forms/pickup" },
      { icon: "/static/tabbar/paotuifuwu.png", text: "跑腿服务", path: "/pages/client/forms/errand" }
    ];
    const announcements = common_vendor.ref([]);
    const activeTasks = common_vendor.ref([]);
    const goFeature = (item) => {
      if (!(item == null ? void 0 : item.path)) {
        common_vendor.index.showToast({ title: "暂未开放", icon: "none" });
        return;
      }
      common_vendor.index.navigateTo({ url: item.path });
    };
    common_vendor.onLoad(() => {
      isLoading.value = true;
      setTimeout(() => {
        announcements.value = [
          "[公告] 双十一快递代取积压，请提前预约",
          "[通知] 打印服务上线，A4/彩印/装订均可"
        ];
        activeTasks.value = [
          { id: "t1", title: "取件 · 菜鸟驿站", status: "进行中" },
          { id: "t2", title: "帮寄 · 教学楼快递", status: "待取件" }
        ];
        isLoading.value = false;
      }, 1500);
    });
    common_vendor.onShow(() => {
      common_vendor.index.hideHomeButton();
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: !isLoading.value
      }, !isLoading.value ? common_vendor.e({
        b: common_vendor.f(slides, (item, i, i0) => {
          return {
            a: common_vendor.t(item.title),
            b: common_vendor.t(item.desc),
            c: common_vendor.t(item.cta),
            d: common_vendor.n(item.type),
            e: i
          };
        }),
        c: common_vendor.f(features, (item, k0, i0) => {
          return {
            a: item.icon,
            b: common_vendor.t(item.text),
            c: item.text,
            d: common_vendor.o(($event) => goFeature(item), item.text)
          };
        }),
        d: announcements.value.length
      }, announcements.value.length ? {
        e: common_vendor.f(announcements.value, (n, i, i0) => {
          return {
            a: common_vendor.t(n),
            b: i
          };
        })
      } : {}) : {
        f: common_vendor.f(4, (i, k0, i0) => {
          return {
            a: i
          };
        })
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-462fe6d9"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/client/home.js.map
