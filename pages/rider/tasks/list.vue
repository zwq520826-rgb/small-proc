<template>
  <view class="page">
  <view class="tabs">
    <view
      v-for="(item, index) in tabs"
      :key="item.value"
      class="tab"
      :class="{ active: index === currentTab }"
      @click="currentTab = index"
    >
      {{ item.label }}
    </view>
  </view>

    <!-- 待取货 -->
    <view v-if="currentTab === 0" class="task-list">
      <view v-for="task in taskList" :key="task.id" class="card">
        <view class="card-header">
          <view class="route">
            <text class="delivery">{{ task.delivery }}</text>
          </view>
          <text class="price">¥{{ task.price.toFixed(2) }}</text>
        </view>
        
        <view class="info-row">
          <text class="type">{{ task.type === 'pickup' ? '快递代取' : '跑腿服务' }}</text>
          <text class="status">{{ statusMap[task.status] }}</text>
        </view>

        <view v-if="task.tags && task.tags.length" class="tag-row">
          <text
            v-for="tag in task.tags"
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

        <view class="contact-info" v-if="task.phone" @click="copyPhone(task.phone)">
          <text class="phone-label">客户电话：</text>
          <text class="phone">{{ task.phone }}</text>
          <text class="copy-hint">点击复制</text>
        </view>

        <view class="actions">
          <button class="view-btn" @click="viewPickupImages(task)">
            查看取件信息
          </button>
          <button class="confirm-btn" type="primary" @click="confirmPickup(task)">
             已取货
          </button>
        </view>
      </view>
    </view>

    <!-- 配送中 -->
    <view v-if="currentTab === 1" class="task-list">
      <view v-for="task in taskList" :key="task.id" class="card">
        <view class="card-header">
          <view class="route">
            <text class="delivery">{{ task.delivery }}</text>
          </view>
          <text class="price">¥{{ task.price.toFixed(2) }}</text>
        </view>
        
        <view class="info-row">
          <text class="type">{{ task.type === 'pickup' ? '快递代取' : '跑腿服务' }}</text>
          <text class="status delivering-status">配送中</text>
        </view>

        <view v-if="task.tags && task.tags.length" class="tag-row">
          <text
            v-for="tag in task.tags"
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

        <view class="contact-info" v-if="task.phone" @click="copyPhone(task.phone)">
          <text class="phone-label">客户电话：</text>
          <text class="phone">{{ task.phone }}</text>
          <text class="copy-hint">点击复制</text>
        </view>

        <view class="actions">
          <button class="deliver-btn" @click="confirmDelivery(task)">
            拍照送达
          </button>
        </view>
      </view>
    </view>

    <!-- 已送达 -->
    <view v-if="currentTab === 2" class="task-list">
      <view v-for="task in taskList" :key="task.id" class="card completed-card">
        <view class="card-header">
          <view class="route">
            <text class="delivery">{{ task.delivery }}</text>
          </view>
          <text class="income">
            收入 ¥{{ ((task.content && task.content.rider_income) != null ? Number(task.content.rider_income) : Number(task.price || 0)).toFixed(2) }}
          </text>
        </view>
        
        <view class="info-row">
          <text class="type">{{ task.type === 'pickup' ? '快递代取' : '跑腿服务' }}</text>
          <text class="completed-time">{{ formatTime(task.completedAt) }}</text>
        </view>

        <view v-if="task.tags && task.tags.length" class="tag-row">
          <text
            v-for="tag in task.tags"
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

        <view v-if="task.deliveryImage" class="delivery-proof">
          <text class="proof-label">送达凭证：</text>
          <image
            class="proof-img"
            :src="task.deliveryImage"
            mode="aspectFill"
            @click="previewDeliveryImage(task)"
          />
        </view>
      </view>
    </view>
  </view>
  <TheTabBar />
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import TheTabBar from '@/components/TheTabBar.vue'
// 【修改点1】引入正确的 Rider Store
import { useRiderTaskStore } from '@/store/riderTask'

// 【修改点2】初始化 store
const store = useRiderTaskStore()
const currentTab = ref(0) // 0: 待取货, 1: 配送中, 2: 已送达

const tabs = [
  { label: '待取货', value: 'pending_pickup' },
  { label: '配送中', value: 'delivering' },
  { label: '已送达', value: 'completed' }
]

let pulling = false
onShow(async () => {
  uni.hideHomeButton()
})

onPullDownRefresh(async () => {
  if (pulling) return
  pulling = true
  try {
    // 下拉刷新：强制刷新大厅/我的任务（页面仅展示，不额外触发 stats）
    await store.loadFromStorage(true)
  } catch (e) {
    console.error('下拉刷新失败:', e)
  } finally {
    pulling = false
    uni.stopPullDownRefresh()
  }
})

