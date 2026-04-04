<template>
  <view class="page">
    <view v-if="isLoading" class="hall-skeleton">
      <view class="skeleton stats"></view>
      <view class="skeleton task" v-for="i in 3" :key="`hall-skeleton-${i}`"></view>
    </view>
    <view v-else-if="loadError" class="error-card">
      <view class="error-illustration">🚚</view>
      <text class="error-title">任务列表加载失败</text>
      <text class="error-desc">{{ loadError }}</text>
      <button class="retry-btn" @click="retryHall">重新加载</button>
    </view>
    <template v-else>
      <view class="stats-card">
        <!-- 左侧：等级与累计订单 -->
        <view class="metric wide" v-if="displayLevel">
          <view class="level-row">
            <text class="label">我的等级</text>
            <text class="level-btn" @click="goLevelTable">查看等级表</text>
          </view>
          <text class="value">{{ displayLevel.name }}</text>
          <text class="sub">累计订单：{{ displayLevel.totalOrders }}单</text>
          <text class="sub" v-if="displayLevel.needMore > 0">
            距离升级：还差{{ displayLevel.needMore }}单
          </text>
          <text class="sub" v-else>已是最高等级</text>
        </view>

        <!-- 右侧：今日数据 & 抽成信息 -->
        <view class="metric small">
          <text class="label">今日单数</text>
          <text class="value">{{ stats.orders }}</text>
          <text class="sub">今日收入：¥{{ stats.income.toFixed(1) }}</text>
          <text class="sub" v-if="displayLevel">
            当前抽成：{{ displayLevel.currentRate.toFixed(0) }}%
          </text>
          <text class="sub" v-if="displayLevel && displayLevel.nextRate !== null">
            升级后抽成：{{ displayLevel.nextRate.toFixed(0) }}%
          </text>
        </view>
      </view>

      <view class="task-card" v-for="task in filteredTasks" :key="task.id" @click="viewDetail(task)">
      <view v-if="task.visualTags && task.visualTags.length" class="tags">
        <view
          v-for="tag in task.visualTags"
          :key="tag.key"
          class="tag-chip"
          :class="`tag-${tag.type}`"
        >
          <text v-if="tag.icon" class="chip-icon">{{ tag.icon }}</text>
          <text>{{ tag.text }}</text>
        </view>
      </view>
        <view class="route">
          <view class="destination">
            <text class="dot red">🔴</text>
            <view class="dest-info">
              <text class="dest-label">目的地</text>
              <text class="place">{{ task.delivery }}</text>
            </view>
          </view>
        </view>
        <view class="footer">
          <view class="price">¥{{ Number(task.displayPrice || task.price || 0).toFixed(2) }}</view>
          <view class="actions">
            <button
              type="default"
              size="mini"
              class="view-btn"
              @click.stop="viewPickupInfo(task)"
            >
              📦 取件信息
            </button>
            <button
              type="primary"
              size="mini"
              class="grab"
              @click.stop="grab(task)"
            >
              ⚡ 立即抢单
            </button>
          </view>
        </view>
      </view>
    </template>
  </view>
  <TheTabBar />
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import TheTabBar from '@/components/TheTabBar.vue'
import { useRiderTaskStore } from '@/store/riderTask'
import { buildVisualTags } from '@/utils/orderTags'

// 【修改点2】初始化 store
const store = useRiderTaskStore()
// 骑手等级与统计信息
const levelInfo = ref(null)
const isLoading = ref(true)
const loadError = ref('')
let pulling = false
let pageRefreshing = false

const filterOptions = [
  { label: '距离最近', value: 'distance' },
  { label: '金额最高', value: 'price' }
]
const activeFilter = ref('distance')

const stats = computed(() => {
  // 只统计已完成的订单
  const completed = store.myTasks.filter((t) => t.status === 'completed')
  const income = completed.reduce((sum, t) => sum + Number(t.price || 0), 0)
  return {
    orders: completed.length,
    income
  }
})

