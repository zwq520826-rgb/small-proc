<template>
  <view class="page">
    <view class="header">
      <text class="title">订单详情</text>
    </view>
    <view class="card">
      <text class="label">订单ID：</text>
      <text class="value">{{ orderId }}</text>
    </view>
    <view class="card">
      <text class="value">这里显示该订单的详细信息（占位）。</text>
    </view>
  </view>
</template>

<script>
export default {
  name: 'OrderDetail',
  data() {
    return {
      orderId: ''
    }
  },
  onLoad(query) {
    this.orderId = query.id || ''
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx;
  background: #f5f6f7;
  box-sizing: border-box;
}

.header {
  margin-bottom: 16rpx;
}

.title {
  font-size: 34rpx;
  font-weight: 600;
}

.card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}

.label {
  font-size: 28rpx;
  color: #666;
}

.value {
  font-size: 28rpx;
  color: #333;
}
</style>












