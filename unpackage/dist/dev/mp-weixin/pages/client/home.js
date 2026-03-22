"use strict";
const common_vendor = require("../../common/vendor.js");
if (!Math) {
  TheTabBar();
}
const TheTabBar = () => "../../components/TheTabBar.js";
const contactPhone = "18608945191";
const _sfc_main = {
  __name: "home",
  setup(__props) {
    const configService = common_vendor.tr.importObject("config-service");
    const isLoading = common_vendor.ref(true);
    const hero = common_vendor.ref({
      title: "品牌赞助位",
      desc: "欢迎校内商家合作投放",
      cta_text: "联系运营",
      image_file_id: "",
      link_url: ""
    });
    const announcements = common_vendor.ref([]);
    const features = [
      { icon: "/static/tabbar/kuaididaiqu.png", text: "快递代取", path: "/pages/client/forms/pickup" },
      { icon: "/static/tabbar/paotuifuwu.png", text: "跑腿服务", path: "/pages/client/forms/errand" }
    ];
    const showContactModal = common_vendor.ref(false);
    const openContactModal = () => {
      showContactModal.value = true;
    };
    const handleHeroLink = () => {
      const u = String(hero.value.link_url || "").trim();
      if (u) {
        if (u.startsWith("/pages")) {
          common_vendor.index.navigateTo({ url: u });
        } else if (u.startsWith("http")) {
          common_vendor.index.setClipboardData({
            data: u,
            success: () => {
              common_vendor.index.showToast({ title: "链接已复制，请在浏览器打开", icon: "none" });
            }
          });
        } else {
          common_vendor.index.navigateTo({ url: u });
        }
      } else {
        openContactModal();
      }
    };
    const onHeroCta = () => {
      handleHeroLink();
    };
    const onHeroBannerTap = () => {
      if (hero.value.image_file_id) {
        handleHeroLink();
      }
    };
    const loadHomeContent = async () => {
      try {
        const res = await configService.getHomeContent();
        if (res.code === 0 && res.data) {
          const h = res.data.hero;
          if (h) {
            hero.value = {
              title: h.title || hero.value.title,
              desc: h.desc || "",
              cta_text: h.cta_text || "联系运营",
              image_file_id: h.image_file_id || "",
              link_url: h.link_url || ""
            };
          }
          announcements.value = res.data.announcements || [];
        }
      } catch (e) {
        common_vendor.index.__f__("warn", "at pages/client/home.vue:178", "loadHomeContent", e);
      }
    };
    const closeContactModal = () => {
      showContactModal.value = false;
    };
    const copyPhone = () => {
      common_vendor.index.setClipboardData({
        data: contactPhone,
        success: () => {
          common_vendor.index.showToast({ title: "已复制到剪贴板", icon: "none" });
        }
      });
    };
    const goFeature = (item) => {
      if (!(item == null ? void 0 : item.path)) {
        common_vendor.index.showToast({ title: "暂未开放", icon: "none" });
        return;
      }
      common_vendor.index.navigateTo({ url: item.path });
    };
    common_vendor.onLoad(async () => {
      isLoading.value = true;
      await loadHomeContent();
      isLoading.value = false;
    });
    common_vendor.onShow(() => {
      common_vendor.index.hideHomeButton();
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: !isLoading.value
      }, !isLoading.value ? common_vendor.e({
        b: hero.value.image_file_id
      }, hero.value.image_file_id ? {
        c: hero.value.image_file_id,
        d: common_vendor.o(onHeroBannerTap)
      } : {}, {
        e: common_vendor.t(hero.value.title),
        f: common_vendor.t(hero.value.desc),
        g: common_vendor.t(hero.value.cta_text),
        h: common_vendor.o(onHeroCta),
        i: hero.value.image_file_id ? 1 : "",
        j: common_vendor.f(features, (item, k0, i0) => {
          return {
            a: item.icon,
            b: common_vendor.t(item.text),
            c: item.text,
            d: common_vendor.o(($event) => goFeature(item), item.text)
          };
        }),
        k: announcements.value.length
      }, announcements.value.length ? {
        l: common_vendor.f(announcements.value, (a, k0, i0) => {
          return common_vendor.e({
            a: a.image_file_id
          }, a.image_file_id ? {
            b: a.image_file_id
          } : {}, {
            c: common_vendor.t(a.title),
            d: common_vendor.t(a.content),
            e: a._id
          });
        }),
        m: announcements.value.length > 1,
        n: announcements.value.length > 1,
        o: announcements.value.length > 1
      } : {}) : {
        p: common_vendor.f(4, (i, k0, i0) => {
          return {
            a: i
          };
        })
      }, {
        q: showContactModal.value
      }, showContactModal.value ? {
        r: common_vendor.o(closeContactModal),
        s: common_vendor.t(contactPhone),
        t: common_vendor.o(copyPhone),
        v: common_vendor.o(closeContactModal),
        w: common_vendor.o(() => {
        }),
        x: common_vendor.o(closeContactModal)
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-462fe6d9"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/client/home.js.map
