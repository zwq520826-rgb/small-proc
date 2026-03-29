<template>
  <view class="home-root">
  <view class="page">
    <view v-if="isLoading" class="skeleton-container">
      <view class="skeleton banner pulse"></view>
      <view class="skeleton grid">
        <view class="skeleton grid-item pulse" v-for="i in 4" :key="i"></view>
      </view>
    </view>
    <view v-else-if="loadError" class="error-card">
      <view class="error-illustration">🙈</view>
      <text class="error-title">加载失败</text>
      <text class="error-desc">{{ loadError }}</text>
      <button class="retry-btn" @click="retryHome">重新加载</button>
    </view>
    <template v-else>
      <view class="top">
        <view class="location">
          <text class="pos">长江师范学院</text>
          <text class="bell">🔔</text>
        </view>
      </view>

      <swiper
        v-if="heroes.length"
        class="hero-swiper hero-card-only"
        :class="{ compact: heroSwiperCompact }"
        :indicator-dots="heroes.length > 1"
        indicator-color="rgba(255,255,255,0.45)"
        indicator-active-color="#ffffff"
        :autoplay="heroes.length > 1"
        :interval="4200"
        :circular="heroes.length > 1"
        :duration="350"
      >
        <swiper-item v-for="hero in heroes" :key="hero._id || hero.title">
          <view class="hero-card ad" :class="{ 'hero-with-banner': hero.image_file_id }">
            <image
              v-if="hero.image_file_id"
              class="hero-banner"
              :src="hero.image_file_id"
              mode="aspectFill"
              @tap="onHeroBannerTap(hero)"
            />
            <view class="hero-text-row">
              <view class="main">
                <text class="title">{{ hero.title }}</text>
                <text class="desc">{{ hero.desc }}</text>
              </view>
              <view v-if="hero.show_cta !== false" class="side" @tap.stop="onHeroCta(hero)">{{ hero.cta_text || '联系运营' }}</view>
            </view>
          </view>
        </swiper-item>
      </swiper>
      <view v-else class="hero-card hero-card-only ad">
        <view class="hero-text-row">
          <view class="main">
            <text class="title">品牌赞助位</text>
            <text class="desc">欢迎校内商家合作投放</text>
          </view>
          <view class="side" @tap.stop="onHeroCta(null)">联系运营</view>
        </view>
      </view>

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

      <view v-if="announcements.length" class="announce-section">
        <view class="announce-head">
          <text class="announce-title">公告</text>
        </view>
        <swiper
          class="announce-swiper"
          :indicator-dots="announcements.length > 1"
          indicator-color="rgba(0,0,0,0.2)"
          indicator-active-color="#1a73e8"
          :autoplay="announcements.length > 1"
          :interval="5000"
          :circular="announcements.length > 1"
          :duration="400"
        >
          <swiper-item v-for="a in announcements" :key="a._id">
            <view class="announce-slide">
              <image
                v-if="a.image_file_id"
                class="announce-img"
                :src="a.image_file_id"
                mode="aspectFill"
              />
              <view class="announce-body">
                <text class="announce-line-title">{{ a.title }}</text>
                <text class="announce-line-content">{{ a.content }}</text>
              </view>
            </view>
          </swiper-item>
        </swiper>
      </view>
    </template>
  </view>
  <TheTabBar />
  <!-- 必须放在 TabBar 之后，否则自定义底栏会盖住遮罩，导致无法关闭 -->
  <view
    v-if="showContactModal"
    class="contact-mask"
    @tap="closeContactModal"
  >
    <view class="contact-modal" @tap.stop>
      <view class="contact-close-x" @tap.stop="closeContactModal">×</view>
      <text class="contact-title">联系运营</text>
      <view class="contact-line">
        <text class="contact-label">请联系电话：</text>
        <text class="contact-phone" @tap.stop="copyPhone">{{ contactPhone }}</text>
      </view>
      <text class="contact-hint">点击号码可复制</text>
      <view class="contact-btn" @tap.stop="closeContactModal">知道了</view>
    </view>
  </view>
  </view>
</template>

<script setup>
import TheTabBar from '@/components/TheTabBar.vue'
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { requireLogin } from '@/utils/auth.js'

const configService = uniCloud.importObject('order-service')

const HOME_CACHE_KEY = 'home_content_cache_v1'
const HOME_CACHE_TTL = 5 * 60 * 1000 // 5 分钟

