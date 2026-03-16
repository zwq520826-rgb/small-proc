<template>
  <view class="page">
    <!-- 地址选择 -->
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

    <!-- 1. 取件凭证 -->
    <view class="card">
      <view class="section-title">1. 取件凭证 (必填)</view>
      <view class="sub-desc">请上传取件码截图或短信截图，最多 9 张</view>
      <view class="upload-grid">
        <view
          v-for="(img, idx) in images"
          :key="idx"
          class="upload-item"
        >
          <image class="preview-img" :src="img" mode="aspectFill" />
          <view class="delete" @click.stop="removeImage(idx)">×</view>
        </view>
        <view
          v-if="images.length < 9"
          class="upload-btn"
          @click="chooseImage"
        >
          +
        </view>
      </view>
    </view>

    <!-- 2. 物品规格 -->
    <view class="card">
      <view class="section-title">2. 物品规格</view>
      <view class="stepper-row" v-for="item in sizeOptions" :key="item.key">
        <view class="row-left">
          <view class="row-title">{{ item.label }}</view>
          <view class="row-sub">¥{{ item.price }}</view>
        </view>
        <view class="row-right">
          <button class="step-btn" @click="decrease(item.key)">-</button>
          <text class="step-num">{{ quantities[item.key] }}</text>
          <button class="step-btn" @click="increase(item.key)">+</button>
        </view>
      </view>
    </view>

    <!-- 3. 增值服务 -->
    <view class="card">
      <view class="section-title">3. 增值服务</view>
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
      <button class="pay-btn" @click="handlePayClick">立即支付</button>
    </view>

    <PaymentPopup
      v-model:show="showPayPopup"
      :amount="Number(totalPrice)"
      :balance="balance"
      @confirm="onPayConfirm"
    />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useAddressStore } from '@/store/address'
import { useClientOrderStore  } from '@/store/clientOrder'
import PaymentPopup from '@/components/PaymentPopup.vue'
import { useWalletStore } from '@/store/wallet'
import { payForOrder } from '@/store/pay'

const images = ref([])
const quantities = ref({ small: 0, medium: 0, large: 0 })
// 从后端配置读取的小/中/大件价格（单位：元）
const rates = ref({ small: 1.5, medium: 2, large: 3 })
const isUrgent = ref(false)
const isDelivery = ref(false)
const dormNumber = ref('')
// 男生宿舍 / 女生宿舍，对应 male / female
const deliveryDormType = ref('') // 'male' | 'female'
const addressStore = useAddressStore()
const store = useClientOrderStore()
const walletStore = useWalletStore()
const showPayPopup = ref(false)
const balance = computed(() => walletStore.balance)

// 金额工具：统一在“分”上运算，避免浮点精度问题
const toFen = (yuan) => Math.round(Number(yuan || 0) * 100)
const fromFen = (fen) => Number(fen || 0) / 100

const sizeOptions = computed(() => ([
  { key: 'small', label: '小件（手机壳、饰品等）', price: fromFen(toFen(rates.value.small)).toFixed(2) },
  { key: 'medium', label: '中件（衣服、鞋子等）', price: fromFen(toFen(rates.value.medium)).toFixed(2) },
  { key: 'large', label: '大件（床上用品、架子等）', price: fromFen(toFen(rates.value.large)).toFixed(2) }
]))

const currentAddress = computed(() => {
  return (
    addressStore.selectedAddress ||
    addressStore.addressList.find((item) => item.isDefault) ||
    null
  )
})

// 物品金额（单位：分）
const goodsPriceFen = computed(() => {
  const q = quantities.value
  const smallFen = q.small * toFen(rates.value.small)
  const mediumFen = q.medium * toFen(rates.value.medium)
  const largeFen = q.large * toFen(rates.value.large)
  return smallFen + mediumFen + largeFen
})

// 总金额（单位：分）
const totalPriceFen = computed(() => {
  let fen = goodsPriceFen.value
  if (isUrgent.value) fen += toFen(1)      // 加急 +1 元
  if (isDelivery.value) fen += toFen(1)    // 送货上门 +1 元
  return fen
})

// 用于界面显示和下单的金额（单位：元，字符串，保留两位小数）
const totalPrice = computed(() => {
  return fromFen(totalPriceFen.value).toFixed(2)
})

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

const increase = (key) => {
  quantities.value[key] = Math.max(0, quantities.value[key] + 1)
}

const decrease = (key) => {
  quantities.value[key] = Math.max(0, quantities.value[key] - 1)
}

