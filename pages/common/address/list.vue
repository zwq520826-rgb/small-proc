<template>
  <view class="page">
    <view class="nav-bar">
      <text class="title">地址管理</text>
    </view>

    <scroll-view class="content" scroll-y>
      <view
        v-for="item in addressList"
        :key="item.id"
        class="card"
        @click="handleCardClick(item.id)"
      >
        <view class="row-top">
          <view class="name-phone">
            <text class="name">{{ item.name }}</text>
            <text class="phone">{{ item.phone }}</text>
          </view>
          <view class="actions">
            <text
              v-if="item.isDefault"
              class="default-tag"
            >默认地址</text>
            <button
              class="icon-btn"
              @click.stop="editAddress(item.id)"
            >✏️</button>
            <button
              class="icon-btn"
              @click.stop="remove(item.id)"
            >🗑</button>
          </view>
        </view>
        <view class="row-middle">
          <text class="detail">{{ item.detail }}</text>
        </view>
        <view class="row-bottom">
          <button
            v-if="!item.isDefault"
            class="set-default"
            @click.stop="setDefault(item.id)"
          >
            设为默认
          </button>
        </view>
      </view>
    </scroll-view>

    <view class="bottom-bar">
      <button class="add-btn" @click="addNew">
        + 添加新地址
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useAddressStore } from '@/store/address'

const addressStore = useAddressStore()
const addressList = computed(() => addressStore.addressList)

const query = { source: '' }

onLoad((options) => {
  query.source = options?.source || ''
})

const setDefault = async (id) => {
  const ok = await addressStore.setSelected(id)
  // 如果是从选择地址入口进来的，设为默认后直接返回上一页
  if (ok && query.source === 'select') {
    uni.navigateBack()
  }
}

const editAddress = (id) => {
  uni.navigateTo({
    url: `/pages/common/address/edit?id=${id}`
  })
}

const remove = (id) => {
  uni.showModal({
    content: '确定删除该地址吗？',
    confirmText: '删除',
    cancelText: '取消',
    success: async (res) => {
      if (res.confirm) {
        const ok = await addressStore.removeAddress(id)
        if (ok) {
          uni.showToast({ title: '已删除', icon: 'success' })
        }
      }
    }
  })
}

const addNew = () => {
  uni.navigateTo({
    url: '/pages/common/address/edit'
  })
}

// 整卡点击：如果是从下单页选择地址进来的，点击整行直接选中并返回
const handleCardClick = (id) => {
  if (query.source === 'select') {
    // 下单选地址：只做本地选中，不改默认地址
    const ok = addressStore.selectLocal(id)
    if (ok) uni.navigateBack()
    else uni.showToast({ title: '地址不存在或已删除', icon: 'none' })
    return
  }
  // 地址管理：点击整卡默认进入编辑
  editAddress(id)
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
  font-size: 32rpx;
  font-weight: 600;
}

.content {
  flex: 1;
  padding: 0 24rpx 24rpx;
}

.card {
  background: #ffffff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}

.row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.name-phone {
  display: flex;
  flex-direction: column;
}

.name {
  font-size: 30rpx;
  font-weight: 600;
}

.phone {
  margin-top: 4rpx;
  font-size: 26rpx;
  color: #666666;
}

.actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.default-tag {
  font-size: 24rpx;
  color: #007aff;
  margin-right: 8rpx;
}

.icon-btn {
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  font-size: 32rpx;
  width: 48rpx;
  height: 48rpx;
  line-height: 48rpx;
}

.row-middle {
  margin-top: 6rpx;
}

.detail {
  display: block;
  margin-top: 4rpx;
  font-size: 26rpx;
  color: #666666;
}

.row-bottom {
  margin-top: 12rpx;
}

.set-default {
  padding: 0 20rpx;
  height: 56rpx;
  line-height: 56rpx;
  font-size: 24rpx;
  border-radius: 999rpx;
  border: 1rpx solid #007aff;
  color: #007aff;
  background: #ffffff;
}

.bottom-bar {
  padding: 12rpx 24rpx 24rpx;
  background: #ffffff;
}

.add-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  background: #007aff;
  color: #ffffff;
  font-size: 30rpx;
}
</style>


