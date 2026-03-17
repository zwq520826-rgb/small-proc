import { reactive } from 'vue'

// 导入云对象
const orderService = uniCloud.importObject('order-service')

const state = reactive({
  hallTasks: [],
  myTasks: []
})

/**
 * 将数据库格式转换为前端格式
 */
function formatTaskFromDB(task) {
  return {
    id: task._id,
    _id: task._id,
    type: task.type,
    typeLabel: task.type_label || '',
    price: task.price,
    pickupLocation: task.pickup_location || '',
    pickupDistance: task.pickup_distance || 0,
    deliveryLocation: task.delivery_location || '',
    address: task.address || task.delivery_location || '',
    status: task.status,
    content: task.content || {},
    tags: task.tags || [],
    rider_id: task.rider_id,
    user_id: task.user_id,
    accept_time: task.accept_time,
    pickup_time: task.pickup_time,
    complete_time: task.complete_time,
    completedAt: task.complete_time
  }
}

/**
 * 从云数据库加载大厅任务
 */
async function loadHallTasksFromCloud(sortBy = 'distance') {
  try {
    const res = await orderService.getHallTasks({
      sortBy: sortBy,
      page: 1,
      pageSize: 100
    })

    if (res.code === 0) {
      state.hallTasks = (res.data || []).map(formatTaskFromDB)
      return true
    } else {
      console.error('加载大厅任务失败:', res.message)
      if (res.code !== 'NO_LOGIN') {
        uni.showToast({
          title: res.message || '加载失败',
          icon: 'none'
        })
      }
      return false
    }
  } catch (error) {
    console.error('加载大厅任务失败:', error)
    // 确保 loading 被隐藏
    uni.hideLoading()
    return false
  }
}

/**
 * 从云数据库加载我的任务
 */
async function loadMyTasksFromCloud(status = 'all') {
  try {
    const res = await orderService.getMyTasks({
      status: status,
      page: 1,
      pageSize: 100
    })

    if (res.code === 0) {
      state.myTasks = (res.data || []).map(formatTaskFromDB)
      return true
    } else {
      console.error('加载我的任务失败:', res.message)
      if (res.code !== 'NO_LOGIN') {
        uni.showToast({
          title: res.message || '加载失败',
          icon: 'none'
        })
      }
      return false
    }
  } catch (error) {
    console.error('加载我的任务失败:', error)
    // 确保 loading 被隐藏
    uni.hideLoading()
    return false
  }
}

/**
 * 获取大厅任务（排序）
 */
function hallTasksSorted(sortBy) {
  const list = [...state.hallTasks]
  // 加急优先：先根据 content.isUrgent 排序（true 在前），再按原有规则排序
  list.sort((a, b) => {
    const aUrgent = !!(a.content && a.content.isUrgent)
    const bUrgent = !!(b.content && b.content.isUrgent)

    if (aUrgent !== bUrgent) {
      // 加急的排前面
      return aUrgent ? -1 : 1
    }

    // 在同一优先级内再按原来的规则排序
  if (sortBy === 'price') {
      return (b.price || 0) - (a.price || 0)
  } else {
      return (a.pickupDistance || 0) - (b.pickupDistance || 0)
  }
  })
  return list
}

/**
 * 抢单（接单）
 */
async function grabTask(id) {
  try {
    const res = await orderService.grabTask(id)

    if (res.code === 0) {
      // 抢单成功后，重新加载数据
      await Promise.all([
        loadHallTasksFromCloud(),
        loadMyTasksFromCloud('all')
      ])
      return { success: true }
    } else {
      return {
        success: false,
        msg: res.message || '抢单失败'
      }
    }
  } catch (error) {
    console.error('抢单失败:', error)
    // 确保 loading 被隐藏
    uni.hideLoading()
    return {
      success: false,
      msg: '网络错误，请稍后重试'
    }
  }
}

/**
 * 根据状态筛选任务
 */
function tasksByStatus(status) {
  return state.myTasks.filter(t => t.status === status)
}

/**
 * 根据ID获取任务（先从我的任务中查找，如果找不到再从大厅任务中查找）
 */
function getTaskById(id) {
  // 先从我的任务中查找
  let task = state.myTasks.find(t => t.id === id || t._id === id)
  if (task) return task
  
  // 如果找不到，再从大厅任务中查找
  task = state.hallTasks.find(t => t.id === id || t._id === id)
  return task || null
}

/**
 * 确认取货
 */
async function confirmPickup(id, images = []) {
  try {
    const res = await orderService.confirmPickup(id, images)

    if (res.code === 0) {
      // 确认成功后，重新加载我的任务
      await loadMyTasksFromCloud('all')
      return true
    } else {
      uni.showToast({
        title: res.message || '确认失败',
        icon: 'none'
      })
      return false
    }
  } catch (error) {
    console.error('确认取货失败:', error)
    uni.showToast({
      title: '网络错误，请稍后重试',
      icon: 'none'
    })
    return false
  }
}

/**
 * 确认送达
 */
async function confirmDelivery(id, images) {
  try {
    const res = await orderService.confirmDelivery(id, images)

    if (res.code === 0) {
      // 送达成功后，骑手收入与等级升级由后端 rider-service 统一处理
      // 确认成功后，重新加载我的任务
      await loadMyTasksFromCloud('all')
      return true
    } else {
      uni.showToast({
        title: res.message || '确认失败',
        icon: 'none'
      })
      return false
    }
  } catch (error) {
    console.error('确认送达失败:', error)
    uni.showToast({
      title: '网络错误，请稍后重试',
      icon: 'none'
    })
    return false
  }
}

/**
 * 初始化数据（兼容旧接口）
 */
async function initMock() {
  await Promise.all([
    loadHallTasksFromCloud(),
    loadMyTasksFromCloud('all')
  ])
}

export function useRiderTaskStore() {
  // 初始化时加载数据
  initMock()

  return {
    get hallTasks() {
      return state.hallTasks
    },
    get myTasks() {
      return state.myTasks
    },
    initMock,
    hallTasksSorted,
    grabTask,
    tasksByStatus,
    getTaskById,
    confirmPickup,
    confirmDelivery,
    loadFromStorage: initMock // 保持接口一致
  }
}