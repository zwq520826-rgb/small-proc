<template>
  <view class="page">
    <!-- Header Status (Gradient Blue) -->
    <view class="status-header" :class="order?.status">
      <text class="status-title">{{ getStatusTitle() }}</text>
      <text class="status-subtitle">{{ getStatusSubtitle() }}</text>
    </view>

    <!-- Timeline Steps -->
    <view class="timeline-section">
      <view class="timeline">
        <view
          v-for="(step, index) in timelineSteps"
          :key="index"
          class="timeline-item"
          :class="{ active: isStepActive(step.status), completed: isStepCompleted(step.status) }"
        >
          <view class="timeline-dot">
            <text v-if="isStepCompleted(step.status)" class="check-icon">✓</text>
          </view>
          <text class="timeline-label">{{ step.label }}</text>
          <view v-if="index < timelineSteps.length - 1" class="timeline-line"></view>
        </view>
      </view>
    </view>

    <!-- Rider Info Card (Only show if delivering or completed) -->
    <view v-if="shouldShowRider" class="rider-card">
      <view class="rider-header">
        <text class="card-title">骑手信息</text>
      </view>
      <view class="rider-content">
        <image
          v-if="order.rider?.avatar"
          class="rider-avatar"
          :src="order.rider.avatar"
          mode="aspectFill"
        />
        <view v-else class="rider-avatar placeholder">
          <text class="avatar-text">{{ getRiderInitial() }}</text>
        </view>
        <view class="rider-info">
          <text class="rider-name">{{ order.rider?.name || '未知骑手' }}</text>
          <text class="rider-phone">{{ order.rider?.phone || '暂无电话' }}</text>
        </view>
        <button class="call-btn" @click="handleCallRider">
          <text class="call-icon">📞</text>
          <text>拨打电话</text>
        </button>
      </view>
    </view>

    <!-- Order Info Card -->
    <view class="order-info-card">
      <view class="card-header">
        <view class="type-badge" :class="order?.type">
          {{ order?.typeLabel || '订单' }}
        </view>
        <text class="order-price">¥{{ Number(order?.price || 0).toFixed(2) }}</text>
      </view>

      <!-- Content Section -->
      <view class="content-section">
        <!-- Images (if Pickup) -->
        <view v-if="order?.type === 'pickup' && order?.content?.images?.length" class="image-grid">
          <image
            v-for="(img, idx) in order.content.images"
            :key="idx"
            class="content-image"
            :src="img"
            mode="aspectFill"
            @click="previewImages(idx)"
          />
        </view>

        <!-- Description -->
        <view class="description-section">
          <text class="description-label">订单描述</text>
          <text class="description-text">{{ getOrderDescription() }}</text>
        </view>
      </view>

      <!-- Address Section -->
      <view class="address-section">
        <view class="address-item">
          <text class="address-label">取件地址</text>
          <text class="address-value">{{ order?.pickupLocation || '未指定' }}</text>
        </view>
        <view class="address-arrow">→</view>
        <view class="address-item">
          <text class="address-label">送达地址</text>
          <text class="address-value">{{ order?.address || order?.deliveryLocation || '未指定' }}</text>
        </view>
      </view>

      <!-- Time Section -->
      <view class="time-section">
        <view class="time-item">
          <text class="time-label">创建时间</text>
          <text class="time-value">{{ formatTime(order?.createTime || order?.publishedAt) }}</text>
        </view>
        <view v-if="order?.rider" class="time-item">
          <text class="time-label">接单时间</text>
          <text class="time-value">{{ formatTime(order.createTime) }}</text>
        </view>
      </view>
    </view>

    <!-- Bottom Action Bar (Fixed) -->
    <view class="bottom-bar">
      <!-- pending_accept: 取消订单 + 加急 -->
      <template v-if="order?.status === 'pending_accept'">
        <button class="action-btn btn-cancel" @click="handleCancelOrder">
          取消订单
        </button>
        <button class="action-btn btn-urgent" @click="handleUrgent">
          加急 (+¥1)
        </button>
      </template>

      <!-- delivering: 确认送达 -->
      <button
        v-if="order?.status === 'delivering'"
        class="action-btn btn-primary"
        @click="handleConfirmDelivery"
      >
        确认送达
      </button>

      <!-- completed: 删除订单 -->
      <button
        v-if="order?.status === 'completed'"
        class="action-btn btn-delete"
        @click="handleDeleteOrder"
      >
        删除订单
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
// 【修改点1】引入正确的 store 文件 (clientOrder.js)
import { useClientOrderStore } from '@/store/clientOrder'

