<script>
	import uniIdPageInit from '@/uni_modules/uni-id-pages/init.js';
	import { ensureSessionAlive } from '@/utils/auth.js';
	export default {
		onLaunch: async function() {
			await uniIdPageInit()
			ensureSessionAlive({ silent: true })
		},
		onShow: function() {
			ensureSessionAlive()
		},
		onHide: function() {}
	}
</script>

<style>
	/* 全局基础样式：iOS 简约风 */
	page {
		font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
		background-color: #f5f5f7;
		color: #111827;
	}

	button {
		border-radius: 999rpx;
		font-size: 28rpx;
	}
</style>