const isLoading = ref(true)
const heroes = ref([])
const announcements = ref([])
const loadError = ref('')

const features = [
  { icon: '/static/tabbar/kuaididaiqu.png', text: '快递代取', path: '/pages/client/forms/pickup' },
  { icon: '/static/tabbar/paotuifuwu.png', text: '跑腿服务', path: '/pages/client/forms/errand' }
]

const showContactModal = ref(false)
const contactPhone = '18608945191'

const heroSwiperCompact = computed(() => {
  if (!heroes.value.length) return false
  return heroes.value.every((h) => !h.image_file_id)
})

const openContactModal = () => {
  showContactModal.value = true
}

const handleHeroLink = (hero) => {
  const u = String((hero && hero.link_url) || '').trim()
  if (u) {
    if (u.startsWith('/pages')) {
      uni.navigateTo({ url: u })
    } else if (u.startsWith('http')) {
      uni.setClipboardData({
        data: u,
        success: () => {
          uni.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' })
        }
      })
    } else {
      uni.navigateTo({ url: u })
    }
  } else {
    openContactModal()
  }
}

const onHeroCta = (hero) => {
  handleHeroLink(hero)
}

const onHeroBannerTap = (hero) => {
  if (hero && hero.image_file_id) {
    handleHeroLink(hero)
  }
}

const formatErrorMessage = (err, fallback) => {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (typeof err.message === 'string' && err.message.trim()) return err.message
  return fallback
}

const loadHomeContent = async ({ showSkeleton = true } = {}) => {
  const readCache = () => {
    try {
      const raw = uni.getStorageSync(HOME_CACHE_KEY)
      if (!raw) return null
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!parsed || !parsed.ts || !parsed.data) return null
      return parsed
    } catch (e) {
      return null
    }
  }

  const writeCache = (data) => {
    try {
      uni.setStorageSync(HOME_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
    } catch (e) {
      // ignore storage errors
    }
  }

  const now = Date.now()
  const cache = readCache()

  if (cache && now - cache.ts < HOME_CACHE_TTL && cache.data) {
    heroes.value = cache.data.heroes || []
    announcements.value = cache.data.announcements || []
    isLoading.value = false
    // 后台刷新一次，不阻塞界面
    loadHomeContentFromCloud(false, writeCache)
    return
  }

  await loadHomeContentFromCloud(showSkeleton, writeCache)
}

const loadHomeContentFromCloud = async (showSkeleton = true, saveFn = () => {}) => {
  if (showSkeleton) isLoading.value = true
  loadError.value = ''
  try {
    const res = await configService.getHomeContent()
    if (!res || res.code !== 0 || !res.data) {
      throw new Error(res?.message || '未获取到首页内容')
    }
    const nextHeroes = (res.data.heroes || []).map((h) => ({
      _id: h._id || '',
      title: h.title || '品牌赞助位',
      desc: h.desc || '',
      cta_text: h.cta_text || '联系运营',
      show_cta: h.show_cta !== false,
      image_file_id: h.image_file_id || '',
      link_url: h.link_url || ''
    }))
    const nextAnnouncements = res.data.announcements || []
    heroes.value = nextHeroes
    announcements.value = nextAnnouncements
    saveFn({ heroes: nextHeroes, announcements: nextAnnouncements })
  } catch (e) {
    console.error('[home] loadHomeContent failed', e)
    loadError.value = formatErrorMessage(e, '首页内容加载失败，请稍后重试')
    if (!showSkeleton) {
      uni.showToast({ title: loadError.value, icon: 'none' })
    }
  } finally {
    isLoading.value = false
  }
}

const retryHome = () => {
  loadHomeContent({ showSkeleton: true })
}

const closeContactModal = () => {
  showContactModal.value = false
}

const copyPhone = () => {
  uni.setClipboardData({
    data: contactPhone,
    success: () => {
      uni.showToast({ title: '已复制到剪贴板', icon: 'none' })
    }
  })
}

const goFeature = (item) => {
  if (!item?.path) {
    uni.showToast({ title: '暂未开放', icon: 'none' })
    return
  }
  if (!requireLogin({ toast: '请先登录后使用该功能' })) {
    return
  }
  uni.navigateTo({ url: item.path })
}