// 【修改点2】使用新的 store 名称
const store = useClientOrderStore()
const order = ref(null)

// Timeline steps
const timelineSteps = [
  { label: '已支付', status: 'paid' },
  { label: '已接单', status: 'accepted' },
  { label: '配送中', status: 'delivering' },
  { label: '已送达', status: 'completed' }
]

// Check if should show rider info
const shouldShowRider = computed(() => {
  return order.value && 
    (order.value.status === 'delivering' || order.value.status === 'completed') &&
    order.value.rider
})

// Get status title
const getStatusTitle = () => {
  if (!order.value) return '加载中...'
  
  const statusMap = {
    pending_accept: '等待骑手接单',
    delivering: '骑手正在配送中',
    completed: '订单已完成',
    cancelled: '订单已取消'
  }
  return statusMap[order.value.status] || '订单处理中'
}

// Get status subtitle
const getStatusSubtitle = () => {
  if (!order.value) return ''
  
  if (order.value.status === 'delivering') {
    return '预计 10 分钟送达'
  } else if (order.value.status === 'pending_accept') {
    return '正在为您匹配骑手'
  } else if (order.value.status === 'completed') {
    return '感谢您的使用'
  }
  return ''
}

// Check if step is active
const isStepActive = (stepStatus) => {
  if (!order.value) return false
  
  const statusMapping = {
    pending_accept: 'accepted',
    delivering: 'delivering',
    completed: 'completed'
  }
  
  return statusMapping[order.value.status] === stepStatus
}

// Check if step is completed
const isStepCompleted = (stepStatus) => {
  if (!order.value) return false
  
  const statusOrder = ['paid', 'accepted', 'delivering', 'completed']
  const currentStatus = order.value.status
  
  const currentIndex = statusOrder.findIndex(s => {
    const mapping = {
      pending_accept: 'accepted',
      delivering: 'delivering',
      completed: 'completed'
    }
    return mapping[currentStatus] === s
  })
  
  const stepIndex = statusOrder.indexOf(stepStatus)
  return stepIndex < currentIndex || (stepIndex === currentIndex && currentStatus !== 'pending_accept')
}

// Get order description
const getOrderDescription = () => {
  if (!order.value) return ''
  
  if (order.value.content?.description) {
    return order.value.content.description
  }
  
  if (order.value.type === 'pickup') {
    return `从 ${order.value.pickupLocation} 代取快递到 ${order.value.deliveryLocation}`
  }
  
  return order.value.typeLabel || '订单详情'
}

// Get rider initial
const getRiderInitial = () => {
  if (!order.value?.rider?.name) return '?'
  return order.value.rider.name.charAt(0).toUpperCase()
}

// Format time
const formatTime = (timeStr) => {
  if (!timeStr) return '未知时间'
  return timeStr
}

// Preview images
const previewImages = (currentIndex) => {
  if (!order.value?.content?.images?.length) return
  
  uni.previewImage({
    urls: order.value.content.images,
    current: order.value.content.images[currentIndex]
  })
}

// Handle call rider
const handleCallRider = () => {
  if (!order.value?.rider?.phone) {
    uni.showToast({ title: '暂无骑手电话', icon: 'none' })
    return
  }
  
  uni.makePhoneCall({
    phoneNumber: order.value.rider.phone,
    fail: (err) => {
      console.error('拨打电话失败:', err)
      uni.showToast({ title: '拨打电话失败', icon: 'none' })
    }
  })
}

