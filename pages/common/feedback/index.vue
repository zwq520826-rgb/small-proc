<template>
	<view class="fb-page">
		<view class="type-row">
			<text class="label">类型</text>
			<view class="type-btns">
				<button
					class="type-btn"
					:class="{ active: feedbackKind === 'complaint' }"
					@click="feedbackKind = 'complaint'"
				>
					投诉
				</button>
				<button
					class="type-btn"
					:class="{ active: feedbackKind === 'suggestion' }"
					@click="feedbackKind = 'suggestion'"
				>
					建议
				</button>
			</view>
		</view>

		<view class="block">
			<text class="label">说明</text>
			<textarea
				class="textarea"
				v-model="content"
				:placeholder="feedbackKind === 'complaint' ? '请描述您遇到的问题…' : '请写下您的建议…'"
				maxlength="2000"
			/>
			<text class="count">{{ content.length }}/2000</text>
		</view>

		<view class="block">
			<text class="label">图片（选填，最多 6 张）</text>
			<view class="img-grid">
				<view v-for="(img, idx) in localImages" :key="idx" class="img-item">
					<image :src="img" mode="aspectFill" class="img" @click="preview(idx)" />
					<text class="img-del" @click.stop="removeImg(idx)">×</text>
				</view>
				<view v-if="localImages.length < 6" class="img-add" @click="chooseImages">
					<text class="plus">+</text>
					<text class="add-text">添加</text>
				</view>
			</view>
		</view>

		<view class="bottom">
			<button class="submit" :loading="submitting" @click="submit">提交</button>
		</view>
	</view>
</template>

<script setup>
import { ref } from 'vue'
import { store } from '@/uni_modules/uni-id-pages/common/store.js'

const feedbackKind = ref('complaint')
const content = ref('')
const localImages = ref([])
const submitting = ref(false)

const chooseImages = () => {
	const remain = 6 - localImages.value.length
	if (remain <= 0) return
	uni.chooseImage({
		count: remain,
		sizeType: ['compressed'],
		sourceType: ['album', 'camera'],
		success: (res) => {
			const paths = res.tempFilePaths || []
			paths.forEach((p) => {
				if (localImages.value.length >= 6) return
				localImages.value.push(p)
			})
		}
	})
}

const removeImg = (idx) => {
	localImages.value.splice(idx, 1)
}

const preview = (idx) => {
	uni.previewImage({ urls: localImages.value, current: idx })
}

const submit = async () => {
	const uid = store.userInfo && store.userInfo._id
	if (!uid) {
		uni.showToast({ title: '请先登录', icon: 'none' })
		return
	}
	const text = content.value.trim()
	if (!text) {
		uni.showToast({ title: '请填写说明', icon: 'none' })
		return
	}

	submitting.value = true
	uni.showLoading({ title: '提交中…', mask: true })
	try {
		const fileIds = []
		for (let i = 0; i < localImages.value.length; i++) {
			const p = localImages.value[i]
			const ext = p.match(/\.(\w+)$/) ? RegExp.$1 : 'jpg'
			const cloudPath = `complaints/${uid}/${Date.now()}_${i}.${ext}`
			const up = await uniCloud.uploadFile({ filePath: p, cloudPath })
			if (up.fileID) fileIds.push(up.fileID)
		}

		const db = uniCloud.database()
		await db.collection('complaints').add({
			user_id: uid,
			type: feedbackKind.value === 'complaint' ? 'service' : 'other',
			content: text,
			feedback_kind: feedbackKind.value,
			images: fileIds,
			status: 'pending'
		})

		uni.hideLoading()
		uni.showToast({ title: '提交成功', icon: 'success' })
		setTimeout(() => uni.navigateBack(), 1200)
	} catch (e) {
		console.error(e)
		uni.hideLoading()
		uni.showToast({ title: e.message || '提交失败', icon: 'none' })
	} finally {
		submitting.value = false
	}
}
</script>

<style lang="scss" scoped>
.fb-page {
	min-height: 100vh;
	background: #f5f6f7;
	padding: 24rpx;
	padding-bottom: 180rpx;
}
.type-row {
	background: #fff;
	border-radius: 16rpx;
	padding: 24rpx;
	margin-bottom: 24rpx;
}
.label {
	font-size: 28rpx;
	color: #333;
	font-weight: 600;
	display: block;
	margin-bottom: 16rpx;
}
.type-btns {
	display: flex;
	gap: 24rpx;
}
.type-btn {
	flex: 1;
	height: 72rpx;
	line-height: 72rpx;
	font-size: 28rpx;
	background: #f0f0f0;
	color: #666;
	border: none;
	border-radius: 12rpx;
}
.type-btn.active {
	background: #e8f1ff;
	color: #1a73e8;
	font-weight: 600;
}
.block {
	background: #fff;
	border-radius: 16rpx;
	padding: 24rpx;
	margin-bottom: 24rpx;
}
.textarea {
	width: 100%;
	min-height: 240rpx;
	font-size: 28rpx;
	line-height: 1.6;
}
.count {
	font-size: 22rpx;
	color: #999;
	text-align: right;
	display: block;
	margin-top: 8rpx;
}
.img-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 16rpx;
}
.img-item {
	width: 200rpx;
	height: 200rpx;
	position: relative;
	border-radius: 12rpx;
	overflow: hidden;
}
.img {
	width: 100%;
	height: 100%;
}
.img-del {
	position: absolute;
	right: 8rpx;
	top: 4rpx;
	width: 44rpx;
	height: 44rpx;
	line-height: 40rpx;
	text-align: center;
	background: rgba(0, 0, 0, 0.5);
	color: #fff;
	border-radius: 50%;
	font-size: 32rpx;
}
.img-add {
	width: 200rpx;
	height: 200rpx;
	border: 2rpx dashed #ccc;
	border-radius: 12rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	color: #999;
}
.plus {
	font-size: 56rpx;
	line-height: 1;
}
.add-text {
	font-size: 24rpx;
	margin-top: 8rpx;
}
.bottom {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
	background: #fff;
	box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.06);
}
.submit {
	width: 100%;
	height: 88rpx;
	line-height: 88rpx;
	background: linear-gradient(135deg, #1a73e8, #4fc3f7);
	color: #fff;
	font-size: 30rpx;
	border-radius: 44rpx;
	border: none;
}
</style>
