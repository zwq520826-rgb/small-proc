<template>
  <view class="page">
    <view class="card">
      <view class="field">
        <text class="label">姓名</text>
        <input class="input" v-model="form.name" placeholder="请输入姓名" />
      </view>
      <view class="field">
        <text class="label">学号</text>
        <input class="input" v-model="form.student_no" placeholder="请输入学号" />
      </view>
      <view class="field">
        <text class="label">学院 + 班级</text>
        <input class="input" v-model="form.college_class" placeholder="例如：计算机学院 21级计科1班" />
      </view>
      <view class="field">
        <text class="label">身份证号</text>
        <input class="input" v-model="form.id_card" placeholder="请输入身份证号" />
      </view>
      <view class="field">
        <text class="label">手机号</text>
        <input class="input" v-model="form.mobile" placeholder="请输入手机号" />
      </view>
      <view class="field">
        <text class="label">图形验证码</text>
        <uni-captcha 
          ref="captchaRef" 
          scene="rider-verify" 
          v-model="form.captcha"
          :focus="focusCaptchaInput"
        />
      </view>
    </view>

    <view class="status-tip" v-if="profile">
      <text v-if="profile.status === 'approved'" class="ok">当前状态：已通过认证</text>
      <text v-else-if="profile.status === 'pending'" class="pending">当前状态：审核中，请等待管理员处理</text>
      <text v-else class="rejected">当前状态：未通过，请修改信息后重新提交</text>
    </view>

    <button class="submit-btn" @click="submit">提交认证</button>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const riderService = uniCloud.importObject('rider-service')

const form = ref({
  name: '',
  student_no: '',
  college_class: '',
  id_card: '',
  mobile: '',
  captcha: ''
})

const profile = ref(null)
const focusCaptchaInput = ref(false)
const captchaRef = ref(null)

const loadProfile = async () => {
  const res = await riderService.getMyProfile()
  if (res && res.code === 0 && res.data) {
    profile.value = res.data
    form.value.name = res.data.name || ''
    form.value.student_no = res.data.student_no || ''
    form.value.college_class = res.data.college_class || ''
    form.value.id_card = res.data.id_card || ''
    form.value.mobile = res.data.mobile || ''
  }
}


const submit = async () => {
  // 验证图形验证码
  if (!form.value.captcha || form.value.captcha.length !== 4) {
    focusCaptchaInput.value = true
    uni.showToast({ title: '请先输入图形验证码', icon: 'none' })
    return
  }
  
  try {
    uni.showLoading({ title: '提交中...' })
    const res = await riderService.submitApplication(form.value)
    uni.hideLoading()
    
    if (res.code === 0) {
      // 认证成功后提示并返回“我的”页面
      uni.showToast({
        title: res.message || '验证成功',
        icon: 'success',
        // 让跳转不被 toast 持续时间“看起来卡住”
        duration: 800
      })

      // 目的：/pages/mine/index 是 tabBar 页面，用 switchTab 最稳（自定义 tabBar 场景也兼容）
      uni.switchTab({
        url: '/pages/mine/index',
        fail: () => {
          // 兜底：极少数情况下 switchTab 失败，再用 reLaunch
          uni.reLaunch({ url: '/pages/mine/index' })
        }
      })
    } else {
      uni.showToast({ title: res.message || '提交失败', icon: 'none' })
      // 如果验证码错误，刷新图形验证码
      if (res.code === 'CAPTCHA_ERROR' || res.message?.includes('验证码')) {
        form.value.captcha = ''
        if (captchaRef.value) {
          captchaRef.value.getImageCaptcha()
        }
        focusCaptchaInput.value = true
      }
    }
  } catch (e) {
    uni.hideLoading()
    console.error('提交失败:', e)
    uni.showToast({ title: '提交失败', icon: 'none' })
    // 刷新图形验证码
    form.value.captcha = ''
    if (captchaRef.value) {
      captchaRef.value.getImageCaptcha()
    }
  }
}

onLoad(() => {
  loadProfile()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f7;
  padding: 20rpx 24rpx 40rpx;
  box-sizing: border-box;
}

.card {
  background: #ffffff;
  border-radius: 20rpx;
  padding: 24rpx;
}

.field {
  margin-bottom: 18rpx;
}

.label {
  display: block;
  font-size: 26rpx;
  color: #666666;
  margin-bottom: 6rpx;
}

.input {
  font-size: 28rpx;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #eeeeee;
}


.submit-btn {
  margin-top: 24rpx;
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  background: #007aff;
  color: #ffffff;
  font-size: 30rpx;
}

.status-tip {
  margin-top: 16rpx;
  padding: 12rpx 8rpx;
  font-size: 26rpx;
}

.ok {
  color: #2ecc71;
}

.pending {
  color: #f39c12;
}

.rejected {
  color: #e74c3c;
}
</style>

