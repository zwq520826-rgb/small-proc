<template>
  <view class="page">
    <view v-if="task" class="content">
      <view class="header" :class="task.status">
        <text class="status-text">{{ statusText }}</text>
        <text class="status-desc">{{ statusDesc }}</text>
      </view>

      <view class="card route-card">
        <view class="location-row">
          <view class="dot green"></view>
          <view class="info">
            <text class="label">取货点</text>
            <text class="addr">{{ task.pickupLocation || '未指定取货点' }}</text>
          </view>
        </view>
        <view class="line"></view>
        <view class="location-row">
          <view class="dot red"></view>
          <view class="info">
            <text class="label">送达点</text>
            <text class="addr">{{ task.deliveryLocation || task.address || '未指定送达点' }}</text>
          </view>
        </view>
      </view>

      <view class="card info-card">
        <view class="row">
          <text class="label">订单编号</text>
          <text class="value">{{ task.id }}</text>
        </view>
        <view class="row">
          <text class="label">任务类型</text>
          <text class="tag">{{ task.typeLabel || '配送' }}</text>
        </view>
        <view class="row">
          <text class="label">预计收入</text>
          <text class="price">¥{{ Number(task.price || 0).toFixed(2) }}</text>
        </view>
        <view class="desc-box">
          <text class="label">备注内容：</text>
          <text class="desc-text">{{ task.content?.description || '无备注' }}</text>
        </view>
        <view v-if="task.content?.images?.length || task.content?.pickupImages?.length" class="img-section">
          <text class="label">取件凭证：</text>
          <view class="imgs">
            <image 
              v-for="(img, idx) in (task.content.images || task.content.pickupImages || [])" 
              :key="idx"
              :src="img" 
              mode="aspectFill"
              @click="previewImage(img, task.content.images || task.content.pickupImages || [])"
            />
          </view>
        </view>
      </view>

      <view v-if="task.content?.phone || task.phone" class="card contact-card">
        <view class="user-info">
          <text class="name">客户电话</text>
          <text class="phone-hint">{{ task.content?.phone || task.phone || '' }}</text>
        </view>
        <button class="call-btn" @click="handleCall">📞 拨打电话</button>
      </view>
    </view>

    <view v-else class="empty">
      <text>未找到任务信息</text>
      <button size="mini" @click="goBack">返回列表</button>
    </view>

    <view v-if="task && task.status !== 'completed'" class="bottom-bar">
      <!-- 大厅订单：待接单状态 -->
      <template v-if="task.status === 'pending_accept'">
        <button class="btn btn-grab" @click="handleGrab">⚡ 立即抢单</button>
      </template>

      <!-- 已接单：待取货状态 -->
      <template v-if="task.status === 'pending_pickup'">
        <button class="btn btn-primary" @click="handleConfirmPickup">确认已取货</button>
      </template>

      <!-- 配送中状态 -->
      <template v-if="task.status === 'delivering'">
        <button class="btn btn-success" @click="handleConfirmDelivery">拍照送达</button>
      </template>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useRiderTaskStore } from '@/store/riderTask'

const store = useRiderTaskStore()
const task = ref(null)

// 页面加载时获取 ID 并查找任务
onLoad(async (options) => {
  if (options.id) {
    // 强制刷新一次 store 确保数据最新
    await store.loadFromStorage()
    const found = store.getTaskById(options.id)
    if (found) {
      task.value = found
    } else {
      uni.showToast({ title: '任务不存在', icon: 'none' })
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    }
  }
})

// 计算属性：状态文案
const statusText = computed(() => {
  const map = {
    pending_accept: '待接单',
    pending_pickup: '待取货',
    delivering: '配送中',
    completed: '已送达'
  }
  return map[task.value?.status] || task.value?.status
})

const statusDesc = computed(() => {
  if (task.value?.status === 'pending_accept') return '点击下方按钮立即抢单'
  if (task.value?.status === 'pending_pickup') return '请前往取货点取货'
  if (task.value?.status === 'delivering') return '请尽快送达客户手中'
  if (task.value?.status === 'completed') return '任务已完成'
  return ''
})

// 方法
const goBack = () => uni.navigateBack()

const handleCall = () => {
  // 从 task.content.phone 或 task.phone 获取电话
  const phone = task.value?.content?.phone || task.value?.phone || ''
  if (!phone) {
    uni.showToast({ title: '暂无客户电话', icon: 'none' })
    return
  }
  uni.makePhoneCall({ phoneNumber: phone.replace(/\*/g, '') })
}

// 抢单
const handleGrab = async () => {
  uni.showModal({
    title: '确认抢单',
    content: '确定要接这个订单吗？',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '抢单中...' })
        const result = await store.grabTask(task.value.id || task.value._id)
        uni.hideLoading()
        
        if (result.success) {
          uni.showToast({ title: '抢单成功', icon: 'success' })
          // 刷新数据
          await store.loadFromStorage()
          const updatedTask = store.getTaskById(task.value.id || task.value._id)
          if (updatedTask) {
            task.value = updatedTask
          }
        } else {
          uni.showToast({ title: result.msg || '抢单失败', icon: 'none' })
        }
      }
    }
  })
}