const filteredTasks = computed(() => {
  // 使用 store 提供的排序 getter
  // 如果你的 store 里实现了 hallTasksSorted getter，直接用它
  // 如果没有实现，这里手动排序 store.hallTasks 也可以
  const list = store.hallTasksSorted ? store.hallTasksSorted(activeFilter.value) : [...store.hallTasks]
  
  return list.map((o) => {
    // 提取送达地址：优先使用 deliveryLocation，其次从 address 中解析
    let delivery = o.deliveryLocation || o.delivery || ''
    if (!delivery && o.address) {
      // address 格式通常是: "姓名 电话\n详细地址"
      const lines = o.address.split('\n')
      if (lines.length > 1) {
        // 取最后一行作为详细地址
        delivery = lines.slice(1).join('\n')
      } else {
        delivery = lines[0]
      }
    }

    if (!delivery) {
      delivery = '送达地址'
    }

    const requiredGender = o.content?.requiredRiderGender
    const visualTags = buildVisualTags({
      rawTags: o.tags,
      content: o.content,
      requiredGender
    })

    return {
      ...o,
      pickupDistance: o.pickupDistance || 1,
      pickup: o.pickupLocation || o.pickup || '取件点',
      delivery,
      visualTags
    }
  })
})

// 显示用的等级与抽成信息
const displayLevel = computed(() => {
  if (!levelInfo.value) return null
  const info = levelInfo.value

  const currentRate = (info.current_commission_rate || 0) * 100
  const nextRate = info.next_commission_rate != null ? info.next_commission_rate * 100 : null

  return {
    name: info.level_name || info.level || '未知等级',
    totalOrders: info.total_completed_orders || 0,
    needMore: info.need_more_orders || 0,
    currentRate,
    nextRate
  }
})

// 查看等级表
const goLevelTable = () => {
  uni.navigateTo({ url: '/pages/rider/levels' })
}

// 查看订单详情
const viewDetail = (task) => {
  const taskId = task.id || task._id
  if (!taskId) {
    uni.showToast({ title: '订单ID不存在', icon: 'none' })
    return
  }
  uni.navigateTo({
    url: `/pages/rider/tasks/detail?id=${taskId}`,
    fail: (err) => {
      console.error('跳转失败:', err)
      uni.showToast({ title: '页面不存在，请重新编译', icon: 'none' })
    }
  })
}

// 将 cloud:// fileID 转为可预览的 https 临时地址并直接预览图片
const previewCloudImages = async (images = []) => {
  if (!images || images.length === 0) {
    uni.showToast({ title: '暂无取件凭证', icon: 'none' })
    return
  }

  let urls = [...images]

  // 检查是否有 cloud:// 开头的 fileID，需要先换成临时链接
  const hasCloudFile = urls.some(url => url && url.startsWith('cloud://'))
  
  if (hasCloudFile) {
    try {
      const res = await uniCloud.getTempFileURL({
        fileList: urls
      })

      urls = (res.fileList || [])
        .map(item => item.tempFileURL || item.download_url || item.fileID)
        .filter(Boolean)
    } catch (e) {
      console.error('获取临时文件 URL 失败:', e)
      uni.showToast({ title: '图片加载失败，请稍后重试', icon: 'none' })
      return
    }
  }

  // 直接预览图片（支持多张轮播）
  uni.previewImage({
    urls,
    current: urls[0]
  })
}

// 查看取件信息（复用临时链接预览逻辑）
const viewPickupInfo = async (task) => {
  const images = task.content?.images || []
  await previewCloudImages(images)
}

// 【修改点5】抢单逻辑
const grab = async (task) => {
  uni.showLoading({ title: '抢单中...' })
  // 调用 store 的 grabTask 方法
  const res = await store.grabTask(task.id)
  uni.hideLoading()
  
  // 根据返回结果判断成功失败
  if (!res.success) {
    uni.showToast({ title: res.msg || '抢单失败', icon: 'none' })
    return
  }
  
  uni.showToast({ title: '抢单成功', icon: 'success' })
  // 抢单成功后，可以选择跳转到任务列表
  // setTimeout(() => uni.reLaunch({ url: '/pages/rider/tasks/list' }), 500)
}

const refreshPageData = async (force = false, options = {}) => {
  if (pageRefreshing) return
  pageRefreshing = true
  if (options.showSkeleton) {
    isLoading.value = true
  }
  loadError.value = ''
  try {
    const shouldForce = force || store.statsRefreshNeeded
    await store.loadFromStorage(shouldForce, { sortBy: activeFilter.value })
    levelInfo.value = store.riderStats || null
    store.setStatsRefreshNeeded(false)
  } catch (e) {
    console.error('[rider-hall] refresh failed', e)
    loadError.value = e?.message || '大厅数据加载失败，请稍后重试'
  } finally {
    isLoading.value = false
    pageRefreshing = false
  }
}

