<!-- 我的页面 -->
<template>
  <scroll-view class="mine-page" scroll-y>
    <view class="blue-header">
      <view class="header-top">
        <view class="avatar-wrap">
          <uni-id-pages-avatar width="120rpx" height="120rpx"></uni-id-pages-avatar>
        </view>
        <view class="user-info">
          <text class="nickname">{{ displayNickname }}</text>
          <text class="uid" v-if="userInfo.studentNo">学号: {{ userInfo.studentNo }}</text>
          <text class="uid" v-else-if="!userInfo._id">未登录</text>
        </view>
        <text class="edit-btn" @click="userInfo._id ? setNickname('') : login()">{{ userInfo._id ? '编辑名称' : '登录' }}</text>
      </view>
    </view>

    <view class="orange-card" v-if="!isRiderMode" @click="goBecomeRider">
      <view class="orange-left">
        <image class="orange-icon-img" src="/static/tabbar/kuaididaiqu.png" mode="aspectFit" />
      </view>
      <view class="orange-middle">
        <text class="orange-title">成为骑手</text>
        <text class="orange-sub">开启接单模式，赚取额外收入</text>
      </view>
    </view>

    <view class="menu-card">
      <view class="menu-item" @click="goWallet">
        <view class="menu-left">
          <image class="menu-icon-img" src="/static/tabbar/wodeqianbao.png" mode="aspectFit" />
          <text class="menu-text">我的钱包</text>
        </view>
        <view class="menu-right">
          <text class="menu-extra">¥{{ walletAmount }}</text>
        </view>
      </view>

      <view class="menu-item" @click="goAddress">
        <view class="menu-left">
          <image class="menu-icon-img" src="/static/tabbar/wodedizhi.png" mode="aspectFit" />
          <text class="menu-text">收货地址</text>
        </view>
      </view>

      <view class="menu-item" @click="goMessages">
        <view class="menu-left">
          <image class="menu-icon-img" src="/static/tabbar/xiaoxitonzhi.png" mode="aspectFit" />
          <text class="menu-text">消息通知</text>
        </view>
      </view>

      <view class="menu-item" @click="goService">
        <view class="menu-left">
          <image class="menu-icon-img" src="/static/tabbar/zaixiankefu.png" mode="aspectFit" />
          <text class="menu-text">联系客服</text>
        </view>
      </view>

      <view class="menu-item" @click="goHelp">
        <view class="menu-left">
          <image class="menu-icon-img" src="/static/tabbar/bangzhuzhonxin.png" mode="aspectFit" />
          <text class="menu-text">建议&投诉</text>
        </view>
      </view>

      <view class="menu-item" @click="goSettings">
        <view class="menu-left">
          <image class="menu-icon-img" src="/static/tabbar/shezhi.png" mode="aspectFit" />
          <text class="menu-text">设置</text>
        </view>
      </view>
    </view>

    <view class="menu-card" v-if="isRiderMode">
      <view class="menu-item" @click="goClientMode">
        <view class="menu-left">
          <text class="menu-icon">↩️</text>
          <text class="menu-text">切回用户端</text>
        </view>
      </view>
    </view>

    <view class="logout-row" v-if="showLoginManage">
      <button v-if="userInfo._id" class="logout-btn" @click="logout">退出登录</button>
      <button v-else class="login-btn" @click="login">去登录</button>
    </view>

    <uni-popup ref="dialog" type="dialog">
      <uni-popup-dialog
        mode="input"
        :value="userInfo.nickname"
        @confirm="setNickname"
        :inputType="setNicknameIng?'nickname':'text'"
        title="设置昵称"
        placeholder="请输入要设置的昵称"
      />
    </uni-popup>

    <uni-popup ref="servicePopup" type="center">
      <view class="service-popup" @click.stop>
        <text class="service-popup-title">联系客服</text>
        <text class="service-popup-phone">{{ servicePhone }}</text>
        <view class="service-popup-actions">
          <button class="service-popup-btn primary" @click="copyServicePhone">复制号码</button>
          <button class="service-popup-btn ghost" @click="closeServicePopup">关闭</button>
        </view>
      </view>
    </uni-popup>
    <uni-id-pages-bind-mobile ref="bind-mobile-by-sms" @success="bindMobileSuccess"></uni-id-pages-bind-mobile>
  </scroll-view>
  <TheTabBar />
