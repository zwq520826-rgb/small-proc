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
let inited = false;
let initPromise = null;
let lastBalanceLoadedAt = 0;
let lastTransactionsLoadedAt = 0;
let lastTxKey = "";
let txPromise = null;
const BALANCE_MIN_INTERVAL_MS = 8e3;
const TRANSACTIONS_MIN_INTERVAL_MS = 8e3;
async function loadFromCloud(force = false) {
  const now = Date.now();
  if (state.loading && !force)
    return;
  if (!force && inited && now - lastBalanceLoadedAt < BALANCE_MIN_INTERVAL_MS) {
    return true;
  }
  if (initPromise && !force)
    return initPromise;
  initPromise = (async () => {
    state.loading = true;
    try {
      const res = await walletService.getBalance();
      if (res.code === 0 && res.data) {
        state.balance = res.data.balance || 0;
        state.frozenBalance = res.data.frozen_balance || 0;
        state.totalIncome = res.data.total_income || 0;
        state.totalExpense = res.data.total_expense || 0;
        inited = true;
        lastBalanceLoadedAt = Date.now();
      }
    } catch (e) {
      common_vendor.index.__f__("warn", "at store/wallet.js:53", "加载钱包信息失败:", e);
    } finally {
      state.loading = false;
    }
  })();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
  return true;
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
    common_vendor.index.__f__("error", "at store/wallet.js:82", "充值失败:", e);
    return { success: false, reason: "网络错误，请稍后重试" };
  }
}
async function withdraw(amount) {
  try {
    const res = await walletService.withdraw(amount);
    if (res.code === 0) {
      state.balance = res.data.balance;
      return { success: true, message: res.message || "提交成功" };
    } else {
      return { success: false, reason: res.message };
    }
  } catch (e) {
    common_vendor.index.__f__("error", "at store/wallet.js:102", "提现失败:", e);
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
    common_vendor.index.__f__("error", "at store/wallet.js:123", "支付失败:", e);
    return { success: false, reason: "网络错误，请稍后重试" };
  }
}
async function getTransactionsInternal(params = {}, force = false) {
  var _a;
  const now = Date.now();
  const { type, page = 1, pageSize = 20 } = params;
  const txKey = `${type || "all"}|${page}|${pageSize}`;
  if (!force && txKey === lastTxKey && now - lastTransactionsLoadedAt < TRANSACTIONS_MIN_INTERVAL_MS) {
    return { success: true, data: state.transactions, total: ((_a = state.transactions) == null ? void 0 : _a.length) || 0 };
  }
  if (txPromise && !force)
    return txPromise;
  txPromise = (async () => {
    try {
      const res = await walletService.getTransactionList({ type, page, pageSize });
      if (res.code === 0) {
        state.transactions = res.data || [];
        lastTxKey = txKey;
        lastTransactionsLoadedAt = Date.now();
        return { success: true, data: res.data, total: res.total };
      } else {
        return { success: false, reason: res.message };
      }
    } catch (e) {
      common_vendor.index.__f__("error", "at store/wallet.js:161", "获取交易记录失败:", e);
      return { success: false, reason: "网络错误，请稍后重试" };
    }
  })();
  try {
    return await txPromise;
  } finally {
    txPromise = null;
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
    getTransactions: (params, force = false) => getTransactionsInternal(params, force)
  };
}
exports.useWalletStore = useWalletStore;
//# sourceMappingURL=../../.sourcemap/mp-weixin/store/wallet.js.map