// 【修改点3】重写列表获取逻辑
const taskList = computed(() => {
  // 状态映射数组，对应 currentTab 的 0, 1, 2
  const statusKeys = ['pending_pickup', 'delivering', 'completed']
  const currentStatus = statusKeys[currentTab.value]

  // 直接调用 store 的 getter 获取数据
  let list = store.tasksByStatus(currentStatus)

  // 对“已送达”列表按完成时间倒序排序（最近完成的在最前面）
  if (currentStatus === 'completed') {
    list = [...list].sort((a, b) => {
      const ta = a.complete_time || a.completedAt || 0
      const tb = b.complete_time || b.completedAt || 0
      return tb - ta
    })
  }

  // 格式化数据以适配模板
  return list.map((t) => {
    // 基础送达地址
    let delivery = t.deliveryLocation || t.delivery || t.address || ''
    if (!delivery) {
      delivery = '送达地址'
    }

    // 寝室号（客户端“送货上门”填写的 dormNumber）
    const dorm = t.content?.dormNumber

    // 处理标签：原始标签或根据内容生成，再把寝室号拼在“送货上门”后面
    const rawTags =
      (t.tags && t.tags.length
        ? t.tags
        : [
            t.content?.isUrgent ? '加急' : '',
            t.content?.isDelivery ? '送货上门' : ''
          ].filter(Boolean)) || []

    const tags = rawTags.map((tag) => {
      if (tag.includes('送货上门') && dorm) {
        return `${tag} ${dorm}`
      }
      return tag
    })

    return {
      ...t,
      pickup: t.pickupLocation || t.pickup || '取件点',
      delivery,
      // 用户上传的取件凭证在 content.images 中
      pickupImages: t.content?.images || [],
      deliveryImage: t.content?.deliveryImages?.[0] || t.content?.delivery_images?.[0] || '',
      // 客户电话：优先从 content.phone 获取，如果没有则尝试从 address 字段解析
      phone: t.content?.phone || t.phone || extractPhoneFromAddress(t.address) || '',
      tags
    }
  })
})

const statusMap = {
  pending_pickup: '待取货',
  delivering: '配送中',
  completed: '已送达'
}

// 从 address 字段中提取电话（兼容旧数据）
function extractPhoneFromAddress(address) {
  if (!address) return ''
  // address 格式通常是: "姓名 电话\n详细地址"
  const lines = address.split('\n')
  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    // 尝试匹配11位手机号
    const phoneMatch = firstLine.match(/(1[3-9]\d{9})/)
    if (phoneMatch) {
      return phoneMatch[1]
    }
  }
  return ''
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

// 查看取件信息
const viewPickupImages = async (task) => {
  const images = task.pickupImages || task.content?.images || []
  await previewCloudImages(images)
}

// 复制客户电话
const copyPhone = (phone) => {
  if (!phone) {
    uni.showToast({ title: '暂无客户电话', icon: 'none' })
    return
  }
  // 移除可能的星号（脱敏字符）
  const cleanPhone = phone.replace(/\*/g, '')
  uni.setClipboardData({
    data: cleanPhone,
    success: () => {
      uni.showToast({ title: '电话已复制', icon: 'success' })
    },
    fail: () => {
      uni.showToast({ title: '复制失败', icon: 'none' })
    }
  })
}

// 拨打客户电话（保留，可能其他地方需要）
const callCustomer = (task) => {
  // 优先取 content 里的 phone，其次取外层的 phone
  const phone = task.content?.phone || task.phone || ''
  if (!phone) {
    uni.showToast({ title: '暂无客户电话', icon: 'none' })
    return
  }
  uni.makePhoneCall({
    phoneNumber: phone.replace(/\*/g, '')
  })
}

// 确认取货
const confirmPickup = (task) => {
  uni.showModal({
    title: '确认取货',
    content: '您确认已经拿到货品了吗？',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '处理中...' })
        
        // 【修改点4】调用 store.confirmPickup
        const success = await store.confirmPickup(task.id, null)
        
        uni.hideLoading()
        if (success) {
          uni.showToast({ title: '已取货', icon: 'success' })
          // 自动切到配送中 Tab
          if (currentTab.value === 0) {
            setTimeout(() => {
              currentTab.value = 1
            }, 500)
          }
        } else {
          // 错误提示已在 store 中处理
        }
      }
    }
  })
}

