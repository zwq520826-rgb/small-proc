"use strict";
const common_vendor = require("../../common/vendor.js");
const _sfc_main = {
  __name: "levels",
  setup(__props) {
    const levels = common_vendor.ref([]);
    const loading = common_vendor.ref(false);
    const errorMsg = common_vendor.ref("");
    const riderService = common_vendor._r.importObject("rider-service");
    const db = common_vendor._r.database();
    const normalizeLevels = (list = []) => {
      return list.map((item) => {
        const commission = Number(item.commission_rate ?? item.commissionRate ?? 0);
        const minOrders = Number(item.min_orders ?? item.minOrders ?? 0);
        return {
          code: item.code || "",
          name: item.name || item.code || "等级",
          minOrders: Number.isFinite(minOrders) ? minOrders : 0,
          commissionRate: Number.isFinite(commission) ? commission : 0,
          riderShare: 1 - (Number.isFinite(commission) ? commission : 0)
        };
      }).sort((a, b) => a.minOrders - b.minOrders);
    };
    const loadLevels = async () => {
      var _a;
      loading.value = true;
      errorMsg.value = "";
      try {
        let res = null;
        if (riderService && typeof riderService.getLevelList === "function") {
          res = await riderService.getLevelList();
          if (res && res.code === 0) {
            levels.value = normalizeLevels(res.data || []);
            return;
          }
        }
        const dbRes = await db.collection("rider_levels").orderBy("min_orders", "asc").get();
        levels.value = normalizeLevels(((_a = dbRes.result) == null ? void 0 : _a.data) || dbRes.data || []);
      } catch (e) {
        common_vendor.index.__f__("warn", "at pages/rider/levels.vue:84", "loadLevels failed", e);
        errorMsg.value = "加载失败，请稍后重试";
      } finally {
        loading.value = false;
      }
    };
    common_vendor.onLoad(async () => {
      await loadLevels();
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: loading.value
      }, loading.value ? {} : errorMsg.value ? {
        c: common_vendor.t(errorMsg.value)
      } : common_vendor.e({
        d: common_vendor.f(levels.value, (level, k0, i0) => {
          return {
            a: common_vendor.t(level.name || level.code),
            b: common_vendor.t(level.code || "Lv"),
            c: common_vendor.t(level.minOrders),
            d: common_vendor.t((level.commissionRate * 100).toFixed(1)),
            e: common_vendor.t((level.riderShare * 100).toFixed(1)),
            f: level.code || level.name
          };
        }),
        e: !levels.value.length
      }, !levels.value.length ? {} : {}), {
        b: errorMsg.value
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-40c2dccc"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/rider/levels.js.map
