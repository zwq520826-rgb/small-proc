import { reactive } from 'vue'

// 导入云对象
const orderService = uniCloud.importObject('order-service')

const state = reactive({
  orders: []
})

function resolveTypeLabel(type, typeLabel) {
  if (typeLabel) return typeLabel
  if (type === 'pickup') return '快递代取'
  if (type === 'errand') return '跑腿服务'
  return '订单'
}

const pagingState = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
  hasMore: true,
  loading: false
})

let inited = false
let initPromise = null

/**
 * 将数据库格式转换为前端格式
 */
function formatOrderFromDB(order) {
  return {
    id: order._id,
    _id: order._id,
    type: order.type,
    typeLabel: resolveTypeLabel(order.type, order.type_label),
    pickupLocation: order.pickup_location || '',
    deliveryLocation: order.delivery_location || '',
    address: order.address || order.delivery_location || '',
    status: order.status,
    abnormal_reason: order.abnormal_reason || '',
    abnormal_remark: order.abnormal_remark || '',
    photo_feedback_count: Number(order.photo_feedback_count || 0),
    need_customer_service: !!order.need_customer_service,
    price: order.price,
    content: order.content || {},
    tags: order.tags || [],
    createTime: order.create_time ? new Date(order.create_time).toLocaleString() : '',
    create_time: order.create_time
  }
}

/**
 * 将前端格式转换为数据库格式
 */
function formatOrderToDB(orderData) {
  // 处理地址字段
  let deliveryLocation = orderData.deliveryLocation || ''
  const addr = orderData.address || ''
  
  // 如果 deliveryLocation 为空，尝试从 address 中提取
  if (!deliveryLocation && addr) {
    const addrLines = addr.split('\n')
    // address 格式通常是: "姓名 电话\n详细地址"
    // 取最后一行作为详细地址
    deliveryLocation = addrLines.length > 1 ? addrLines.slice(1).join('\n') : addrLines[0]
  }

  return {
    type: orderData.type,
    type_label: orderData.typeLabel || '',
    subscribe_result: orderData.subscribeResult || orderData.subscribe_result || {},
    price: Number(orderData.price),
    pickup_location: orderData.pickupLocation || '',
    delivery_location: deliveryLocation,
    address: addr,
    content: orderData.content || {},
    tags: orderData.tags || []
  }
}

/**
 * 从云数据库加载订单
 */
async function fetchOrdersFromCloud({ page = 1, pageSize = 20, append = false } = {}) {
  try {
    pagingState.loading = true
    const res = await orderService.getOrderList({
      status: 'all',
      page,
      pageSize
    })

    if (res.code === 0) {
      const mapped = (res.data || []).map(formatOrderFromDB)
      if (append) {
        const seen = new Set(state.orders.map((o) => o.id || o._id))
        const incoming = mapped.filter((o) => !seen.has(o.id || o._id))
        state.orders = state.orders.concat(incoming)
      } else {
        state.orders = mapped
      }

      const total = Number(res.total || 0)
      pagingState.page = page
      pagingState.pageSize = pageSize
      pagingState.total = total
      pagingState.hasMore = state.orders.length < total
      inited = true
      return true
    }

    console.error('加载订单失败:', res.message)
    // 如果未登录，不显示错误提示
    if (res.code !== 'NO_LOGIN') {
      uni.showToast({
        title: res.message || '加载失败',
        icon: 'none'
      })
    }
    return false
  } catch (error) {
    console.error('加载订单失败:', error)
    // 网络错误时不显示提示，避免干扰用户体验
    return false
  } finally {
    pagingState.loading = false
  }
}

async function loadOrdersFromCloud({ force = false, page = 1, pageSize = 20, append = false } = {}) {
  if (inited && !force) return true
  if (initPromise) return initPromise

  // 并发复用：避免多个组件/钩子同时触发同一次加载
  initPromise = fetchOrdersFromCloud({ page, pageSize, append }).finally(() => {
    initPromise = null
  })
  return initPromise
}

async function loadNextPage() {
  if (pagingState.loading || !pagingState.hasMore) return false
  const next = pagingState.page + 1
  return fetchOrdersFromCloud({ page: next, pageSize: pagingState.pageSize, append: true })
}

async function reloadOrders({ pageSize = 20 } = {}) {
  pagingState.page = 1
  pagingState.pageSize = pageSize
  pagingState.total = 0
  pagingState.hasMore = true
  return fetchOrdersFromCloud({ page: 1, pageSize, append: false })
}

/**
 * 创建订单
 */
