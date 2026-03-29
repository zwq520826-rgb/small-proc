<template>
  <view class="wallet-page">
    <!-- 余额卡片 -->
    <view class="balance-card">
      <view class="balance-header">
        <text class="balance-title">账户余额</text>
        <text class="balance-refresh" @click="refreshBalance">刷新</text>
      </view>
      <view class="balance-amount">
        <text class="currency">¥</text>
        <text class="amount">{{ balance.toFixed(2) }}</text>
      </view>
      <view class="balance-stats">
        <view class="stat-item">
          <text class="stat-value">¥{{ totalIncome.toFixed(2) }}</text>
          <text class="stat-label">累计收入</text>
        </view>
        <view class="stat-divider"></view>
        <view class="stat-item">
          <text class="stat-value">¥{{ totalExpense.toFixed(2) }}</text>
          <text class="stat-label">累计支出</text>
        </view>
      </view>
    </view>

    <!-- 操作按钮（仅保留提现） -->
    <view class="action-row">
      <button class="action-btn withdraw-btn" @click="showWithdrawPopup">
        <text class="action-icon">💸</text>
        <text class="action-text">提现</text>
      </button>
    </view>

    <view v-if="withdrawGuide.enable" class="guide-entry" @click="openWithdrawGuide">
      <text class="guide-entry-title">{{ withdrawGuide.title || '提现请点我的' }}</text>
      <text class="guide-entry-desc">点击查看骑手群二维码，提现问题可在群内联系运营处理</text>
    </view>

    <!-- 交易记录 -->
    <view class="transaction-section">
      <view class="section-header">
        <text class="section-title">交易记录</text>
        <text class="section-more" @click="loadMoreTransactions">查看更多</text>
      </view>

      <view v-if="transactions.length === 0" class="empty-state">
        <text class="empty-text">暂无交易记录</text>
      </view>

      <view v-else class="transaction-list">
        <view 
          v-for="item in transactions" 
          :key="item._id" 
          class="transaction-item"
        >
          <view class="trans-left">
            <text class="trans-icon">{{ getTransIcon(item.type) }}</text>
            <view class="trans-info">
              <text class="trans-title">{{ getTransTitle(item.type) }}</text>
              <view v-if="withdrawMeta(item)" class="trans-sub-wrap">
                <view v-if="withdrawMeta(item).kind === 'reject'" class="trans-sub-row">
                  <text class="trans-sub-reject">已驳回</text>
                  <text v-if="withdrawMeta(item).reason" class="trans-sub-reason"> · {{ withdrawMeta(item).reason }}</text>
                </view>
                <text v-else class="trans-sub">{{ withdrawMeta(item).text }}</text>
              </view>
              <text class="trans-time">{{ formatTime(item.create_time) }}</text>
            </view>
          </view>
          <!-- 提现驳回：金额删除线 + ❌ 覆盖 -->
          <view
            v-if="item.type === 'withdraw' && item.status === 'failed'"
            class="trans-amount-wrap withdraw-failed"
          >
            <text class="withdraw-failed-text">-¥{{ item.amount.toFixed(2) }}</text>
            <text class="withdraw-failed-x">❌</text>
          </view>
          <!-- 提现已打款：绿色金额 -->
          <text
            v-else-if="item.type === 'withdraw' && item.status === 'success'"
            class="trans-amount trans-withdraw-paid"
          >
            -¥{{ item.amount.toFixed(2) }}
          </text>
          <text
            v-else
            class="trans-amount"
            :class="{ income: isIncome(item.type) }"
          >
            {{ isIncome(item.type) ? '+' : '-' }}¥{{ item.amount.toFixed(2) }}
          </text>
        </view>
      </view>
    </view>

    <!-- 提现弹窗 -->
    <uni-popup ref="withdrawPopup" type="bottom">
      <view class="popup-content">
        <view class="popup-header">
          <text class="popup-title">提现</text>
          <text class="popup-close" @click="closeWithdrawPopup">×</text>
        </view>

        <view class="withdraw-balance">
          <text class="wb-label">可提现余额</text>
          <text class="wb-amount">¥{{ balance.toFixed(2) }}</text>
        </view>
        
        <view class="amount-options">
          <view 
            v-for="amt in withdrawAmounts" 
            :key="amt"
            class="amount-option"
            :class="{ active: withdrawAmount === amt, disabled: amt > balance }"
            @click="selectWithdrawAmount(amt)"
          >
            ¥{{ amt }}
          </view>
        </view>

        <view class="custom-amount">
          <text class="input-label">其他金额</text>
          <input 
            class="amount-input" 
            type="digit" 
            v-model="customWithdrawAmount"
            placeholder="请输入提现金额"
            @input="onCustomAmountInput('withdraw')"
          />
        </view>

        <button class="confirm-btn withdraw-confirm" @click="handleWithdraw">
          确认提现 ¥{{ withdrawAmount || customWithdrawAmount || 0 }}
        </button>
      </view>
    </uni-popup>

    <uni-popup ref="guidePopup" type="center">
      <view class="guide-popup">
        <text class="guide-popup-title">提现请点我的</text>
        <text class="guide-popup-tip">{{ withdrawGuide.tip || '扫描二维码添加骑手群' }}</text>
        <image
          v-if="withdrawGuide.qr_file_id"
          class="guide-qr"
          :src="withdrawGuide.qr_file_id"
          mode="aspectFit"
          @click="previewGuideQr"
        />
        <view v-else class="guide-empty">暂未上传骑手群二维码，请联系管理员</view>
        <button class="guide-close" @click="closeWithdrawGuide">我知道了</button>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { isRiderMode } from '@/store/user'
