<template>
  <view class="detail-card">
    <view class="card-header">
      <text class="title">神秘入口</text>
      <text class="sub">暂未开放，敬请期待～</text>
    </view>
  </view>
</template>

<script>
export default {
  name: 'MysteryPanel'
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
  flex-direction: column;
  gap: 12rpx;
}

.title {
  font-size: 32rpx;
  font-weight: 600;
  color: #222;
}

.sub {
  font-size: 28rpx;
  color: #888;
}
</style>