async function addOrder(payload) {
  try {
    // 格式化数据
    const orderData = formatOrderToDB(payload)

    // 调用云对象创建订单
    const res = await orderService.createOrder(orderData)

    if (res.code === 0) {
      const created = res.data ? formatOrderFromDB(res.data) : null
      if (created) {
        // 本地插入，避免再触发一次全量拉取（省云函数额度）
        const existingIdx = state.orders.findIndex((o) => o.id === created.id || o._id === created._id)
        if (existingIdx >= 0) state.orders.splice(existingIdx, 1, created)
        else state.orders.unshift(created)
      }
      return created
    } else {
      uni.showToast({
        title: res.message || '创建失败',
        icon: 'none'
      })
      return null
    }
  } catch (error) {
    console.error('创建订单失败:', error)
    uni.showToast({
      title: '网络错误，请稍后重试',
      icon: 'none'
    })
    return null
  }
}

/**
 * 取消订单
 */
async function cancelOrder(id) {
  try {
    const res = await orderService.cancelOrder(id)

    if (res.code === 0) {
      // 取消成功提示：若后端已退款，则明确告知“退回余额”
      uni.showToast({
        title: res.message || '取消成功',
        icon: 'none'
      })

      // 本地更新状态，避免全量重刷
      const idx = state.orders.findIndex((o) => o.id === id || o._id === id)
      if (idx >= 0) {
        state.orders[idx] = {
          ...state.orders[idx],
          status: 'cancelled'
        }
      }
      return true
    } else {
      uni.showToast({
        title: res.message || '取消失败',
        icon: 'none'
      })
      return false
    }
  } catch (error) {
    console.error('取消订单失败:', error)
    uni.showToast({
      title: '网络错误，请稍后重试',
      icon: 'none'
    })
    return false
  }
}

/**
 * 删除订单
 */
async function deleteOrder(id) {
  try {
    const res = await orderService.deleteOrder(id)

    if (res.code === 0) {
      // 本地删除，避免全量重刷
      const idx = state.orders.findIndex((o) => o.id === id || o._id === id)
      if (idx >= 0) state.orders.splice(idx, 1)
      return true
    } else {
      uni.showToast({
        title: res.message || '删除失败',
        icon: 'none'
      })
      return false
    }
  } catch (error) {
    console.error('删除订单失败:', error)
    uni.showToast({
      title: '网络错误，请稍后重试',
      icon: 'none'
    })
    return false
  }
}

async function reportDeliveryIssue(id, reason = '') {
  try {
    const callApi = orderService.reportDeliveryIssue || orderService.reportWrongDeliveryPhoto
    const res = await callApi.call(orderService, { orderId: id, reason })
    if (res.code === 0) {
      const idx = state.orders.findIndex((o) => o.id === id || o._id === id)
      if (idx >= 0) {
        const old = state.orders[idx]
        state.orders[idx] = {
          ...old,
          status: 'abnormal',
          abnormal_reason: 'delivery_issue',
          abnormal_remark: String(reason || '').trim(),
          photo_feedback_count: Number(res.data?.feedbackCount || old.photo_feedback_count || 0),
          need_customer_service: !!res.data?.contactRequired,
          content: {
            ...(old.content || {}),
            pending_redelivery_upload: !res.data?.contactRequired
          }
        }
      }
      return { success: true, data: res.data || {} }
    }

    uni.showToast({ title: res.message || '反馈失败', icon: 'none' })
    return { success: false, data: res.data || {} }
  } catch (error) {
    console.error('提交异常反馈失败:', error)
    uni.showToast({ title: '网络错误，请稍后重试', icon: 'none' })
    return { success: false }
  }
}

async function reportWrongDeliveryPhoto(id, reason = '') {
  return reportDeliveryIssue(id, reason)
}

/**
 * 根据状态筛选订单
 */
function ordersByStatus(status) {
  if (status === 'all') return state.orders
  // “进行中”Tab 需要同时展示待取货与配送中
  if (status === 'delivering') {
    return state.orders.filter(
      (o) => o.status === 'pending_pickup' || o.status === 'delivering'
    )
  }
  return state.orders.filter((o) => o.status === status)
}

/**
 * 根据ID获取订单
 */
function getOrderById(id) {
  return state.orders.find((o) => o.id === id || o._id === id) || null
}

export function useClientOrderStore() {
  // 单例初始化：避免每次 useClientOrderStore() 都触发云函数全量拉取
  if (!inited && !initPromise) {
    initPromise = loadOrdersFromCloud({ force: false, page: 1, pageSize: pagingState.pageSize, append: false }).finally(() => {
      initPromise = null
    })
  }

  return {
    get orders() {
      return state.orders
    },
    ordersByStatus,
    getOrderById,
    addOrder,
    cancelOrder,
    deleteOrder,
    reportDeliveryIssue,
    reportWrongDeliveryPhoto,
    loadFromStorage: (force = true) => loadOrdersFromCloud({ force, page: 1, pageSize: pagingState.pageSize, append: false }),
    reloadOrders,
    loadNextPage,
    getPaging() {
      return pagingState
    }
  }
}
