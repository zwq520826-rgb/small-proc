"use strict";
const common_vendor = require("../common/vendor.js");
const walletService = common_vendor.tr.importObject("wallet-service");
const state = common_vendor.reactive({
  balance: 0,
  frozenBalance: 0,
  totalIncome: 0,
  totalExpense: 0,
  transactions: [],
  loading: false
});
async function loadFromCloud() {
  if (state.loading)
    return;
  state.loading = true;
  try {
    const res = await walletService.getBalance();
    if (res.code === 0 && res.data) {
      state.balance = res.data.balance || 0;
      state.frozenBalance = res.data.frozen_balance || 0;
      state.totalIncome = res.data.total_income || 0;
      state.totalExpense = res.data.total_expense || 0;
    }
  } catch (e) {
    common_vendor.index.__f__("warn", "at store/wallet.js:31", "加载钱包信息失败:", e);
  } finally {
    state.loading = false;
  }
}
async function recharge(amount) {
  try {
    const res = await walletService.recharge(amount);
    if (res.code === 0) {
      state.balance = res.data.balance;
      return { success: true };
    } else {
      return { success: false, reason: res.message };
    }
  } catch (e) {
    common_vendor.index.__f__("error", "at store/wallet.js:52", "充值失败:", e);
    return { success: false, reason: "网络错误，请稍后重试" };
  }
}
async function withdraw(amount) {
  try {
    const res = await walletService.withdraw(amount);
    if (res.code === 0) {
      state.balance = res.data.balance;
      return { success: true };
    } else {
      return { success: false, reason: res.message };
    }
  } catch (e) {
    common_vendor.index.__f__("error", "at store/wallet.js:72", "提现失败:", e);
    return { success: false, reason: "网络错误，请稍后重试" };
  }
}
async function pay(amount, orderId) {
  try {
    const res = await walletService.pay(amount, orderId);
    if (res.code === 0) {
      state.balance = res.data.balance;
      return { success: true };
    } else {
      return { success: false, reason: res.message };
    }
  } catch (e) {
    common_vendor.index.__f__("error", "at store/wallet.js:93", "支付失败:", e);
    return { success: false, reason: "网络错误，请稍后重试" };
  }
}
async function getTransactions(params = {}) {
  try {
    const res = await walletService.getTransactionList(params);
    if (res.code === 0) {
      state.transactions = res.data || [];
      return { success: true, data: res.data, total: res.total };
    } else {
      return { success: false, reason: res.message };
    }
  } catch (e) {
    common_vendor.index.__f__("error", "at store/wallet.js:113", "获取交易记录失败:", e);
    return { success: false, reason: "网络错误，请稍后重试" };
  }
}
function useWalletStore() {
  loadFromCloud();
  return {
    get balance() {
      return state.balance;
    },
    get frozenBalance() {
      return state.frozenBalance;
    },
    get totalIncome() {
      return state.totalIncome;
    },
    get totalExpense() {
      return state.totalExpense;
    },
    get transactions() {
      return state.transactions;
    },
    get loading() {
      return state.loading;
    },
    loadFromCloud,
    recharge,
    withdraw,
    pay,
    getTransactions
  };
}
exports.useWalletStore = useWalletStore;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/wallet.js.map
