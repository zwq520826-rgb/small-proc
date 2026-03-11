<template>
  <uni-popup ref="popup" type="bottom" :mask-click="false" v-model:show="innerShow">
    <view class="popup">
      <view class="header">
        <text class="title">确认支付</text>
      </view>
      <view class="amount-row">
        <text class="label">需支付</text>
        <text class="amount">¥ {{ amount.toFixed(2) }}</text>
      </view>
      <view class="balance-row">
        <text class="label">余额</text>
        <text class="balance">¥ {{ balance.toFixed(2) }}</text>
      </view>
      <view class="btn-row">
        <button class="btn cancel" @click="handleCancel">取消</button>
        <button class="btn confirm" @click="handleConfirm">余额支付</button>
      </view>
    </view>
  </uni-popup>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  amount: {
    type: Number,
    default: 0
  },
  balance: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['update:show', 'confirm'])

const innerShow = ref(props.show)

watch(
  () => props.show,
  (val) => {
    innerShow.value = val
  }
)

watch(innerShow, (val) => {
  emit('update:show', val)
})

const handleCancel = () => {
  innerShow.value = false
}

const handleConfirm = () => {
  emit('confirm', 'balance')
}
</script>

<style scoped>
.popup {
  background: #ffffff;
  border-top-left-radius: 20rpx;
  border-top-right-radius: 20rpx;
  padding: 24rpx;
}

.header {
  text-align: center;
  margin-bottom: 12rpx;
}

.title {
  font-size: 30rpx;
  font-weight: 600;
}

.amount-row,
.balance-row {
  display: flex;
  justify-content: space-between;
  margin-top: 12rpx;
}

.label {
  font-size: 26rpx;
  color: #666666;
}

.amount {
  font-size: 34rpx;
  font-weight: 700;
  color: #e53935;
}

.balance {
  font-size: 28rpx;
  color: #333333;
}

.btn-row {
  display: flex;
  margin-top: 24rpx;
  gap: 16rpx;
}

.btn {
  flex: 1;
  border-radius: 999rpx;
}

.cancel {
  background: #f5f5f5;
  color: #666666;
}

.confirm {
  background: #007aff;
  color: #ffffff;
}
</style>