const previewImage = (url, urls) => {
  uni.previewImage({ 
    urls: urls || [url],
    current: url
  })
}

// 确认取货
const handleConfirmPickup = () => {
  uni.showModal({
    title: '确认取货',
    content: '确认已拿到物品？',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '处理中...' })
        const success = await store.confirmPickup(task.value.id, null)
        uni.hideLoading()
        if (success) {
          uni.showToast({ title: '操作成功', icon: 'success' })
          // 刷新当前页面数据
          await store.loadFromStorage()
          const updatedTask = store.myTasks.find(t => t.id === task.value.id || t._id === task.value.id)
          if (updatedTask) {
            task.value = updatedTask
          }
        } else {
          // 错误提示已在 store 中处理
        }
      }
    }
  })
}

// 确认送达
const handleConfirmDelivery = () => {
  uni.chooseImage({
    count: 1,
    success: async (res) => {
      const path = res.tempFilePaths[0]
      uni.showLoading({ title: '上传中...' })
      
      const success = await store.confirmDelivery(task.value.id, [path])
      uni.hideLoading()
      if (success) {
        uni.showToast({ title: '已送达', icon: 'success' })
        // 刷新数据
        await store.loadFromStorage()
        const updatedTask = store.myTasks.find(t => t.id === task.value.id || t._id === task.value.id)
        if (updatedTask) {
          task.value = updatedTask
        }
      } else {
        // 错误提示已在 store 中处理
      }
        task.value = store.getTaskById(task.value.id)
        // 延迟返回
        setTimeout(() => uni.navigateBack(), 1500)
    }
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f5f7fa;
  padding-bottom: 140rpx;
}

.header {
  padding: 40rpx 30rpx;
  color: #fff;
}
.header.pending_accept { background: linear-gradient(135deg, #ff6f00, #ff8f00); }
.header.pending_pickup { background: linear-gradient(135deg, #ff9800, #ffb74d); }
.header.delivering { background: linear-gradient(135deg, #2196f3, #64b5f6); }
.header.completed { background: linear-gradient(135deg, #4caf50, #81c784); }

.status-text { font-size: 40rpx; font-weight: bold; display: block; }
.status-desc { font-size: 26rpx; opacity: 0.9; margin-top: 10rpx; display: block; }

.card {
  background: #fff;
  margin: 20rpx;
  padding: 30rpx;
  border-radius: 16rpx;
  box-shadow: 0 4rpx 12rpx rgba(0,0,0,0.05);
}

.route-card { display: flex; flex-direction: column; gap: 20rpx; }
.location-row { display: flex; gap: 20rpx; align-items: flex-start; }
.dot { width: 20rpx; height: 20rpx; border-radius: 50%; margin-top: 10rpx; }
.dot.green { background: #4caf50; }
.dot.red { background: #f44336; }
.line { width: 2rpx; height: 30rpx; background: #eee; margin-left: 9rpx; }
.info { flex: 1; display: flex; flex-direction: column; }
.label { font-size: 24rpx; color: #999; margin-bottom: 4rpx; }
.addr { font-size: 30rpx; color: #333; font-weight: 500; }

.info-card .row { display: flex; justify-content: space-between; margin-bottom: 20rpx; font-size: 28rpx; }
.info-card .value { color: #333; }
.info-card .price { color: #f44336; font-weight: bold; font-size: 32rpx; }
.tag { background: #e3f2fd; color: #1976d2; padding: 4rpx 12rpx; border-radius: 8rpx; font-size: 24rpx; }
.desc-box { background: #f9f9f9; padding: 20rpx; border-radius: 8rpx; margin-top: 10rpx; }
.desc-text { color: #555; font-size: 28rpx; }

.img-section { margin-top: 20rpx; border-top: 1rpx solid #eee; padding-top: 20rpx; }
.imgs { display: flex; gap: 10rpx; margin-top: 10rpx; }
.imgs image { width: 120rpx; height: 120rpx; border-radius: 8rpx; background: #eee; }

.contact-card { display: flex; justify-content: space-between; align-items: center; }
.user-info .name { font-size: 30rpx; font-weight: bold; display: block; }
.user-info .phone-hint { font-size: 24rpx; color: #999; }
.call-btn { background: #e3f2fd; color: #1976d2; font-size: 26rpx; border: none; }

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  padding: 20rpx 30rpx;
  box-shadow: 0 -4rpx 10rpx rgba(0,0,0,0.05);
  display: flex;
  gap: 20rpx;
}
.btn { flex: 1; border: none; font-size: 32rpx; border-radius: 44rpx; }
.btn-grab { background: linear-gradient(135deg, #ff8f00, #ff7043); color: #fff; }
.btn-primary { background: #2196f3; color: #fff; }
.btn-success { background: #4caf50; color: #fff; }
.empty { text-align: center; padding-top: 200rpx; color: #999; }
</style>