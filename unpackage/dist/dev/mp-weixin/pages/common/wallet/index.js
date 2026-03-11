"use strict";
const common_vendor = require("../../../common/vendor.js");
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
    const walletStore = store_wallet.useWalletStore();
    const rechargePopup = common_vendor.ref(null);
    const withdrawPopup = common_vendor.ref(null);
    const rechargeAmounts = [10, 20, 50, 100, 200, 500];
    const rechargeAmount = common_vendor.ref(0);
    const customRechargeAmount = common_vendor.ref("");
    const withdrawAmounts = [10, 20, 50, 100, 200];
    const withdrawAmount = common_vendor.ref(0);
    const customWithdrawAmount = common_vendor.ref("");
    const balance = common_vendor.computed(() => walletStore.balance);
    const totalIncome = common_vendor.computed(() => walletStore.totalIncome);
    const totalExpense = common_vendor.computed(() => walletStore.totalExpense);
    const transactions = common_vendor.computed(() => walletStore.transactions);
    const refreshBalance = async () => {
      common_vendor.index.showLoading({ title: "刷新中..." });
      await walletStore.loadFromCloud();
      await walletStore.getTransactions({ page: 1, pageSize: 20 });
      common_vendor.index.hideLoading();
      common_vendor.index.showToast({ title: "已刷新", icon: "success" });
    };
    const loadMoreTransactions = async () => {
      common_vendor.index.showLoading({ title: "加载中..." });
      await walletStore.getTransactions({ page: 1, pageSize: 50 });
      common_vendor.index.hideLoading();
    };
    const showRechargePopup = () => {
      rechargeAmount.value = 0;
      customRechargeAmount.value = "";
      rechargePopup.value.open();
    };
    const closeRechargePopup = () => {
      rechargePopup.value.close();
    };
    const selectRechargeAmount = (amt) => {
      rechargeAmount.value = amt;
      customRechargeAmount.value = "";
    };
    const onCustomAmountInput = (type) => {
      if (type === "recharge") {
        rechargeAmount.value = 0;
      } else {
        withdrawAmount.value = 0;
      }
    };
    const handleRecharge = async () => {
      const amount = rechargeAmount.value || Number(customRechargeAmount.value) || 0;
      if (amount <= 0) {
        common_vendor.index.showToast({ title: "请选择或输入金额", icon: "none" });
        return;
      }
      common_vendor.index.showLoading({ title: "充值中..." });
      const result = await walletStore.recharge(amount);
      common_vendor.index.hideLoading();
      if (result.success) {
        common_vendor.index.showToast({ title: "充值成功", icon: "success" });
        closeRechargePopup();
        await walletStore.getTransactions({ page: 1, pageSize: 20 });
      } else {
        common_vendor.index.showToast({ title: result.reason || "充值失败", icon: "none" });
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
        common_vendor.index.showToast({ title: "提现成功", icon: "success" });
        closeWithdrawPopup();
        await walletStore.getTransactions({ page: 1, pageSize: 20 });
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
      await walletStore.loadFromCloud();
      await walletStore.getTransactions({ page: 1, pageSize: 20 });
    });
    return (_ctx, _cache) => {
      return common_vendor.e({
        a: common_vendor.o(refreshBalance),
        b: common_vendor.t(balance.value.toFixed(2)),
        c: common_vendor.t(totalIncome.value.toFixed(2)),
        d: common_vendor.t(totalExpense.value.toFixed(2)),
        e: common_vendor.o(showRechargePopup),
        f: common_vendor.o(showWithdrawPopup),
        g: common_vendor.o(loadMoreTransactions),
        h: transactions.value.length === 0
      }, transactions.value.length === 0 ? {} : {
        i: common_vendor.f(transactions.value, (item, k0, i0) => {
          return {
            a: common_vendor.t(getTransIcon(item.type)),
            b: common_vendor.t(getTransTitle(item.type)),
            c: common_vendor.t(formatTime(item.create_time)),
            d: common_vendor.t(isIncome(item.type) ? "+" : "-"),
            e: common_vendor.t(item.amount.toFixed(2)),
            f: isIncome(item.type) ? 1 : "",
            g: item._id
          };
        })
      }, {
        j: common_vendor.o(closeRechargePopup),
        k: common_vendor.f(rechargeAmounts, (amt, k0, i0) => {
          return {
            a: common_vendor.t(amt),
            b: amt,
            c: rechargeAmount.value === amt ? 1 : "",
            d: common_vendor.o(($event) => selectRechargeAmount(amt), amt)
          };
        }),
        l: common_vendor.o([($event) => customRechargeAmount.value = $event.detail.value, ($event) => onCustomAmountInput("recharge")]),
        m: customRechargeAmount.value,
        n: common_vendor.t(rechargeAmount.value || customRechargeAmount.value || 0),
        o: common_vendor.o(handleRecharge),
        p: common_vendor.sr(rechargePopup, "2e9d1a34-0", {
          "k": "rechargePopup"
        }),
        q: common_vendor.p({
          type: "bottom"
        }),
        r: common_vendor.o(closeWithdrawPopup),
        s: common_vendor.t(balance.value.toFixed(2)),
        t: common_vendor.f(withdrawAmounts, (amt, k0, i0) => {
          return {
            a: common_vendor.t(amt),
            b: amt,
            c: withdrawAmount.value === amt ? 1 : "",
            d: amt > balance.value ? 1 : "",
            e: common_vendor.o(($event) => selectWithdrawAmount(amt), amt)
          };
        }),
        v: common_vendor.o([($event) => customWithdrawAmount.value = $event.detail.value, ($event) => onCustomAmountInput("withdraw")]),
        w: customWithdrawAmount.value,
        x: common_vendor.t(withdrawAmount.value || customWithdrawAmount.value || 0),
        y: common_vendor.o(handleWithdraw),
        z: common_vendor.sr(withdrawPopup, "2e9d1a34-1", {
          "k": "withdrawPopup"
        }),
        A: common_vendor.p({
          type: "bottom"
        })
      });
    };
  }
};
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["__scopeId", "data-v-2e9d1a34"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../../.sourcemap/mp-weixin/pages/common/wallet/index.js.map
