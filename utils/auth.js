const uniIdCo = uniCloud.importObject('uni-id-co', { customUI: true })

let checkingPromise = null

const LOGIN_PAGE = '/uni_modules/uni-id-pages/pages/login/login-withoutpwd'

export function hasLoginToken() {
  return !!uni.getStorageSync('uni_id_token')
}

export function clearLoginToken() {
  uni.removeStorageSync('uni_id_token')
  uni.removeStorageSync('uni_id_token_expired')
}

export function goLogin(options = {}) {
  const { toast = '请先登录' } = options
  if (toast) {
    uni.showToast({ title: toast, icon: 'none' })
  }
  setTimeout(() => {
    uni.navigateTo({ url: LOGIN_PAGE })
  }, 120)
}

export function requireLogin(options = {}) {
  if (hasLoginToken()) return true
  goLogin(options)
  return false
}

export async function ensureSessionAlive(options = {}) {
  if (checkingPromise) return checkingPromise
  const { silent = false } = options
  checkingPromise = (async () => {
    try {
      const token = uni.getStorageSync('uni_id_token')
      if (!token) return false
      const res = await uniIdCo.checkToken()
      if (!res || res.code !== 0) {
        handleTokenExpired()
        if (!silent) {
          uni.showToast({ title: res?.message || '登录状态已过期，请先登录', icon: 'none' })
        }
        return false
      }
      return true
    } catch (err) {
      console.warn('[auth] checkToken failed', err)
      if (!silent) {
        uni.showToast({ title: '登录状态检查失败', icon: 'none' })
      }
      return false
    } finally {
      checkingPromise = null
    }
  })()
  return checkingPromise
}

function handleTokenExpired() {
  clearLoginToken()
}
