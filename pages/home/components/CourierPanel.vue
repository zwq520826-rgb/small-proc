<template>
  <view class="detail-card">
    <!-- 地址选择器样式 -->
    <view class="address-selector" @click="handleChooseAddress">
      <view class="addr-icon">
        <text>📍</text>
      </view>
      <view class="addr-content">
        <text class="addr-main">
          {{ addressText || '请选择收货地址' }}
        </text>
        <text v-if="!addressText" class="addr-placeholder">
          可从“我的地址”中选择
        </text>
      </view>
      <view class="addr-arrow">
        <text>›</text>
      </view>
    </view>

    <view class="card-header">
      <text class="title">快递代取</text>
      <text class="price-tip">小/中/大件：¥1.5 / ¥1.99 / ¥2.99 每件</text>
    </view>

    <view class="rows">
      <view v-for="item in courierItems" :key="item.key" class="row">
        <text class="label">{{ item.label }}</text>
        <view class="qty">
          <button size="mini" class="btn" @click="changeQty(item.key, -1)">-</button>
          <text class="qty-text">{{ item.qty }}</text>
          <button size="mini" class="btn" @click="changeQty(item.key, 1)">+</button>
        </view>
        <text class="price">¥{{ item.price.toFixed(2) }}</text>
      </view>
    </view>

    <!-- 配送方式 -->
    <view class="delivery-section">
      <text class="delivery-label">配送方式</text>
      <view class="delivery-options">
        <view
          class="delivery-item"
          :class="{ active: deliveryType === 'self' }"
          @click="deliveryType = 'self'"
        >
          <text>自取</text>
        </view>
        <view
          class="delivery-item"
          :class="{ active: deliveryType === 'door' }"
          @click="deliveryType = 'door'"
        >
          <text>送货上门</text>
        </view>
      </view>
    </view>

    <view class="options">
      <label class="option">
        <switch :checked="urgent" @change="urgent = $event.detail.value" />
        <text>加急（+¥1）</text>
      </label>
    </view>

    <view v-if="deliveryType === 'door'" class="input-row">
      <text class="label">寝室号（必填）</text>
      <input
        class="input"
        v-model="room"
        placeholder="请输入寝室号，如 3栋201"
      />
    </view>

    <!-- 取证信息 -->
    <view class="input-row">
      <text class="label">取证信息（图片）</text>
      <view class="images-grid">
        <view
          v-for="(img, index) in images"
          :key="img"
          class="img-item"
          @click="previewImage(index)"
        >
          <image class="thumb" :src="img" mode="aspectFill" />
          <view class="close" @click.stop="removeImage(index)">×</view>
        </view>
        <view
          v-if="images.length < maxImages"
          class="img-item add"
          @click="chooseImage"
        >
          <text class="add-plus">＋</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'

const courierItems = reactive([
  { key: 'small', label: '小件', price: 1.5, qty: 0 },
  { key: 'medium', label: '中件', price: 1.99, qty: 0 },
  { key: 'large', label: '大件', price: 2.99, qty: 0 }
])

const urgent = ref(false)
const deliveryType = ref('self') // 'self' 自取, 'door' 送货上门
const room = ref('')

const addressText = ref('')

const images = ref([])
const maxImages = 9

function changeQty(key, delta) {
  courierItems.forEach((item) => {
    if (item.key === key) {
      const next = Math.max(0, item.qty + delta)
      item.qty = next
    }
  })
}

function handleChooseAddress() {
  // TODO: 在此接入“我的地址”选择逻辑
  console.log('handleChooseAddress TODO')
  uni.showToast({
    title: '地址选择待接入',
    icon: 'none'
  })
}

function chooseImage() {
  const remain = maxImages - images.value.length
  if (remain <= 0) return
  uni.chooseImage({
    count: remain,
    sizeType: ['compressed'],
    success: (res) => {
      const list = res.tempFilePaths || []
      images.value = images.value.concat(list)
    }
  })
}

function removeImage(index) {
  images.value.splice(index, 1)
}

function previewImage(index) {
  uni.previewImage({
    current: images.value[index],
    urls: images.value
  })
}
</script>

<style scoped>
.detail-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
}

.address-selector {
  flex-direction: row;
  align-items: center;
  padding: 16rpx 18rpx;
  border-radius: 12rpx;
  background: #f7f8fa;
  margin-bottom: 18rpx;
}

.addr-icon {
  width: 40rpx;
  align-items: center;
  justify-content: center;
  margin-right: 10rpx;
}

.addr-content {
  flex: 1;
}

.addr-main {
  font-size: 28rpx;
  color: #333333;
}

.addr-placeholder {
  margin-top: 4rpx;
  font-size: 24rpx;
  color: #999999;
}

.addr-arrow {
  margin-left: 10rpx;
  font-size: 32rpx;
  color: #c0c4cc;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.title {
  font-size: 32rpx;
  font-weight: 600;
  color: #222;
}

.price-tip {
  font-size: 24rpx;
  color: #888;
}

.rows {
  margin-top: 8rpx;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.row:last-child {
  border-bottom: none;
}

.label {
  font-size: 30rpx;
  color: #333;
}

.qty {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.btn {
  width: 52rpx;
  height: 52rpx;
  line-height: 52rpx;
}

.qty-text {
  min-width: 40rpx;
  text-align: center;
  font-size: 30rpx;
}

.price {
  font-size: 28rpx;
  color: #007aff;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin: 12rpx 0;
}

.option {
  display: flex;
  align-items: center;
  gap: 12rpx;
  font-size: 28rpx;
  color: #333;
}

.input-row {
  margin-top: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.input {
  background: #f8f8f8;
  border-radius: 10rpx;
  padding: 16rpx;
  font-size: 28rpx;
}

.delivery-section {
  margin-top: 10rpx;
}

.delivery-label {
  font-size: 28rpx;
  color: #333333;
  margin-bottom: 10rpx;
}

.delivery-options {
  flex-direction: row;
  margin-top: 4rpx;
}

.delivery-item {
  padding: 10rpx 26rpx;
  border-radius: 999rpx;
  border-width: 1rpx;
  border-color: #dcdfe6;
  border-style: solid;
  margin-right: 16rpx;
  font-size: 26rpx;
  color: #666666;
}

.delivery-item.active {
  background: #007aff;
  border-color: #007aff;
  color: #ffffff;
}

.images-grid {
  margin-top: 12rpx;
  flex-direction: row;
  flex-wrap: wrap;
}

.img-item {
  width: 150rpx;
  height: 150rpx;
  border-radius: 12rpx;
  background: #f7f8fa;
  margin-right: 16rpx;
  margin-bottom: 16rpx;
  position: relative;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.img-item.add {
  border-width: 1rpx;
  border-color: #e5e5e5;
  border-style: dashed;
}

.thumb {
  width: 100%;
  height: 100%;
}

.add-plus {
  font-size: 50rpx;
  color: #c0c4cc;
}

.close {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 18rpx;
  background: rgba(0, 0, 0, 0.55);
  color: #ffffff;
  font-size: 26rpx;
  text-align: center;
  line-height: 36rpx;
}
</style>

