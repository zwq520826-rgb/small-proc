"use strict";
const common_vendor = require("../../../common/vendor.js");
const store_user = require("../../../store/user.js");
const store_wallet = require("../../../store/wallet.js");
if (!Array) {
  const _easycom_uni_popup2 = common_vendor.resolveComponent("uni-popup");
  _easycom_uni_popup2();
}
const _easycom_uni_popup = () => "../../../uni_modules/uni-popup/components/uni-popup/uni-popup.js";
if (!Math) {
  _easycom_uni_popup();
}
const _sfc_main = {
  __name: "index",
  setup(__props) {
    const riderService = common_vendor.tr.importObject("rider-service");
    const walletStore = store_wallet.useWalletStore();
    const withdrawPopup = common_vendor.ref(null);
    const guidePopup = common_vendor.ref(null);
    const withdrawAmounts = [10, 20, 50, 100, 200];
    const withdrawAmount = common_vendor.ref(0);
    const customWithdrawAmount = common_vendor.ref("");
    const withdrawGuide = common_vendor.ref({
      title: "提现请点我的",
      tip: "扫描二维码添加骑手群",
      qr_file_id: "",
      enable: true
    });
    const balance = common_vendor.computed(() => walletStore.balance);
    const totalIncome = common_vendor.computed(() => walletStore.totalIncome);
    const totalExpense = common_vendor.computed(() => walletStore.totalExpense);
    const transactions = common_vendor.computed(() => walletStore.transactions);
    const refreshBalance = async () => {
      common_vendor.index.showLoading({ title: "刷新中..." });
      await walletStore.loadFromCloud(true);
      await walletStore.getTransactions({ page: 1, pageSize: 20 }, true);
      common_vendor.index.hideLoading();
      common_vendor.index.showToast({ title: "已刷新", icon: "success" });
    };
    const loadMoreTransactions = async () => {
      common_vendor.index.showLoading({ title: "加载中..." });
      await walletStore.getTransactions({ page: 1, pageSize: 50 }, true);
      common_vendor.index.hideLoading();
    };
    const onCustomAmountInput = (type) => {
      if (type === "withdraw") {
        withdrawAmount.value = 0;
      }
    };
    const showWithdrawPopup = () => {
      withdrawAmount.value = 0;
      customWithdrawAmount.value = "";
      withdrawPopup.value.open();
    };
    const closeWithdrawPopup = () => {
      withdrawPopup.value.close();
    };
    const openWithdrawGuide = () => {
      guidePopup.value && guidePopup.value.open();
    };
    const closeWithdrawGuide = () => {
      guidePopup.value && guidePopup.value.close();
    };
    const previewGuideQr = () => {
      if (!withdrawGuide.value.qr_file_id)
        return;
      common_vendor.index.previewImage({ urls: [withdrawGuide.value.qr_file_id], current: withdrawGuide.value.qr_file_id });
    };
    const loadWithdrawGuide = async () => {
      try {
        const res = await riderService.getWithdrawGuide();
        if (res && res.code === 0 && res.data) {
          withdrawGuide.value = {
            title: res.data.title || "提现请点我的",
            tip: res.data.tip || "扫描二维码添加骑手群",
            qr_file_id: res.data.qr_file_id || "",
            enable: res.data.enable !== false
          };
        }
      } catch (e) {
      }
    };
    const selectWithdrawAmount = (amt) => {
      if (amt > balance.value) {
        common_vendor.index.showToast({ title: "余额不足", icon: "none" });
        return;
      }
      withdrawAmount.value = amt;
      customWithdrawAmount.value = "";
    };
    const handleWithdraw = async () => {
      const amount = withdrawAmount.value || Number(customWithdrawAmount.value) || 0;
      if (amount <= 0) {
        common_vendor.index.showToast({ title: "请选择或输入金额", icon: "none" });
        return;
      }
      if (amount > balance.value) {
        common_vendor.index.showToast({ title: "余额不足", icon: "none" });
        return;
      }
      common_vendor.index.showLoading({ title: "提现中..." });
      const result = await walletStore.withdraw(amount);
      common_vendor.index.hideLoading();
      if (result.success) {
        common_vendor.index.showToast({ title: result.message || "提交成功", icon: "success" });
        closeWithdrawPopup();
        await walletStore.getTransactions({ page: 1, pageSize: 20 }, true);
      } else {
        common_vendor.index.showToast({ title: result.reason || "提现失败", icon: "none" });
      }
    };
    const getTransIcon = (type) => {
      const icons = {
        recharge: "💰",
        withdraw: "💸",
        pay: "🛒",
        income: "💵",
        refund: "↩️"
      };
      return icons[type] || "📝";
    };
    const getTransTitle = (type) => {
      const titles = {
        recharge: "余额充值",
        withdraw: "余额提现",
        pay: "订单支付",
        income: "订单收入",
        refund: "订单退款"
      };
      return titles[type] || "其他";
    };
    const withdrawMeta = (item) => {
      if (item.type !== "withdraw")
        return null;
      const amt = Number(item.amount || 0);
      const st = item.status || "pending";
      if (st === "pending")
        return { kind: "plain", text: "待打款 · 等待运营处理" };
      if (st === "success")
        return { kind: "plain", text: `已打款 · ¥${amt.toFixed(2)}` };
      if (st === "failed") {
        const r = String(item.remark || "").trim();
        let reason = "";
        if (r.startsWith("提现已驳回：")) {
          reason = r.slice("提现已驳回：".length).trim();
        } else if (r) {
          reason = r;
        }
        return { kind: "reject", reason };
      }
      return { kind: "plain", text: "" };
    };
    const isIncome = (type) => {
      return ["recharge", "income", "refund"].includes(type);
    };
    const formatTime = (timestamp) => {
      if (!timestamp)
        return "";
      const date = new Date(timestamp);
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const hour = date.getHours().toString().padStart(2, "0");
      const minute = date.getMinutes().toString().padStart(2, "0");
      return `${month}-${day} ${hour}:${minute}`;
    };
    common_vendor.onShow(async () => {
      if (!store_user.isRiderMode()) {
        common_vendor.index.showToast({ title: "仅骑手可用", icon: "none" });
        setTimeout(() => {
          common_vendor.index.navigateBack({ delta: 1 });
        }, 300);
        return;
      }
      await walletStore.loadFromCloud();
      await walletStore.getTransactions({ page: 1, pageSize: 20 }, true);
      await loadWithdrawGuide();
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: common_vendor.o(refreshBalance),
        b: common_vendor.t(balance.value.toFixed(2)),
        c: common_vendor.t(totalIncome.value.toFixed(2)),
        d: common_vendor.t(totalExpense.value.toFixed(2)),
        e: common_vendor.o(showWithdrawPopup),
        f: withdrawGuide.value.enable
      }, withdrawGuide.value.enable ? {
        g: common_vendor.t(withdrawGuide.value.title || "提现请点我的"),
        h: common_vendor.o(openWithdrawGuide)
      } : {}, {
        i: common_vendor.o(loadMoreTransactions),
        j: transactions.value.length === 0
      }, transactions.value.length === 0 ? {} : {
        k: common_vendor.f(transactions.value, (item, k0, i0) => {
          return common_vendor.e({
            a: common_vendor.t(getTransIcon(item.type)),
            b: common_vendor.t(getTransTitle(item.type)),
            c: withdrawMeta(item)
          }, withdrawMeta(item) ? common_vendor.e({
            d: withdrawMeta(item).kind === "reject"
          }, withdrawMeta(item).kind === "reject" ? common_vendor.e({
            e: withdrawMeta(item).reason
          }, withdrawMeta(item).reason ? {
            f: common_vendor.t(withdrawMeta(item).reason)
          } : {}) : {
            g: common_vendor.t(withdrawMeta(item).text)
          }) : {}, {
            h: common_vendor.t(formatTime(item.create_time)),
            i: item.type === "withdraw" && item.status === "failed"
          }, item.type === "withdraw" && item.status === "failed" ? {
            j: common_vendor.t(item.amount.toFixed(2))
          } : item.type === "withdraw" && item.status === "success" ? {
            l: common_vendor.t(item.amount.toFixed(2))
          } : {
            m: common_vendor.t(isIncome(item.type) ? "+" : "-"),
            n: common_vendor.t(item.amount.toFixed(2)),
            o: isIncome(item.type) ? 1 : ""
          }, {
            k: item.type === "withdraw" && item.status === "success",
            p: item._id
          });
        })
      }, {
        l: common_vendor.o(closeWithdrawPopup),
        m: common_vendor.t(balance.value.toFixed(2)),
        n: common_vendor.f(withdrawAmounts, (amt, k0, i0) => {
          return {
            a: common_vendor.t(amt),
            b: amt,
            c: withdrawAmount.value === amt ? 1 : "",
            d: amt > balance.value ? 1 : "",
            e: common_vendor.o(($event) => selectWithdrawAmount(amt), amt)
          };
        }),
        o: common_vendor.o([($event) => customWithdrawAmount.value = $event.detail.value, ($event) => onCustomAmountInput("withdraw")]),
        p: customWithdrawAmount.value,
        q: common_vendor.t(withdrawAmount.value || customWithdrawAmount.value || 0),
        r: common_vendor.o(handleWithdraw),
        s: common_vendor.sr(withdrawPopup, "2e9d1a34-0", {
          "k": "withdrawPopup"
        }),
        t: common_vendor.p({
          type: "bottom"
        }),
        v: common_vendor.t(withdrawGuide.value.tip || "扫描二维码添加骑手群"),
        w: withdrawGuide.value.qr_file_id
      }, withdrawGuide.value.qr_file_id ? {
        x: withdrawGuide.value.qr_file_id,
        y: common_vendor.o(previewGuideQr)
      } : {}, {
        z: common_vendor.o(closeWithdrawGuide),
        A: common_vendor.sr(guidePopup, "2e9d1a34-1", {
          "k": "guidePopup"
        }),
        B: common_vendor.p({
          type: "center"
        })
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-2e9d1a34"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/common/wallet/index.js.map
