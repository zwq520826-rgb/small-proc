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

let inited = false
let initPromise = null
let lastBalanceLoadedAt = 0
let lastTransactionsLoadedAt = 0
let lastTxKey = ''
let txPromise = null

// 避免页面频繁切换导致重复请求（尤其在 onShow 中）
const BALANCE_MIN_INTERVAL_MS = 8000
const TRANSACTIONS_MIN_INTERVAL_MS = 8000

/**
 * 从云端加载钱包信息
 */
async function loadFromCloud(force = false) {
  const now = Date.now()
  if (state.loading && !force) return

  // 单例 + 冷却：已经加载过且在冷却时间内，则跳过
  if (!force && inited && now - lastBalanceLoadedAt < BALANCE_MIN_INTERVAL_MS) {
    return true
  }

  if (initPromise && !force) return initPromise

  initPromise = (async () => {
    state.loading = true
    try {
      const res = await walletService.getBalance()
      if (res.code === 0 && res.data) {
        state.balance = res.data.balance || 0
        state.frozenBalance = res.data.frozen_balance || 0
        state.totalIncome = res.data.total_income || 0
        state.totalExpense = res.data.total_expense || 0
        inited = true
        lastBalanceLoadedAt = Date.now()
      }
    } catch (e) {
      console.warn('加载钱包信息失败:', e)
    } finally {
      state.loading = false
    }
  })()
  
  try {
    await initPromise
  } finally {
    initPromise = null
  }
  return true
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
  return getTransactionsInternal(params, false)
}

async function getTransactionsInternal(params = {}, force = false) {
  const now = Date.now()
  const { type, page = 1, pageSize = 20 } = params
  const txKey = `${type || 'all'}|${page}|${pageSize}`

  // 冷却：同一请求参数在短时间内重复触发，则直接复用缓存
  if (!force && txKey === lastTxKey && now - lastTransactionsLoadedAt < TRANSACTIONS_MIN_INTERVAL_MS) {
    return { success: true, data: state.transactions, total: state.transactions?.length || 0 }
  }

  if (txPromise && !force) return txPromise

  txPromise = (async () => {
  try {
    const res = await walletService.getTransactionList({ type, page, pageSize })
    if (res.code === 0) {
      state.transactions = res.data || []
      lastTxKey = txKey
      lastTransactionsLoadedAt = Date.now()
      return { success: true, data: res.data, total: res.total }
    } else {
      return { success: false, reason: res.message }
    }
  } catch (e) {
    console.error('获取交易记录失败:', e)
    return { success: false, reason: '网络错误，请稍后重试' }
  }
  })()

  try {
    return await txPromise
  } finally {
    txPromise = null
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
    getTransactions: (params, force = false) => getTransactionsInternal(params, force)
  }
}
