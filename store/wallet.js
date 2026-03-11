import { reactive } from 'vue'

// 导入云对象
const walletService = uniCloud.importObject('wallet-service')

const state = reactive({
  balance: 0,
  frozenBalance: 0,
  totalIncome: 0,
  totalExpense: 0,
  transactions: [],
  loading: false
})

/**
 * 从云端加载钱包信息
 */
async function loadFromCloud() {
  if (state.loading) return
  state.loading = true
  
  try {
    const res = await walletService.getBalance()
    if (res.code === 0 && res.data) {
      state.balance = res.data.balance || 0
      state.frozenBalance = res.data.frozen_balance || 0
      state.totalIncome = res.data.total_income || 0
      state.totalExpense = res.data.total_expense || 0
    }
  } catch (e) {
    console.warn('加载钱包信息失败:', e)
  } finally {
    state.loading = false
  }
}

/**
 * 充值
 * @param {number} amount 充值金额
 * @returns {object} 结果
 */
async function recharge(amount) {
  try {
    const res = await walletService.recharge(amount)
    if (res.code === 0) {
      state.balance = res.data.balance
      return { success: true }
    } else {
      return { success: false, reason: res.message }
    }
  } catch (e) {
    console.error('充值失败:', e)
    return { success: false, reason: '网络错误，请稍后重试' }
  }
}

/**
 * 提现
 * @param {number} amount 提现金额
 * @returns {object} 结果
 */
async function withdraw(amount) {
  try {
    const res = await walletService.withdraw(amount)
    if (res.code === 0) {
      state.balance = res.data.balance
      return { success: true }
    } else {
      return { success: false, reason: res.message }
    }
  } catch (e) {
    console.error('提现失败:', e)
    return { success: false, reason: '网络错误，请稍后重试' }
  }
}

/**
 * 支付订单
 * @param {number} amount 支付金额
 * @param {string} orderId 订单ID
 * @returns {object} 结果
 */
async function pay(amount, orderId) {
  try {
    const res = await walletService.pay(amount, orderId)
    if (res.code === 0) {
      state.balance = res.data.balance
      return { success: true }
    } else {
      return { success: false, reason: res.message }
    }
  } catch (e) {
    console.error('支付失败:', e)
    return { success: false, reason: '网络错误，请稍后重试' }
  }
}

/**
 * 获取交易记录
 * @param {object} params 查询参数
 * @returns {array} 交易记录列表
 */
async function getTransactions(params = {}) {
  try {
    const res = await walletService.getTransactionList(params)
    if (res.code === 0) {
      state.transactions = res.data || []
      return { success: true, data: res.data, total: res.total }
    } else {
      return { success: false, reason: res.message }
    }
  } catch (e) {
    console.error('获取交易记录失败:', e)
    return { success: false, reason: '网络错误，请稍后重试' }
  }
}

export function useWalletStore() {
  // 初始化时从云端加载
  loadFromCloud()

  return {
    get balance() {
      return state.balance
    },
    get frozenBalance() {
      return state.frozenBalance
    },
    get totalIncome() {
      return state.totalIncome
    },
    get totalExpense() {
      return state.totalExpense
    },
    get transactions() {
      return state.transactions
    },
    get loading() {
      return state.loading
    },
    loadFromCloud,
    recharge,
    withdraw,
    pay,
    getTransactions
  }
}
