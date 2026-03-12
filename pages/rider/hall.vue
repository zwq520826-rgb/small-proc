<template>
  <view class="page">
    <view class="stats-card">
      <view class="metric">
        <text class="label">今日单数</text>
        <text class="value">{{ stats.orders }}</text>
      </view>
      <view class="metric">
        <text class="label">今日收入</text>
        <text class="value">¥{{ stats.income.toFixed(1) }}</text>
      </view>
    </view>

    <view class="task-card" v-for="task in filteredTasks" :key="task.id" @click="viewDetail(task)">
      <view class="tags">
        <text v-for="tag in task.tags" :key="tag" class="tag">{{ tag }}</text>
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
        <view class="price">¥{{ task.price.toFixed(1) }}</view>
        <view class="countdown">剩余 {{ task.countdown || 30 }} 分钟</view>
        <view class="actions">
          <button type="default" size="mini" class="view-btn" @click.stop="viewPickupInfo(task)">👀 查看取件信息</button>
          <button type="primary" size="mini" class="grab" @click.stop="grab(task)">⚡ 立即抢单</button>
        </view>
      </view>
    </view>
  </view>
  <TheTabBar />
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import TheTabBar from '@/components/TheTabBar.vue'
// 【修改点1】引入正确的 Rider Store
import { useRiderTaskStore } from '@/store/riderTask'

// 【修改点2】初始化 store
const store = useRiderTaskStore()

const filterOptions = [
  { label: '距离最近', value: 'distance' },
  { label: '金额最高', value: 'price' }
]
const activeFilter = ref('distance')

// 【修改点3】统计逻辑：改为从 store.myTasks (我已接的单) 中统计
const stats = computed(() => {
  // 只统计已完成的订单
  const completed = store.myTasks.filter((t) => t.status === 'completed')
  const income = completed.reduce((sum, t) => sum + Number(t.price || 0), 0)
  return {
    orders: completed.length,
    income
  }
})

// 【修改点4】列表逻辑：改为从 store.hallTasks (大厅公共单) 获取
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
    
    return {
      ...o,
      pickupDistance: o.pickupDistance || 1,
      pickup: o.pickupLocation || o.pickup || '取件点',
      delivery: delivery,
      tags: o.tags || []
    }
  })
})

const refresh = () => {
  uni.showToast({ title: '已刷新定位', icon: 'none' })
  // 这里可以触发 store 重新拉取大厅数据
  // store.fetchHallTasks()
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

// 将 cloud:// fileID 转为可预览的 https 临时地址并预览（用弹窗显示调试信息）
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

  uni.showModal({
    title: '图片调试链接',
    content: urls[0] || '无可用图片 URL',
    confirmText: '预览',
    cancelText: '复制',
    success: (res) => {
      if (res.confirm) {
        uni.previewImage({
          urls,
          current: urls[0]
        })
      } else if (res.cancel && urls[0]) {
        uni.setClipboardData({
          data: urls[0]
        })
      }
    }
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

onShow(async () => {
  uni.hideHomeButton()
  // 从云端加载大厅任务
  try {
    await store.loadFromStorage()
  } catch (error) {
    console.error('加载任务失败:', error)
    // 确保 loading 被隐藏
    uni.hideLoading()
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
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.metric .label {
  font-size: 24rpx;
  opacity: 0.85;
}

.metric .value {
  display: block;
  margin-top: 6rpx;
  font-size: 34rpx;
  font-weight: 700;
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

.tags {
  display: flex;
  gap: 8rpx;
  flex-wrap: wrap;
}

.tag {
  background: #e8f2ff;
  color: #1e88e5;
  border-radius: 10rpx;
  padding: 6rpx 12rpx;
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

.view-btn {
  background: #f4f5f7;
  color: #1a73e8;
  border: 1rpx solid #e5e7eb;
  font-size: 22rpx;
  padding: 0 16rpx;
}

.grab {
  background: linear-gradient(135deg, #ff8f00, #ff7043);
  border: none;
}
</style>