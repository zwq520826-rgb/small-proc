<template>
  <view class="tabbar">
    <view
      v-for="tab in displayTabs"
      :key="tab.key"
      class="tab-item"
      :class="{ active: isActive(tab) }"
      @click="switchTab(tab)"
    >
      <text class="icon">{{ tab.icon }}</text>
      <text class="text">{{ tab.text }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

const state = reactive({
  route: '',
  mode: 'client'
})

const tabs = [
  { key: 'home', mode: 'client', text: '首页', icon: '🏠', pagePath: '/pages/client/home' },
  { key: 'orders', mode: 'client', text: '订单', icon: '📋', pagePath: '/pages/client/orders/list' },
  { key: 'hall', mode: 'rider', text: '大厅', icon: '🏁', pagePath: '/pages/rider/hall' },
  { key: 'tasks', mode: 'rider', text: '任务', icon: '📦', pagePath: '/pages/rider/tasks/list' },
  { key: 'mine', mode: 'both', text: '我的', icon: '👤', pagePath: '/pages/mine/index' }
]

const displayTabs = computed(() => {
  if (state.mode === 'rider') {
    return [tabByKey('hall'), tabByKey('tasks'), tabByKey('mine')].filter(Boolean)
  }
  return [tabByKey('home'), tabByKey('orders'), tabByKey('mine')].filter(Boolean)
})

function tabByKey(key) {
  return tabs.find(t => t.key === key)
}

function updateState() {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] || {}
  state.route = (currentPage.route || '').replace(/^\//, '')
  const savedMode = uni.getStorageSync('tab_mode')
  state.mode = savedMode === 'rider' ? 'rider' : 'client'
}

function isActive(tab) {
  if (!tab) return false
  const cleanPath = tab.pagePath.replace(/^\//, '')
  return cleanPath === state.route
}

function switchTab(tab) {
  if (!tab) return
  const cleanPath = tab.pagePath.replace(/^\//, '')
  if (cleanPath === state.route) return
  uni.switchTab({ url: tab.pagePath })
}

onShow(() => {
  updateState()
})
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100rpx;
  background: #ffffff;
  border-top: 1rpx solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  box-shadow: 0 -4rpx 12rpx rgba(0, 0, 0, 0.04);
  z-index: 999;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: #7a7e83;
}

.tab-item .icon {
  font-size: 34rpx;
  margin-bottom: 4rpx;
}

.tab-item.active {
  color: #007aff;
}
</style>






