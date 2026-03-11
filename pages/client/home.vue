<template>
  <view class="page">
    <view v-if="!isLoading">
      <view class="top">
        <view class="location">
          <text class="pos">长江师范学院</text>
          <text class="bell">🔔</text>
        </view>
      </view>

      <swiper
        class="hero-swiper"
        indicator-dots
        autoplay
        circular
        interval="3500"
        indicator-color="rgba(255,255,255,0.35)"
        indicator-active-color="#ffffff"
      >
        <swiper-item v-for="(item, i) in slides" :key="i">
          <view class="hero-card" :class="item.type">
            <view class="main">
              <text class="title">{{ item.title }}</text>
              <text class="desc">{{ item.desc }}</text>
            </view>
            <view class="side">{{ item.cta }}</view>
          </view>
        </swiper-item>
      </swiper>

      <view class="grid">
        <view
          class="grid-item"
          v-for="item in features"
          :key="item.text"
          @click="goFeature(item)"
        >
          <image class="icon-img" :src="item.icon" mode="aspectFit" />
          <text class="name">{{ item.text }}</text>
        </view>
      </view>

      <view class="notice">
        <text class="tag">公告</text>
        <view class="marquee">
          <swiper v-if="announcements.length" autoplay circular interval="3000" vertical>
            <swiper-item v-for="(n, i) in announcements" :key="i">
              <text>{{ n }}</text>
            </swiper-item>
          </swiper>
          <view v-else class="empty">暂无公告</view>
        </view>
      </view>
    </view>

    <view v-else class="skeleton-container">
      <view class="skeleton banner pulse"></view>
      <view class="skeleton grid">
        <view class="skeleton grid-item pulse" v-for="i in 4" :key="i"></view>
      </view>
      <view class="skeleton list">
        <view class="skeleton line pulse"></view>
        <view class="skeleton line pulse"></view>
      </view>
    </view>
  </view>
  <TheTabBar />
</template>

<script setup>
import TheTabBar from '@/components/TheTabBar.vue'
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'

const isLoading = ref(true)
const slides = [
  { title: '校园兼职内推', desc: '社团、助教、勤工俭学信息速递', cta: '查看更多', type: 'job' },
  { title: '新学期寄件优惠', desc: '快递代取满 10 单立减 5 元', cta: '立即参与', type: 'promo' },
  { title: '品牌赞助位', desc: '欢迎校内商家合作投放', cta: '联系运营', type: 'ad' }
]

const features = [
  { icon: '/static/tabbar/kuaididaiqu.png', text: '快递代取', path: '/pages/client/forms/pickup' },
  { icon: '/static/tabbar/paotuifuwu.png', text: '跑腿服务', path: '/pages/client/forms/errand' }
]

const announcements = ref([])
const activeTasks = ref([])

const goFeature = (item) => {
  if (!item?.path) {
    uni.showToast({ title: '暂未开放', icon: 'none' })
    return
  }
  uni.navigateTo({ url: item.path })
}

onLoad(() => {
  isLoading.value = true
  setTimeout(() => {
    announcements.value = [
      '[公告] 双十一快递代取积压，请提前预约',
      '[通知] 打印服务上线，A4/彩印/装订均可'
    ]
    activeTasks.value = [
      { id: 't1', title: '取件 · 菜鸟驿站', status: '进行中' },
      { id: 't2', title: '帮寄 · 教学楼快递', status: '待取件' }
    ]
    isLoading.value = false
  }, 1500)
})

onShow(() => {
  uni.hideHomeButton()
})
</script>

<style scoped>
.page {
  padding: 24rpx 24rpx 140rpx;
  background: #f5f5f7;
  min-height: 100vh;
  box-sizing: border-box;
  padding-bottom: 100rpx;
}

.top .location {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 30rpx;
}

.bell {
  font-size: 34rpx;
}

.hero-swiper {
  margin-top: 24rpx;
  height: 220rpx;
}

.hero-card {
  height: 220rpx;
  background: #ffffff;
  color: #111827;
  border-radius: 20rpx;
  display: flex;
  justify-content: space-between;
  padding: 24rpx;
  box-sizing: border-box;
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.06);
}

.hero-card .title {
  font-size: 32rpx;
  font-weight: 700;
}

.hero-card .desc {
  display: block;
  margin-top: 8rpx;
  opacity: 0.8;
}

.hero-card .side {
  background: #f2f2f7;
  border-radius: 999rpx;
  padding: 12rpx 16rpx;
  font-weight: 600;
  height: fit-content;
}

.hero-card.job {
  background: #ffffff;
}

.hero-card.promo {
  background: #ffffff;
}

.hero-card.ad {
  background: #ffffff;
}

.grid {
  margin-top: 24rpx;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.grid-item {
  background: #ffffff;
  border-radius: 18rpx;
  padding: 30rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  font-size: 26rpx;
  box-shadow: 0 8rpx 26rpx rgba(0, 0, 0, 0.06);
  white-space: nowrap;
}

.grid-item .icon-img {
  width: 120rpx;
  height: 120rpx;
}

.notice {
  margin-top: 20rpx;
  background: #ffffff;
  border-radius: 14rpx;
  padding: 14rpx;
  display: flex;
  align-items: center;
}

.notice .tag {
  background: #e8f2ff;
  color: #1a73e8;
  border-radius: 10rpx;
  padding: 6rpx 12rpx;
  font-size: 22rpx;
  margin-right: 12rpx;
}

.marquee {
  flex: 1;
  height: 50rpx;
  overflow: hidden;
}

.empty {
  color: #9aa6b8;
  font-size: 24rpx;
}

.skeleton-container {
  padding-top: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.skeleton {
  background: #e9edf3;
  border-radius: 12rpx;
}

.skeleton.banner {
  height: 300rpx;
}

.skeleton.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16rpx;
}

.skeleton.grid-item {
  height: 160rpx;
}

.skeleton.list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.skeleton.line {
  height: 50rpx;
}

.pulse {
  position: relative;
  overflow: hidden;
}

.pulse::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0% { left: -100%; }
  50% { left: 100%; }
  100% { left: 100%; }
}
</style>

