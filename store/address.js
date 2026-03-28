import { reactive } from 'vue'

const addressService = uniCloud.importObject('order-service')

const state = reactive({
  selectedAddress: null,
  addressList: []
})

let inited = false

// 将云端文档标准化为前端使用的结构（统一 id / schoolArea / isDefault）
function normalize(doc) {
  const id = doc._id || doc.id
  return {
    ...doc,
    id,
    schoolArea: doc.school_area ?? doc.schoolArea ?? '',
    isDefault: doc.is_default ?? doc.isDefault ?? false
  }
}

async function loadFromCloud() {
  try {
    const res = await addressService.getAddressList()
    if (res && res.code === 0 && Array.isArray(res.data)) {
      state.addressList = res.data.map(normalize)
      // 不要自动选中默认地址/第一条地址；必须由用户在页面里手动选择
      // 仅当当前已选地址仍存在于列表中时才保留，否则置空
      if (state.selectedAddress) {
        const selId = state.selectedAddress.id || state.selectedAddress._id
        const stillExists = state.addressList.find((a) => (a.id || a._id) === selId)
        state.selectedAddress = stillExists || null
      }
      save()
      return true
    }
  } catch (e) {
    console.warn('load address from cloud failed', e)
  }
  return false
}

async function ensureInit() {
  if (inited) return
  inited = true

  // 优先从云端加载，保证以云端为准
  const ok = await loadFromCloud()
  if (ok) return

  // 云端失败时，再尝试从本地存储恢复（降级方案）
  try {
    const data = uni.getStorageSync('client-address-list')
    if (data) {
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        state.addressList = parsed.map(normalize)
        // 同上：不自动选中默认地址/第一条地址
        if (state.selectedAddress) {
          const selId = state.selectedAddress.id || state.selectedAddress._id
          const stillExists = state.addressList.find((a) => (a.id || a._id) === selId)
          state.selectedAddress = stillExists || null
        }
      }
    }
  } catch (e) {
    console.warn('load address failed', e)
  }
}

function save() {
  try {
    uni.setStorageSync('client-address-list', JSON.stringify(state.addressList))
  } catch (e) {
    console.warn('save address failed', e)
  }
}

export function useAddressStore() {
  // 触发异步初始化（不阻塞页面），加载完成后地址列表会自动更新
  ensureInit()

  const reloadFromCloud = async () => {
    await loadFromCloud()
  }

  /**
   * 仅在前端本地“选中地址”（用于下单页选择地址场景）
   * 不触发云端“设为默认”，避免无感修改用户默认地址
   */
  const selectLocal = (id) => {
    const target = state.addressList.find((a) => a.id === id || a._id === id)
    if (!target) return false
    state.selectedAddress = target
    return true
  }

  const setSelected = async (id) => {
    const target = state.addressList.find((a) => a.id === id || a._id === id)
    if (!target) return

    // 以云端为准：先调用云对象设置默认地址
    try {
      const res = await addressService.setDefaultAddress(target._id || target.id)
      if (res && res.code !== 0) {
        uni.showToast({ title: res.message || '设置默认失败', icon: 'none' })
        return
      }
      await reloadFromCloud()
    } catch (e) {
      console.warn('set default address failed', e)
      uni.showToast({ title: '设置默认失败', icon: 'none' })
    }
  }

  const addAddress = async (payload) => {
    try {
      const res = await addressService.addAddress(payload)
      if (res && res.code !== 0) {
        uni.showToast({ title: res.message || '保存失败', icon: 'none' })
        return false
      }
      await reloadFromCloud()
      return true
    } catch (e) {
      console.warn('add address failed', e)
      uni.showToast({ title: '保存失败', icon: 'none' })
      return false
    }
  }

  const updateAddress = async (id, payload) => {
    const target = state.addressList.find((a) => a.id === id || a._id === id)
    if (!target) return false
    try {
      const res = await addressService.updateAddress(target._id || target.id, payload)
      if (res && res.code !== 0) {
        uni.showToast({ title: res.message || '保存失败', icon: 'none' })
        return false
      }
      await reloadFromCloud()
      return true
    } catch (e) {
      console.warn('update address failed', e)
      uni.showToast({ title: '保存失败', icon: 'none' })
      return false
    }
  }

  const removeAddress = async (id) => {
    const target = state.addressList.find((a) => a.id === id || a._id === id)
    if (!target) return false
    try {
      const res = await addressService.deleteAddress(target._id || target.id)
      if (res && res.code !== 0) {
        uni.showToast({ title: res.message || '删除失败', icon: 'none' })
        return false
      }
      await reloadFromCloud()
      return true
    } catch (e) {
      console.warn('delete address failed', e)
      uni.showToast({ title: '删除失败', icon: 'none' })
      return false
    }
  }

  return {
    get selectedAddress() {
      return state.selectedAddress
    },
    get addressList() {
      return state.addressList
    },
    // 下单页选择地址：只本地选中
    selectLocal,
    setSelected,
    addAddress,
    updateAddress,
    removeAddress,
    reloadFromCloud
  }
}




