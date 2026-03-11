/**
 * 用户模式状态管理
 * 用于管理用户端和骑手端的切换
 */

const STORAGE_KEY = 'user_mode'

// 模式枚举
export const USER_MODE = {
  CLIENT: 'client',  // 用户端
  RIDER: 'rider'     // 骑手端
}

/**
 * 获取当前用户模式
 * @returns {string} 'client' 或 'rider'
 */
export function getUserMode() {
  const mode = uni.getStorageSync(STORAGE_KEY)
  return mode === USER_MODE.RIDER ? USER_MODE.RIDER : USER_MODE.CLIENT
}

/**
 * 设置用户模式
 * @param {string} mode - 'client' 或 'rider'
 */
export function setUserMode(mode) {
  if (mode !== USER_MODE.CLIENT && mode !== USER_MODE.RIDER) {
    console.warn('Invalid user mode, default to client')
    mode = USER_MODE.CLIENT
  }
  uni.setStorageSync(STORAGE_KEY, mode)
  
  // 触发自定义事件，通知其他组件模式已改变
  // #ifdef H5
  window.dispatchEvent(new CustomEvent('userModeChanged', { detail: { mode } }))
  // #endif
  
  return mode
}

/**
 * 切换到骑手端
 * @returns {string} 新的模式
 */
export function switchToRider() {
  return setUserMode(USER_MODE.RIDER)
}

/**
 * 切换到用户端
 * @returns {string} 新的模式
 */
export function switchToClient() {
  return setUserMode(USER_MODE.CLIENT)
}

/**
 * 判断是否为骑手模式
 * @returns {boolean}
 */
export function isRiderMode() {
  return getUserMode() === USER_MODE.RIDER
}

/**
 * 判断是否为用户端模式
 * @returns {boolean}
 */
export function isClientMode() {
  return getUserMode() === USER_MODE.CLIENT
}

/**
 * 清除模式设置（恢复默认用户端）
 */
export function clearUserMode() {
  uni.removeStorageSync(STORAGE_KEY)
}





