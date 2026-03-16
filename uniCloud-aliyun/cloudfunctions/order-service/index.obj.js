'use strict';

// 引入 uni-id-common
const uniID = require('uni-id-common')
const db = uniCloud.database()
const dbCmd = db.command

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

module.exports = {
	/**
	 * 通用预处理器
	 * 初始化 uni-id 实例，获取用户身份
	 */
	async _before() {
		// 获取客户端信息
		const clientInfo = this.getClientInfo()
		
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
		const order = {
			order_no: generateOrderNo(new Date()),
			user_id: uid,
			type: orderData.type,
			type_label: orderData.type_label || '',
			status: 'pending_accept',
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
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		const { status = 'all', page = 1, pageSize = 10 } = params

		try {
			let query = db.collection('orders').where({
				user_id: uid
			})

			// 根据状态过滤
			if (status && status !== 'all') {
				query = query.where({
					status: status
				})
			}

			const result = await query
				.orderBy('create_time', 'desc')
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.get()

			// 获取总数
			const countResult = await db.collection('orders')
				.where({
					user_id: uid,
					...(status && status !== 'all' ? { status } : {})
				})
				.count()

			return {
				code: 0,
				message: '获取成功',
				data: result.data,
				total: countResult.total
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

			// 原子取消：必须是待接单 & 未被骑手接单（互斥锁思路同抢单）
			// rider_id 不存在或为 null 才允许取消
			const updateRes = await db.collection('orders')
				.where({
					_id: orderId,
					user_id: uid,
					status: 'pending_accept',
					rider_id: dbCmd.exists(false).or(dbCmd.eq(null))
				})
				.update({
					status: 'cancelled',
					cancel_time: now,
					update_time: now
				})

			if (updateRes.updated === 0) {
				// 重新读一次，给出明确原因
				const latest = await db.collection('orders').doc(orderId).get()
				const o = latest.data && latest.data[0]
				if (o && o.rider_id) {
					return { code: 'ALREADY_GRABBED', message: '订单已被骑手接单，无法取消' }
				}
				return { code: 'INVALID_STATUS', message: '当前订单状态无法取消' }
			}

			// === 退款：取消成功后，若已支付则退回余额 ===
			let refunded = false
			let refundAmount = 0

			// 判断是否“已支付”
			// - 微信支付：pay_status === 'paid'
			// - 余额支付：transactions 里存在 type='pay' & status='success' & order_id=orderId
			let isPaid = false
			if (order.pay_status === 'paid') {
				isPaid = true
			} else {
				const payTx = await db.collection('transactions')
					.where({
						user_id: uid,
						type: 'pay',
						status: 'success',
						order_id: orderId
					})
					.limit(1)
					.get()
				if (payTx.data && payTx.data.length) isPaid = true
			}

			if (isPaid) {
				refundAmount = Number(order.price || 0)
				if (refundAmount > 0) {
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

			return {
				code: 0,
				message: refunded ? '取消成功，款项已退回余额' : '取消成功',
				data: {
					refunded,
					refund_amount: refunded ? refundAmount : 0
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

			// 只能删除已完成的订单
			if (order.status !== 'completed') {
				return {
					code: 'INVALID_STATUS',
					message: '只能删除已完成的订单'
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
	 * 获取大厅任务列表（待接单的订单）
	 * @param {object} params 查询参数
	 * @param {string} params.sortBy 排序方式：distance（距离最近）/price（金额最高）
	 * @param {number} params.page 页码，默认1
	 * @param {number} params.pageSize 每页数量，默认10
	 * @returns {object} 任务列表
	 */
	async getHallTasks(params = {}) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		const { sortBy = 'distance', page = 1, pageSize = 10 } = params

		try {
			// 查询待接单的订单（没有骑手接单的，且不是自己发布的）
			let query = db.collection('orders').where({
				status: 'pending_accept',
				rider_id: dbCmd.exists(false).or(dbCmd.eq(null)),
				user_id: dbCmd.neq(uid) // 排除自己发布的订单
			})

			// 排序
			if (sortBy === 'price') {
				query = query.orderBy('price', 'desc')
			} else {
				query = query.orderBy('pickup_distance', 'asc')
			}

			const result = await query
				.orderBy('create_time', 'desc')
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.get()

			// 获取总数
			const countResult = await db.collection('orders')
				.where({
					status: 'pending_accept',
					rider_id: dbCmd.exists(false).or(dbCmd.eq(null)),
					user_id: dbCmd.neq(uid) // 排除自己发布的订单
				})
				.count()

			return {
				code: 0,
				message: '获取成功',
				data: result.data,
				total: countResult.total
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

			// 检查订单状态
			if (order.status !== 'pending_accept') {
				return {
					code: 'INVALID_STATUS',
					message: '订单已被接单或已取消'
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

			// 如果是送货上门订单，校验骑手性别是否符合要求
			const isDelivery = !!(order.content && order.content.isDelivery)
			const requiredGender = order.content && order.content.requiredRiderGender

			if (isDelivery && requiredGender) {
				// 查询骑手认证资料
				const riderProfileRes = await db.collection('rider_profiles')
					.where({
						user_id: uid,
						status: 'approved'
					})
					.limit(1)
					.get()

				if (!riderProfileRes.data.length) {
					return {
						code: 'NO_RIDER_PROFILE',
						message: '请先完成骑手认证后再接送货上门订单'
					}
				}

				const riderProfile = riderProfileRes.data[0] || {}
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
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		const { status = 'all', page = 1, pageSize = 10 } = params

		try {
			let query = db.collection('orders').where({
				rider_id: uid
			})

			// 根据状态过滤
			if (status && status !== 'all') {
				query = query.where({
					status: status
				})
			}

			const result = await query
				.orderBy('accept_time', 'desc')
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.get()

			// 获取总数
			const countResult = await db.collection('orders')
				.where({
					rider_id: uid,
					...(status && status !== 'all' ? { status } : {})
				})
				.count()

			return {
				code: 0,
				message: '获取成功',
				data: result.data,
				total: countResult.total
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

			// 检查订单状态：必须是配送中状态
			if (order.status !== 'delivering') {
				return {
					code: 'INVALID_STATUS',
					message: '订单状态不正确，无法确认送达'
				}
			}

			// 更新订单：完成订单，记录完成时间和送达凭证
			await db.collection('orders')
				.doc(orderId)
				.update({
					status: 'completed',
					complete_time: Date.now(),
					'content.delivery_images': images
				})

			// 调用骑手服务，更新累计单数和等级抽成，并给骑手入账
			try {
				const riderService = uniCloud.importObject('rider-service')
				await riderService.afterOrderCompleted(orderId, order.rider_id, order.price)
			} catch (e) {
				console.error('调用骑手结算服务失败:', e)
				// 不影响送达成功本身，只记录错误日志
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
	}
}