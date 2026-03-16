<template>
  <view class="page">
    <!-- 收货地址 -->
    <view class="card address-card" @click="goSelectAddress">
      <view v-if="currentAddress">
        <view class="info">
          <view class="addr">{{ currentAddress.schoolArea }} · {{ currentAddress.detail }}</view>
          <view class="user">{{ currentAddress.name }} {{ formatPhone(currentAddress.phone) }}</view>
        </view>
        <text class="arrow">›</text>
      </view>
      <view v-else class="placeholder">➕ 请选择收货地址</view>
    </view>

    <!-- 卡片A 要做什么 -->
    <view class="card">
      <view class="section-title">要做什么</view>
      <textarea
        class="textarea"
        v-model="description"
        placeholder="例：帮我把钥匙送到紫荆5号楼，或帮我取打印件"
        auto-height
      />
      <view class="sub-desc">可选：上传参考图片（有图更方便骑手理解目的）</view>
      <view class="upload-grid">
        <view v-for="(img, idx) in images" :key="idx" class="upload-item">
          <image class="preview-img" :src="img" mode="aspectFill" />
          <view class="delete" @click.stop="removeImage(idx)">×</view>
        </view>
        <view v-if="images.length < 9" class="upload-btn" @click="chooseImage">+</view>
      </view>
    </view>

    <!-- 卡片B 跑腿费用 -->
    <view class="card fee-card">
      <view class="section-title">跑腿费用</view>
      <view class="stepper-row">
        <view class="row-left">
          <view class="row-title">跑腿费</view>
          <view class="row-sub">基础费 2 元，可根据距离/紧急适当加价</view>
        </view>
        <view class="row-right">
          <button class="step-btn" @click="decreaseFee">-</button>
          <input
            class="step-num-input"
            type="number"
            v-model.number="runnerFee"
            @blur="normalizeRunnerFee"
          />
          <button class="step-btn" @click="increaseFee">+</button>
        </view>
      </view>
    </view>

    <!-- 卡片C 增值服务 -->
    <view class="card">
      <view class="section-title">增值服务</view>
      <view class="option-row">
        <view class="option-left">
          <view class="row-title">
            <image class="option-icon" src="/static/tabbar/jiajichuli.png" mode="aspectFit" />
            <text>加急处理</text>
          </view>
          <view class="row-sub">+¥1.00</view>
        </view>
        <switch
          :checked="isUrgent"
          @change="(e) => (isUrgent = e.detail.value)"
          color="#007AFF"
        />
      </view>
      <view class="option-row">
        <view class="option-left">
          <view class="row-title">
            <image class="option-icon" src="/static/tabbar/sonhuoshangmen.png" mode="aspectFit" />
            <text>送货上门</text>
          </view>
          <view class="row-sub">+¥1.00</view>
        </view>
        <switch
          :checked="isDelivery"
          @change="onDeliveryToggle"
          color="#007AFF"
        />
      </view>
      <view v-if="isDelivery" class="dorm-row">
        <view class="gender-row">
          <text class="gender-label">宿舍类型</text>
          <view class="gender-tags">
            <view
              class="gender-tag"
              :class="{ active: deliveryDormType === 'male' }"
              @click="deliveryDormType = 'male'"
            >
              男生宿舍
            </view>
            <view
              class="gender-tag"
              :class="{ active: deliveryDormType === 'female' }"
              @click="deliveryDormType = 'female'"
            >
              女生宿舍
            </view>
          </view>
        </view>
        <input
          class="input"
          v-model="dormNumber"
          placeholder="请输入详细寝室号 (如: 紫荆5号楼302) - 必填"
        />
      </view>
    </view>

    <!-- 底部栏 -->
    <view class="bottom-bar">
      <view class="total">
        <text class="total-label">合计:</text>
        <text class="total-price">¥ {{ totalPrice }}</text>
      </view>
      <button class="pay-btn" @click="handlePayClick">立即发布</button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useAddressStore } from '@/store/address'
import { useClientOrderStore  } from '@/store/clientOrder'
import { useWalletStore } from '@/store/wallet'
import { payForOrder } from '@/store/pay'

// 状态
const description = ref('')
const runnerFee = ref(2) // 跑腿费，整数，最少 2 元
const images = ref([])
const isUrgent = ref(false)
const isDelivery = ref(false)
const dormNumber = ref('')
// 男生宿舍 / 女生宿舍，对应 male / female
const deliveryDormType = ref('') // 'male' | 'female'
const walletStore = useWalletStore()
const balance = computed(() => walletStore.balance)

// 地址 & 订单
const addressStore = useAddressStore()
const store = useClientOrderStore()
const currentAddress = computed(() => {
  // 只展示用户明确选择的地址，避免自动带出默认/历史地址
  return addressStore.selectedAddress || null
})

// 价格
const totalPrice = computed(() => {
  let price = runnerFee.value
  if (isUrgent.value) price += 1
  if (isDelivery.value) price += 1
  return price.toFixed(2)
})

