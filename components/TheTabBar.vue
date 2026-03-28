<template>
  <view class="tabbar">
    <view
      v-for="(item, index) in displayTabs"
      :key="item.key"
      class="tab-item"
      :class="{ active: isActive(item) }"
      @click="handleClick(item)"
    >
      <view class="icon">
        <image
          v-if="item.iconType === 'image'"
          :src="item.icon"
          class="icon-image"
          mode="aspectFit"
        />
        <text v-else class="icon-text">{{ item.icon }}</text>
      </view>
      <text class="text">{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { requireLogin } from '@/utils/auth.js'

// 用户端 Tab 列表
const clientTabs = [
  { 
    key: 'home', 
    text: '首页', 
    icon: '/static/tabbar/home-active-new.png', 
    iconType: 'image',
    pagePath: '/pages/client/home',
    requiresLogin: false
  },
  { 
    key: 'orders', 
    text: '订单', 
    icon: '/static/tabbar/dindan.png', 
    iconType: 'image',
    pagePath: '/pages/client/orders/list',
    requiresLogin: true
  },
  { 
    key: 'mine', 
    text: '我的', 
    icon: '/static/tabbar/wode.png', 
    iconType: 'image',
    pagePath: '/pages/mine/index',
    requiresLogin: true
  }
]

// 骑手端 Tab 列表
const riderTabs = [
  { 
    key: 'hall', 
    text: '大厅', 
    icon: '/static/tabbar/home-active-new.png', 
    iconType: 'image',
    pagePath: '/pages/rider/hall',
    requiresLogin: true
  },
  { 
    key: 'tasks', 
    text: '任务', 
    icon: '/static/tabbar/renwu.png', 
    iconType: 'image',
    pagePath: '/pages/rider/tasks/list',
    requiresLogin: true
  },
  { 
    key: 'mine', 
    text: '我的', 
    icon: '/static/tabbar/wode.png', 
    iconType: 'image',
    pagePath: '/pages/mine/index',
    requiresLogin: true
  }
]

const currentRoute = ref('')
const userMode = ref('client') // 'client' 或 'rider'

// 获取当前模式
function getCurrentMode() {
  const savedMode = uni.getStorageSync('user_mode')
  return savedMode === 'rider' ? 'rider' : 'client'
}

// 更新当前路由和模式
function updateState() {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] || {}
  currentRoute.value = (currentPage.route || '').replace(/^\//, '')
  userMode.value = getCurrentMode()
}

// 根据模式显示对应的 Tab 列表
const displayTabs = computed(() => {
  return userMode.value === 'rider' ? riderTabs : clientTabs
})

// 判断当前 Tab 是否激活
function isActive(tab) {
  if (!tab || !currentRoute.value) return false
  const cleanPath = tab.pagePath.replace(/^\//, '')
  return cleanPath === currentRoute.value
}

// 处理 Tab 点击
function handleClick(tab) {
  if (!tab || !tab.pagePath) return

  if (tab.requiresLogin && !requireLogin({ toast: '请先登录后使用该功能' })) {
    return
  }
  
  const cleanPath = tab.pagePath.replace(/^\//, '')
  
  // 如果点击的是当前页面，不执行跳转
  if (cleanPath === currentRoute.value) return
  
  // 使用 switchTab 跳转（因为这些都是 tabBar 页面）
  uni.switchTab({ 
    url: tab.pagePath,
    fail: (err) => {
      // 如果 switchTab 失败（可能页面不在 tabBar 配置中），使用 reLaunch
      console.warn('switchTab failed, use reLaunch:', err)
      uni.reLaunch({ url: tab.pagePath })
    }
  })
}

// 页面显示时更新状态
onShow(() => {
  updateState()
})

// 组件挂载时更新状态
onMounted(() => {
  updateState()
})
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 96rpx;
  background: rgba(255, 255, 255, 0.94);
  display: flex;
  align-items: center;
  justify-content: space-around;
  box-shadow: 0 -6rpx 20rpx rgba(0, 0, 0, 0.06);
  z-index: 999;
  /* 安全区域适配 */
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8rpx 0;
  transition: all 0.2s;
}

.tab-item .icon {
  margin-bottom: 4rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-item .icon-text {
  font-size: 40rpx;
}

.tab-item .icon-image {
  width: 54rpx;
  height: 54rpx;
}

.tab-item .text {
  font-size: 22rpx;
  color: #7a7e83;
  line-height: 1;
}

.tab-item.active .text {
  color: #007aff;
  font-weight: 500;
}

.tab-item.active .icon {
  transform: scale(1.1);
}
</style>
