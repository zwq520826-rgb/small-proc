const uniIdCo = uniCloud.importObject('uni-id-co', { customUI: true })

let checkingPromise = null
let showingExpiryModal = false

const LOGIN_PAGE = '/uni_modules/uni-id-pages/pages/login/login-withoutpwd'

export async function ensureSessionAlive(options = {}) {
  if (checkingPromise) return checkingPromise
  const { silent = false } = options
  checkingPromise = (async () => {
    try {
      const token = uni.getStorageSync('uni_id_token')
      if (!token) return false
      const res = await uniIdCo.checkToken()
      if (!res || res.code !== 0) {
        await handleTokenExpired(res?.message || '登录状态已过期，请重新登录')
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

async function handleTokenExpired(message) {
  if (showingExpiryModal) return
  showingExpiryModal = true
  try {
    uni.removeStorageSync('uni_id_token')
    uni.removeStorageSync('uni_id_token_expired')
    await new Promise((resolve) => {
      uni.showModal({
        title: '登录状态失效',
        content: message || '请重新登录后继续使用',
        showCancel: false,
        success: () => {
          uni.reLaunch({ url: LOGIN_PAGE })
          resolve()
        },
        fail: resolve
      })
    })
  } finally {
    showingExpiryModal = false
  }
}