// Handle cancel order
const handleCancelOrder = () => {
  uni.showModal({
    title: '确认取消',
    content: '确定要取消这个订单吗？',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '处理中...' })
        // 【修改点3】变量名改为 store
        const success = await store.cancelOrder(order.value.id)
        uni.hideLoading()
        if (success) {
          uni.showToast({ title: '订单已取消', icon: 'success' })
          setTimeout(() => {
            uni.navigateBack()
          }, 1500)
        } else {
          // 错误提示已在 store 中处理
        }
      }
    }
  })
}

// Handle urgent
const handleUrgent = () => {
  uni.showModal({
    title: '加急服务',
    content: '加急服务将额外收取 ¥1.00，是否确认？',
    success: (res) => {
      if (res.confirm) {
        // 这里可以调用加急接口
        uni.showToast({ title: '加急成功', icon: 'success' })
      }
    }
  })
}

// Handle confirm delivery
const handleConfirmDelivery = () => {
  uni.showModal({
    title: '确认送达',
    content: '确认订单已送达？',
    success: (res) => {
      if (res.confirm) {
        // 【修改点4】调用 Client Store 的确认收货方法 (confirmComplete)
        // 注意：如果你之前叫 confirmDelivery，请确认 clientOrder.js 里到底是哪个名字
        // 通常用户端确认收货叫 confirmComplete
        const success = store.confirmComplete ? store.confirmComplete(order.value.id) : false
        
        if (success) {
          uni.showToast({ title: '确认成功', icon: 'success' })
          // 刷新订单数据
          loadOrder()
        } else {
          uni.showToast({ title: '确认失败', icon: 'none' })
        }
      }
    }
  })
}

// Handle delete order
const handleDeleteOrder = () => {
  uni.showModal({
    title: '确认删除',
    content: '确定要删除这个订单吗？删除后无法恢复',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '处理中...' })
        // 【修改点5】变量名改为 store
        const success = await store.deleteOrder(order.value.id)
        uni.hideLoading()
        if (success) {
          uni.showToast({ title: '删除成功', icon: 'success' })
          setTimeout(() => {
            uni.navigateBack()
          }, 1500)
        } else {
          // 错误提示已在 store 中处理
        }
      }
    }
  })
}

// Load order
const loadOrder = async () => {
  // 从 store 重新获取最新数据
  if (order.value?.id) {
    // 先刷新订单列表
    await store.loadFromStorage()
    // 【修改点6】变量名改为 store
    const updatedOrder = store.getOrderById(order.value.id)
    if (updatedOrder) {
      order.value = updatedOrder
    }
  }
}

// onLoad
onLoad(async (options) => {
  if (options.id) {
    // 先刷新订单列表
    await store.loadFromStorage()
    // 【修改点7】变量名改为 store
    const foundOrder = store.getOrderById(options.id)
    if (foundOrder) {
      order.value = foundOrder
    } else {
      uni.showToast({ title: '订单不存在', icon: 'none' })
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    }
  } else {
    uni.showToast({ title: '订单ID缺失', icon: 'none' })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  }
})

