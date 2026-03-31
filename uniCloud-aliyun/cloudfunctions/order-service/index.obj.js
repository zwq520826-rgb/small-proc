'use strict';

// 引入 uni-id-common
const uniID = require('uni-id-common')
const securityKit = require('./security-kit')
const db = uniCloud.database()
const dbCmd = db.command
const ORDER_CLASS = {
	NORMAL: 'normal',
	URGENT_ADDON: 'urgent_addon'
}
const FIRST_ORDER_DISCOUNT_VALID_DAYS = 7
const ORDER_STATUS = {
	ABNORMAL: 'abnormal'
}
const FEEDBACK_LIMIT = 3
const HALL_TASK_FIELD_PROJECTION = {
	_id: 1,
	type: 1,
	type_label: 1,
	price: 1,
	pickup_location: 1,
	pickup_distance: 1,
	delivery_location: 1,
	address: 1,
	status: 1,
	'content.images': 1,
	'content.dormNumber': 1,
	'content.isUrgent': 1,
	'content.isDelivery': 1,
	'content.requiredRiderGender': 1,
	tags: 1,
	rider_id: 1,
	user_id: 1,
	accept_time: 1
}

const MY_TASK_FIELD_PROJECTION = {
	_id: 1,
	type: 1,
	type_label: 1,
	price: 1,
	pickup_location: 1,
	pickup_distance: 1,
	delivery_location: 1,
	address: 1,
	status: 1,
	'content.images': 1,
	'content.delivery_images': 1,
	'content.deliveryImages': 1,
	'content.phone': 1,
	'content.dormNumber': 1,
	'content.isUrgent': 1,
	'content.isDelivery': 1,
	'content.requiredRiderGender': 1,
	'content.rider_income': 1,
	'content.pending_redelivery_upload': 1,
	tags: 1,
	rider_id: 1,
	user_id: 1,
	accept_time: 1,
	pickup_time: 1,
	complete_time: 1,
	photo_feedback_count: 1,
	need_customer_service: 1,
	abnormal_reason: 1,
	abnormal_remark: 1,
	abnormal_time: 1
}

function pad2(n) {
	return String(n).padStart(2, '0')
}

/**
 * 生成可追踪订单号：YYYYMMDDHHmmss + 4位随机数
 * 例：202603170915301234
 */
function generateOrderNo(now = new Date()) {
	const yyyy = now.getFullYear()
	const MM = pad2(now.getMonth() + 1)
	const dd = pad2(now.getDate())
	const HH = pad2(now.getHours())
	const mm = pad2(now.getMinutes())
	const ss = pad2(now.getSeconds())
	const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
	return `${yyyy}${MM}${dd}${HH}${mm}${ss}${rand}`
}

function formatYMDByTs(ts = Date.now()) {
	const d = new Date(ts)
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

async function incDashboardMetrics({
	ts = Date.now(),
	orderInc = 0,
	paidInc = 0,
	completedInc = 0,
	gmvInc = 0
} = {}) {
	if (!orderInc && !paidInc && !completedInc && !gmvInc) return

	const now = Date.now()
	const ymd = formatYMDByTs(ts)
	const dailyIncDoc = {
		update_time: now
	}
	if (orderInc) dailyIncDoc.order_count = dbCmd.inc(orderInc)
	if (paidInc) dailyIncDoc.paid_order_count = dbCmd.inc(paidInc)
	if (completedInc) dailyIncDoc.completed_order_count = dbCmd.inc(completedInc)
	if (gmvInc) dailyIncDoc.gmv = dbCmd.inc(Number(gmvInc) || 0)

	try {
		const upRes = await db.collection('daily_stats').where({ stat_date: ymd }).update(dailyIncDoc)
		if (!upRes || !upRes.updated) {
			await db.collection('daily_stats').add({
				stat_date: ymd,
				order_count: Math.max(0, Number(orderInc || 0)),
				paid_order_count: Math.max(0, Number(paidInc || 0)),
				completed_order_count: Math.max(0, Number(completedInc || 0)),
				gmv: Number(gmvInc || 0),
				status_list: [],
				type_list: [],
				income_trend_7d: [],
				order_trend_7d: [],
				rider_rank_7d: [],
				hourly: [],
				update_time: now
			})
		}
	} catch (e) {
		console.warn('[order-service] daily_stats inc failed:', e.message)
	}

	const totalIncDoc = {
		update_time: now
	}
	if (orderInc) totalIncDoc.total_order_count = dbCmd.inc(orderInc)
	if (paidInc) totalIncDoc.total_paid_order_count = dbCmd.inc(paidInc)
	if (completedInc) totalIncDoc.total_completed_order_count = dbCmd.inc(completedInc)
	if (gmvInc) totalIncDoc.total_gmv = dbCmd.inc(Number(gmvInc) || 0)

	try {
		await db.collection('dashboard_counters').doc('orders').update(totalIncDoc)
	} catch (e) {
		try {
			await db.collection('dashboard_counters').add({
				_id: 'orders',
				total_order_count: Math.max(0, Number(orderInc || 0)),
				total_paid_order_count: Math.max(0, Number(paidInc || 0)),
				total_completed_order_count: Math.max(0, Number(completedInc || 0)),
				total_gmv: Number(gmvInc || 0),
				update_time: now
			})
		} catch (ee) {
			console.warn('[order-service] dashboard_counters inc failed:', ee.message)
		}
	}
}

// 独立的登录检查函数，避免对 this 上方法的依赖
function checkAuth(ctx) {
	if (!ctx || !ctx.uid) {
		return {
			code: 'NO_LOGIN',
			message: '请先登录'
		}
	}
	return { uid: ctx.uid }
}

function ensurePositiveInt(val, fallback) {
	const n = Number(val)
	if (!Number.isFinite(n) || n <= 0) return fallback
	return Math.floor(n)
}

function normalizeAmount(val) {
	const n = Number(val || 0)
	if (!Number.isFinite(n)) return 0
	return Math.round(n * 100) / 100
}

const RATE_LIMIT_RULES = {
	getOrderList: {
		ipRule: { limit: 120, windowSec: 60 },
		uidRule: { limit: 60, windowSec: 60 }
	},
	getHallTasks: {
		ipRule: { limit: 120, windowSec: 60 },
		uidRule: { limit: 60, windowSec: 60 }
	},
	getMyTasks: {
		ipRule: { limit: 120, windowSec: 60 },
		uidRule: { limit: 60, windowSec: 60 }
	},
	getRiderDashboard: {
		ipRule: { limit: 80, windowSec: 60 },
		uidRule: { limit: 40, windowSec: 60 }
	},
	reportWrongDeliveryPhoto: {
		ipRule: { limit: 30, windowSec: 60 },
		uidRule: { limit: 10, windowSec: 60 }
	},
	reportDeliveryIssue: {
		ipRule: { limit: 30, windowSec: 60 },
		uidRule: { limit: 10, windowSec: 60 }
	}
}

async function enforceRateLimit(ctx, apiName) {
	const rule = RATE_LIMIT_RULES[apiName]
	if (!rule) return null
	const hit = await securityKit.checkRateLimit({
		service: 'order-service',
		api: apiName,
		ip: ctx.clientIP || '',
		uid: ctx.uid || '',
		ipRule: rule.ipRule,
		uidRule: rule.uidRule
	})
	if (hit.allowed) return null
	return securityKit.rateLimitedError({
		requestId: ctx.requestId,
		retryAfterSec: hit.retryAfterSec || 1
	})
}

async function getRiderStatsByUid(uid) {
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

	let currentLevel = levels[0]
	for (const lvl of levels) {
		if (total >= (lvl.min_orders || 0)) currentLevel = lvl
		else break
	}
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
			current_commission_rate: currentCommission,
			next_commission_rate: nextCommission,
			current_rider_share: 1 - currentCommission,
			next_rider_share: nextCommission != null ? (1 - nextCommission) : null
		}
	}
}

