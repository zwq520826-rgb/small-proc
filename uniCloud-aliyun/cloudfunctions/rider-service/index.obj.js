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

/**
 * 根据身份证号推断性别
 * 规则：第17位数字（倒数第二位）奇数为男，偶数为女
 * 兼容 18 位和 15 位身份证：
 * - 18 位：取 index 16
 * - 15 位：取 index 14
 */
function getGenderFromIdCard(idCard) {
  if (!idCard || typeof idCard !== 'string') return null
  const trimmed = idCard.trim()
  let genderDigit = ''

  if (trimmed.length === 18) {
    genderDigit = trimmed.charAt(16)
  } else if (trimmed.length === 15) {
    genderDigit = trimmed.charAt(14)
  } else {
    return null
  }

  if (!/^\d$/.test(genderDigit)) return null
  const num = parseInt(genderDigit, 10)
  if (isNaN(num)) return null

  return num % 2 === 1 ? 'male' : 'female'
}

/**
 * 根据累计完成订单数，从 rider_levels 表中计算等级与抽成
 * @param {number} totalCompletedOrders
 * @returns {Object} { code, data?: { level, level_name, commission_rate, rider_share } }
 */
async function getCommissionByOrders(totalCompletedOrders) {
  const res = await db.collection('rider_levels')
    .orderBy('min_orders', 'desc')
    .get()

  const levels = res.data || []
  if (!levels.length) {
    return {
      code: 'NO_LEVEL_CONFIG',
      message: '未配置骑手等级规则'
    }
  }

  // 选出满足 min_orders <= total 的最高档
  const level = levels.find(l => totalCompletedOrders >= (l.min_orders || 0)) || levels[levels.length - 1]
  const commission = Number(level.commission_rate || 0)

  return {
    code: 0,
    data: {
      level: level.code,
      level_name: level.name,
      commission_rate: commission,         // 平台抽成比例
      rider_share: 1 - commission         // 骑手分成比例
    }
  }
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

    // 根据身份证号自动识别性别（male/female）
    const gender = getGenderFromIdCard(id_card)
    const genderLabel = gender === 'male' ? '男' : gender === 'female' ? '女' : ''

    const existed = await col.where({ user_id: uid }).limit(1).get()
    if (existed.data.length) {
      const old = existed.data[0]
      const id = old._id
      await col.doc(id).update({
        name,
        student_no,
        college_class,
        id_card,
        mobile,
        gender,                // 骑手性别（male/female）
        gender_label: genderLabel, // 性别中文
        // 如果之前没有这些字段，初始化为默认值；已有则保留原值
        total_completed_orders: typeof old.total_completed_orders === 'number' ? old.total_completed_orders : 0,
        level: old.level || 'L1',
        level_name: old.level_name || '萌新骑手',
        commission_rate: typeof old.commission_rate === 'number' ? old.commission_rate : 0.15,
        rider_share: typeof old.rider_share === 'number' ? old.rider_share : 0.85,
        // 取消审核流程：直接标记为已通过
        status: 'approved',
        real_name_verified: true,
        real_name_verify_time: now,
        update_time: now
      })
      return {
        code: 0,
        message: '已更新认证资料，已通过认证',
        data: { _id: id }
      }
    } else {
      // 新骑手：初始化累计订单数和等级（L1 萌新骑手）
      const addRes = await col.add({
        user_id: uid,
        name,
        student_no,
        college_class,
        id_card,
        mobile,
        gender,
        gender_label: genderLabel,
        total_completed_orders: 0,
        level: 'L1',
        level_name: '萌新骑手',
        commission_rate: 0.15,
        rider_share: 0.85,
        // 取消审核流程：直接标记为已通过
        status: 'approved',
        real_name_verified: true,
        real_name_verify_time: now,
        create_time: now,
        update_time: now
      })
      return {
        code: 0,
        message: '认证已通过',
        data: { _id: addRes.id }
      }
    }
  },

  /**
   * 获取当前骑手的等级与统计信息（给前端展示用）
   * 返回：当前等级、累计订单数、距离下一级还差多少单、当前/下一级抽成
   */
  async getMyStats() {
    const auth = checkAuth(this)
    if (auth.code) return auth
    const uid = auth.uid

    // 1. 读取骑手档案
    const profileRes = await db.collection('rider_profiles')
      .where({ user_id: uid })
      .limit(1)
      .get()

    if (!profileRes.data.length) {
      return {
        code: 'NO_RIDER_PROFILE',
        message: '请先完成骑手认证'
      }
    }

    const profile = profileRes.data[0]
    const total = profile.total_completed_orders || 0

    // 2. 读取全部等级配置，按 min_orders 升序
    const levelRes = await db.collection('rider_levels')
      .orderBy('min_orders', 'asc')
      .get()

    const levels = levelRes.data || []
    if (!levels.length) {
      return {
        code: 'NO_LEVEL_CONFIG',
        message: '未配置骑手等级规则'
      }
    }

    // 当前等级：满足 min_orders <= total 的最高档
    let currentLevel = levels[0]
    for (const lvl of levels) {
      if (total >= (lvl.min_orders || 0)) {
        currentLevel = lvl
      } else {
        break
      }
    }

    // 下一级：第一个 min_orders > total 的档
    const nextLevel = levels.find(l => total < (l.min_orders || 0)) || null

    const currentCommission = Number(currentLevel.commission_rate || 0)
    const nextCommission = nextLevel ? Number(nextLevel.commission_rate || 0) : null
    const needMore = nextLevel ? Math.max(0, (nextLevel.min_orders || 0) - total) : 0

    return {
      code: 0,
      data: {
        level: currentLevel.code,
        level_name: currentLevel.name,
        total_completed_orders: total,
        need_more_orders: needMore,
        current_commission_rate: currentCommission,   // 平台抽成，例如 0.11
        next_commission_rate: nextCommission,         // 可能为 null（已是最高级）
        current_rider_share: 1 - currentCommission,
        next_rider_share: nextCommission != null ? (1 - nextCommission) : null
      }
    }
  },

  /**
   * 订单送达后的骑手统计与抽成结算
   * 由 order-service.confirmDelivery 在订单状态更新为 completed 后调用
   * @param {string} orderId 订单ID
   * @param {string} riderId 骑手用户ID
   * @param {number} orderPrice 订单金额
   */
  async afterOrderCompleted(orderId, riderId, orderPrice) {
    if (!orderId || !riderId) {
      return {
        code: 'INVALID_PARAM',
        message: '订单ID和骑手ID不能为空'
      }
    }

    // 订单金额统一精确到分
    const price = Math.round(Number(orderPrice || 0) * 100) / 100
    if (!price || isNaN(price)) {
      return {
        code: 'INVALID_PRICE',
        message: '订单金额异常'
      }
    }

    // 1. 查找骑手档案
    const col = db.collection('rider_profiles')
    const profileRes = await col.where({ user_id: riderId }).limit(1).get()
    if (!profileRes.data.length) {
      return {
        code: 'NO_RIDER_PROFILE',
        message: '未找到骑手档案'
      }
    }

    const profile = profileRes.data[0]
    const totalCompletedOrders = (profile.total_completed_orders || 0) + 1

    // 2. 按累计单数计算等级和抽成
    const levelRes = await getCommissionByOrders(totalCompletedOrders)
    if (levelRes.code !== 0) {
      return levelRes
    }
    const { level, level_name, commission_rate, rider_share } = levelRes.data

    // 3. 更新骑手档案
    await col.doc(profile._id).update({
      total_completed_orders: totalCompletedOrders,
      level,
      level_name,
      commission_rate,
      rider_share,
      last_complete_time: Date.now()
    })

    // 4. 计算骑手收入与平台抽成，并调用钱包服务给骑手入账（统一精确到分）
    const riderIncome = Math.round(price * rider_share * 100) / 100
    const platformIncome = Math.round(price * commission_rate * 100) / 100

    // 将骑手实际收入与平台抽成写回订单，方便前端展示
    await db.collection('orders')
      .doc(orderId)
      .update({
        'content.rider_income': riderIncome,
        'content.platform_income': platformIncome
      })

    const walletService = uniCloud.importObject('wallet-service')
    if (riderIncome > 0) {
      // 服务端内部调用：直接指定骑手 userId 入账
      await walletService.addIncomeForUser(riderId, riderIncome, orderId)
    }

    return {
      code: 0,
      message: '骑手统计与抽成结算完成',
      data: {
        total_completed_orders: totalCompletedOrders,
        level,
        level_name,
        commission_rate,
        rider_share,
        riderIncome
      }
    }
  }
}