</template>
<script>
const uniIdCo = uniCloud.importObject("uni-id-co")
const riderService = uniCloud.importObject("rider-service")
  import {
    store,
    mutations
  } from '@/uni_modules/uni-id-pages/common/store.js'
  import { isRiderMode as checkRiderMode, switchToRider, switchToClient } from '@/store/user.js'
  import { useWalletStore } from '@/store/wallet.js'
  import TheTabBar from '@/components/TheTabBar.vue'
	export default {
    components: {
      TheTabBar
    },
    computed: {
      userInfo() {
        return store.userInfo
      },
      displayNickname() {
        if (this.userInfo.nickname) return this.userInfo.nickname
        if (this.userInfo._id) return this.getDefaultNickname()
        return '点击登录/完善资料'
      },
      isRiderMode() {
        return checkRiderMode()
      },
	    realNameStatus () {
		    if (!this.userInfo.realNameAuth) {
			    return 0
		    }

		    return this.userInfo.realNameAuth.authStatus
	    },
      walletAmount() {
        return this.walletStore ? this.walletStore.balance : 0
      }
    },
		data() {
			return {
				univerifyStyle: {
					authButton: {
						"title": "本机号码一键绑定", // 授权按钮文案
					},
					otherLoginButton: {
						"title": "其他号码绑定",
					}
				},
				hasPwd: false,
				showLoginManage: true,
				setNicknameIng:false,
        stats: {
          totalOrders: 23,
          credit: 4.9,
          points: 580
        },
        walletStore: null,
        couponCount: 3,
        servicePhone: '18608945191'
			}
		},
    watch: {
      // 登录态变化后，重新拉一次钱包，避免首次进入时未登录导致钱包为 0 且后续不刷新
      'userInfo._id': {
        immediate: true,
        handler: async function (val) {
          if (!val) return
          if (!this.walletStore) this.walletStore = useWalletStore()
          await this.walletStore.loadFromCloud()
        }
      }
    },
		async onShow() {
			this.univerifyStyle.authButton.title = "本机号码一键绑定"
			this.univerifyStyle.otherLoginButton.title = "其他号码绑定"
			// 刷新钱包余额
			if (this.walletStore) {
				await this.walletStore.loadFromCloud()
			}
		},
		async onLoad(e) {
			if (e.showLoginManage) {
				this.showLoginManage = true //通过页面传参隐藏登录&退出登录按钮
			}
			//判断当前用户是否有密码，否则就不显示密码修改功能
			let res = await uniIdCo.getAccountInfo()
			this.hasPwd = res.isPasswordSet
			// 初始化钱包 store
			this.walletStore = useWalletStore()
		},
		methods: {
      // 默认昵称：同学 + 长度为 3 的“数字或英文”随机组合，并按 uid 缓存保证稳定展示
			getDefaultNickname() {
				const uid = this.userInfo && this.userInfo._id ? String(this.userInfo._id) : ''
				if (!uid) return '点击登录/完善资料'

				const cacheKey = `default_nickname_${uid}`
				const cached = uni.getStorageSync(cacheKey)
				if (cached && typeof cached === 'string') return cached

				const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
				let code = ''
				for (let i = 0; i < 3; i++) {
					code += chars.charAt(Math.floor(Math.random() * chars.length))
				}

				const nickname = `同学${code}`
				uni.setStorageSync(cacheKey, nickname)
				return nickname
			},
			login() {
				uni.navigateTo({
					url: '/uni_modules/uni-id-pages/pages/login/login-withoutpwd',
					complete: (e) => {
						// console.log(e);
					}
				})
			},
			logout() {
				mutations.logout()
			},
			bindMobileSuccess() {
				mutations.updateUserInfo()
			},
			changePassword() {
				uni.navigateTo({
					url: '/uni_modules/uni-id-pages/pages/userinfo/change_pwd/change_pwd',
					complete: (e) => {
						// console.log(e);
					}
				})
			},
			bindMobile() {
				// #ifdef APP-PLUS
				uni.preLogin({
					provider: 'univerify',
					success: this.univerify(), //预登录成功
					fail: (res) => { // 预登录失败
						// 不显示一键登录选项（或置灰）
						console.log(res)
						this.bindMobileBySmsCode()
					}
				})
				// #endif

				// #ifdef MP-WEIXIN
				this.$refs['bind-mobile-by-sms'].open()
				// #endif

				// #ifdef H5
				//...去用验证码绑定
				this.bindMobileBySmsCode()
				// #endif
			},
			univerify() {
				uni.login({
					"provider": 'univerify',
					"univerifyStyle": this.univerifyStyle,
					success: async e => {
						uniIdCo.bindMobileByUniverify(e.authResult).then(res => {
							mutations.updateUserInfo()
						}).catch(e => {
							console.log(e);
						}).finally(e => {
							// console.log(e);
							uni.closeAuthView()
						})
					},
					fail: (err) => {
						console.log(err);
						if (err.code == '30002' || err.code == '30001') {
							this.bindMobileBySmsCode()
						}
					}
				})
			},
			bindMobileBySmsCode() {
				uni.navigateTo({
					url: '/uni_modules/uni-id-pages/pages/userinfo/bind-mobile/bind-mobile'
				})
			},
			setNickname(nickname) {
				if (nickname) {
					mutations.updateUserInfo({
						nickname
					})
					this.setNicknameIng = false
					this.$refs.dialog.close()
				} else {
					this.$refs.dialog.open()
				}
			},
			deactivate(){
				uni.navigateTo({
					url:"/uni_modules/uni-id-pages/pages/userinfo/deactivate/deactivate"
				})
			},
      goOrders() {
        uni.reLaunch({
          url: '/pages/client/orders/list'
        })
      },
      goWallet() {
        uni.navigateTo({ url: '/pages/common/wallet/index' })
      },
      goAddress() {
        uni.navigateTo({
          url: '/pages/common/address/list'
        })
      },
      goFavorite() {
        uni.showToast({ title: '我的收藏（待实现）', icon: 'none' })
      },
      goCoupon() {
        uni.showToast({ title: '优惠券（待实现）', icon: 'none' })
      },
      goMessages() {
        uni.showToast({ title: '消息通知（待实现）', icon: 'none' })
      },
      goService() {
        this.$refs.servicePopup && this.$refs.servicePopup.open()
      },
      closeServicePopup() {
        this.$refs.servicePopup && this.$refs.servicePopup.close()
      },
      copyServicePhone() {
        uni.setClipboardData({
          data: this.servicePhone,
          success: () => {
            uni.showToast({ title: '已复制', icon: 'success' })
          }
        })
      },
      goHelp() {
        uni.navigateTo({ url: '/pages/common/feedback/index' })
      },
      goSettings() {
        uni.showToast({ title: '设置（待实现）', icon: 'none' })
      },
      /**
       * 切换到骑手端
       * - 如果未完成骑手实名认证，则先跳转到认证页面
       * - 只有认证通过(approved)后才真正切换模式
       */
      async goBecomeRider() {
        if (!this.userInfo || !this.userInfo._id) {
          uni.showToast({ title: '请先登录', icon: 'none' })
          return
        }

        try {
          const res = await riderService.getMyProfile()
          const profile = res && res.code === 0 ? res.data : null

          if (!profile) {
            // 没有资料时，引导去填写认证信息
            uni.navigateTo({ url: '/pages/rider/verify' })
            return
          }

          // 取消审核流程：只要有一份资料就视为已通过，直接切换到骑手端
          switchToRider()
          uni.reLaunch({ 
            url: '/pages/rider/hall',
            success: () => {
              uni.showToast({
                title: '已切换到骑手端',
                icon: 'success',
                duration: 1500
              })
            }
          })
        } catch (e) {
          uni.showToast({ title: '获取认证信息失败，请稍后重试', icon: 'none' })
        }
      },
      /**
       * 切回用户端
       * 1. 修改本地存储 user_mode 为 'client'
       * 2. 使用 reLaunch 跳转到用户端首页
       */
      goClientMode() {
        switchToClient()
        uni.reLaunch({ 
          url: '/pages/client/home',
          success: () => {
            uni.showToast({
              title: '已切换到用户端',
              icon: 'success',
              duration: 1500
            })
          }
        })
      },
			async bindThirdAccount(provider) {
				const uniIdCo = uniCloud.importObject("uni-id-co")
				const bindField = {
					weixin: 'wx_openid',
					alipay: 'ali_openid',
					apple: 'apple_openid',
					qq: 'qq_openid'
				}[provider.toLowerCase()]

				if (this.userInfo[bindField]) {
					await uniIdCo['unbind' + provider]()
					await mutations.updateUserInfo()
				} else {
					uni.login({
						provider: provider.toLowerCase(),
						onlyAuthorize: true,
						success: async e => {
							const res = await uniIdCo['bind' + provider]({
								code: e.code
							})
							if (res.errCode) {
								uni.showToast({
									title: res.errMsg || '绑定失败',
									duration: 3000
								})
							}
							await mutations.updateUserInfo()
						},
						fail: async (err) => {
							console.log(err);
							uni.hideLoading()
						}
					})
				}
			},
			realNameVerify () {
				uni.navigateTo({
					url: "/uni_modules/uni-id-pages/pages/userinfo/realname-verify/realname-verify"
				})
			}
		}
	}