onLoad(async () => {
  await loadHomeContent({ showSkeleton: true })
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

.hero-card-only {
  margin-top: 24rpx;
}
.hero-swiper {
  margin-top: 24rpx;
  height: 340rpx;
  border-radius: 20rpx;
  overflow: hidden;
}

.hero-swiper.compact {
  height: 220rpx;
}

.hero-card {
  min-height: 220rpx;
  background: #ffffff;
  color: #111827;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 24rpx;
  box-sizing: border-box;
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.06);
}

.hero-card.hero-with-banner {
  padding: 0;
  overflow: hidden;
}

.hero-banner {
  width: 100%;
  height: 220rpx;
  display: block;
  background: #f0f0f0;
}

.hero-text-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0;
  box-sizing: border-box;
  width: 100%;
}

.hero-text-row .main {
  flex: 1;
  min-width: 0;
  padding-right: 16rpx;
}

.hero-with-banner .hero-text-row {
  padding: 24rpx;
}

.hero-card .title {
  display: block;
  font-size: 32rpx;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: 0.6rpx;
  color: #111827;
  text-shadow: 0 1rpx 0 rgba(255, 255, 255, 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-card .desc {
  display: block;
  margin-top: 10rpx;
  font-size: 30rpx;
  line-height: 1.42;
  font-weight: 500;
  color: #4b5563;
  opacity: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hero-text-row .side {
  width: 132rpx;
  min-width: 132rpx;
  height: 92rpx;
  background: #eef2ff;
  border: 1rpx solid #dbe4ff;
  border-radius: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.2;
  color: #1f2f4a;
  font-weight: 600;
  box-sizing: border-box;
  flex-shrink: 0;
}

.hero-card.ad {
  background: #ffffff;
}

.grid {
  margin-top: 18rpx;
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

.announce-section {
  margin-top: 28rpx;
  background: #ffffff;
  border-radius: 20rpx;
  padding: 20rpx 20rpx 24rpx;
  box-shadow: 0 8rpx 26rpx rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}

.announce-head {
  margin-bottom: 16rpx;
}

.announce-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #111827;
}

.announce-swiper {
  width: 100%;
  height: 420rpx;
}

.announce-slide {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 16rpx;
  overflow: hidden;
  background: #f5f5f7;
  box-sizing: border-box;
}

.announce-img {
  width: 100%;
  height: 220rpx;
  flex-shrink: 0;
  background: #e5e7eb;
}

.announce-body {
  flex: 1;
  padding: 16rpx 18rpx 20rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  min-height: 0;
  overflow: hidden;
}

.announce-line-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #111827;
  line-height: 1.35;
}

.announce-line-content {
  font-size: 24rpx;
  color: #4b5563;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  overflow: hidden;
}

.contact-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  box-sizing: border-box;
}

.contact-modal {
  position: relative;
  width: 100%;
  max-width: 600rpx;
  background: #ffffff;
  border-radius: 24rpx;
  padding: 40rpx 32rpx 32rpx;
  box-sizing: border-box;
}

.contact-close-x {
  position: absolute;
  top: 16rpx;
  right: 24rpx;
  width: 56rpx;
  height: 56rpx;
  line-height: 52rpx;
  text-align: center;
  font-size: 44rpx;
  color: #9ca3af;
  font-weight: 300;
}

.contact-title {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  text-align: center;
  margin-bottom: 28rpx;
  color: #111827;
}

.contact-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8rpx;
  font-size: 30rpx;
  line-height: 1.5;
}

.contact-label {
  color: #374151;
}

.contact-phone {
  color: #1a73e8;
  font-weight: 600;
  text-decoration: underline;
}

.contact-hint {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #9ca3af;
}

.contact-btn {
  margin-top: 32rpx;
  width: 100%;
  background: #111827;
  color: #ffffff;
  border-radius: 999rpx;
  font-size: 28rpx;
  text-align: center;
  padding: 22rpx 0;
  font-weight: 500;
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

.error-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80rpx 40rpx;
  text-align: center;
  background: #ffffff;
  border-radius: 24rpx;
  box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
  margin-top: 80rpx;
  gap: 16rpx;
}

.error-illustration {
  font-size: 80rpx;
}

.error-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1f2f4a;
}

.error-desc {
  font-size: 26rpx;
  color: #6b7280;
}

.retry-btn {
  margin-top: 8rpx;
  width: 240rpx;
  background: #1a73e8;
  color: #ffffff;
}

@keyframes pulse {
  0% { left: -100%; }
  50% { left: 100%; }
  100% { left: 100%; }
}
</style>
