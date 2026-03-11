'use strict';

// 骑手实名认证相关云对象

const uniID = require('uni-id-common')
const db = uniCloud.database()
const uniCaptcha = require('uni-captcha')

function checkAuth(ctx) {
  if (!ctx || !ctx.uid) {
    return {
      code: 'NO_LOGIN',
      message: '请先登录'
    }
  }
  return { uid: ctx.uid }
}

module.exports = {
  /**
   * 通用预处理器：创建 uni-id 实例并解析当前用户 uid
   */
  async _before() {
    const clientInfo = this.getClientInfo()

    this.uniID = uniID.createInstance({
      clientInfo
    })

    const token = this.getUniIdToken()
    if (token) {
      try {
        const payload = await this.uniID.checkToken(token)
        if (payload.code === 0) {
          this.uid = payload.uid
          this.authInfo = payload
        } else {
          this.uid = null
          this.authInfo = null
        }
      } catch (err) {
        console.error('Token 验证失败:', err)
        this.uid = null
        this.authInfo = null
      }
    } else {
      this.uid = null
      this.authInfo = null
    }
  },

  /**
   * 获取当前用户的骑手认证信息
   */
  async getMyProfile() {
    const auth = checkAuth(this)
    if (auth.code) return auth
    const uid = auth.uid

    const res = await db.collection('rider_profiles')
      .where({ user_id: uid })
      .limit(1)
      .get()

    return {
      code: 0,
      data: res.data[0] || null
    }
  },

  /**
   * 提交 / 更新骑手认证申请
   * @param {object} data
   * @param {string} data.name 姓名
   * @param {string} data.student_no 学号
   * @param {string} data.college_class 学院+班级
   * @param {string} data.id_card 身份证号
   * @param {string} data.mobile 手机号
   * 注意：已去掉短信验证码步骤，直接使用实名核验验证三要素
   */
  async submitApplication(data) {
    const auth = checkAuth(this)
    if (auth.code) return auth
    const uid = auth.uid

    const {
      name,
      student_no,
      college_class,
      id_card,
      mobile
    } = data || {}

    if (!name || !student_no || !college_class || !id_card || !mobile) {
      return {
        code: 'INVALID_PARAM',
        message: '请完整填写认证信息'
      }
    }
    
    // 验证手机号格式
    const phoneReg = /^1\d{10}$/
    if (!phoneReg.test(mobile.trim())) {
      return {
        code: 'INVALID_PARAM',
        message: '手机号格式错误'
      }
    }

    // ========== 新增：实名认证核验 ==========
    try {
      // 获取认证管理对象（根据官方文档：https://doc.dcloud.net.cn/uniCloud/uni-rpia/mobile-verify/dev.html）
      const uniVerifyManager = uniCloud.getUniVerifyManager({
        provider: "univerify"
      })
      
      // 调用三要素（详版）认证接口
      const verifyRes = await uniVerifyManager.mobile3EleVerifyPro({
        realName: name.trim(),
        idCard: id_card.trim(),
        mobile: mobile.trim()
      })

      // 检查请求是否成功
      if (verifyRes.errCode !== 0) {
        console.error('实名认证请求失败:', verifyRes.errMsg)
        return {
          code: 'VERIFY_ERROR',
          message: verifyRes.errMsg || '实名认证服务异常，请稍后重试'
        }
      }

      // 检查认证结果：status 1-通过 2-不通过 3-查无结果 0-待定
      const status = verifyRes.data?.status
      if (status !== 1) {
        // 只要有一个不匹配，统一提示认证失败
        return {
          code: 'VERIFY_FAILED',
          message: '认证失败，请确认姓名、身份证和手机号是否正确',
          data: {
            status: status,
            reasonType: verifyRes.data?.reasonType,
            logId: verifyRes.data?.logId
          }
        }
      }

      // 认证通过，记录日志ID（可选）
      console.log('实名认证通过，logId:', verifyRes.data?.logId)
    } catch (error) {
      console.error('实名认证接口调用失败:', error)
      return {
        code: 'VERIFY_ERROR',
        message: '实名认证服务异常，请稍后重试: ' + (error.message || String(error))
      }
    }
    // ========== 实名认证核验结束 ==========

    const now = Date.now()
    const col = db.collection('rider_profiles')

    const existed = await col.where({ user_id: uid }).limit(1).get()
    if (existed.data.length) {
      const id = existed.data[0]._id
      await col.doc(id).update({
        name,
        student_no,
        college_class,
        id_card,
        mobile,
        // 取消审核流程：直接标记为已通过
        status: 'approved',
        real_name_verified: true,        // 新增：标记已通过实名认证
        real_name_verify_time: now,      // 新增：实名认证时间
        update_time: now
      })
      return {
        code: 0,
        message: '已更新认证资料，已通过认证',
        data: { _id: id }
      }
    } else {
      const addRes = await col.add({
        user_id: uid,
        name,
        student_no,
        college_class,
        id_card,
        mobile,
        // 取消审核流程：直接标记为已通过
        status: 'approved',
        real_name_verified: true,        // 新增：标记已通过实名认证
        real_name_verify_time: now,      // 新增：实名认证时间
        create_time: now,
        update_time: now
      })
      return {
        code: 0,
        message: '认证已通过',
        data: { _id: addRes.id }
      }
    }
  }
}


