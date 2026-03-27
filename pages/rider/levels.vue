<template>
  <view class="page">
    <view class="hero">
      <view class="hero-title">等级说明</view>
      <view class="hero-sub">完成越多，抽成越低</view>
    </view>

    <view v-if="loading" class="status">加载中...</view>
    <view v-else-if="errorMsg" class="status error">{{ errorMsg }}</view>
    <view v-else>
      <view v-for="level in levels" :key="level.code || level.name" class="card">
        <view class="row between">
          <view class="name">{{ level.name || level.code }}</view>
          <view class="badge">{{ level.code || 'Lv' }}</view>
        </view>
        <view class="row">
          <text class="label">升级条件</text>
          <text class="value">累计 ≥ {{ level.minOrders }} 单</text>
        </view>
        <view class="row">
          <text class="label">平台抽成</text>
          <text class="value">{{ (level.commissionRate * 100).toFixed(1) }}%</text>
        </view>
        <view class="row">
          <text class="label">骑手分成</text>
          <text class="value strong">{{ (level.riderShare * 100).toFixed(1) }}%</text>
        </view>
      </view>

      <view v-if="!levels.length" class="status">暂未配置等级数据</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const levels = ref([])
const loading = ref(false)
const errorMsg = ref('')

const riderService = uniCloud.importObject('rider-service')
const db = uniCloud.database()

const normalizeLevels = (list = []) => {
  return list
    .map((item) => {
      const commission = Number(item.commission_rate ?? item.commissionRate ?? 0)
      const minOrders = Number(item.min_orders ?? item.minOrders ?? 0)
      return {
        code: item.code || '',
        name: item.name || item.code || '等级',
        minOrders: Number.isFinite(minOrders) ? minOrders : 0,
        commissionRate: Number.isFinite(commission) ? commission : 0,
        riderShare: 1 - (Number.isFinite(commission) ? commission : 0)
      }
    })
    .sort((a, b) => a.minOrders - b.minOrders)
}

const loadLevels = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    let res = null

    if (riderService && typeof riderService.getLevelList === 'function') {
      res = await riderService.getLevelList()
      if (res && res.code === 0) {
        levels.value = normalizeLevels(res.data || [])
        return
      }
    }

    // 回退：直接查询 rider_levels 表（需云端放开读权限或走云函数代理）
    const dbRes = await db
      .collection('rider_levels')
      .orderBy('min_orders', 'asc')
      .get()

    levels.value = normalizeLevels(dbRes.result?.data || dbRes.data || [])
  } catch (e) {
    console.warn('loadLevels failed', e)
    errorMsg.value = '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onLoad(async () => {
  await loadLevels()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f7f9fb;
  padding: 24rpx;
  box-sizing: border-box;
}

.hero {
  background: linear-gradient(135deg, #1e88e5, #4fc3f7);
  padding: 24rpx;
  border-radius: 16rpx;
  color: #ffffff;
  margin-bottom: 20rpx;
}

.hero-title {
  font-size: 34rpx;
  font-weight: 700;
}

.hero-sub {
  margin-top: 6rpx;
  font-size: 26rpx;
  opacity: 0.9;
}

.card {
  background: #ffffff;
  border-radius: 14rpx;
  padding: 18rpx;
  margin-bottom: 14rpx;
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.04);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6rpx;
  gap: 10rpx;
}

.between {
  margin-bottom: 8rpx;
}

.name {
  font-size: 30rpx;
  font-weight: 700;
  color: #111827;
}

.badge {
  padding: 6rpx 12rpx;
  background: #e8f2ff;
  color: #1e88e5;
  border-radius: 10rpx;
  font-size: 24rpx;
  font-weight: 700;
}

.label {
  font-size: 24rpx;
  color: #6b7280;
}

.value {
  font-size: 26rpx;
  color: #111827;
}

.value.strong {
  font-weight: 700;
  color: #0ea371;
}

.status {
  text-align: center;
  padding: 40rpx 0;
  color: #6b7280;
}

.status.error {
  color: #e53935;
}
</style>