</script>
<style lang="scss" scoped>
  .mine-page {
    min-height: 100vh;
    background: #f5f5f7;
  }

  /* 顶部 iOS 风格个人卡片 */
  .blue-header {
    padding: 40rpx 24rpx 24rpx;
    background: transparent;
  }

  .header-top {
    display: flex;
    align-items: center;
  }

  .avatar-wrap {
    width: 120rpx;
    height: 120rpx;
    border-radius: 60rpx;
    background: #f2f2f7;
    align-items: center;
    justify-content: center;
    margin-right: 24rpx;
    position: relative;
  }

  .user-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .nickname {
    font-size: 34rpx;
    font-weight: 600;
    color: #111827;
  }

  .uid {
    margin-top: 6rpx;
    font-size: 24rpx;
    color: #6b7280;
  }
  

  .edit-btn {
    font-size: 26rpx;
    color: #007aff;
  }

  .stat-row {
    margin-top: 24rpx;
    background: #ffffff;
    border-radius: 20rpx;
    padding: 18rpx 0;
    display: flex;
    justify-content: space-around;
    box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.05);
  }

  .stat-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .stat-num {
    display: block;
    text-align: center;
    font-size: 32rpx;
    font-weight: 600;
    color: #111827;
  }

  .stat-label {
    margin-top: 6rpx;
    text-align: center;
    font-size: 24rpx;
    color: #9ca3af;
  }

  .orange-card {
    margin: 16rpx 24rpx 0;
    background: #ffffff;
    border-radius: 20rpx;
    padding: 24rpx;
    flex-direction: row;
    align-items: center;
    box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.04);
  }

  .orange-left {
    width: 96rpx;
    align-items: center;
  }

  .orange-icon {
    font-size: 44rpx;
    color: #ff9500;
  }

  .orange-icon-img {
    width: 72rpx;
    height: 72rpx;
    border-radius: 20rpx;
  }

  .orange-middle {
    flex: 1;
  }

  .orange-title {
    font-size: 30rpx;
    color: #111827;
    font-weight: 600;
  }

  .orange-sub {
    margin-top: 6rpx;
    font-size: 24rpx;
    color: #6b7280;
  }

  .orange-right {
    width: 40rpx;
    align-items: center;
  }

  .menu-card {
    margin: 16rpx 24rpx 0;
    background: #ffffff;
    border-radius: 20rpx;
    padding-left: 24rpx;
    box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.03);
  }

  .menu-item {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 26rpx 24rpx 26rpx 0;
  }

  .menu-left {
    flex-direction: row;
    align-items: center;
  }

  .menu-icon {
    width: 48rpx;
    text-align: center;
    margin-right: 18rpx;
    font-size: 36rpx;
  }

  .menu-icon-img {
    width: 48rpx;
    height: 48rpx;
    margin-right: 18rpx;
    border-radius: 12rpx;
  }

  .menu-text {
    font-size: 28rpx;
    color: #333333;
    margin-top: -4rpx;
  }

  .menu-right {
    flex-direction: row;
    align-items: center;
  }

  .menu-extra {
    font-size: 26rpx;
    color: #999999;
    margin-right: 8rpx;
  }

  .logout-row {
    margin: 32rpx 24rpx 40rpx;
  }

  .logout-btn,
  .login-btn {
    width: 100%;
    border-radius: 999rpx;
    line-height: 88rpx;
    background-color: #ffffff;
    color: #e54d42;
    border: 1rpx solid #e54d42;
  }

  .service-popup {
    width: 560rpx;
    padding: 40rpx 32rpx 32rpx;
    background: #ffffff;
    border-radius: 24rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .service-popup-title {
    font-size: 32rpx;
    font-weight: 600;
    color: #111827;
    margin-bottom: 24rpx;
  }

  .service-popup-phone {
    font-size: 40rpx;
    font-weight: 600;
    color: #007aff;
    letter-spacing: 2rpx;
    margin-bottom: 36rpx;
  }

  .service-popup-actions {
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 20rpx;
  }

  .service-popup-btn {
    flex: 1;
    border-radius: 999rpx;
    font-size: 28rpx;
    line-height: 76rpx;
    margin: 0;
    padding: 0;
  }

  .service-popup-btn.primary {
    background: #007aff;
    color: #ffffff;
    border: none;
  }

  .service-popup-btn.ghost {
    background: #f3f4f6;
    color: #374151;
    border: none;
  }
</style>