// 事件
const chooseImage = () => {
  // 微信小程序端优先使用 wx.chooseMedia，支持图片/视频选择
  // #ifdef MP-WEIXIN
  wx.chooseMedia({
    count: 9 - images.value.length,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const files = res.tempFiles || []
      const paths = files.map(item => item.tempFilePath).filter(Boolean)
      images.value = images.value.concat(paths)
    },
    fail: (err) => {
      console.error('选择图片失败:', err)
    }
  })
  // #endif

  // 其它平台继续使用 uni.chooseImage
  // #ifndef MP-WEIXIN
  uni.chooseImage({
    count: 9 - images.value.length,
    success: (res) => {
      images.value = images.value.concat(res.tempFilePaths || [])
    }
  })
  // #endif
}

const removeImage = (idx) => {
  images.value.splice(idx, 1)
}

const normalizeRunnerFee = () => {
  let v = Number(runnerFee.value || 0)
  if (!Number.isFinite(v) || v < 2) v = 2
  runnerFee.value = Math.round(v)
}

const increaseFee = () => {
  runnerFee.value = Math.max(2, runnerFee.value + 1)
}

const decreaseFee = () => {
  runnerFee.value = Math.max(2, runnerFee.value - 1)
}

// 送货上门开关切换时，关闭则清空相关信息
const onDeliveryToggle = (e) => {
  const checked = e?.detail?.value
  isDelivery.value = !!checked
  if (!isDelivery.value) {
    dormNumber.value = ''
    deliveryDormType.value = ''
  }
}

const goSelectAddress = () => {
  uni.navigateTo({ url: '/pages/common/address/list?source=select' })
}