const retryHall = () => {
  refreshPageData(true, { showSkeleton: true })
}

onShow(async () => {
  uni.hideHomeButton()
  try {
    await refreshPageData(false, { showSkeleton: isLoading.value })
  } catch (e) {
    console.error('页面刷新失败:', e)
  }
})

onPullDownRefresh(async () => {
  if (pulling) return
  pulling = true
  try {
    await refreshPageData(true)
  } catch (e) {
    console.error('下拉刷新失败:', e)
  } finally {
    pulling = false
    uni.stopPullDownRefresh()
  }
})
</script>

<style scoped>
.page {
  padding: 24rpx 24rpx 140rpx;
  background: #f7f9fb;
  min-height: 100vh;
  box-sizing: border-box;
  padding-bottom: 120rpx;
}

.stats-card {
  background: linear-gradient(135deg, #1e88e5, #4fc3f7);
  color: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  position: relative;
}

.level-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.level-btn {
  font-size: 22rpx;
  padding: 6rpx 14rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 999rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.4);
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.metric.wide {
  flex: 1.4;
}

.metric.small {
  flex: 1;
  align-items: flex-end;
  text-align: right;
}

.metric .label {
  font-size: 24rpx;
  opacity: 0.9;
}

.metric .value {
  display: block;
  margin-top: 4rpx;
  font-size: 34rpx;
  font-weight: 700;
}

.metric .sub {
  font-size: 22rpx;
  opacity: 0.9;
}

.task-card {
  background: #ffffff;
  border-radius: 14rpx;
  padding: 18rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: all 0.2s;
}

.task-card:active {
  background: #f5f5f5;
  transform: scale(0.98);
}

.hall-skeleton {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.hall-skeleton .skeleton {
  border-radius: 16rpx;
  background: #e3e8f0;
  position: relative;
  overflow: hidden;
}

.hall-skeleton .skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
  transform: translateX(-100%);
  animation: hallPulse 1.2s ease-in-out infinite;
}

.hall-skeleton .skeleton.stats {
  height: 240rpx;
}

.hall-skeleton .skeleton.task {
  height: 180rpx;
}

.error-card {
  background: #ffffff;
  border-radius: 20rpx;
  padding: 60rpx 30rpx;
  text-align: center;
  box-shadow: 0 12rpx 30rpx rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 40rpx;
}

.error-illustration {
  font-size: 72rpx;
}

.error-title {
  font-size: 32rpx;
  font-weight: 700;
}

.error-desc {
  font-size: 26rpx;
  color: #6b7280;
}

.retry-btn {
  margin-top: 10rpx;
  background: #1a73e8;
  color: #ffffff;
}

@keyframes hallPulse {
  0% {
    transform: translateX(-100%);
  }
  50% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(100%);
  }
}

.tags {
  display: flex;
  gap: 8rpx;
  flex-wrap: wrap;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  background: #eef2ff;
  color: #1d4ed8;
  border-radius: 999rpx;
  padding: 6rpx 16rpx;
  font-size: 22rpx;
  font-weight: 600;
}

.tag-chip.tag-urgent {
  background: #fee2e2;
  color: #b91c1c;
}

.tag-chip.tag-delivery {
  background: #e0f2fe;
  color: #0369a1;
}

.tag-chip.tag-info {
  background: #ede9fe;
  color: #5b21b6;
}

.tag-chip.tag-neutral {
  background: #f3f4f6;
  color: #374151;
}

.chip-icon {
  font-size: 22rpx;
}

.route {
  margin: 10rpx 0;
}

.destination {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
}

.dest-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  flex: 1;
}

.dest-label {
  font-size: 22rpx;
  color: #999999;
}

.place {
  font-size: 28rpx;
  color: #333333;
  font-weight: 500;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6rpx;
  gap: 12rpx;
}

.price {
  font-size: 34rpx;
  font-weight: 700;
  color: #ff6b00;
}

.countdown {
  color: #999999;
  font-size: 24rpx;
}

.actions {
  display: flex;
  gap: 8rpx;
  align-items: center;
}

.actions button {
  font-size: 24rpx;
}

.view-btn {
  background: #f4f5f7;
  color: #1a73e8;
  border: 1rpx solid #e5e7eb;
  padding: 0 16rpx;
}

.grab {
  background: linear-gradient(135deg, #ff8f00, #ff7043);
  border: none;
}
</style>