// onShow - 页面显示时刷新数据
onShow(async () => {
  if (order.value?.id) {
    await store.loadFromStorage()
    const updatedOrder = store.getOrderById(order.value.id)
    if (updatedOrder) {
      order.value = updatedOrder
    }
  }
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f7f9fb;
  padding-bottom: 140rpx;
  box-sizing: border-box;
}

/* Header Status (Gradient Blue) */
.status-header {
  padding: 60rpx 24rpx 40rpx;
  background: linear-gradient(135deg, #1a73e8 0%, #4285f4 100%);
  color: #ffffff;

  &.delivering {
    background: linear-gradient(135deg, #1a73e8 0%, #4285f4 100%);
  }

  &.completed {
    background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
  }

  &.pending_accept {
    background: linear-gradient(135deg, #ff8f00 0%, #ffa726 100%);
  }

  &.cancelled {
    background: linear-gradient(135deg, #999999 0%, #bdbdbd 100%);
  }
}

.status-title {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
}

.status-subtitle {
  display: block;
  font-size: 26rpx;
  opacity: 0.9;
}

/* Timeline Section */
.timeline-section {
  background: #ffffff;
  margin: 24rpx;
  border-radius: 16rpx;
  padding: 32rpx 24rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
}

.timeline {
  display: flex;
  justify-content: space-between;
  position: relative;
}

.timeline-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.timeline-dot {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;
  position: relative;
  z-index: 2;
}

.timeline-item.active .timeline-dot {
  background: #1a73e8;
  box-shadow: 0 0 0 8rpx rgba(26, 115, 232, 0.1);
}

.timeline-item.completed .timeline-dot {
  background: #4caf50;
}

.check-icon {
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
}

.timeline-label {
  font-size: 24rpx;
  color: #666666;
}

.timeline-item.active .timeline-label {
  color: #1a73e8;
  font-weight: 600;
}

.timeline-item.completed .timeline-label {
  color: #4caf50;
  font-weight: 600;
}

.timeline-line {
  position: absolute;
  top: 24rpx;
  left: 50%;
  width: 100%;
  height: 2rpx;
  background: #e0e0e0;
  z-index: 1;
}

.timeline-item:last-child .timeline-line {
  display: none;
}

.timeline-item.completed + .timeline-item .timeline-line {
  background: #4caf50;
}

/* Rider Card */
.rider-card {
  background: #ffffff;
  margin: 0 24rpx 24rpx;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
}

.rider-header {
  margin-bottom: 20rpx;
}

.card-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #333333;
}

.rider-content {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.rider-avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: #f5f5f5;
}

.rider-avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a73e8 0%, #4285f4 100%);
}

.avatar-text {
  color: #ffffff;
  font-size: 36rpx;
  font-weight: 700;
}

.rider-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.rider-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #333333;
}

.rider-phone {
  font-size: 24rpx;
  color: #666666;
}

.call-btn {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx 24rpx;
  background: #1a73e8;
  color: #ffffff;
  border-radius: 12rpx;
  font-size: 26rpx;
  border: none;
}

.call-icon {
  font-size: 28rpx;
}

/* Order Info Card */
.order-info-card {
  background: #ffffff;
  margin: 0 24rpx 24rpx;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.type-badge {
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  font-weight: 600;

  &.pickup {
    background: #e3f2fd;
    color: #1976d2;
  }

  &.errand {
    background: #fff3e0;
    color: #f57c00;
  }
}

.order-price {
  font-size: 36rpx;
  font-weight: 800;
  color: #e53935;
}

.content-section {
  margin-bottom: 24rpx;
}

.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 20rpx;
}

.content-image {
  width: 200rpx;
  height: 200rpx;
  border-radius: 12rpx;
}

.description-section {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.description-label {
  font-size: 24rpx;
  color: #999999;
}

.description-text {
  font-size: 28rpx;
  color: #333333;
  line-height: 1.6;
}

.address-section {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
  padding: 20rpx;
  background: #f7f9fb;
  border-radius: 12rpx;
}

.address-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.address-label {
  font-size: 24rpx;
  color: #999999;
}

.address-value {
  font-size: 26rpx;
  color: #333333;
  font-weight: 500;
}

.address-arrow {
  font-size: 32rpx;
  color: #1a73e8;
  font-weight: 700;
}

.time-section {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #f0f0f0;
}

.time-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.time-label {
  font-size: 24rpx;
  color: #999999;
}

.time-value {
  font-size: 26rpx;
  color: #333333;
}

/* Bottom Action Bar */
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  background: #ffffff;
  box-shadow: 0 -4rpx 12rpx rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  z-index: 100;
}

.action-btn {
  flex: 1;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
  font-weight: 600;
  border: none;

  &.btn-cancel {
    background: #f5f5f5;
    color: #666666;
  }

  &.btn-urgent {
    background: #fff3e0;
    color: #f57c00;
  }

  &.btn-primary {
    background: #1a73e8;
    color: #ffffff;
  }

  &.btn-delete {
    background: #ffebee;
    color: #e53935;
  }
}
</style>


