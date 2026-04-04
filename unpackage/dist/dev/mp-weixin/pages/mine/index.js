"use strict";
const common_vendor = require("../../common/vendor.js");
const uni_modules_uniIdPages_common_store = require("../../uni_modules/uni-id-pages/common/store.js");
const store_user = require("../../store/user.js");
const store_wallet = require("../../store/wallet.js");
const common_assets = require("../../common/assets.js");
const uniIdCo = common_vendor._r.importObject("uni-id-co");
const riderService = common_vendor._r.importObject("rider-service");
const TheTabBar = () => "../../components/TheTabBar.js";
const _sfc_main = {
  components: {
    TheTabBar
  },
  computed: {
    userInfo() {
      return uni_modules_uniIdPages_common_store.store.userInfo;
    },
    displayNickname() {
      if (this.userInfo.nickname)
        return this.userInfo.nickname;
      if (this.userInfo._id)
        return this.getDefaultNickname();
      return "点击登录/完善资料";
    },
    isRiderMode() {
      return store_user.isRiderMode();
    },
    realNameStatus() {
      if (!this.userInfo.realNameAuth) {
        return 0;
      }
      return this.userInfo.realNameAuth.authStatus;
    },
    walletAmount() {
      return this.walletStore ? this.walletStore.balance : 0;
    }
  },
  data() {
    return {
      univerifyStyle: {
        authButton: {
          "title": "本机号码一键绑定"
          // 授权按钮文案
        },
        otherLoginButton: {
          "title": "其他号码绑定"
        }
      },
      hasPwd: false,
      showLoginManage: true,
      setNicknameIng: false,
      stats: {
        totalOrders: 23,
        credit: 4.9,
        points: 580
      },
      walletStore: null,
      couponCount: 3,
      servicePhone: "18608945191",
      riderGuide: {
        title: "提现请点我的",
        tip: "扫描二维码添加骑手群",
        qr_file_id: "",
        enable: true,
        recruit_closed: false,
        recruit_closed_tip: "骑手已招满，待小程序做大做强后会公告扩招。"
      },
      riderJoinMode: "pending"
    };
  },
  watch: {
    // 登录态变化后，重新拉一次钱包，避免首次进入时未登录导致钱包为 0 且后续不刷新
    "userInfo._id": {
      immediate: true,
      handler: async function(val) {
        if (!val)
          return;
        if (!this.walletStore)
          this.walletStore = store_wallet.useWalletStore();
        await this.walletStore.loadFromCloud();
      }
    }
  },
  async onShow() {
    this.univerifyStyle.authButton.title = "本机号码一键绑定";
    this.univerifyStyle.otherLoginButton.title = "其他号码绑定";
    if (this.walletStore) {
      await this.walletStore.loadFromCloud();
    }
    await this.loadRiderGuide();
  },
  async onLoad(e) {
    if (e.showLoginManage) {
      this.showLoginManage = true;
    }
    let res = await uniIdCo.getAccountInfo();
    this.hasPwd = res.isPasswordSet;
    this.walletStore = store_wallet.useWalletStore();
    await this.loadRiderGuide();
  },
  methods: {
    async loadRiderGuide() {
      try {
        const res = await riderService.getWithdrawGuide();
        if (res && res.code === 0 && res.data) {
          this.riderGuide = {
            title: res.data.title || "提现请点我的",
            tip: res.data.tip || "扫描二维码添加骑手群",
            qr_file_id: res.data.qr_file_id || "",
            enable: res.data.enable !== false,
            recruit_closed: res.data.recruit_closed === true,
            recruit_closed_tip: res.data.recruit_closed_tip || "骑手已招满，待小程序做大做强后会公告扩招。"
          };
        }
      } catch (e) {
      }
    },
    openRiderJoinPopup(mode = "pending") {
      this.riderJoinMode = mode;
      this.$refs.riderJoinPopup && this.$refs.riderJoinPopup.open();
    },
    closeRiderJoinPopup() {
      this.$refs.riderJoinPopup && this.$refs.riderJoinPopup.close();
    },
    previewRiderGuideQr() {
      if (!this.riderGuide.qr_file_id)
        return;
      common_vendor.index.previewImage({ urls: [this.riderGuide.qr_file_id], current: this.riderGuide.qr_file_id });
    },
    enterRiderMode() {
      this.closeRiderJoinPopup();
      store_user.switchToRider();
      common_vendor.index.reLaunch({
        url: "/pages/rider/hall",
        success: () => {
          common_vendor.index.showToast({ title: "已切换到骑手端", icon: "success", duration: 1500 });
        }
      });
    },
    // 默认昵称：同学 + 长度为 3 的“数字或英文”随机组合，并按 uid 缓存保证稳定展示
    getDefaultNickname() {
      const uid = this.userInfo && this.userInfo._id ? String(this.userInfo._id) : "";
      if (!uid)
        return "点击登录/完善资料";
      const cacheKey = `default_nickname_${uid}`;
      const cached = common_vendor.index.getStorageSync(cacheKey);
      if (cached && typeof cached === "string")
        return cached;
      const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
      let code = "";
      for (let i = 0; i < 3; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const nickname = `同学${code}`;
      common_vendor.index.setStorageSync(cacheKey, nickname);
      return nickname;
    },
    login() {
      common_vendor.index.navigateTo({
        url: "/uni_modules/uni-id-pages/pages/login/login-withoutpwd",
        complete: (e) => {
        }
      });
    },
    logout() {
      uni_modules_uniIdPages_common_store.mutations.logout();
    },
    bindMobileSuccess() {
      uni_modules_uniIdPages_common_store.mutations.updateUserInfo();
    },
    changePassword() {
      common_vendor.index.navigateTo({
        url: "/uni_modules/uni-id-pages/pages/userinfo/change_pwd/change_pwd",
        complete: (e) => {
        }
      });
    },
    bindMobile() {
      this.$refs["bind-mobile-by-sms"].open();
    },
    univerify() {
      common_vendor.index.login({
        "provider": "univerify",
        "univerifyStyle": this.univerifyStyle,
        success: async (e) => {
          uniIdCo.bindMobileByUniverify(e.authResult).then(() => {
            uni_modules_uniIdPages_common_store.mutations.updateUserInfo();
          }).catch((err) => {
            common_vendor.index.showToast({ title: (err == null ? void 0 : err.message) || "绑定失败", icon: "none" });
          }).finally(() => {
            common_vendor.index.closeAuthView();
          });
        },
        fail: (err) => {
          if (err.code == "30002" || err.code == "30001") {
            this.bindMobileBySmsCode();
          } else {
            common_vendor.index.showToast({ title: (err == null ? void 0 : err.errMsg) || "操作已取消", icon: "none" });
          }
        }
      });
    },
    bindMobileBySmsCode() {
      common_vendor.index.navigateTo({
        url: "/uni_modules/uni-id-pages/pages/userinfo/bind-mobile/bind-mobile"
      });
    },
    setNickname(nickname) {
      if (nickname) {
        uni_modules_uniIdPages_common_store.mutations.updateUserInfo({
          nickname
        });
        this.setNicknameIng = false;
        this.$refs.dialog.close();
      } else {
        this.$refs.dialog.open();
      }
    },
    deactivate() {
      common_vendor.index.navigateTo({
        url: "/uni_modules/uni-id-pages/pages/userinfo/deactivate/deactivate"
      });
    },
    goOrders() {
      common_vendor.index.reLaunch({
        url: "/pages/client/orders/list"
      });
    },
    goWallet() {
      if (!this.isRiderMode) {
        common_vendor.index.showToast({ title: "仅骑手可用", icon: "none" });
        return;
      }
      common_vendor.index.navigateTo({ url: "/pages/common/wallet/index" });
    },
    goAddress() {
      common_vendor.index.navigateTo({
        url: "/pages/common/address/list"
      });
    },
    goFavorite() {
      common_vendor.index.showToast({ title: "我的收藏（待实现）", icon: "none" });
    },
    goCoupon() {
      common_vendor.index.showToast({ title: "优惠券（待实现）", icon: "none" });
    },
    goMessages() {
      common_vendor.index.showToast({ title: "消息通知（待实现）", icon: "none" });
    },
    goService() {
      this.$refs.servicePopup && this.$refs.servicePopup.open();
    },
    closeServicePopup() {
      this.$refs.servicePopup && this.$refs.servicePopup.close();
    },
    copyServicePhone() {
      common_vendor.index.setClipboardData({
        data: this.servicePhone,
        success: () => {
          common_vendor.index.showToast({ title: "已复制", icon: "success" });
        }
      });
    },
    callServicePhone() {
      common_vendor.index.makePhoneCall({
        phoneNumber: this.servicePhone,
        fail: () => {
          common_vendor.index.showToast({ title: "拨打失败，请重试", icon: "none" });
        }
      });
    },
    onContact(e) {
    },
    goHelp() {
      common_vendor.index.navigateTo({ url: "/pages/common/feedback/index" });
    },
    goSettings() {
      common_vendor.index.showToast({ title: "设置（待实现）", icon: "none" });
    },
    goAgreements() {
      common_vendor.index.showActionSheet({
        itemList: ["用户服务协议", "隐私政策"],
        success: (res) => {
          const url = res.tapIndex === 0 ? "/pages/common/legal/service" : "/pages/common/legal/privacy";
          common_vendor.index.navigateTo({ url });
        }
      });
    },
    /**
     * 切换到骑手端
     * - 如果未完成骑手实名认证，则先跳转到认证页面
     * - 只有认证通过(approved)后才真正切换模式
     */
    async goBecomeRider() {
      if (!this.userInfo || !this.userInfo._id) {
        common_vendor.index.showToast({ title: "请先登录", icon: "none" });
        return;
      }
      try {
        await this.loadRiderGuide();
        const res = await riderService.getMyProfile();
        const profile = res && res.code === 0 ? res.data : null;
        if (this.riderGuide.recruit_closed && (!profile || profile.status !== "approved")) {
          common_vendor.index.showModal({
            title: "暂停招募",
            content: this.riderGuide.recruit_closed_tip || "骑手已招满，待小程序做大做强后会公告扩招。",
            showCancel: false
          });
          return;
        }
        if (!profile) {
          common_vendor.index.navigateTo({ url: "/pages/rider/verify" });
          return;
        }
        if (profile.status !== "approved") {
          if (profile.status === "pending") {
            common_vendor.index.showToast({ title: "认证审核中，请先加群等待通知", icon: "none" });
            this.openRiderJoinPopup("pending");
          } else {
            common_vendor.index.showToast({ title: "认证未通过，请修改资料后重提", icon: "none" });
            common_vendor.index.navigateTo({ url: "/pages/rider/verify" });
          }
          return;
        }
        this.enterRiderMode();
      } catch (e) {
        common_vendor.index.showToast({ title: "获取认证信息失败，请稍后重试", icon: "none" });
      }
    },
    /**
     * 切回用户端
     * 1. 修改本地存储 user_mode 为 'client'
     * 2. 使用 reLaunch 跳转到用户端首页
     */
    goClientMode() {
      store_user.switchToClient();
      common_vendor.index.reLaunch({
        url: "/pages/client/home",
        success: () => {
          common_vendor.index.showToast({
            title: "已切换到用户端",
            icon: "success",
            duration: 1500
          });
        }
      });
    },
    async bindThirdAccount(provider) {
      const uniIdCo2 = common_vendor._r.importObject("uni-id-co");
      const bindField = {
        weixin: "wx_openid",
        alipay: "ali_openid",
        apple: "apple_openid",
        qq: "qq_openid"
      }[provider.toLowerCase()];
      if (this.userInfo[bindField]) {
        await uniIdCo2["unbind" + provider]();
        await uni_modules_uniIdPages_common_store.mutations.updateUserInfo();
      } else {
        common_vendor.index.login({
          provider: provider.toLowerCase(),
          onlyAuthorize: true,
          success: async (e) => {
            const res = await uniIdCo2["bind" + provider]({
              code: e.code
            });
            if (res.errCode) {
              common_vendor.index.showToast({
                title: res.errMsg || "绑定失败",
                duration: 3e3
              });
            }
            await uni_modules_uniIdPages_common_store.mutations.updateUserInfo();
          },
          fail: async (err) => {
            common_vendor.index.hideLoading();
            common_vendor.index.showToast({ title: (err == null ? void 0 : err.errMsg) || "操作已取消", icon: "none" });
          }
        });
      }
    },
    realNameVerify() {
      common_vendor.index.navigateTo({
        url: "/uni_modules/uni-id-pages/pages/userinfo/realname-verify/realname-verify"
      });
    }
  }
};
if (!Array) {
  const _easycom_uni_id_pages_avatar2 = common_vendor.resolveComponent("uni-id-pages-avatar");
  const _easycom_uni_popup_dialog2 = common_vendor.resolveComponent("uni-popup-dialog");
  const _easycom_uni_popup2 = common_vendor.resolveComponent("uni-popup");
  const _easycom_uni_id_pages_bind_mobile2 = common_vendor.resolveComponent("uni-id-pages-bind-mobile");
  const _component_TheTabBar = common_vendor.resolveComponent("TheTabBar");
  (_easycom_uni_id_pages_avatar2 + _easycom_uni_popup_dialog2 + _easycom_uni_popup2 + _easycom_uni_id_pages_bind_mobile2 + _component_TheTabBar)();
}
const _easycom_uni_id_pages_avatar = () => "../../uni_modules/uni-id-pages/components/uni-id-pages-avatar/uni-id-pages-avatar.js";
const _easycom_uni_popup_dialog = () => "../../uni_modules/uni-popup/components/uni-popup-dialog/uni-popup-dialog.js";
const _easycom_uni_popup = () => "../../uni_modules/uni-popup/components/uni-popup/uni-popup.js";
const _easycom_uni_id_pages_bind_mobile = () => "../../uni_modules/uni-id-pages/components/uni-id-pages-bind-mobile/uni-id-pages-bind-mobile.js";
if (!Math) {
  (_easycom_uni_id_pages_avatar + _easycom_uni_popup_dialog + _easycom_uni_popup + _easycom_uni_id_pages_bind_mobile)();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: common_vendor.p({
      width: "120rpx",
      height: "120rpx"
    }),
    b: common_vendor.t($options.displayNickname),
    c: $options.userInfo.studentNo
  }, $options.userInfo.studentNo ? {
    d: common_vendor.t($options.userInfo.studentNo)
  } : !$options.userInfo._id ? {} : {}, {
    e: !$options.userInfo._id,
    f: common_vendor.t($options.userInfo._id ? "编辑名称" : "登录"),
    g: common_vendor.o(($event) => $options.userInfo._id ? $options.setNickname("") : $options.login(), "77"),
    h: !$options.isRiderMode
  }, !$options.isRiderMode ? {
    i: common_assets._imports_0$2,
    j: common_vendor.o((...args) => $options.goBecomeRider && $options.goBecomeRider(...args), "39")
  } : {}, {
    k: common_assets._imports_1$1,
    l: common_vendor.t($options.walletAmount),
    m: common_vendor.o((...args) => $options.goWallet && $options.goWallet(...args), "64"),
    n: common_assets._imports_2,
    o: common_vendor.o((...args) => $options.goAddress && $options.goAddress(...args), "74"),
    p: common_assets._imports_3,
    q: common_vendor.o((...args) => $options.goMessages && $options.goMessages(...args), "b0"),
    r: common_assets._imports_4,
    s: common_vendor.o((...args) => $options.goService && $options.goService(...args), "8c"),
    t: common_assets._imports_5,
    v: common_vendor.o((...args) => $options.goHelp && $options.goHelp(...args), "cc"),
    w: common_assets._imports_6,
    x: common_vendor.o((...args) => $options.goSettings && $options.goSettings(...args), "c8"),
    y: common_assets._imports_5,
    z: common_vendor.o((...args) => $options.goAgreements && $options.goAgreements(...args), "1a"),
    A: $options.isRiderMode
  }, $options.isRiderMode ? {
    B: common_vendor.o((...args) => $options.goClientMode && $options.goClientMode(...args), "c0")
  } : {}, {
    C: $data.showLoginManage
  }, $data.showLoginManage ? common_vendor.e({
    D: $options.userInfo._id
  }, $options.userInfo._id ? {
    E: common_vendor.o((...args) => $options.logout && $options.logout(...args), "ad")
  } : {
    F: common_vendor.o((...args) => $options.login && $options.login(...args), "33")
  }) : {}, {
    G: common_vendor.o($options.setNickname, "74"),
    H: common_vendor.p({
      mode: "input",
      value: $options.userInfo.nickname,
      inputType: $data.setNicknameIng ? "nickname" : "text",
      title: "设置昵称",
      placeholder: "请输入要设置的昵称"
    }),
    I: common_vendor.sr("dialog", "569e925a-1"),
    J: common_vendor.p({
      type: "dialog"
    }),
    K: common_vendor.t($data.servicePhone),
    L: common_vendor.o((...args) => $options.onContact && $options.onContact(...args), "a0"),
    M: common_vendor.o((...args) => $options.callServicePhone && $options.callServicePhone(...args), "3d"),
    N: common_vendor.o((...args) => $options.closeServicePopup && $options.closeServicePopup(...args), "4c"),
    O: common_vendor.o(() => {
    }, "1f"),
    P: common_vendor.sr("servicePopup", "569e925a-3"),
    Q: common_vendor.p({
      type: "center"
    }),
    R: common_vendor.t($data.riderGuide.tip || "扫描二维码添加骑手群"),
    S: $data.riderGuide.qr_file_id
  }, $data.riderGuide.qr_file_id ? {
    T: $data.riderGuide.qr_file_id,
    U: common_vendor.o((...args) => $options.previewRiderGuideQr && $options.previewRiderGuideQr(...args), "19")
  } : {}, {
    V: common_vendor.o((...args) => $options.closeRiderJoinPopup && $options.closeRiderJoinPopup(...args), "58"),
    W: common_vendor.o(() => {
    }, "e0"),
    X: common_vendor.sr("riderJoinPopup", "569e925a-4"),
    Y: common_vendor.p({
      type: "center"
    }),
    Z: common_vendor.sr("bind-mobile-by-sms", "569e925a-5"),
    aa: common_vendor.o($options.bindMobileSuccess, "90")
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-569e925a"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/mine/index.js.map