import { useWalletStore } from '@/store/wallet'
const riderService = uniCloud.importObject('rider-service')

const walletStore = useWalletStore()

// 弹窗引用
const withdrawPopup = ref(null)
const guidePopup = ref(null)

// 提现相关
const withdrawAmounts = [10, 20, 50, 100, 200]
const withdrawAmount = ref(0)
const customWithdrawAmount = ref('')
const withdrawGuide = ref({
  title: '提现请点我的',
  tip: '扫描二维码添加骑手群',
  qr_file_id: '',
  enable: true
})

// 计算属性
const balance = computed(() => walletStore.balance)
const totalIncome = computed(() => walletStore.totalIncome)
const totalExpense = computed(() => walletStore.totalExpense)
const transactions = computed(() => walletStore.transactions)

// 刷新余额
const refreshBalance = async () => {
  uni.showLoading({ title: '刷新中...' })
  await walletStore.loadFromCloud(true)
  await walletStore.getTransactions({ page: 1, pageSize: 20 }, true)
  uni.hideLoading()
  uni.showToast({ title: '已刷新', icon: 'success' })
}

// 加载更多交易记录
const loadMoreTransactions = async () => {
  uni.showLoading({ title: '加载中...' })
  await walletStore.getTransactions({ page: 1, pageSize: 50 }, true)
  uni.hideLoading()
}

const onCustomAmountInput = (type) => {
  if (type === 'withdraw') {
    withdrawAmount.value = 0
  }
}

// 提现弹窗
const showWithdrawPopup = () => {
  withdrawAmount.value = 0
  customWithdrawAmount.value = ''
  withdrawPopup.value.open()
}

const closeWithdrawPopup = () => {
  withdrawPopup.value.close()
}

const openWithdrawGuide = () => {
  guidePopup.value && guidePopup.value.open()
}

const closeWithdrawGuide = () => {
  guidePopup.value && guidePopup.value.close()
}

const previewGuideQr = () => {
  if (!withdrawGuide.value.qr_file_id) return
  uni.previewImage({ urls: [withdrawGuide.value.qr_file_id], current: withdrawGuide.value.qr_file_id })
}

const loadWithdrawGuide = async () => {
  try {
    const res = await riderService.getWithdrawGuide()
    if (res && res.code === 0 && res.data) {
      withdrawGuide.value = {
        title: res.data.title || '提现请点我的',
        tip: res.data.tip || '扫描二维码添加骑手群',
        qr_file_id: res.data.qr_file_id || '',
        enable: res.data.enable !== false
      }
    }
  } catch (e) {
    // ignore, keep default guide
  }
}

const selectWithdrawAmount = (amt) => {
  if (amt > balance.value) {
    uni.showToast({ title: '余额不足', icon: 'none' })
    return
  }
  withdrawAmount.value = amt
  customWithdrawAmount.value = ''
}

const handleWithdraw = async () => {
  const amount = withdrawAmount.value || Number(customWithdrawAmount.value) || 0
  if (amount <= 0) {
    uni.showToast({ title: '请选择或输入金额', icon: 'none' })
    return
  }
  if (amount > balance.value) {
    uni.showToast({ title: '余额不足', icon: 'none' })
    return
  }

  uni.showLoading({ title: '提现中...' })
  const result = await walletStore.withdraw(amount)
  uni.hideLoading()

  if (result.success) {
    uni.showToast({ title: result.message || '提交成功', icon: 'success' })
    closeWithdrawPopup()
    // 刷新交易记录
    await walletStore.getTransactions({ page: 1, pageSize: 20 }, true)
  } else {
    uni.showToast({ title: result.reason || '提现失败', icon: 'none' })
  }
}