async function fetchHallTasksByUid(uid, sortBy = 'distance', page = 1, pageSize = 10) {
	let query = db.collection('orders').where({
		status: 'pending_accept',
		pay_status: 'paid',
		hall_visible: true,
		rider_id: dbCmd.exists(false).or(dbCmd.eq(null)),
		user_id: dbCmd.neq(uid)
	})

	if (sortBy === 'price') {
		query = query.orderBy('price', 'desc')
	} else {
		query = query.orderBy('pickup_distance', 'asc')
	}

	const result = await query
		.field(HALL_TASK_FIELD_PROJECTION)
		.orderBy('create_time', 'desc')
		.skip((page - 1) * pageSize)
		.limit(pageSize)
		.get()

	return result.data || []
}

async function fetchMyTasksByUid(uid, status = 'all', page = 1, pageSize = 10) {
	let query = db.collection('orders').where({
		rider_id: uid
	})

	if (status && status !== 'all') {
		query = query.where({
			status: status
		})
	}

	const result = await query
		.field(MY_TASK_FIELD_PROJECTION)
		.orderBy('accept_time', 'desc')
		.skip((page - 1) * pageSize)
		.limit(pageSize)
		.get()

	return result.data || []
}

module.exports = {
	/**
	 * 通用预处理器
	 * 初始化 uni-id 实例，获取用户身份
	 */
	async _before() {
		// 获取客户端信息
		const clientInfo = this.getClientInfo()
		this.clientIP = clientInfo.clientIP || ''
		this.requestId = securityKit.resolveRequestId({
			headers: (clientInfo && clientInfo.headers) || {},
			fallback: this.getUniCloudRequestId ? this.getUniCloudRequestId() : ''
		})
		
		// 创建 uni-id 实例
		this.uniID = uniID.createInstance({
			clientInfo
		})
		
		// 获取并验证 token
		const token = this.getUniIdToken()
		if (token) {
			try {
				const payload = await this.uniID.checkToken(token)
				if (payload.code === 0) {
					// token 验证成功，保存用户信息
					this.uid = payload.uid
					this.authInfo = payload
				} else {
					// token 验证失败
					this.uid = null
					this.authInfo = null
				}
			} catch (error) {
				console.error('Token验证失败:', error)
				this.uid = null
				this.authInfo = null
			}
		} else {
			this.uid = null
			this.authInfo = null
		}
		this.logger = securityKit.createLogger({
			service: 'order-service',
			uid: this.uid || '',
			ip: this.clientIP,
			requestId: this.requestId
		})
	},

	_after(error, result) {
		if (error) throw error
		return securityKit.withRequestId(result, this.requestId)
	},

	/**
	 * 创建加急附加订单（仅用于微信支付加急费用）
	 * @param {object} payload
	 * @param {string} payload.orderId 主订单ID
	 * @param {number} payload.amount 加急费用（元）
	 */
	async createUrgentOrder(payload = {}) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		const orderId = payload.orderId
		let amount = normalizeAmount(payload.amount || 1)

		if (!orderId) {
			return { code: 'INVALID_PARAM', message: '订单ID不能为空' }
		}
		if (amount <= 0) {
			return { code: 'INVALID_PARAM', message: '加急金额必须大于0' }
		}
		if (amount > 20) {
			return { code: 'INVALID_PARAM', message: '单笔加急费用不能超过 ¥20' }
		}

		// 查询主订单
		const orderResult = await db.collection('orders').doc(orderId).get()
		if (!orderResult.data.length) {
			return { code: 'NOT_FOUND', message: '订单不存在' }
		}
		const parentOrder = orderResult.data[0]

		if (parentOrder.user_id !== uid) {
			return { code: 'NO_PERMISSION', message: '无权限操作该订单' }
		}

		if (!['pending_accept', 'pending_pickup', 'delivering'].includes(parentOrder.status)) {
			return { code: 'INVALID_STATUS', message: '当前状态不可加急' }
		}

		if (parentOrder.pay_status !== 'paid') {
			return { code: 'NOT_PAID', message: '订单未支付，无法加急' }
		}

		if (parentOrder.content && parentOrder.content.isUrgent) {
			return { code: 'ALREADY_URGENT', message: '该订单已加急' }
		}

		// 复用已有的待支付加急单，避免重复创建
		const existedAddon = await db.collection('orders')
			.where({
				parent_order_id: orderId,
				order_class: ORDER_CLASS.URGENT_ADDON,
				pay_status: 'unpaid'
			})
			.orderBy('create_time', 'desc')
			.limit(1)
			.get()

		if (existedAddon.data && existedAddon.data.length) {
			return {
				code: 0,
				message: '已为您生成待支付的加急订单',
				data: {
					orderId: existedAddon.data[0]._id || existedAddon.data[0].id
				}
			}
		}

		const now = Date.now()
		const urgentOrder = {
			order_no: generateOrderNo(new Date()) + 'U',
			user_id: uid,
			parent_order_id: orderId,
			order_class: ORDER_CLASS.URGENT_ADDON,
			type: 'urgent_addon',
			type_label: '加急服务',
			status: 'pending_pay',
			pay_method: 'wechat',
			pay_status: 'unpaid',
			hall_visible: false,
			refund_status: 'none',
			price: amount,
			content: {
				parent_order_id: orderId,
				urgent_fee: amount
			},
			tags: [],
			create_time: now,
			update_time: now
		}

		const addRes = await db.collection('orders').add(urgentOrder)
		const newId = addRes.id || addRes._id

		return {
			code: 0,
			message: '加急订单已生成',
			data: {
				orderId: newId
			}
		}
	},
	// ==================== 用户端功能 ====================

	/**
	 * 创建订单
	 * @param {object} orderData 订单数据
	 * @param {string} orderData.type 订单类型
	 * @param {number} orderData.price 订单金额
	 * @param {string} orderData.pickup_location 取件地址
	 * @param {string} orderData.delivery_location 送达地址
	 * @param {object} orderData.content 订单内容
	 * @returns {object} 创建结果
	 */
	async createOrder(orderData) {
		// 检查登录状态
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		// 参数校验
		if (!orderData || !orderData.type || !orderData.price) {
			return {
				code: 'INVALID_PARAM',
				message: '订单类型和金额不能为空'
			}
		}

		// 构建订单数据
		// 关键：订单创建后默认“待支付”，且不进入骑手大厅；支付成功后再推进到待接单并放到大厅
		const order = {
			order_no: generateOrderNo(new Date()),
			user_id: uid,
			order_class: ORDER_CLASS.NORMAL,
			type: orderData.type,
			type_label: orderData.type_label || '',
			status: 'pending_pay',
			pay_method: 'wechat', // 默认微信支付；余额支付会在 wallet-service.pay 成功后更新
			pay_status: 'unpaid',
			hall_visible: false,
			refund_status: 'none',
			price: Number(orderData.price),
			pickup_location: orderData.pickup_location || '',
			delivery_location: orderData.delivery_location || orderData.address || '',
			address: orderData.address || orderData.delivery_location || '',
			content: orderData.content || {},
			tags: orderData.tags || [],
			pickup_distance: orderData.pickup_distance || 0,
			create_time: Date.now()
		}

		try {
			const result = await db.collection('orders').add(order)
			await incDashboardMetrics({ orderInc: 1 })
			return {
				code: 0,
				message: '创建成功',
				data: {
					_id: result.id,
					...order
				}
			}
		} catch (error) {
			console.error('创建订单失败:', error)
			return {
				code: 'DB_ERROR',
				message: '创建订单失败：' + error.message
			}
		}
	},

	/**
	 * 获取订单列表
	 * @param {object} params 查询参数
	 * @param {string} params.status 订单状态（可选：all/pending_accept/delivering/completed/cancelled）
	 * @param {number} params.page 页码，默认1
	 * @param {number} params.pageSize 每页数量，默认10
	 * @returns {object} 订单列表
	 */
	async getOrderList(params = {}) {
		const limitErr = await enforceRateLimit(this, 'getOrderList')
		if (limitErr) return limitErr
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		const { status = 'all', page = 1, pageSize = 10 } = params

		try {
			const cond = {
				user_id: uid,
				order_class: dbCmd.neq(ORDER_CLASS.URGENT_ADDON)
			}

			// 根据状态过滤
			if (status && status !== 'all') {
				cond.status = status
			}

			const col = db.collection('orders')
			const totalRes = await col.where(cond).count()
			const total = Number(totalRes.total || 0)

			const result = await col.where(cond)
				.orderBy('create_time', 'desc')
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.get()

			return {
				code: 0,
				message: '获取成功',
				data: result.data,
				total
			}
		} catch (error) {
			console.error('获取订单列表失败:', error)
			return {
				code: 'DB_ERROR',
				message: '获取订单列表失败：' + error.message
			}
		}
	},

	/**
	 * 获取订单详情
	 * @param {string} orderId 订单ID
	 * @returns {object} 订单详情
	 */
	async getOrderDetail(orderId) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		if (!orderId) {
			return {
				code: 'INVALID_PARAM',
				message: '订单ID不能为空'
			}
		}

		try {
			const result = await db.collection('orders')
				.doc(orderId)
				.get()

			if (result.data.length === 0) {
				return {
					code: 'NOT_FOUND',
					message: '订单不存在'
				}
			}

			const order = result.data[0]

			// 权限检查：只能查看自己的订单或自己接的单
			if (order.user_id !== uid && order.rider_id !== uid) {
				return {
					code: 'NO_PERMISSION',
					message: '无权限查看此订单'
				}
			}

			return {
				code: 0,
				message: '获取成功',
				data: order
			}
		} catch (error) {
			console.error('获取订单详情失败:', error)
			return {
				code: 'DB_ERROR',
				message: '获取订单详情失败：' + error.message
			}
		}
	},

	/**
	 * 取消订单
	 * @param {string} orderId 订单ID
	 * @returns {object} 取消结果
	 */
	async cancelOrder(orderId) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		if (!orderId) {
			return {
				code: 'INVALID_PARAM',
				message: '订单ID不能为空'
			}
		}

		try {
			const dbCmd = db.command
			const now = Date.now()

			// 先读一遍订单，用于判断是否需要退款、以及返回更友好的提示
			const orderResult = await db.collection('orders').doc(orderId).get()
			if (!orderResult.data.length) {
				return { code: 'NOT_FOUND', message: '订单不存在' }
			}
			const order = orderResult.data[0]

			if (order.user_id !== uid) {
				return { code: 'NO_PERMISSION', message: '无权限取消此订单' }
			}

			// 允许取消规则：
			// 1) 未被骑手接单：pending_pay / pending_accept 且 rider_id 为空 => 可取消
			// 2) 已被骑手接单：pending_pickup / delivering
			//    - 以 accept_time 为准，接单后未满 40 分钟 => 不可取消
			//    - 超过 40 分钟且未完成 => 可取消（触发退款逻辑）

			let updateRes = null
			const TIMEOUT_MS = 40 * 60 * 1000

			const status = order.status
			const riderId = order.rider_id
			const acceptTs = typeof order.accept_time === 'number' ? order.accept_time : (order.accept_time ? Date.parse(order.accept_time) : 0)

			const isRiderNotGrabbed = !riderId
			const allowWithoutGrab = ['pending_pay', 'pending_accept'].includes(status) && isRiderNotGrabbed

			const allowWithTimeout =
				['pending_pickup', 'delivering'].includes(status) &&
				!!riderId &&
				Number.isFinite(acceptTs) &&
				acceptTs > 0 &&
				now - acceptTs >= TIMEOUT_MS

			if (allowWithoutGrab) {
				// 原子取消：必须是待支付/待接单 & rider_id 为空
				updateRes = await db.collection('orders')
					.where({
						_id: orderId,
						user_id: uid,
						status: dbCmd.in(['pending_pay', 'pending_accept']),
						rider_id: dbCmd.exists(false).or(dbCmd.eq(null))
					})
					.update({
						status: 'cancelled',
						cancel_time: now,
						update_time: now
					})
			} else if (['pending_pickup', 'delivering'].includes(status)) {
				// 已接单：未满 40 分钟不允许取消
				if (!allowWithTimeout) {
					return {
						code: 'INVALID_STATUS',
						message: '接单尚未满 40 分钟，暂不可取消'
					}
				}

				// 原子取消：pending_pickup / delivering 且 rider_id 与当前一致（避免并发状态变化）
				updateRes = await db.collection('orders')
					.where({
						_id: orderId,
						user_id: uid,
						status: dbCmd.in(['pending_pickup', 'delivering']),
						rider_id: riderId ? dbCmd.eq(riderId) : dbCmd.exists(false).or(dbCmd.eq(null))
					})
					.update({
						status: 'cancelled',
						cancel_time: now,
						update_time: now,
						hall_visible: false,
						rider_id: dbCmd.remove()
					})
			} else {
				return { code: 'INVALID_STATUS', message: '当前订单状态无法取消' }
			}

			if (updateRes.updated === 0) {
				// 并发导致的状态变化，给出明确原因
				return { code: 'INVALID_STATUS', message: '当前订单状态无法取消' }
			}

			// === 退款：取消成功后，若已支付则退款 ===
			// - 余额支付：退回站内余额（wallet-service.refundForUser）
			// - 微信支付：原路退款到微信（payment-service.refundOrder，异步完成）
			let refunded = false
			let refundAmount = 0
			let refundChannel = ''

			// 判断是否“已支付”，并尽量拿到“支付渠道（wechat/balance）”
			// 目的：避免把微信支付单误退到余额（你要的是原路退微信）
			let isPaid = false
			let payTxDoc = null
			if (order.pay_status === 'paid') {
				isPaid = true
			}
			// 无论是否 pay_status=paid，都查一次成功的支付流水用于判定 channel（兼容老数据）
			const payTx = await db.collection('transactions')
				.where({
					user_id: uid,
					type: 'pay',
					status: 'success',
					order_id: orderId
				})
				.orderBy('create_time', 'desc')
				.limit(1)
				.get()
			if (payTx.data && payTx.data.length) {
				payTxDoc = payTx.data[0]
				isPaid = true
			}

			if (isPaid) {
				refundAmount = Number(order.price || 0)
				if (refundAmount > 0) {
					// 退款渠道判定优先级（从高到低）：
					// 1) 支付流水 channel（最可靠）
					// 2) 订单 pay_method
					// 3) 订单 out_trade_no 存在则视为微信支付
					// 目的：坚决避免“微信支付却退到余额”
					const txChannel = (payTxDoc && payTxDoc.channel) ? String(payTxDoc.channel) : ''
					const payMethod = (order.pay_method || '').toString()
					const txLooksLikeWechat = !!(payTxDoc && (payTxDoc.out_trade_no || payTxDoc.transaction_id))
					const isWechat =
						txChannel === 'wechat' ||
						txLooksLikeWechat ||
						payMethod === 'wechat' ||
						(!!order.out_trade_no && payMethod !== 'balance')

					if (isWechat) {
						refundChannel = 'wechat'
						const paymentService = uniCloud.importObject('payment-service')
						const refundRes = await paymentService.refundOrder({
							orderId,
							reason: '订单取消',
							userId: uid // 服务端内部调用：避免 payment-service 误判“未登录”
						})
						if (refundRes && refundRes.code === 0) {
							// 微信原路退款是异步：这里只表示“已受理”
							refunded = true
							await db.collection('orders').doc(orderId).update({
								refund_status: 'refunding_wechat',
								refund_time: now
							})
						} else {
							await db.collection('orders').doc(orderId).update({
								refund_status: 'refund_failed',
								refund_time: now
							})
							return {
								code: 'REFUND_FAILED',
								message: refundRes?.message || '订单已取消，但微信退款申请失败，请联系管理员处理'
							}
						}
					} else {
						refundChannel = 'balance'
						const walletService = uniCloud.importObject('wallet-service')
						const refundRes = await walletService.refundForUser(uid, refundAmount, orderId)
						if (refundRes && refundRes.code === 0) {
							refunded = true
							await db.collection('orders').doc(orderId).update({
								refund_status: 'refunded_to_balance',
								refund_time: now
							})
						} else {
							await db.collection('orders').doc(orderId).update({
								refund_status: 'refund_failed',
								refund_time: now
							})
							return {
								code: 'REFUND_FAILED',
								message: '订单已取消，但退款失败，请联系管理员处理'
							}
						}
					}
				}
			}

			return {
				code: 0,
				message: refunded
					? (refundChannel === 'wechat' ? '取消成功，退款已受理，将原路退回微信' : '取消成功，款项已退回余额')
					: '取消成功',
				data: {
					refunded,
					refund_amount: refunded ? refundAmount : 0,
					refund_channel: refunded ? refundChannel : ''
				}
			}
		} catch (error) {
			console.error('取消订单失败:', error)
			return {
				code: 'DB_ERROR',
				message: '取消订单失败：' + error.message
			}
		}
	},

	/**
	 * 骑手取消订单（允许 delivering）
	 * - reasonType='rider_personal'：骑手原因，订单回到大厅（pending_accept + hall_visible=true + rider_id=null），不退款
	 * - reasonType='user_illegal'：用户问题，取消并全额退款 + 记录 illegal-order
	 *
	 * @param {string} orderId 订单ID（orders._id）
	 * @param {object} payload
	 * @param {'rider_personal'|'user_illegal'} payload.reasonType
	 * @param {string} payload.reasonText 骑手说明（6~30字）
	 * @param {object} payload.actualQuantities 骑手实际物品数量（仅 user_illegal 使用）：{ small, medium, large }
	 */
	async riderCancelOrder(orderId, payload = {}) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const riderUid = authResult.uid

		if (!orderId) {
			return {
				code: 'INVALID_PARAM',
				message: '订单ID不能为空'
			}
		}

		const reasonType = payload && payload.reasonType ? String(payload.reasonType) : ''
		const reasonText = (payload && payload.reasonText ? String(payload.reasonText) : '').trim()

		if (!['rider_personal', 'user_illegal'].includes(reasonType)) {
			return {
				code: 'INVALID_PARAM',
				message: '取消原因类型错误'
			}
		}
		if (!reasonText || reasonText.length < 6 || reasonText.length > 30) {
			return {
				code: 'INVALID_PARAM',
				message: '取消原因需在 6~30 字之间'
			}
		}

		const dbCmd = db.command
		const now = Date.now()

		// 先读订单，用于校验权限与退款判定
		const orderResult = await db.collection('orders').doc(orderId).get()
		if (!orderResult.data || !orderResult.data.length) {
			return { code: 'NOT_FOUND', message: '订单不存在' }
		}
		const order = orderResult.data[0]

		// 只能取消自己接的单
		if (order.rider_id !== riderUid) {
			return { code: 'NO_PERMISSION', message: '无权限取消此订单' }
		}

		// 允许在 pending_pickup / delivering 取消
		if (!['pending_pickup', 'delivering'].includes(order.status)) {
			return { code: 'INVALID_STATUS', message: '当前订单状态无法取消' }
		}

		// 原子更新：先把订单改成目标状态，避免并发重复取消
		let updateRes = null

		if (reasonType === 'rider_personal') {
			updateRes = await db.collection('orders')
				.where({
					_id: orderId,
					rider_id: riderUid,
					status: dbCmd.in(['pending_pickup', 'delivering'])
				})
				.update({
					status: 'pending_accept',
					hall_visible: true,
					rider_id: null,
					update_time: now
				})
		} else {
			// user_illegal：全额退款 + 记录 illegal-order
			// 新需求：前端取消不再要求骑手手动填实际数量
			// 为保证 illegal-order 的展示字段可用，这里用订单 content.quantities 做兜底。
			const q = (payload && payload.actualQuantities) ? payload.actualQuantities : null

			const fallbackQs = (order.content && order.content.quantities) ? order.content.quantities : {}
			const small = q && q.small != null ? Number(q.small) : Number(fallbackQs.small || 0)
			const medium = q && q.medium != null ? Number(q.medium) : Number(fallbackQs.medium || 0)
			const large = q && q.large != null ? Number(q.large) : Number(fallbackQs.large || 0)

			// 只要取消原因文本正确，就允许进入退款逻辑；数量用于记录展示字段。
			// 若 fallbackQs 也为空，则 rider_quantities 记为 0，不影响退款/取消动作。
			if (Number.isNaN(small) || Number.isNaN(medium) || Number.isNaN(large)) {
				// 防御：极端脏数据时兜底为 0
				// eslint-disable-next-line no-unused-vars
			}

			updateRes = await db.collection('orders')
				.where({
					_id: orderId,
					rider_id: riderUid,
					status: dbCmd.in(['pending_pickup', 'delivering'])
				})
				.update({
					status: 'cancelled',
					hall_visible: false,
					rider_id: null,
					cancel_time: now,
					update_time: now
				})

			if (updateRes.updated === 0) {
				return { code: 'INVALID_STATUS', message: '订单状态已变化，无法取消' }
			}

			// 写入 illegal-order：记录“用户填的 vs 骑手判定的”
			const userQs = (order.content && order.content.quantities) ? order.content.quantities : {}
			await db.collection('illegal-order').add({
				order_id: orderId,
				user_id: order.user_id,
				rider_id: riderUid,
				// 与 schema 的 reason_type enum 保持一致
				reason_type: 'user_illegal',
				reason_text: reasonText,
				user_quantities: {
					small: Number(userQs.small || 0),
					medium: Number(userQs.medium || 0),
					large: Number(userQs.large || 0)
				},
				rider_quantities: { small, medium, large },
				create_time: now,
				update_time: now
			})
		}

		if (updateRes.updated === 0) {
			return { code: 'INVALID_STATUS', message: '订单状态已变化，无法取消' }
		}

		// rider_personal 不退款
		if (reasonType === 'rider_personal') {
			return {
				code: 0,
				message: '取消成功，订单已回到大厅'
			}
		}

		// user_illegal：全额退款（目标用户为 order.user_id）
		const userId = order.user_id
		let refunded = false
		let refundAmount = 0
		let refundChannel = ''

		let isPaid = false
		let payTxDoc = null
		if (order.pay_status === 'paid') {
			isPaid = true
		}

		// 查一次成功支付流水用于判定渠道（兼容老数据）
		const payTx = await db.collection('transactions')
			.where({
				user_id: userId,
				type: 'pay',
				status: 'success',
				order_id: orderId
			})
			.orderBy('create_time', 'desc')
			.limit(1)
			.get()

		if (payTx.data && payTx.data.length) {
			payTxDoc = payTx.data[0]
			isPaid = true
		}

		if (isPaid) {
			refundAmount = Number(order.price || 0)
			if (refundAmount > 0) {
				const txChannel = (payTxDoc && payTxDoc.channel) ? String(payTxDoc.channel) : ''
				const payMethod = (order.pay_method || '').toString()
				const txLooksLikeWechat = !!(payTxDoc && (payTxDoc.out_trade_no || payTxDoc.transaction_id))
				const isWechat =
					txChannel === 'wechat' ||
					txLooksLikeWechat ||
					payMethod === 'wechat' ||
					(!!order.out_trade_no && payMethod !== 'balance')

				if (isWechat) {
					refundChannel = 'wechat'
					const paymentService = uniCloud.importObject('payment-service')
					const refundRes = await paymentService.refundOrder({
						orderId,
						reason: reasonText,
						userId
					})
					if (refundRes && refundRes.code === 0) {
						refunded = true
						await db.collection('orders').doc(orderId).update({
							refund_status: 'refunding_wechat',
							refund_time: now
						})
					} else {
						await db.collection('orders').doc(orderId).update({
							refund_status: 'refund_failed',
							refund_time: now
						})
						return {
							code: 'REFUND_FAILED',
							message: refundRes?.message || '订单已取消，但微信退款申请失败，请联系管理员处理'
						}
					}
				} else {
					refundChannel = 'balance'
					const walletService = uniCloud.importObject('wallet-service')
					const refundRes = await walletService.refundForUser(userId, refundAmount, orderId)
					if (refundRes && refundRes.code === 0) {
						refunded = true
						await db.collection('orders').doc(orderId).update({
							refund_status: 'refunded_to_balance',
							refund_time: now
						})
					} else {
						await db.collection('orders').doc(orderId).update({
							refund_status: 'refund_failed',
							refund_time: now
						})
						return {
							code: 'REFUND_FAILED',
							message: '订单已取消，但退款失败，请联系管理员处理'
						}
					}
				}
			}
		}

		return {
			code: 0,
			message: refunded
				? (refundChannel === 'wechat' ? '取消成功，已触发全额退款（原路退回微信）' : '取消成功，已触发全额退款（退回余额）')
				: '取消成功',
			data: {
				refunded,
				refund_amount: refunded ? refundAmount : 0,
				refund_channel: refunded ? refundChannel : ''
			}
		}
	},

	/**
	 * 删除订单
	 * @param {string} orderId 订单ID
	 * @returns {object} 删除结果
	 */
	async deleteOrder(orderId) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		if (!orderId) {
			return {
				code: 'INVALID_PARAM',
				message: '订单ID不能为空'
			}
		}

		try {
			// 先查询订单
			const orderResult = await db.collection('orders')
				.doc(orderId)
				.get()

			if (orderResult.data.length === 0) {
				return {
					code: 'NOT_FOUND',
					message: '订单不存在'
				}
			}

			const order = orderResult.data[0]

			// 权限检查：只能删除自己的订单
			if (order.user_id !== uid) {
				return {
					code: 'NO_PERMISSION',
					message: '无权限删除此订单'
				}
			}

			// 仅允许删除已完成或已取消的订单
			const deletableStatuses = ['completed', 'cancelled']
			if (!deletableStatuses.includes(order.status)) {
				return {
					code: 'INVALID_STATUS',
					message: '只能删除已完成或已取消的订单'
				}
			}

			// 删除订单
			await db.collection('orders')
				.doc(orderId)
				.remove()

			return {
				code: 0,
				message: '删除成功'
			}
		} catch (error) {
			console.error('删除订单失败:', error)
			return {
				code: 'DB_ERROR',
				message: '删除订单失败：' + error.message
			}
		}
	},

	// ==================== 骑手端功能 ====================

	/**
	 * 获取骑手首页聚合数据（大厅任务 + 我的任务）
	 * 目的：减少前端首屏多次云函数调用
	 */
	async getRiderDashboard(params = {}) {
		const limitErr = await enforceRateLimit(this, 'getRiderDashboard')
		if (limitErr) return limitErr
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}

		const {
			sortBy = 'distance',
			page = 1,
			pageSize = 7,
			myStatus = 'all',
			myPage = 1,
			myPageSize = 7,
			includeStats = true
		} = params

		try {
			const safePage = ensurePositiveInt(page, 1)
			const safePageSize = ensurePositiveInt(pageSize, 7)
			const safeMyPage = ensurePositiveInt(myPage, 1)
			const safeMyPageSize = ensurePositiveInt(myPageSize, 7)

			const [hallTasks, myTasks] = await Promise.all([
				fetchHallTasksByUid(authResult.uid, sortBy, safePage, safePageSize),
				fetchMyTasksByUid(authResult.uid, myStatus, safeMyPage, safeMyPageSize)
			])

			let riderStats = null
			if (includeStats) {
				const statsRes = await getRiderStatsByUid(authResult.uid)
				if (statsRes.code === 0) riderStats = statsRes.data
			}

			return {
				code: 0,
				message: '获取成功',
				data: {
					hallTasks,
					myTasks,
					riderStats
				}
			}
		} catch (error) {
			console.error('获取骑手聚合数据失败:', error)
			return {
				code: 'DB_ERROR',
				message: '获取骑手聚合数据失败：' + error.message
			}
		}
	},

	/**
	 * 获取大厅任务列表（待接单的订单）
	 * @param {object} params 查询参数
	 * @param {string} params.sortBy 排序方式：distance（距离最近）/price（金额最高）
	 * @param {number} params.page 页码，默认1
	 * @param {number} params.pageSize 每页数量，默认10
	 * @returns {object} 任务列表
	 */
	async getHallTasks(params = {}) {
		const limitErr = await enforceRateLimit(this, 'getHallTasks')
		if (limitErr) return limitErr
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		const sortBy = params.sortBy || 'distance'
		const page = ensurePositiveInt(params.page, 1)
		const pageSize = ensurePositiveInt(params.pageSize, 10)

		try {
			const data = await fetchHallTasksByUid(uid, sortBy, page, pageSize)

			return {
				code: 0,
				message: '获取成功',
				data,
				// 兼容旧字段：前端当前不依赖精确 total，因此用当前返回的数量回填
				total: data.length
			}
		} catch (error) {
			console.error('获取大厅任务失败:', error)
			return {
				code: 'DB_ERROR',
				message: '获取大厅任务失败：' + error.message
			}
		}
	},

	/**
	 * 抢单（接单）
	 * @param {string} orderId 订单ID
	 * @returns {object} 抢单结果
	 */
	async grabTask(orderId) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		if (!orderId) {
			return {
				code: 'INVALID_PARAM',
				message: '订单ID不能为空'
			}
		}

		try {
			// 先查询订单
			const orderResult = await db.collection('orders')
				.doc(orderId)
				.get()

			if (orderResult.data.length === 0) {
				return {
					code: 'NOT_FOUND',
					message: '订单不存在'
				}
			}

			const order = orderResult.data[0]

			// 检查订单状态（必须已支付且在大厅可见）
			if (order.status !== 'pending_accept') {
				return {
					code: 'INVALID_STATUS',
					message: '订单已被接单或已取消'
				}
			}
			if (order.pay_status !== 'paid' || order.hall_visible !== true) {
				return {
					code: 'NOT_PAID',
					message: '订单未支付，暂不可接单'
				}
			}

			// 检查是否已被其他骑手接单
			if (order.rider_id) {
				return {
					code: 'ALREADY_GRABBED',
					message: '订单已被其他骑手接单'
				}
			}

			// 不能接自己的订单
			if (order.user_id === uid) {
				return {
					code: 'CANNOT_GRAB_OWN',
					message: '不能接自己的订单'
				}
			}

			// 骑手资质检查：必须管理员审核通过后才可接单
			const riderProfileRes = await db.collection('rider_profiles')
				.where({ user_id: uid })
				.limit(1)
				.get()
			if (!riderProfileRes.data.length) {
				return {
					code: 'NO_RIDER_PROFILE',
					message: '请先提交骑手认证资料'
				}
			}
			const riderProfile = riderProfileRes.data[0] || {}
			if (riderProfile.status !== 'approved') {
				if (riderProfile.status === 'pending') {
					return {
						code: 'RIDER_NOT_APPROVED',
						message: '骑手认证审核中，请等待管理员通过后接单'
					}
				}
				return {
					code: 'RIDER_NOT_APPROVED',
					message: '骑手认证未通过，请联系管理员'
				}
			}

			// 如果是送货上门订单，校验骑手性别是否符合要求
			const isDelivery = !!(order.content && order.content.isDelivery)
			const requiredGender = order.content && order.content.requiredRiderGender

			if (isDelivery && requiredGender) {
				const riderGender = riderProfile.gender // male / female

				if (!riderGender) {
					return {
						code: 'NO_RIDER_GENDER',
						message: '骑手性别信息缺失，请重新提交认证资料'
					}
				}

				if (riderGender !== requiredGender) {
					const genderText = requiredGender === 'male' ? '男生' : '女生'
					return {
						code: 'GENDER_NOT_MATCH',
						message: `该订单要求 ${genderText} 骑手送货上门`
					}
				}
			}

			// 使用“带条件的更新”实现原子抢单，避免并发下多个骑手同时成功
			const updateRes = await db.collection('orders')
				.where({
					_id: orderId,
					status: 'pending_accept',
					rider_id: dbCmd.exists(false).or(dbCmd.eq(null))
				})
				.update({
					rider_id: uid,
					status: 'pending_pickup',
					accept_time: Date.now()
				})

			if (updateRes.updated === 0) {
				// 说明在本次操作前后，订单状态或骑手信息已被其他请求修改
				return {
					code: 'ALREADY_GRABBED',
					message: '订单已被其他骑手接单'
				}
			}

			return {
				code: 0,
				message: '抢单成功'
			}
		} catch (error) {
			console.error('抢单失败:', error)
			return {
				code: 'DB_ERROR',
				message: '抢单失败：' + error.message
			}
		}
	},

	/**
	 * 获取我的任务列表
	 * @param {object} params 查询参数
	 * @param {string} params.status 任务状态（可选：all/pending_pickup/delivering/completed）
	 * @param {number} params.page 页码，默认1
	 * @param {number} params.pageSize 每页数量，默认10
	 * @returns {object} 任务列表
	 */
	async getMyTasks(params = {}) {
		const limitErr = await enforceRateLimit(this, 'getMyTasks')
		if (limitErr) return limitErr
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		const status = params.status || 'all'
		const page = ensurePositiveInt(params.page, 1)
		const pageSize = ensurePositiveInt(params.pageSize, 10)

		try {
			const data = await fetchMyTasksByUid(uid, status, page, pageSize)

			return {
				code: 0,
				message: '获取成功',
				data,
				// 兼容旧字段：前端当前不依赖精确 total，因此用当前返回的数量回填
				total: data.length
			}
		} catch (error) {
			console.error('获取我的任务失败:', error)
			return {
				code: 'DB_ERROR',
				message: '获取我的任务失败：' + error.message
			}
		}
	},

	/**
	 * 确认取货
	 * @param {string} orderId 订单ID
	 * @param {array} images 取货凭证图片（可选）
	 * @returns {object} 确认结果
	 */
	async confirmPickup(orderId, images = []) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		if (!orderId) {
			return {
				code: 'INVALID_PARAM',
				message: '订单ID不能为空'
			}
		}

		try {
			// 先查询订单
			const orderResult = await db.collection('orders')
				.doc(orderId)
				.get()

			if (orderResult.data.length === 0) {
				return {
					code: 'NOT_FOUND',
					message: '订单不存在'
				}
			}

			const order = orderResult.data[0]

			// 权限检查：只能操作自己接的单
			if (order.rider_id !== uid) {
				return {
					code: 'NO_PERMISSION',
					message: '无权限操作此订单'
				}
			}

			// 检查订单状态：必须是待取货状态
			if (order.status !== 'pending_pickup') {
				return {
					code: 'INVALID_STATUS',
					message: '订单状态不正确，无法确认取货'
				}
			}

			// 更新订单：记录取货时间和凭证，状态改为配送中
			const updateData = {
				status: 'delivering',
				pickup_time: Date.now()
			}

			// 如果有图片，保存到 content.pickup_images
			if (images && images.length > 0) {
				updateData['content.pickup_images'] = images
			}

			await db.collection('orders')
				.doc(orderId)
				.update(updateData)

			return {
				code: 0,
				message: '确认取货成功'
			}
		} catch (error) {
			console.error('确认取货失败:', error)
			return {
				code: 'DB_ERROR',
				message: '确认取货失败：' + error.message
			}
		}
	},

	/**
	 * 确认送达
	 * @param {string} orderId 订单ID
	 * @param {array} images 送达凭证图片
	 * @returns {object} 确认结果
	 */
  async confirmDelivery(orderId, images = []) {
    const authResult = checkAuth(this)
    if (authResult.code) {
      return authResult
		}
		const uid = authResult.uid

		if (!orderId) {
			return {
				code: 'INVALID_PARAM',
				message: '订单ID不能为空'
			}
		}

		if (!images || images.length === 0) {
			return {
				code: 'INVALID_PARAM',
				message: '请上传送达凭证图片'
			}
		}

		try {
			// 先查询订单
			const orderResult = await db.collection('orders')
				.doc(orderId)
				.get()

			if (orderResult.data.length === 0) {
				return {
					code: 'NOT_FOUND',
					message: '订单不存在'
				}
			}

			const order = orderResult.data[0]

			// 权限检查：只能操作自己接的单
			if (order.rider_id !== uid) {
				return {
					code: 'NO_PERMISSION',
					message: '无权限操作此订单'
				}
			}

			// 检查订单状态：配送中 或 异常单都允许上传送达凭证
			if (!['delivering', ORDER_STATUS.ABNORMAL].includes(order.status)) {
				return {
					code: 'INVALID_STATUS',
					message: '订单状态不正确，无法确认送达'
				}
			}

			const now = Date.now()

			if (order.status === 'delivering') {
				// 首次送达：完成订单，记录完成时间和送达凭证
				await db.collection('orders')
					.doc(orderId)
					.update({
						status: 'completed',
						complete_time: now,
						'content.delivery_images': images,
						'content.pending_redelivery_upload': false
					})

				await incDashboardMetrics({ completedInc: 1 })

				// 调用骑手服务，更新累计单数和等级抽成，并给骑手入账
				try {
					const riderService = uniCloud.importObject('rider-service')
					await riderService.afterOrderCompleted(orderId, order.rider_id, order.price)
				} catch (e) {
					console.error('调用骑手结算服务失败:', e)
					// 不影响送达成功本身，只记录错误日志
				}
			} else {
				// 异常单重传送达图：恢复为已完成，不重复结算
				await db.collection('orders')
					.doc(orderId)
					.update({
						status: 'completed',
						'content.delivery_images': images,
						'content.pending_redelivery_upload': false,
						abnormal_resolved_time: now,
						update_time: now
					})
			}

			return {
				code: 0,
				message: '确认送达成功'
			}
		} catch (error) {
			console.error('确认送达失败:', error)
			return {
				code: 'DB_ERROR',
				message: '确认送达失败：' + error.message
			}
		}
	},

	/**
	 * 用户提交配送异常反馈（需备注说明）
	 * - 同一订单可多次反馈
	 * - 反馈次数达到阈值后，自动生成客服介入单并禁止继续反馈
	 */
	async reportWrongDeliveryPhoto({ orderId, reason = '' } = {}) {
		const limitErr = await enforceRateLimit(this, 'reportWrongDeliveryPhoto')
		if (limitErr) return limitErr
		const authResult = checkAuth(this)
		if (authResult.code) return authResult
		const uid = authResult.uid
		const reasonText = String(reason || '').trim().slice(0, 120)

		if (!orderId) {
			return { code: 'INVALID_PARAM', message: 'orderId 不能为空' }
		}
		if (!reasonText) {
			return { code: 'INVALID_PARAM', message: '请填写异常备注说明' }
		}

		try {
			const orderRes = await db.collection('orders').doc(orderId).get()
			if (!orderRes.data || !orderRes.data.length) {
				return { code: 'NOT_FOUND', message: '订单不存在' }
			}
			const order = orderRes.data[0]
			if (order.user_id !== uid) {
				return { code: 'NO_PERMISSION', message: '无权反馈此订单' }
			}
			if (!['completed', ORDER_STATUS.ABNORMAL].includes(order.status)) {
				return { code: 'INVALID_STATUS', message: '当前订单状态不支持异常反馈' }
			}

			const prevCount = Number(order.photo_feedback_count || 0)
			if (prevCount >= FEEDBACK_LIMIT) {
				return {
					code: 'CUSTOMER_SERVICE_REQUIRED',
					message: '该订单已触发客服介入，请联系客服处理',
					data: {
						feedbackCount: prevCount,
						limit: FEEDBACK_LIMIT,
						contactRequired: true
					}
				}
			}

			const now = Date.now()
			const nextCount = prevCount + 1
			const needCS = nextCount >= FEEDBACK_LIMIT
			const feedbackLog = {
				time: now,
				by: uid,
				reason: reasonText
			}

			await db.collection('orders').doc(orderId).update({
				status: ORDER_STATUS.ABNORMAL,
				abnormal_reason: 'delivery_issue',
				abnormal_remark: reasonText,
				abnormal_time: now,
				photo_feedback_count: nextCount,
				photo_feedback_last_time: now,
				need_customer_service: needCS,
				'content.pending_redelivery_upload': !needCS,
				'content.delivery_feedback_logs': dbCmd.push(feedbackLog),
				update_time: now
			})

			if (needCS) {
				await db.collection('customer_service_interventions').doc(orderId).set({
					order_id: orderId,
					user_id: order.user_id,
					rider_id: order.rider_id || '',
					type: 'delivery_issue',
					status: 'open',
					feedback_count: nextCount,
					latest_reason: feedbackLog.reason,
					latest_feedback_time: now,
					create_time: now,
					update_time: now
				})
			}

			return {
				code: 0,
				message: needCS
					? '反馈次数已达上限，请联系客服处理，系统已生成介入单'
					: '反馈成功，已通知骑手处理异常并重新上传送达凭证',
				data: {
					feedbackCount: nextCount,
					limit: FEEDBACK_LIMIT,
					contactRequired: needCS
				}
			}
		} catch (error) {
			console.error('提交配送异常反馈失败:', error)
			return {
				code: 'DB_ERROR',
				message: '反馈失败：' + error.message
			}
		}
	},

	/**
	 * 别名：reportDeliveryIssue -> 复用异常反馈逻辑
	 */
	async reportDeliveryIssue({ orderId, reason = '' } = {}) {
		return this.reportWrongDeliveryPhoto({ orderId, reason })
	},

  /**
   * 获取当前用户的地址列表
   */
  async getAddressList () {
    const authResult = checkAuth(this)
    if (authResult.code) {
      return authResult
    }
    const uid = authResult.uid

    try {
      const res = await db.collection('addresses')
        .where({ user_id: uid })
        .orderBy('create_time', 'desc')
        .get()

      return {
        code: 0,
        message: '获取成功',
        data: res.data
      }
    } catch (error) {
      console.error('获取地址列表失败:', error)
      return {
        code: 'DB_ERROR',
        message: '获取地址列表失败：' + error.message
      }
    }
  },

  /**
   * 新增地址
   */
  async addAddress (addressData) {
		const flags = await securityKit.getRuntimeFlags()
		if (flags.degrade_non_core_write) {
			return { code: 'DEGRADED', message: '当前处于降级模式，请稍后再试' }
		}
    const authResult = checkAuth(this)
    if (authResult.code) {
      return authResult
    }
    const uid = authResult.uid

    if (!addressData || !addressData.name || !addressData.phone || !addressData.detail) {
      return {
        code: 'INVALID_PARAM',
        message: '联系人、手机号和详细地址不能为空'
      }
    }

    const doc = {
      user_id: uid,
      name: addressData.name,
      phone: addressData.phone,
      detail: addressData.detail,
      school_area: addressData.schoolArea || '',
      is_default: !!addressData.isDefault,
      create_time: Date.now()
    }

    try {
      if (doc.is_default) {
        await db.collection('addresses')
          .where({ user_id: uid, is_default: true })
          .update({ is_default: false })
      }

      const res = await db.collection('addresses').add(doc)

      return {
        code: 0,
        message: '新增地址成功',
        data: { _id: res.id, ...doc }
      }
    } catch (error) {
      console.error('新增地址失败:', error)
      return {
        code: 'DB_ERROR',
        message: '新增地址失败：' + error.message
      }
    }
  },

  /**
   * 更新地址
   */
  async updateAddress (id, addressData = {}) {
		const flags = await securityKit.getRuntimeFlags()
		if (flags.degrade_non_core_write) {
			return { code: 'DEGRADED', message: '当前处于降级模式，请稍后再试' }
		}
    const authResult = checkAuth(this)
    if (authResult.code) {
      return authResult
    }
    const uid = authResult.uid

    if (!id) {
      return { code: 'INVALID_PARAM', message: '地址ID不能为空' }
    }

    const updateDoc = {}
    if (addressData.name) updateDoc.name = addressData.name
    if (addressData.phone) updateDoc.phone = addressData.phone
    if (addressData.detail) updateDoc.detail = addressData.detail
    if (addressData.schoolArea !== undefined) {
      updateDoc.school_area = addressData.schoolArea
    }
    if (addressData.isDefault !== undefined) {
      updateDoc.is_default = !!addressData.isDefault
    }

    if (Object.keys(updateDoc).length === 0) {
      return { code: 'INVALID_PARAM', message: '没有需要更新的字段' }
    }

    try {
      const collection = db.collection('addresses')
      const findRes = await collection.where({ _id: id, user_id: uid }).limit(1).get()
      if (findRes.data.length === 0) {
        return { code: 'NOT_FOUND', message: '地址不存在或无权访问' }
      }

      if (updateDoc.is_default) {
        await collection.where({ user_id: uid, is_default: true, _id: dbCmd.neq(id) }).update({ is_default: false })
      }

      await collection.doc(id).update(updateDoc)

      return { code: 0, message: '更新地址成功' }
    } catch (error) {
      console.error('更新地址失败:', error)
      return { code: 'DB_ERROR', message: '更新地址失败：' + error.message }
    }
  },

  /**
   * 删除地址
   */
  async deleteAddress (id) {
		const flags = await securityKit.getRuntimeFlags()
		if (flags.degrade_non_core_write) {
			return { code: 'DEGRADED', message: '当前处于降级模式，请稍后再试' }
		}
    const authResult = checkAuth(this)
    if (authResult.code) {
      return authResult
    }
    const uid = authResult.uid

    if (!id) {
      return { code: 'INVALID_PARAM', message: '地址ID不能为空' }
    }

    try {
      const collection = db.collection('addresses')
      const findRes = await collection.where({ _id: id, user_id: uid }).limit(1).get()

      if (!findRes.data.length) {
        return { code: 'NOT_FOUND', message: '地址不存在或无权访问' }
      }

      await collection.doc(id).remove()

      return { code: 0, message: '删除地址成功' }
    } catch (error) {
      console.error('删除地址失败:', error)
      return { code: 'DB_ERROR', message: '删除地址失败：' + error.message }
    }
  },

  /**
   * 设置默认地址
   */
  async setDefaultAddress (id) {
		const flags = await securityKit.getRuntimeFlags()
		if (flags.degrade_non_core_write) {
			return { code: 'DEGRADED', message: '当前处于降级模式，请稍后再试' }
		}
    const authResult = checkAuth(this)
    if (authResult.code) {
      return authResult
    }
    const uid = authResult.uid

    if (!id) {
      return { code: 'INVALID_PARAM', message: '地址ID不能为空' }
    }

    try {
      const collection = db.collection('addresses')
      const findRes = await collection.where({ _id: id, user_id: uid }).limit(1).get()
      if (!findRes.data.length) {
        return { code: 'NOT_FOUND', message: '地址不存在或无权访问' }
      }

      await collection.where({ user_id: uid, is_default: true, _id: dbCmd.neq(id) }).update({ is_default: false })
      await collection.doc(id).update({ is_default: true })

      return { code: 0, message: '设置默认地址成功' }
    } catch (error) {
      console.error('设置默认地址失败:', error)
      return { code: 'DB_ERROR', message: '设置默认地址失败：' + error.message }
    }
  },

	/**
	 * 获取快递代取价格配置
	 */
	async getPickupRates () {
		try {
			const res = await db.collection('item_price_config')
				.where(dbCmd.or([
					{ type: dbCmd.in(['pickup_small', 'pickup_medium', 'pickup_large', 'pickup_extra_large']) },
					{ scene: 'pickup', size: dbCmd.in(['small', 'medium', 'large', 'extra_large']) }
				]))
				.get()

			const list = res.data || []
			const rates = { small: 1.5, medium: 2, large: 3, extra_large: 5 }
			const typeToSize = {
				pickup_small: 'small',
				pickup_medium: 'medium',
				pickup_large: 'large',
				pickup_extra_large: 'extra_large'
			}

			list.forEach((item) => {
				if (typeof item.price !== 'number') return
				const size = (item.scene === 'pickup' && item.size)
					? String(item.size)
					: typeToSize[item.type]
				if (size && rates[size] != null) {
					rates[size] = item.price
				}
			})

	      return { code: 0, data: rates }
	    } catch (error) {
	      console.error('获取快递代取价格失败:', error)
      return { code: 'DB_ERROR', message: '获取价格配置失败：' + error.message }
    }
  },

	/**
	 * 首单优惠预览（仅用于下单页展示，不做核销）
	 */
	async getFirstOrderDiscountPreview() {
		const authResult = checkAuth(this)
		if (authResult.code) return authResult
		const uid = authResult.uid

		try {
			const settingRes = await db.collection('maintenance_settings').doc('first_order_discount').get()
			const setting = Array.isArray(settingRes.data) ? settingRes.data[0] : settingRes.data
			const enable = setting?.enable !== false
			const amount = Number(setting?.amount)
			const discountAmount = Number.isFinite(amount) ? Math.max(0, Math.min(50, amount)) : 5
			const budgetLimit = Number(setting?.budget_limit)
			const budgetUsed = Number(setting?.budget_used || 0)
			const cap = Number.isFinite(budgetLimit) ? Math.max(0, budgetLimit) : 500

			if (!enable || discountAmount <= 0) {
				return { code: 0, data: { enable: false, canUse: false, amount: discountAmount } }
			}
			if (budgetUsed + discountAmount > cap) {
				return {
					code: 0,
					data: {
						enable: true,
						canUse: false,
						amount: discountAmount,
						reason: 'BUDGET_EXHAUSTED'
					}
				}
			}

			const userRes = await db.collection('uni-id-users').doc(uid).get()
			const user = Array.isArray(userRes.data) ? userRes.data[0] : userRes.data
			const registerTs = Number(user?.register_date || user?.create_date || 0)
			const validMs = FIRST_ORDER_DISCOUNT_VALID_DAYS * 24 * 60 * 60 * 1000
			if (!Number.isFinite(registerTs) || registerTs <= 0 || Date.now() - registerTs > validMs) {
				return {
					code: 0,
					data: {
						enable: true,
						canUse: false,
						amount: discountAmount,
						reason: 'NOT_IN_7_DAYS'
					}
				}
			}

			const usedRes = await db.collection('user_first_order_discount').doc(uid).get()
			const usedDoc = Array.isArray(usedRes.data) ? usedRes.data[0] : usedRes.data
			if (usedDoc && usedDoc.status === 'used') {
				return {
					code: 0,
					data: {
						enable: true,
						canUse: false,
						amount: discountAmount,
						reason: 'ALREADY_USED'
					}
				}
			}

			const paidCountRes = await db.collection('orders').where({
				user_id: uid,
				order_class: dbCmd.neq(ORDER_CLASS.URGENT_ADDON),
				pay_status: 'paid'
			}).count()
			if (Number(paidCountRes.total || 0) > 0) {
				return {
					code: 0,
					data: {
						enable: true,
						canUse: false,
						amount: discountAmount,
						reason: 'HAD_PAID_ORDER'
					}
				}
			}

			return {
				code: 0,
				data: {
					enable: true,
					canUse: true,
					amount: discountAmount
				}
			}
		} catch (error) {
			return {
				code: 'DB_ERROR',
				message: '获取首单优惠预览失败：' + error.message
			}
		}
	},

  /**
   * 首页内容：广告位 + 公告列表
   */
  async getHomeContent () {
    try {
			const flags = await securityKit.getRuntimeFlags()
			if (flags.degrade_home_read) {
				return {
					code: 0,
					message: '首页已降级为缓存模式',
					data: {
						heroes: [],
						announcements: []
					}
				}
			}

      const heroRes = await db.collection('home_hero')
        .where(dbCmd.or([{ enabled: true }, { enabled: dbCmd.exists(false) }]))
        .orderBy('sort', 'asc')
        .limit(20)
        .get()

      const heroes = (heroRes.data || [])
        .filter((row) => row.enabled !== false)
        .map((row) => ({
          _id: row._id,
          title: row.title != null ? String(row.title) : '',
          desc: row.desc != null ? String(row.desc) : '',
          cta_text: row.cta_text != null ? String(row.cta_text) : '联系运营',
          show_cta: row.show_cta !== false,
          image_file_id: row.image_file_id ? String(row.image_file_id) : '',
          link_url: row.link_url ? String(row.link_url) : '',
          sort: row.sort != null ? row.sort : 0
        }))

      const annRes = await db.collection('home_announcements')
        .where(dbCmd.or([{ enabled: true }, { enabled: dbCmd.exists(false) }]))
        .orderBy('sort', 'asc')
        .limit(30)
        .get()

      const announcements = (annRes.data || [])
        .filter((row) => row.enabled !== false)
        .map((row) => ({
          _id: row._id,
          title: row.title || '',
          content: row.content || '',
          image_file_id: row.image_file_id ? String(row.image_file_id) : '',
          sort: row.sort != null ? row.sort : 0
        }))

      return { code: 0, data: { heroes, announcements } }
    } catch (error) {
      console.error('getHomeContent', error)
      return { code: 'DB_ERROR', message: '获取首页内容失败：' + error.message }
    }
  }
}