// 送货上门开关切换时，关闭则清空相关字段
const onDeliveryToggle = (e) => {
  const checked = e?.detail?.value
  isDelivery.value = !!checked
  if (!isDelivery.value) {
    dormNumber.value = ''
    deliveryDormType.value = ''
  }
}

const handlePayClick = () => {
  if (!currentAddress.value) {
    uni.showToast({ title: '请选择收货地址', icon: 'none' })
    return
  }
  if (!images.value.length) {
    uni.showToast({ title: '请上传至少一张取件凭证', icon: 'none' })
    return
  }
  if (goodsPriceFen.value <= 0) {
    uni.showToast({ title: '请选择代取物品数量', icon: 'none' })
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

// 上传取件凭证到云存储，返回可跨设备访问的 fileID
const uploadImages = async (list = []) => {
  const uploaded = []
  for (const path of list) {
    if (!path) continue
    // 已是云文件或网络地址则直接使用（注意排除 http://tmp/ 这类本地临时路径）
    if (path.startsWith('cloud://') || path.startsWith('https://')) {
      uploaded.push(path)
      continue
    }
    const res = await uniCloud.uploadFile({
      filePath: path,
      cloudPath: `orders/pickup/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    })
    const fileID = res?.fileID || res?.fileId
    if (fileID) uploaded.push(fileID)
  }
  return uploaded
}

const onPayConfirm = async (method = 'balance') => {
  showPayPopup.value = false
  uni.showLoading({ title: '处理中...' })

  try {
    // 先上传取件凭证，避免支付成功后图片不可用
    const uploadedImages = await uploadImages(images.value)
    if (!uploadedImages.length) {
      uni.hideLoading()
      uni.showToast({ title: '请上传取件凭证', icon: 'none' })
      return
    }

    const amount = Number(totalPrice.value)
    const addr = currentAddress.value || {}
    const deliveryLocation = addr.schoolArea ? `${addr.schoolArea}・${addr.detail}` : addr.detail
    
    // 1. 先创建订单（状态为 pending_accept）
    const payload = {
      type: 'pickup',
      typeLabel: '快递代取',
      price: amount,
      status: 'pending_accept',
      pickupLocation: '', // 不再使用“待指定”，改为通过取件凭证照片识别取件点
      deliveryLocation: deliveryLocation,
      address: `${addr.name || ''} ${addr.phone || ''}\n${deliveryLocation}`,
      content: {
        phone: addr.phone || '', // 单独存储用户电话，方便骑手拨打
        name: addr.name || '', // 单独存储用户姓名
        images: uploadedImages,
        quantities: quantities.value,
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

const goSelectAddress = () => {
  uni.navigateTo({ url: '/pages/common/address/list?source=select' })
}

const formatPhone = (phone = '') => {
  if (!phone) return ''
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

onLoad(async () => {
  // 从后端配置服务加载快递代取价格
  try {
    const configService = uniCloud.importObject('config-service')
    const res = await configService.getPickupRates()
    if (res && res.code === 0 && res.data) {
      rates.value = {
        small: Number(res.data.small) || rates.value.small,
        medium: Number(res.data.medium) || rates.value.medium,
        large: Number(res.data.large) || rates.value.large
      }
    }
  } catch (e) {
    console.error('加载快递代取价格失败，将使用默认价格:', e)
  }
  // 预留扩展：可从路由参数预填数量或服务选项
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
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 6rpx 18rpx rgba(20, 40, 80, 0.05);
}

.address-card {
  display: flex;
  align-items: center;
  padding: 30rpx;
  border-radius: 20rpx;
}

.addr-icon {
  font-size: 34rpx;
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
  margin-bottom: 16rpx;
}

.upload-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.upload-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  border-radius: 10rpx;
  overflow: hidden;
}

.preview-img {
  width: 100%;
  height: 100%;
  border-radius: 10rpx;
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
  width: 200rpx;
  height: 200rpx;
  border-radius: 10rpx;
  border: 2rpx dashed #cdd3dd;
  background: #f4f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 60rpx;
  color: #a0aec0;
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
  color: #1a73e8;
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
  width: 60rpx;
  text-align: center;
  font-size: 28rpx;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14rpx 0;
}

.option-left {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.option-icon {
  width: 32rpx;
  height: 32rpx;
  margin-right: 8rpx;
}

.row-title {
  display: flex;
  align-items: center;
  font-size: 28rpx;
  color: #1f2f4a;
  font-weight: 700;
}

.dorm-row {
  margin-top: 12rpx;
  border: 1rpx solid #e5e7eb;
  border-radius: 12rpx;
  padding: 12rpx;
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

.input {
  width: 100%;
  font-size: 28rpx;
  color: #1f2f4a;
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

