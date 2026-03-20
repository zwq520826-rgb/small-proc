<template>
  <view class="page">
    <!-- 顶部 Tabs -->
    <view class="tabs">
      <view
        v-for="(tab, index) in tabs"
        :key="index"
        class="tab"
        :class="{ active: currentTab === index }"
        @click="onTabChange(index)"
      >
        {{ tab.label }}
      </view>
    </view>

    <!-- 列表区域 -->
    <scroll-view
      class="list-wrapper"
      scroll-y
      @scrolltolower="handleReachBottom"
    >
      <!-- 空状态 -->
      <view v-if="displayList.length === 0" class="empty">
        <image class="empty-img" src="/static/empty-order.png" mode="aspectFit" />
        <text class="empty-text">暂无订单</text>
      </view>

      <!-- 订单卡片 -->
      <view
        v-for="order in displayList"
        :key="order.id"
        class="card"
        @click="goDetail(order.id)"
      >
        <view class="row between">
          <view class="type-badge" :class="order.type">{{ order.typeLabel }}</view>
          <text class="badge" :class="order.status">{{ statusMap[order.status] }}</text>
        </view>
        <view class="row">
          <text class="place">{{ order.pickupLocation }}</text>
          <text class="place">{{ order.deliveryLocation || order.address }}</text>
        </view>
        <view
          v-if="order.tags && order.tags.length"
          class="row tag-row"
        >
          <text
            v-for="tag in order.tags"
            :key="tag"
            class="tag"
            :class="{
              'tag-urgent': tag.includes('加急'),
              'tag-delivery': tag.includes('送货上门')
            }"
          >
            {{ tag }}
          </text>
        </view>
        <view class="row">
          <text class="desc">{{ order.content?.description || '订单详情' }}</text>
        </view>
        <view class="row between footer-row">
          <view class="price-info">
            <text class="price-label">合计</text>
            <text class="price-amount">¥{{ Number(order.price || 0).toFixed(2) }}</text>
          </view>
          <text class="time">{{ order.publishedAt || order.createTime }}</text>
        </view>
        <view class="row actions-row">
          <view class="actions">
            <button
              v-if="order.status === 'completed'"
              class="btn btn-photo"
              size="mini"
              @click.stop="handleViewPhotos(order)"
            >
              送达照片
            </button>
            <button
              v-if="order.status === 'pending_accept' || order.status === 'pending_pickup' || order.status === 'delivering'"
              class="btn btn-cancel"
              size="mini"
              @click.stop="handleCancel(order.id)"
            >
              取消
            </button>
            <button
              v-if="order.status === 'completed'"
              class="btn btn-delete"
              size="mini"
              @click.stop="handleDelete(order.id)"
            >
              删除
            </button>
          </view>
        </view>
      </view>

      <!-- 加载状态 -->
      <view class="load-status">
        <text v-if="loadStatus === 'loading'">加载中...</text>
        <text v-else-if="loadStatus === 'noMore'">没有更多了</text>
        <text v-else>上拉加载更多</text>
      </view>
    </scroll-view>
  </view>
  <TheTabBar />
</template>

<script setup>
import TheTabBar from '@/components/TheTabBar.vue'
import { ref, computed } from 'vue' // 引入 computed
import { onPullDownRefresh } from '@dcloudio/uni-app'
// 【修改点1】引入正确的 store (clientOrder.js)
import { useClientOrderStore } from '@/store/clientOrder'

// 【修改点2】使用新的 store 名称
const store = useClientOrderStore()

const tabs = [
  { label: '全部', status: 'all' },
  { label: '待接单', status: 'pending_accept' },
  { label: '进行中', status: 'delivering' },
  { label: '已完成', status: 'completed' }
]

const statusMap = {
  pending_accept: '待接单',
  pending_pickup: '待取货',
  delivering: '配送中',
  completed: '已完成',
  cancelled: '已取消'
}

const currentTab = ref(0)
// 分页相关变量保留，但目前 store 暂未实现分页，我们先直接获取全部
const page = ref(1)
const pageSize = ref(5)
const loadStatus = ref('more') // 'more' | 'loading' | 'noMore'

// 【修改点3】重写 displayList 为计算属性，直接从 store 获取
const displayList = computed(() => {
  const status = tabs[currentTab.value].status
  // 使用 clientOrder store 提供的 getter
  const list = store.ordersByStatus(status)

  return list.map((o) => {
    const tags =
      (o.tags && o.tags.length
        ? o.tags
        : [
            o.content?.isUrgent ? '加急处理' : '',
            o.content?.isDelivery ? '送货上门' : ''
          ].filter(Boolean)) || []

    return {
      ...o,
      tags
    }
  })
})

// 【修改点4】简化加载逻辑 (因为改成了 computed，不需要手动 loadData)
const loadData = () => {
  // 暂时留空，或者用来做下拉刷新的模拟延迟
  if (loadStatus.value === 'loading') return
  loadStatus.value = 'loading'
  
  setTimeout(() => {
    loadStatus.value = 'noMore' // 假设一次性加载完
  }, 500)
}

