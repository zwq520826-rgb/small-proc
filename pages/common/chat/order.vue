<template>
  <view class="page">
    <scroll-view class="msg-list" scroll-y :scroll-into-view="scrollToId">
      <view v-if="!messages.length" class="empty">暂无消息，先聊两句吧</view>
      <view
        v-for="item in messages"
        :key="item._id"
        :id="`msg-${item._id}`"
        class="msg-row"
        :class="item.sender_role === role ? 'self' : 'peer'"
      >
        <view class="bubble">{{ item.content }}</view>
        <text class="time">{{ formatTime(item.create_time) }}</text>
      </view>
    </scroll-view>

    <view class="composer">
      <input
        v-model="draft"
        class="input"
        maxlength="300"
        placeholder="请输入消息..."
        @confirm="send"
      />
      <button class="send-btn" :disabled="sending" @click="send">发送</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'

const orderService = uniCloud.importObject('order-service')

const orderId = ref('')
const role = ref('user')
const messages = ref([])
const draft = ref('')
const sending = ref(false)
const scrollToId = ref('')
let timer = null

onLoad(async (options) => {
  orderId.value = String(options?.orderId || '')
  role.value = String(options?.role || 'user')
  if (!orderId.value) {
    uni.showToast({ title: '订单ID缺失', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
    return
  }
  await loadMessages()
  timer = setInterval(loadMessages, 8000)
})

onUnload(() => {
  if (timer) clearInterval(timer)
  timer = null
})

const loadMessages = async () => {
  try {
    const res = await orderService.listOrderChatMessages({ orderId: orderId.value, page: 1, pageSize: 100 })
    if (res?.code !== 0) return
    messages.value = res.data?.list || []
    jumpToBottom()
    await orderService.markOrderChatRead({ orderId: orderId.value })
  } catch (e) {
    console.warn('加载聊天消息失败:', e)
  }
}

const jumpToBottom = () => {
  if (!messages.value.length) return
  const last = messages.value[messages.value.length - 1]
  scrollToId.value = `msg-${last._id}`
}

const send = async () => {
  const content = String(draft.value || '').trim()
  if (!content || sending.value) return
  sending.value = true
  try {
    const res = await orderService.sendOrderChatMessage({ orderId: orderId.value, content })
    if (res?.code !== 0) {
      uni.showToast({ title: res?.message || '发送失败', icon: 'none' })
      return
    }
    draft.value = ''
    messages.value = [...messages.value, res.data]
    jumpToBottom()
    await orderService.markOrderChatRead({ orderId: orderId.value })
  } catch (e) {
    uni.showToast({ title: '发送失败，请重试', icon: 'none' })
  } finally {
    sending.value = false
  }
}

const formatTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}
</script>

<style scoped>
.page { min-height: 100vh; background: #f4f6f8; display: flex; flex-direction: column; }
.msg-list { flex: 1; padding: 24rpx; box-sizing: border-box; }
.empty { color: #999; text-align: center; margin-top: 120rpx; font-size: 26rpx; }
.msg-row { display: flex; flex-direction: column; margin-bottom: 16rpx; }
.msg-row.self { align-items: flex-end; }
.msg-row.peer { align-items: flex-start; }
.bubble { max-width: 70%; padding: 16rpx 20rpx; border-radius: 14rpx; font-size: 28rpx; background: #fff; color: #333; }
.msg-row.self .bubble { background: #2f80ed; color: #fff; }
.time { margin-top: 6rpx; font-size: 22rpx; color: #999; }
.composer { display: flex; gap: 12rpx; padding: 16rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #eee; }
.input { flex: 1; height: 72rpx; border: 1rpx solid #e5e7eb; border-radius: 10rpx; background: #f8fafc; padding: 0 16rpx; font-size: 28rpx; }
.send-btn { width: 132rpx; height: 72rpx; line-height: 72rpx; border: none; border-radius: 10rpx; background: #2f80ed; color: #fff; font-size: 28rpx; }
</style>
