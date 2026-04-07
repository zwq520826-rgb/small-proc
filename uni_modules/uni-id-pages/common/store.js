import pagesJson from '@/pages.json'
import config from '@/uni_modules/uni-id-pages/config.js'

const uniIdCo = uniCloud.importObject("uni-id-co")

function getModeHomePath() {
	const mode = uni.getStorageSync('user_mode')
	return mode === 'rider' ? '/pages/rider/hall' : '/pages/client/home'
}

// 避免在模块加载阶段就访问 uniCloud（某些运行环境/未绑定云空间时 uniCloud.database 可能不可用，导致直接崩溃）
function getUsersTable() {
	// #ifdef MP
	// 小程序端如果没正确启用/绑定 uniCloud，这里会是 undefined
	// #endif
	try {
		if (typeof uniCloud === 'undefined' || !uniCloud || typeof uniCloud.database !== 'function') {
			return null
		}
		const db = uniCloud.database()
		if (!db || typeof db.collection !== 'function') return null
		return db.collection('uni-id-users')
	} catch (e) {
		return null
	}
}

let hostUserInfo = uni.getStorageSync('uni-id-pages-userInfo')||{}
// console.log( hostUserInfo);
const data = {
	userInfo: hostUserInfo,
	hasLogin: Object.keys(hostUserInfo).length != 0
}

// console.log('data', data);
// 定义 mutations, 修改属性
export const mutations = {
	// data不为空，表示传递要更新的值(注意不是覆盖是合并),什么也不传时，直接查库获取更新
	async updateUserInfo(data = false) {
		const usersTable = getUsersTable()
		if (!usersTable) {
			// 不要让整个页面崩掉，给出可理解的提示
			// 典型原因：未开通/未绑定uniCloud云空间；未部署 uni-id-co / uni-id-users；或运行环境不支持
			console.error('[uni-id-pages] uniCloud.database() 不可用：请检查是否已开通并绑定 uniCloud 云空间、并部署 uni-id-co/uni-id-users。')
			// 清理本地缓存的登录态，避免一直以为已登录
			this.setUserInfo({}, { cover: true })
			return
		}
		if (data) {
			usersTable.where('_id==$env.uid').update(data).then(e => {
				// console.log(e);
				if (e.result.updated) {
					uni.showToast({
						title: "更新成功",
						icon: 'none',
						duration: 3000
					});
					this.setUserInfo(data)
				} else {
					uni.showToast({
						title: "没有改变",
						icon: 'none',
						duration: 3000
					});
				}
			})

		} else {
			const uniIdCo = uniCloud.importObject("uni-id-co", {
				customUI: true
			})
			try {
				let res = await usersTable.where("'_id' == $cloudEnv_uid")
					.field('mobile,nickname,username,email,avatar_file')
					.get()

				const realNameRes = await uniIdCo.getRealNameInfo()

				// console.log('fromDbData',res.result.data);
				this.setUserInfo({
					...res.result.data[0],
					realNameAuth: realNameRes
				})
			} catch (e) {
				this.setUserInfo({},{cover:true})
				console.error(e.message, e.errCode);
			}
		}
	},
	async setUserInfo(data, {cover}={cover:false}) {
		// console.log('set-userInfo', data);
		let userInfo = cover?data:Object.assign(store.userInfo,data)
		store.userInfo = Object.assign({},userInfo)
		store.hasLogin = Object.keys(store.userInfo).length != 0
		// console.log('store.userInfo', store.userInfo);
		uni.setStorageSync('uni-id-pages-userInfo', store.userInfo)
		return data
	},
	async logout() {
		// 1. 已经过期就不需要调用服务端的注销接口	2.即使调用注销接口失败，不能阻塞客户端
		if(uniCloud.getCurrentUserInfo().tokenExpired > Date.now()){
			try{
				await uniIdCo.logout()
			}catch(e){
				console.error(e);
			}
		}
		uni.removeStorageSync('uni_id_token');
		uni.setStorageSync('uni_id_token_expired', 0)
		uni.redirectTo({
			url: `/${pagesJson.uniIdRouter && pagesJson.uniIdRouter.loginPage ? pagesJson.uniIdRouter.loginPage: 'uni_modules/uni-id-pages/pages/login/login-withoutpwd'}`,
		});
		uni.$emit('uni-id-pages-logout')
		this.setUserInfo({},{cover:true})
	},

	loginBack (e = {}) {
		const {uniIdRedirectUrl = ''} = e
		let delta = 0; //判断需要返回几层
		let pages = getCurrentPages();
		// console.log(pages);
		pages.forEach((page, index) => {
			if (pages[pages.length - index - 1].route.split('/')[3] == 'login') {
				delta++
			}
		})
		// console.log('判断需要返回几层:', delta);
		if (uniIdRedirectUrl) {
			return uni.redirectTo({
				url: uniIdRedirectUrl,
				fail: (err1) => {
					uni.switchTab({
						url:uniIdRedirectUrl,
						fail: (err2) => {
							console.log(err1,err2)
						}
					})
				}
			})
		}
		// #ifdef H5
		if (e.loginType == 'weixin') {
			// console.log('window.history', window.history);
			return window.history.go(-3)
		}
		// #endif

		if (delta) {
			return uni.reLaunch({
				url: getModeHomePath()
			})
		}

		uni.navigateBack({
			delta
		})
	},
	loginSuccess(e = {}){
		const {
			showToast = true, toastText = '登录成功', autoBack = true, uniIdRedirectUrl = '', passwordConfirmed
		} = e
		// console.log({toastText,autoBack});
		if (showToast) {
			uni.showToast({
				title: toastText,
				icon: 'none',
				duration: 3000
			});
		}
		this.updateUserInfo()

		uni.$emit('uni-id-pages-login-success')

		if (config.setPasswordAfterLogin && !passwordConfirmed) {
			return uni.redirectTo({
				url: uniIdRedirectUrl ? `/uni_modules/uni-id-pages/pages/userinfo/set-pwd/set-pwd?uniIdRedirectUrl=${uniIdRedirectUrl}&loginType=${e.loginType}`: `/uni_modules/uni-id-pages/pages/userinfo/set-pwd/set-pwd?loginType=${e.loginType}`,
				fail: (err) => {
					console.log(err)
				}
			})
		}

		if (autoBack) {
			this.loginBack({uniIdRedirectUrl})
		}
	}

}

// #ifdef VUE2
import Vue from 'vue'
// 通过Vue.observable创建一个可响应的对象
export const store = Vue.observable(data)
// #endif

// #ifdef VUE3
import {
	reactive
} from 'vue'
// 通过Vue.observable创建一个可响应的对象
export const store = reactive(data)
// #endif