const onTabChange = (index) => {
  currentTab.value = index
  // 切换 tab 时，computed 会自动更新数据
}

const handleReachBottom = () => {
  // 暂时不处理分页
  loadStatus.value = 'noMore'
}

const reloadCurrent = async () => {
  // 刷新逻辑：从云端重新加载订单列表
  await store.loadFromStorage()
}

const handleCancel = async (id) => {
  uni.showModal({
    title: '确认取消',
    content: '确定要取消该订单吗？',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '处理中...' })
        const ok = await store.cancelOrder(id)
        uni.hideLoading()
        if (ok) {
          uni.showToast({ title: '已取消', icon: 'success' })
        } else {
          // 错误提示已在 store 中处理
        }
      }
    }
  })
}

const handleDelete = async (id) => {
  uni.showModal({
    title: '确认删除',
    content: '删除后无法恢复，是否继续？',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '处理中...' })
        const ok = await store.deleteOrder(id)
        uni.hideLoading()
        if (ok) {
          uni.showToast({ title: '已删除', icon: 'success' })
        } else {
          // 错误提示已在 store 中处理
        }
      }
    }
  })
}

const handleViewPhotos = (order) => {
  // 兼容不同字段名：delivery_images (数据库下划线命名) 或 deliveryImages (驼峰命名)
  const urls = order.content?.delivery_images || order.content?.deliveryImages || order.deliveryImages || (order.deliveryImage ? [order.deliveryImage] : [])
  
  if (!urls || !urls.length) {
    uni.showToast({ title: '暂无送达照片', icon: 'none' })
    return
  }
  uni.previewImage({ urls })
}

const goDetail = (id) => {
  uni.navigateTo({ url: `/pages/client/orders/detail?id=${id}` })
}

onPullDownRefresh(async () => {
  await reloadCurrent()
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f7f9fb;
  padding-bottom: 120rpx;
}
.tabs {
  display: flex;
  background: #ffffff;
  margin: 16rpx;
  border-radius: 12rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.06);
}
.tab {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  font-size: 28rpx;
  color: #666;
}
.tab.active {
  color: #1a73e8;
  font-weight: 700;
  background: #f0f7ff;
}
.list-wrapper {
  height: calc(100vh - 140rpx);
  padding: 0 16rpx 60rpx;
  box-sizing: border-box;
}
.card {
  background: #ffffff;
  border-radius: 14rpx;
  padding: 18rpx;
  margin-top: 16rpx;
  box-shadow: 0 6rpx 14rpx rgba(0, 0, 0, 0.04);
}
.row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 8rpx;
}
.between {
  justify-content: space-between;
}
.type-badge {
  padding: 6rpx 14rpx;
  border-radius: 10rpx;
  font-size: 24rpx;
  font-weight: 600;
}
.type-badge.pickup {
  background: #e3f2fd;
  color: #1976d2;
}
.type-badge.errand {
  background: #fff3e0;
  color: #f57c00;
}
.badge {
  font-size: 24rpx;
  padding: 4rpx 10rpx;
  border-radius: 10rpx;
  background: #f0f0f0;
}
.badge.pending_accept {
  color: #ff8f00;
  background: #fff4e0;
}
.badge.delivering {
  color: #1a73e8;
  background: #e8f2ff;
}
.badge.completed {
  color: #4caf50;
  background: #e9f8ed;
}
.badge.cancelled {
  color: #9e9e9e;
  background: #f2f2f2;
}
.place {
  font-size: 26rpx;
}
.arrow {
  color: #c0c0c0;
}
.desc {
  font-size: 24rpx;
  color: #666;
}

.tag-row {
  margin-top: 4rpx;
  flex-wrap: wrap;
}

.tag {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  background: #f4f5f7;
  color: #555555;
}

.tag-urgent {
  background: #ffe8e6;
  color: #e53935;
  font-weight: 700;
}

.tag-delivery {
  background: #e6f6ff;
  color: #0288d1;
  font-weight: 700;
}
.footer-row {
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #f0f0f0;
}
.price-info {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
}
.price-label {
  font-size: 24rpx;
  color: #666;
}
.price-amount {
  font-size: 36rpx;
  color: #ff3b30;
  font-weight: 800;
}
.time {
  color: #888;
  font-size: 24rpx;
}
.actions-row {
  margin-top: 8rpx;
  justify-content: flex-end;
}
.load-status {
  text-align: center;
  padding: 20rpx 0 40rpx;
  color: #999;
  font-size: 24rpx;
}
.actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.actions .btn {
  padding: 0 24rpx;
  min-width: 120rpx;
  height: 56rpx;
  line-height: 56rpx;
  font-size: 24rpx;
  border-radius: 28rpx;
  box-sizing: border-box;
}
.btn-photo {
  background: #1a73e8;
  color: #ffffff;
  border: none;
  padding: 0 36rpx;
  min-width: 170rpx;
  font-size: 26rpx;
  white-space: nowrap;
}
.empty {
  padding: 140rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.empty-img {
  width: 200rpx;
  height: 200rpx;
  opacity: 0.6;
}
.empty-text {
  color: #999;
  font-size: 26rpx;
}
</style>