// 工具函数
const getTransIcon = (type) => {
  const icons = {
    recharge: '💰',
    withdraw: '💸',
    pay: '🛒',
    income: '💵',
    refund: '↩️'
  }
  return icons[type] || '📝'
}

const getTransTitle = (type) => {
  const titles = {
    recharge: '余额充值',
    withdraw: '余额提现',
    pay: '订单支付',
    income: '订单收入',
    refund: '订单退款'
  }
  return titles[type] || '其他'
}

/**
 * 提现副文案：驳回单独拆出「已驳回」便于标红；其余为整段灰字
 */
const withdrawMeta = (item) => {
  if (item.type !== 'withdraw') return null
  const amt = Number(item.amount || 0)
  const st = item.status || 'pending'
  if (st === 'pending') return { kind: 'plain', text: '待打款 · 等待运营处理' }
  if (st === 'success') return { kind: 'plain', text: `已打款 · ¥${amt.toFixed(2)}` }
  if (st === 'failed') {
    const r = String(item.remark || '').trim()
    let reason = ''
    if (r.startsWith('提现已驳回：')) {
      reason = r.slice('提现已驳回：'.length).trim()
    } else if (r) {
      reason = r
    }
    return { kind: 'reject', reason }
  }
  return { kind: 'plain', text: '' }
}

const isIncome = (type) => {
  return ['recharge', 'income', 'refund'].includes(type)
}

const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hour = date.getHours().toString().padStart(2, '0')
  const minute = date.getMinutes().toString().padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

// 页面显示时加载数据（交易记录强制拉取，避免 8s 缓存导致看不到后台刚更新的打款/驳回状态）
onShow(async () => {
  if (!isRiderMode()) {
    uni.showToast({ title: '仅骑手可用', icon: 'none' })
    setTimeout(() => {
      uni.navigateBack({ delta: 1 })
    }, 300)
    return
  }

  await walletStore.loadFromCloud()
  await walletStore.getTransactions({ page: 1, pageSize: 20 }, true)
  await loadWithdrawGuide()
})
</script>

<style lang="scss" scoped>
.wallet-page {
  min-height: 100vh;
  background: #f5f6f7;
  padding-bottom: 40rpx;
}

.balance-card {
  margin: 24rpx;
  padding: 32rpx;
  background: linear-gradient(135deg, #1a73e8 0%, #4fc3f7 100%);
  border-radius: 24rpx;
  color: #ffffff;
  box-shadow: 0 8rpx 32rpx rgba(26, 115, 232, 0.3);
}

.balance-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.balance-title {
  font-size: 28rpx;
  opacity: 0.9;
}

.balance-refresh {
  font-size: 24rpx;
  padding: 8rpx 16rpx;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20rpx;
}

.balance-amount {
  display: flex;
  align-items: baseline;
  margin-bottom: 32rpx;
}

.currency {
  font-size: 36rpx;
  font-weight: 600;
  margin-right: 8rpx;
}

.amount {
  font-size: 72rpx;
  font-weight: 700;
}

.balance-stats {
  display: flex;
  align-items: center;
  padding-top: 24rpx;
  border-top: 1rpx solid rgba(255, 255, 255, 0.2);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 32rpx;
  font-weight: 600;
}

.stat-label {
  font-size: 24rpx;
  opacity: 0.8;
  margin-top: 8rpx;
}

.stat-divider {
  width: 1rpx;
  height: 60rpx;
  background: rgba(255, 255, 255, 0.3);
}

.action-row {
  display: flex;
  gap: 24rpx;
  margin: 0 24rpx 24rpx;
}

.guide-entry {
  margin: 0 24rpx 24rpx;
  border-radius: 16rpx;
  padding: 20rpx 22rpx;
  background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
  border: 2rpx solid #fdba74;
  box-shadow: 0 10rpx 24rpx rgba(249, 115, 22, 0.12);
}

.guide-entry-title {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #c2410c;
}

.guide-entry-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.45;
  color: #7c2d12;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  height: 100rpx;
  border-radius: 16rpx;
  border: none;
  font-size: 30rpx;
  font-weight: 600;
}

.recharge-btn {
  background: #1a73e8;
  color: #ffffff;
}

.withdraw-btn {
  background: #ffffff;
  color: #1a73e8;
  border: 2rpx solid #1a73e8;
}

