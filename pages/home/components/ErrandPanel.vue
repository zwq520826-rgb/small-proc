<template>
  <view class="detail-card">
    <view class="card-header">
      <text class="title">校园跑腿</text>
      <text class="price-tip">统一：¥2 / 单</text>
    </view>
    <view class="rows">
      <view class="row">
        <text class="label">数量</text>
        <view class="qty">
          <button size="mini" class="btn" @click="changeQty(-1)">-</button>
          <text class="qty-text">{{ errand.qty }}</text>
          <button size="mini" class="btn" @click="changeQty(1)">+</button>
        </view>
        <text class="price">¥2.00</text>
      </view>
    </view>
    <view class="options">
      <label class="option">
        <switch :checked="errand.urgent" @change="toggleOption('urgent', $event.detail.value)" />
        <text>加急（+¥1）</text>
      </label>
      <label class="option">
        <switch :checked="errand.door" @change="toggleDoor($event.detail.value)" />
        <text>送货上门（+¥1）</text>
      </label>
    </view>
    <view v-if="errand.door" class="input-row">
      <text class="label">寝室号</text>
      <input class="input" v-model="errand.room" placeholder="请输入寝室号" />
    </view>
    <view class="input-row required">
      <text class="label">图片（必填）</text>
      <uni-file-picker v-model="errand.photos" fileMediatype="image" :limit="3" mode="grid" />
    </view>
    <view class="input-row required">
      <text class="label">给骑手的话（必填）</text>
      <textarea class="textarea" v-model="errand.note" placeholder="请填写具体需求，例如去超市买水、取文件等" />
    </view>
  </view>
</template>

<script>
export default {
  name: 'ErrandPanel',
  data() {
    return {
      errand: {
        qty: 0,
        urgent: false,
        door: false,
        room: '',
        photos: [],
        note: ''
      }
    }
  },
  methods: {
    changeQty(delta) {
      const next = Math.max(0, this.errand.qty + delta)
      this.errand.qty = next
    },
    toggleOption(field, value) {
      this.errand[field] = value
    },
    toggleDoor(value) {
      this.errand.door = value
      if (!value) this.errand.room = ''
    }
  }
}
</script>

<style scoped>
.detail-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.04);
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

.textarea {
  background: #f8f8f8;
  border-radius: 10rpx;
  padding: 16rpx;
  min-height: 160rpx;
  font-size: 28rpx;
}

.required .label::after {
  content: '*';
  color: #e54d42;
  margin-left: 6rpx;
}
</style>












