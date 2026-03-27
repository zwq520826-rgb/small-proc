<template>
  <view class="page">
    <view class="nav-bar">
      <text class="title">编辑地址</text>
    </view>

    <view class="form">
      <view class="form-item">
        <text class="label">联系人</text>
        <input
          class="input"
          v-model="name"
          placeholder="请填写收货人姓名"
        />
      </view>
      <view class="form-item">
        <text class="label">手机号</text>
        <input
          class="input"
          v-model="phone"
          type="number"
          maxlength="11"
          placeholder="请填写收货人手机号"
        />
      </view>
      <view class="form-item">
        <text class="label">详细地址</text>
        <input
          class="input"
          v-model="detail"
          placeholder="例：紫荆公寓5号楼302"
        />
      </view>
      <view class="form-item row">
        <text class="label">设为默认</text>
        <switch :checked="isDefault" @change="onDefaultChange" />
      </view>
    </view>

    <view class="bottom-bar">
      <button class="save-btn" @click="saveAddress">
        保存地址
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useAddressStore } from '@/store/address'

const addressStore = useAddressStore()
const addressService = uniCloud.importObject('order-service')

const id = ref('')
const name = ref('')
const phone = ref('')
const detail = ref('')
const isDefault = ref(false)

onLoad((options) => {
  id.value = options?.id || ''
  if (id.value) {
    const existing = addressStore.addressList.find((a) => a.id === id.value || a._id === id.value)
    if (existing) {
      name.value = existing.name || ''
      phone.value = existing.phone || ''
      detail.value = existing.detail || ''
      isDefault.value = !!existing.isDefault
    }
  }
})

const onDefaultChange = (e) => {
  isDefault.value = e.detail.value
}

const saveAddress = async () => {
  if (!name.value.trim()) {
    uni.showToast({ title: '请填写联系人', icon: 'none' })
    return
  }
  if (!phone.value.trim()) {
    uni.showToast({ title: '请填写手机号', icon: 'none' })
    return
  }
  if (!detail.value.trim()) {
    uni.showToast({ title: '请填写详细地址', icon: 'none' })
    return
  }

  const payload = {
    name: name.value.trim(),
    phone: phone.value.trim(),
    detail: detail.value.trim(),
    // 不再固定写死校区字段，统一只用 detail 保存完整地址
    isDefault: isDefault.value
  }

  try {
    let ok = false
    if (id.value) {
      // 更新已有地址（云端为准）
      ok = await addressStore.updateAddress(id.value, payload)
    } else {
      // 新增地址
      ok = await addressStore.addAddress(payload)
    }
    if (!ok) return

    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 400)
  } catch (e) {
    console.error('保存地址失败:', e)
    uni.showToast({ title: '网络错误，请稍后重试', icon: 'none' })
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f7;
  display: flex;
  flex-direction: column;
}

.nav-bar {
  padding: 24rpx;
}

.title {
  font-size: 32rpx;
  font-weight: 600;
}

.form {
  margin: 16rpx 24rpx 0;
  background: #ffffff;
  border-radius: 20rpx;
  padding: 0 24rpx;
}

.form-item {
  padding: 24rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.form-item:last-child {
  border-bottom: none;
}

.label {
  display: block;
  font-size: 26rpx;
  color: #666666;
  margin-bottom: 8rpx;
}

.input {
  font-size: 28rpx;
  padding: 8rpx 0;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bottom-bar {
  margin-top: auto;
  padding: 12rpx 24rpx 24rpx;
  background: #ffffff;
}

.save-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  background: #007aff;
  color: #ffffff;
  font-size: 30rpx;
}
</style>