.action-icon {
  font-size: 36rpx;
}

.action-text {
  font-size: 30rpx;
}

.transaction-section {
  margin: 0 24rpx;
  background: #ffffff;
  border-radius: 20rpx;
  padding: 24rpx;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333333;
}

.section-more {
  font-size: 26rpx;
  color: #1a73e8;
}

.empty-state {
  padding: 60rpx 0;
  text-align: center;
}

.empty-text {
  font-size: 28rpx;
  color: #999999;
}

.transaction-list {
  display: flex;
  flex-direction: column;
}

.transaction-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.transaction-item:last-child {
  border-bottom: none;
}

.trans-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.trans-icon {
  font-size: 40rpx;
}

.trans-info {
  display: flex;
  flex-direction: column;
}

.trans-title {
  font-size: 28rpx;
  color: #333333;
}

.trans-sub-wrap {
  margin-top: 6rpx;
}

.trans-sub-row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
  line-height: 1.4;
}

.trans-sub-reject {
  font-size: 24rpx;
  color: #e53935;
  font-weight: 600;
}

.trans-sub-reason {
  font-size: 24rpx;
  color: #666666;
  line-height: 1.4;
}

.trans-sub-wrap > .trans-sub {
  margin-top: 0;
}

.trans-sub {
  display: block;
  font-size: 24rpx;
  color: #666666;
  margin-top: 6rpx;
  line-height: 1.4;
}

.trans-time {
  font-size: 24rpx;
  color: #999999;
  margin-top: 6rpx;
}

.trans-amount {
  font-size: 32rpx;
  font-weight: 600;
  color: #e53935;
}

.trans-amount.income {
  color: #4caf50;
}

.trans-withdraw-paid {
  color: #07c160;
}

.trans-amount-wrap.withdraw-failed {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 140rpx;
  min-height: 48rpx;
}

.withdraw-failed-text {
  font-size: 32rpx;
  font-weight: 600;
  color: #e53935;
  text-decoration: line-through;
  text-decoration-color: #e53935;
}

.withdraw-failed-x {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -52%);
  font-size: 52rpx;
  line-height: 1;
  opacity: 0.9;
  pointer-events: none;
}

// 弹窗样式
.popup-content {
  background: #ffffff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx;
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32rpx;
}

.popup-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #333333;
}

.popup-close {
  font-size: 48rpx;
  color: #999999;
  line-height: 1;
}

.withdraw-balance {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx;
  background: #f5f6f7;
  border-radius: 16rpx;
  margin-bottom: 24rpx;
}

.wb-label {
  font-size: 28rpx;
  color: #666666;
}

.wb-amount {
  font-size: 36rpx;
  font-weight: 600;
  color: #1a73e8;
}

.amount-options {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.amount-option {
  width: calc(33.33% - 12rpx);
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f6f7;
  border-radius: 12rpx;
  font-size: 30rpx;
  color: #333333;
  border: 2rpx solid transparent;
}

.amount-option.active {
  background: #e8f2ff;
  border-color: #1a73e8;
  color: #1a73e8;
}

.amount-option.disabled {
  opacity: 0.5;
}

.custom-amount {
  margin-bottom: 24rpx;
}

.input-label {
  font-size: 28rpx;
  color: #666666;
  margin-bottom: 12rpx;
  display: block;
}

.amount-input {
  width: 100%;
  height: 88rpx;
  background: #f5f6f7;
  border-radius: 12rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  box-sizing: border-box;
}

.confirm-btn {
  width: 100%;
  height: 96rpx;
  background: #1a73e8;
  color: #ffffff;
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: 600;
  border: none;
}

.withdraw-confirm {
  background: #ff6b00;
}

.guide-popup {
  width: 620rpx;
  max-width: calc(100vw - 48rpx);
  background: #ffffff;
  border-radius: 24rpx;
  padding: 30rpx;
  box-sizing: border-box;
  text-align: center;
}

.guide-popup-title {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #111827;
}

.guide-popup-tip {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #4b5563;
}

.guide-qr {
  width: 420rpx;
  height: 420rpx;
  margin: 24rpx auto 0;
  border-radius: 14rpx;
  border: 2rpx solid #e5e7eb;
  background: #f9fafb;
}

.guide-empty {
  margin-top: 20rpx;
  font-size: 24rpx;
  color: #9ca3af;
}

.guide-close {
  margin-top: 24rpx;
  width: 100%;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  border: none;
  background: #111827;
  color: #ffffff;
  font-size: 30rpx;
}
</style>