// 确认送达
const confirmDelivery = (task) => {
  uni.chooseImage({
    count: 1,
    sourceType: ['camera', 'album'],
    success: async (res) => {
      const tempFilePath = res.tempFilePaths[0]
      uni.showLoading({ title: '上传中...' })

      try {
        // 先上传到云存储，获取可跨设备访问的 fileID
        const uploadRes = await uniCloud.uploadFile({
          filePath: tempFilePath,
          cloudPath: `delivery/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
        })

        const fileID = uploadRes?.fileID || uploadRes?.fileId
        if (!fileID) {
          throw new Error('上传失败，未获取到文件ID')
        }

        // 【修改点5】调用 store.confirmDelivery (注意传云端 fileID 数组)
        const success = await store.confirmDelivery(task.id, [fileID])
        
        uni.hideLoading()
        if (success) {
          uni.showToast({ title: '送达确认成功', icon: 'success' })
          // 自动切到已送达 Tab
          if (currentTab.value === 1) {
            setTimeout(() => {
              currentTab.value = 2
            }, 500)
          }
        } else {
          // 错误提示已在 store 中处理
        }
      } catch (e) {
        console.error('上传/送达确认失败:', e)
        uni.hideLoading()
        uni.showToast({ title: e.message || '上传失败，请重试', icon: 'none' })
      }
    },
    fail: () => {
      uni.showToast({ title: '取消拍照', icon: 'none' })
    }
  })
}

// 格式化时间
const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60000) {
    return '刚刚'
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`
  } else {
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hour = date.getHours()
    const minute = date.getMinutes()
    return `${month}-${day} ${hour}:${minute.toString().padStart(2, '0')}`
  }
}
</script>

<style lang="scss" scoped>
.page {
  padding: 24rpx 24rpx 140rpx;
  background: #f7f9fb;
  min-height: 100vh;
  box-sizing: border-box;
  padding-bottom: 120rpx;
}

.tabs {
  display: flex;
  background: #ffffff;
  border-radius: 12rpx;
  overflow: hidden;
  margin-bottom: 16rpx;
}

.tab {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  font-size: 28rpx;
  color: #666666;
  transition: all 0.3s;
}

.tab.active {
  color: #1a73e8;
  font-weight: 700;
  background: #e8f2ff;
  border-bottom: 4rpx solid #1a73e8;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 6rpx 18rpx rgba(0, 0, 0, 0.06);
}

.completed-card {
  background: #fafbfc;
  opacity: 0.9;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.route {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;
}

.pickup {
  font-size: 30rpx;
  font-weight: 700;
  color: #1f2f4a;
}

.arrow {
  font-size: 24rpx;
  color: #9aa6b8;
}

.delivery {
  font-size: 30rpx;
  font-weight: 700;
  color: #1f2f4a;
}

.price {
  font-size: 32rpx;
  font-weight: 800;
  color: #ff6b00;
}

.income {
  font-size: 32rpx;
  font-weight: 800;
  color: #e53935;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-bottom: 10rpx;
}

.tag {
  font-size: 24rpx;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background: #f4f5f7;
  color: #555555;
  font-weight: 600;
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

.type {
  font-size: 24rpx;
  color: #7a8499;
  background: #f4f5f7;
  padding: 6rpx 12rpx;
  border-radius: 8rpx;
}

.status {
  font-size: 24rpx;
  color: #888888;
}

.delivering-status {
  color: #1a73e8;
  font-weight: 600;
}

.completed-time {
  font-size: 24rpx;
  color: #9aa6b8;
}

.contact-info {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 16rpx;
  padding: 12rpx;
  background: #f4f5f7;
  border-radius: 8rpx;
  cursor: pointer;
  transition: background-color 0.2s;
}

.contact-info:active {
  background: #e5e7eb;
}

.phone-label {
  font-size: 24rpx;
  color: #7a8499;
}

.phone {
  font-size: 26rpx;
  color: #1a73e8;
  font-weight: 600;
  flex: 1;
}

.copy-hint {
  font-size: 22rpx;
  color: #9aa6b8;
  margin-left: auto;
}

.actions {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
}

.view-btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  background: #1a73e8;
  color: #ffffff;
  border-radius: 12rpx;
  font-size: 28rpx;
  border: none;
}

.view-btn-small {
  width: 160rpx;
  height: 72rpx;
  line-height: 72rpx;
  background: #1a73e8;
  color: #ffffff;
  border-radius: 12rpx;
  font-size: 24rpx;
  border: none;
  padding: 0;
  margin: 0;
  flex-shrink: 0;
}

.confirm-btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  background: #1a73e8;
  color: #ffffff;
  border-radius: 12rpx;
  font-size: 28rpx;
  border: none;
}

.call-btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  background: #f4f5f7;
  color: #1a73e8;
  border-radius: 12rpx;
  font-size: 28rpx;
  border: 1rpx solid #e5e7eb;
}

.call-btn-small {
  width: 72rpx;
  height: 72rpx;
  line-height: 72rpx;
  background: #f4f5f7;
  color: #1a73e8;
  border-radius: 12rpx;
  font-size: 32rpx;
  border: 1rpx solid #e5e7eb;
  padding: 0;
  margin: 0;
}

.deliver-btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  background: #4caf50;
  color: #ffffff;
  border-radius: 12rpx;
  font-size: 28rpx;
  border: none;
}

.delivery-proof {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #e5e7eb;
}

.proof-label {
  font-size: 24rpx;
  color: #7a8499;
}

.proof-img {
  width: 120rpx;
  height: 120rpx;
  border-radius: 8rpx;
  border: 1rpx solid #e5e7eb;
}
</style>
