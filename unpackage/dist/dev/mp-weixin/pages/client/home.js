"use strict";
const common_vendor = require("../../common/vendor.js");
const utils_auth = require("../../utils/auth.js");
if (!Math) {
  TheTabBar();
}
const TheTabBar = () => "../../components/TheTabBar.js";
const HOME_CACHE_KEY = "home_content_cache_v1";
const HOME_CACHE_TTL = 5 * 60 * 1e3;
const contactPhone = "18608945191";
const _sfc_main = {
  __name: "home",
  setup(__props) {
    const configService = common_vendor._r.importObject("order-service");
    const isLoading = common_vendor.ref(true);
    const heroes = common_vendor.ref([]);
    const announcements = common_vendor.ref([]);
    const loadError = common_vendor.ref("");
    const features = [
      { icon: "/static/tabbar/kuaididaiqu.png", text: "快递代取", path: "/pages/client/forms/pickup" },
      { icon: "/static/tabbar/paotuifuwu.png", text: "跑腿服务", path: "/pages/client/forms/errand" }
    ];
    const showContactModal = common_vendor.ref(false);
    const heroSwiperCompact = common_vendor.computed(() => {
      if (!heroes.value.length)
        return false;
      return heroes.value.every((h) => !h.image_file_id);
    });
    const openContactModal = () => {
      showContactModal.value = true;
    };
    const handleHeroLink = (hero) => {
      const u = String(hero && hero.link_url || "").trim();
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
    const onHeroCta = (hero) => {
      handleHeroLink(hero);
    };
    const onHeroBannerTap = (hero) => {
      if (hero && hero.image_file_id) {
        handleHeroLink(hero);
      }
    };
    const formatErrorMessage = (err, fallback) => {
      if (!err)
        return fallback;
      if (typeof err === "string")
        return err;
      if (typeof err.message === "string" && err.message.trim())
        return err.message;
      return fallback;
    };
    const loadHomeContent = async ({ showSkeleton = true } = {}) => {
      const readCache = () => {
        try {
          const raw = common_vendor.index.getStorageSync(HOME_CACHE_KEY);
          if (!raw)
            return null;
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (!parsed || !parsed.ts || !parsed.data)
            return null;
          return parsed;
        } catch (e) {
          return null;
        }
      };
      const writeCache = (data) => {
        try {
          common_vendor.index.setStorageSync(HOME_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch (e) {
        }
      };
      const now = Date.now();
      const cache = readCache();
      if (cache && now - cache.ts < HOME_CACHE_TTL && cache.data) {
        heroes.value = cache.data.heroes || [];
        announcements.value = cache.data.announcements || [];
        isLoading.value = false;
        loadHomeContentFromCloud(false, writeCache);
        return;
      }
      await loadHomeContentFromCloud(showSkeleton, writeCache);
    };
    const loadHomeContentFromCloud = async (showSkeleton = true, saveFn = () => {
    }) => {
      if (showSkeleton)
        isLoading.value = true;
      loadError.value = "";
      try {
        const res = await configService.getHomeContent();
        if (!res || res.code !== 0 || !res.data) {
          throw new Error((res == null ? void 0 : res.message) || "未获取到首页内容");
        }
        const nextHeroes = (res.data.heroes || []).map((h) => ({
          _id: h._id || "",
          title: h.title || "品牌赞助位",
          desc: h.desc || "",
          cta_text: h.cta_text || "联系运营",
          show_cta: h.show_cta !== false,
          image_file_id: h.image_file_id || "",
          link_url: h.link_url || ""
        }));
        const nextAnnouncements = res.data.announcements || [];
        heroes.value = nextHeroes;
        announcements.value = nextAnnouncements;
        saveFn({ heroes: nextHeroes, announcements: nextAnnouncements });
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/client/home.vue:258", "[home] loadHomeContent failed", e);
        loadError.value = formatErrorMessage(e, "首页内容加载失败，请稍后重试");
        if (!showSkeleton) {
          common_vendor.index.showToast({ title: loadError.value, icon: "none" });
        }
      } finally {
        isLoading.value = false;
      }
    };
    const retryHome = () => {
      loadHomeContent({ showSkeleton: true });
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
      if (!utils_auth.requireLogin({ toast: "请先登录后使用该功能" })) {
        return;
      }
      common_vendor.index.navigateTo({ url: item.path });
    };
    common_vendor.onLoad(async () => {
      await loadHomeContent({ showSkeleton: true });
    });
    common_vendor.onShow(() => {
      common_vendor.index.hideHomeButton();
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: isLoading.value
      }, isLoading.value ? {
        b: common_vendor.f(4, (i, k0, i0) => {
          return {
            a: i
          };
        })
      } : loadError.value ? {
        d: common_vendor.t(loadError.value),
        e: common_vendor.o(retryHome, "8d")
      } : common_vendor.e({
        f: heroes.value.length
      }, heroes.value.length ? {
        g: common_vendor.f(heroes.value, (hero, k0, i0) => {
          return common_vendor.e({
            a: hero.image_file_id
          }, hero.image_file_id ? {
            b: hero.image_file_id,
            c: common_vendor.o(($event) => onHeroBannerTap(hero), hero._id || hero.title)
          } : {}, {
            d: common_vendor.t(hero.title),
            e: common_vendor.t(hero.desc),
            f: hero.show_cta !== false
          }, hero.show_cta !== false ? {
            g: common_vendor.t(hero.cta_text || "联系运营"),
            h: common_vendor.o(($event) => onHeroCta(hero), hero._id || hero.title)
          } : {}, {
            i: hero.image_file_id ? 1 : "",
            j: hero._id || hero.title
          });
        }),
        h: heroSwiperCompact.value ? 1 : "",
        i: heroes.value.length > 1,
        j: heroes.value.length > 1,
        k: heroes.value.length > 1
      } : {
        l: common_vendor.o(($event) => onHeroCta(null), "36")
      }, {
        m: common_vendor.f(features, (item, k0, i0) => {
          return {
            a: item.icon,
            b: common_vendor.t(item.text),
            c: item.text,
            d: common_vendor.o(($event) => goFeature(item), item.text)
          };
        }),
        n: announcements.value.length
      }, announcements.value.length ? {
        o: common_vendor.f(announcements.value, (a, k0, i0) => {
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
        p: announcements.value.length > 1,
        q: announcements.value.length > 1,
        r: announcements.value.length > 1
      } : {}), {
        c: loadError.value,
        s: showContactModal.value
      }, showContactModal.value ? {
        t: common_vendor.o(closeContactModal, "0a"),
        v: common_vendor.t(contactPhone),
        w: common_vendor.o(copyPhone, "b7"),
        x: common_vendor.o(closeContactModal, "73"),
        y: common_vendor.o(() => {
        }, "0b"),
        z: common_vendor.o(closeContactModal, "50")
      } : {});
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-462fe6d9"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/client/home.js.map