const formatPhone = (phone = '') => {
  if (!phone) return ''
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

const handlePayClick = () => {
  if (!currentAddress.value) {
    uni.showToast({ title: '请选择收货地址', icon: 'none' })
    return
  }
  if (!description.value.trim()) {
    uni.showToast({ title: '请填写任务描述', icon: 'none' })
    return
  }
  if (isDelivery.value) {
    if (!deliveryDormType.value) {
      uni.showToast({ title: '请选择男女宿舍', icon: 'none' })
      return
    }
    if (!dormNumber.value.trim()) {
      uni.showToast({ title: '请填写寝室号', icon: 'none' })
      return
    }
  }

  const amount = Number(totalPrice.value).toFixed(2)
  uni.showActionSheet({
    itemList: [`余额支付 ¥${amount}`, '微信支付'],
    success: (res) => {
      const index = res.tapIndex
      if (index === 0) {
        onPayConfirm('balance')
      } else if (index === 1) {
        onPayConfirm('wechat')
      }
    }
  })
}

// 上传任务图片（可选），返回可跨设备访问的 fileID
const uploadImages = async (list = []) => {
  const uploaded = []
  for (const path of list) {
    if (!path) continue
    // 已是云文件或网络地址则直接使用（排除 http://tmp/ 等本地临时路径）
    if (path.startsWith('cloud://') || path.startsWith('https://')) {
      uploaded.push(path)
      continue
    }
    const res = await uniCloud.uploadFile({
      filePath: path,
      cloudPath: `orders/errand/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    })
    const fileID = res?.fileID || res?.fileId
    if (fileID) uploaded.push(fileID)
  }
  return uploaded
}

const onPayConfirm = async (method = 'balance') => {
  uni.showLoading({ title: '处理中...' })

  try {
    // 先上传图片（可选）
    const uploadedImages = await uploadImages(images.value || [])

    const amount = Number(totalPrice.value)
    const addr = currentAddress.value || {}
    const deliveryLocation = addr.schoolArea ? `${addr.schoolArea}・${addr.detail}` : addr.detail
    
    // 1. 先创建订单（状态为 pending_accept）
      const payload = {
      type: 'errand',
      typeLabel: '跑腿代购',
      price: amount,
      status: 'pending_accept',
      pickupLocation: '', // 不再使用“待指定”，改为由图片说明取件信息
      deliveryLocation: deliveryLocation,
      address: `${addr.name || ''} ${addr.phone || ''}\n${deliveryLocation}`,
      content: {
        phone: addr.phone || '', // 单独存储用户电话，方便骑手拨打
        name: addr.name || '', // 单独存储用户姓名
        description: description.value,
        images: uploadedImages,
        runnerFee: runnerFee.value,
        isUrgent: isUrgent.value,
        isDelivery: isDelivery.value,
        dormNumber: dormNumber.value,
        // 送货上门时要求的骑手性别（male/female）
        requiredRiderGender: isDelivery.value ? (deliveryDormType.value || '') : ''
      },
      tags: [
        isUrgent.value ? '加急' : '',
        isDelivery.value
          ? (deliveryDormType.value === 'male'
              ? '男生宿舍送货上门'
              : deliveryDormType.value === 'female'
              ? '女生宿舍送货上门'
              : '送货上门')
          : ''
      ].filter(Boolean),
      createTime: new Date().toLocaleString()
    }

    const order = await store.addOrder(payload)
    if (!order) {
      uni.hideLoading()
      uni.showToast({ title: '创建订单失败', icon: 'none' })
      return
    }

    const orderId = order.id || order._id

    // 2. 调用统一支付入口进行支付
    const payResult = await payForOrder({
      method,
      orderId,
      amount
    })

    uni.hideLoading()

    if (payResult.success) {
      uni.showToast({ title: '支付成功', icon: 'success' })
      setTimeout(() => {
        uni.reLaunch({ url: '/pages/client/orders/list' })
      }, 500)
    } else {
      // 支付失败，取消订单
      await store.cancelOrder(orderId)
      uni.showToast({ 
        title: payResult.reason || '支付失败，订单已取消', 
        icon: 'none',
        duration: 2000
      })
    }
  } catch (error) {
    uni.hideLoading()
    console.error('支付流程失败:', error)
    uni.showToast({ title: '支付失败，请重试', icon: 'none' })
  }
}

onLoad(() => {
  // 预留：可从路由参数预填表单
})

onShow(() => {
  // 进入页面时可同步地址
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f7f9fb;
  padding: 24rpx 24rpx 140rpx;
  box-sizing: border-box;
}

.card {
  background: #ffffff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 18rpx;
  box-shadow: 0 6rpx 18rpx rgba(20, 40, 80, 0.05);
}

.address-card {
  display: flex;
  align-items: center;
  padding: 30rpx;
}

.info {
  flex: 1;
  margin: 0 20rpx;
}

.addr {
  font-size: 32rpx;
  font-weight: 700;
  color: #333;
  margin-bottom: 8rpx;
}

.user {
  font-size: 26rpx;
  color: #666;
}

.placeholder {
  flex: 1;
  text-align: center;
  color: #007aff;
  font-size: 30rpx;
  font-weight: 500;
}

.arrow {
  color: #9aa6b8;
  font-size: 32rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 700;
  margin-bottom: 10rpx;
}

.sub-desc {
  font-size: 24rpx;
  color: #7a8499;
  margin: 12rpx 0;
}

.textarea {
  width: 100%;
  min-height: 120rpx;
  padding: 16rpx;
  box-sizing: border-box;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #1f2f4a;
  background: #fafbfc;
}

.upload-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 12rpx;
}

.upload-item {
  position: relative;
  width: 180rpx;
  height: 180rpx;
  border-radius: 12rpx;
  overflow: hidden;
}

.preview-img {
  width: 100%;
  height: 100%;
}

.delete {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 20rpx;
  background: rgba(0, 0, 0, 0.5);
  color: #ffffff;
  text-align: center;
  line-height: 40rpx;
  font-size: 30rpx;
}

.upload-btn {
  width: 180rpx;
  height: 180rpx;
  border-radius: 12rpx;
  border: 2rpx dashed #cdd3dd;
  background: #f4f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 60rpx;
  color: #a0aec0;
}

.input {
  width: 100%;
  font-size: 28rpx;
  color: #1f2f4a;
  padding: 16rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  background: #fafbfc;
  box-sizing: border-box;
}

.fee-card .stepper-row {
  padding: 12rpx 0 0;
  border-bottom: none;
}

.stepper-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #eee;
}

.row-left {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.row-title {
  font-size: 28rpx;
  color: #1f2f4a;
  font-weight: 700;
}

.row-sub {
  font-size: 24rpx;
  color: #7a8499;
}

.option-icon {
  width: 32rpx;
  height: 32rpx;
  margin-right: 8rpx;
}

.row-title {
  display: flex;
  align-items: center;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14rpx 0;
}

.row-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.step-btn {
  width: 60rpx;
  height: 60rpx;
  border-radius: 12rpx;
  background: #f4f5f7;
  color: #1f2f4a;
}

.step-num {
  min-width: 120rpx;
  text-align: center;
  font-size: 28rpx;
}

.step-num-input {
  min-width: 120rpx;
  text-align: center;
  font-size: 28rpx;
  padding: 8rpx 12rpx;
  border-radius: 12rpx;
  border: 1rpx solid #e5e7eb;
  background: #f9fafb;
}

.dorm-row {
  margin-top: 16rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  padding: 20rpx;
}

.gender-row {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.gender-label {
  font-size: 26rpx;
  color: #4b5563;
  font-weight: 600;
}

.gender-tags {
  display: flex;
  gap: 16rpx;
}

.gender-tag {
  flex: 1;
  text-align: center;
  padding: 14rpx 0;
  border-radius: 999rpx;
  border: 1rpx solid #e5e7eb;
  font-size: 26rpx;
  color: #4b5563;
  background-color: #f9fafb;
}

.gender-tag.active {
  border-color: #1a73e8;
  background-color: #e0edff;
  color: #1a73e8;
  font-weight: 600;
}

.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 20rpx;
  background: #ffffff;
  box-shadow: 0 -6rpx 16rpx rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}

.total {
  display: flex;
  align-items: baseline;
  gap: 10rpx;
}

.total-label {
  color: #4a5568;
  font-size: 26rpx;
}

.total-price {
  font-size: 40rpx;
  font-weight: 800;
  color: #000000;
}

.pay-btn {
  min-width: 220rpx;
  background: #1a73e8;
  color: #ffffff;
  border-radius: 12rpx;
}
</style>




