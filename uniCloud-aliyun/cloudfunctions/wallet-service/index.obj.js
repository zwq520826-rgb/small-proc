// 钱包服务云对象
const uniIdCommon = require('uni-id-common')
const db = uniCloud.database()
const dbCmd = db.command

/**
 * 检查登录状态
 */
function checkAuth(ctx) {
	if (!ctx.uid) {
		return {
			code: 'NO_LOGIN',
			message: '请先登录'
		}
	}
	return { uid: ctx.uid }
}

/**
 * 金额统一精确到分（两位小数）
 * 所有写入数据库或用于累计的金额，必须先走这个方法
 */
function normalizeAmount(num) {
	const n = Number(num || 0)
	if (!n || isNaN(n)) return 0
	// 先放大到分，再四舍五入，最后再缩回元，保证只有两位小数
	return Math.round(n * 100) / 100
}

module.exports = {
	_before: async function() {
		// 获取客户端信息
		this.clientInfo = this.getClientInfo()
		// 解析 token 获取用户 ID
		const uniIdCommonIns = uniIdCommon.createInstance({
			clientInfo: this.clientInfo
		})
		try {
			const token = this.getUniIdToken()
			if (token) {
				const payload = await uniIdCommonIns.checkToken(token)
				if (payload.code === 0) {
					this.uid = payload.uid
					this.authInfo = payload
				}
			}
		} catch (e) {
			console.error('Token 校验失败:', e)
			this.uid = null
			this.authInfo = null
		}
	},

	/**
	 * 获取钱包余额
	 * @returns {object} 钱包信息
	 */
	async getBalance() {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		try {
			// 查询用户钱包
			let wallet = await db.collection('wallets')
				.where({ user_id: uid })
				.get()

			// 如果钱包不存在，创建一个
			if (wallet.data.length === 0) {
				const now = Date.now()
				await db.collection('wallets').add({
					user_id: uid,
					balance: 0,
					frozen_balance: 0,
					total_income: 0,
					total_expense: 0,
					create_time: now,
					update_time: now
				})
				wallet = await db.collection('wallets')
					.where({ user_id: uid })
					.get()
			}

			return {
				code: 0,
				message: '获取成功',
				data: wallet.data[0]
			}
		} catch (error) {
			console.error('获取钱包余额失败:', error)
			return {
				code: 'DB_ERROR',
				message: '获取余额失败：' + error.message
			}
		}
	},

  /**
   * 充值
   * @param {number} amount 充值金额
   * @returns {object} 充值结果
   */
  async recharge(amount) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		// 参数校验（统一精确到分）
		amount = normalizeAmount(amount)
		if (amount <= 0) {
			return {
				code: 'INVALID_PARAM',
				message: '充值金额必须大于0'
			}
		}

		try {
			// 获取当前钱包
			let walletRes = await db.collection('wallets')
				.where({ user_id: uid })
				.get()

			const now = Date.now()
			let wallet

			// 如果钱包不存在，创建一个
			if (walletRes.data.length === 0) {
				const addRes = await db.collection('wallets').add({
					user_id: uid,
					balance: 0,
					frozen_balance: 0,
					total_income: 0,
					total_expense: 0,
					create_time: now,
					update_time: now
				})
				wallet = {
					_id: addRes.id,
					balance: 0
				}
			} else {
				wallet = walletRes.data[0]
			}

			const balanceBefore = normalizeAmount(wallet.balance || 0)
			const balanceAfter = normalizeAmount(balanceBefore + amount)

			// 更新钱包余额
			await db.collection('wallets')
				.doc(wallet._id)
				.update({
					balance: balanceAfter,
					update_time: now
				})

			// 记录交易流水
			await db.collection('transactions').add({
				user_id: uid,
				type: 'recharge',
				amount: amount,
				balance_before: balanceBefore,
				balance_after: balanceAfter,
				status: 'success',
				remark: '余额充值',
				create_time: now
			})

			return {
				code: 0,
				message: '充值成功',
				data: {
					balance: balanceAfter
				}
			}
		} catch (error) {
			console.error('充值失败:', error)
			return {
				code: 'DB_ERROR',
				message: '充值失败：' + error.message
			}
		}
	},

	/**
	 * 提现申请：扣减余额 → 写入 withdraw_requests(pending) → 流水为 pending；人工打款后由 admin-service 将流水置为 success
	 * @param {number} amount 提现金额
	 * @returns {object} 提现结果
	 */
	async withdraw(amount) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		// 参数校验（统一精确到分）
		amount = normalizeAmount(amount)
		if (amount <= 0) {
			return {
				code: 'INVALID_PARAM',
				message: '提现金额必须大于0'
			}
		}

		try {
			// 获取当前钱包
			const walletRes = await db.collection('wallets')
				.where({ user_id: uid })
				.get()

			if (walletRes.data.length === 0) {
				return {
					code: 'NO_WALLET',
					message: '钱包不存在'
				}
			}

			const wallet = walletRes.data[0]
			const balanceBefore = normalizeAmount(wallet.balance || 0)

			// 检查余额是否足够
			if (balanceBefore < amount) {
				return {
					code: 'INSUFFICIENT_BALANCE',
					message: '余额不足'
				}
			}

			const balanceAfter = normalizeAmount(balanceBefore - amount)
			const now = Date.now()

			// 先扣余额（资金冻结在待打款流程中，驳回时由管理端退回）
			await db.collection('wallets')
				.doc(wallet._id)
				.update({
					balance: balanceAfter,
					update_time: now
				})

			let wrId = null
			try {
				const wrAdd = await db.collection('withdraw_requests').add({
					user_id: uid,
					amount,
					status: 'pending',
					create_time: now,
					update_time: now
				})
				wrId = wrAdd.id || wrAdd._id

				const txAdd = await db.collection('transactions').add({
					user_id: uid,
					type: 'withdraw',
					amount,
					balance_before: balanceBefore,
					balance_after: balanceAfter,
					status: 'pending',
					remark: '提现申请（待人工打款）',
					withdraw_request_id: wrId,
					create_time: now
				})
				const newTxId = txAdd.id || txAdd._id

				await db.collection('withdraw_requests').doc(wrId).update({
					transaction_id: newTxId,
					update_time: now
				})
			} catch (innerErr) {
				if (wrId) {
					try {
						await db.collection('withdraw_requests').doc(wrId).remove()
					} catch (e) {
						console.error('回滚 withdraw_requests 失败', e)
					}
				}
				await db.collection('wallets').doc(wallet._id).update({
					balance: balanceBefore,
					update_time: Date.now()
				})
				throw innerErr
			}

			return {
				code: 0,
				message: '提现申请已提交，请等待人工打款',
				data: {
					balance: balanceAfter,
					withdraw_request_id: wrId
				}
			}
		} catch (error) {
			console.error('提现失败:', error)
			return {
				code: 'DB_ERROR',
				message: '提现失败：' + error.message
			}
		}
	},

	/**
	 * 支付订单
	 * @param {number} amount 支付金额
	 * @param {string} orderId 订单ID
	 * @returns {object} 支付结果
	 */
	async pay(amount, orderId) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		// 参数校验（统一精确到分）
		amount = normalizeAmount(amount)
		if (amount <= 0) {
			return {
				code: 'INVALID_PARAM',
				message: '支付金额必须大于0'
			}
		}

		try {
			// 获取当前钱包
			const walletRes = await db.collection('wallets')
				.where({ user_id: uid })
				.get()

			if (walletRes.data.length === 0) {
				return {
					code: 'NO_WALLET',
					message: '钱包不存在，请先充值'
				}
			}

			const wallet = walletRes.data[0]
			const balanceBefore = normalizeAmount(wallet.balance || 0)

			// 检查余额是否足够
			if (balanceBefore < amount) {
				return {
					code: 'INSUFFICIENT_BALANCE',
					message: '余额不足'
				}
			}

			const balanceAfter = normalizeAmount(balanceBefore - amount)
			const now = Date.now()

			// 更新钱包余额和累计支出
			await db.collection('wallets')
				.doc(wallet._id)
				.update({
					balance: balanceAfter,
					total_expense: dbCmd.inc(amount),
					update_time: now
				})

			// 记录交易流水
			await db.collection('transactions').add({
				user_id: uid,
				type: 'pay',
				amount: amount,
				balance_before: balanceBefore,
				balance_after: balanceAfter,
				order_id: orderId || '',
				status: 'success',
				remark: '订单支付',
				create_time: now
			})

			// 余额支付成功后：推进订单状态（待支付 -> 已支付待接单，并进入大厅）
			if (orderId) {
				try {
					// 只允许从未支付推进，避免重复调用导致状态异常（幂等 + 互斥）
					await db.collection('orders')
						.where({
							_id: orderId,
							user_id: uid,
							// 只允许未支付订单推进（字段不存在 或 等于 unpaid）
							pay_status: dbCmd.exists(false).or(dbCmd.eq('unpaid'))
						})
						.update({
							pay_method: 'balance',
							pay_status: 'paid',
							pay_time: now,
							status: 'pending_accept',
							hall_visible: true,
							update_time: now
						})
				} catch (e) {
					console.error('余额支付后更新订单状态失败:', e)
					// 不影响扣款成功，但需要提示运营排查
				}
			}

			return {
				code: 0,
				message: '支付成功',
				data: {
					balance: balanceAfter
				}
			}
		} catch (error) {
			console.error('支付失败:', error)
			return {
				code: 'DB_ERROR',
				message: '支付失败：' + error.message
			}
		}
	},

	/**
	 * 骑手收入入账
	 * @param {number} amount 收入金额
	 * @param {string} orderId 订单ID
	 * @returns {object} 结果
	 */
	async addIncome(amount, orderId) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		// 参数校验（统一精确到分）
		amount = normalizeAmount(amount)
		if (amount <= 0) {
			return {
				code: 'INVALID_PARAM',
				message: '收入金额必须大于0'
			}
		}

		try {
			// 获取当前钱包
			let walletRes = await db.collection('wallets')
				.where({ user_id: uid })
				.get()

			const now = Date.now()
			let wallet

			// 如果钱包不存在，创建一个
			if (walletRes.data.length === 0) {
				const addRes = await db.collection('wallets').add({
					user_id: uid,
					balance: 0,
					frozen_balance: 0,
					total_income: 0,
					total_expense: 0,
					create_time: now,
					update_time: now
				})
				wallet = {
					_id: addRes.id,
					balance: 0
				}
			} else {
				wallet = walletRes.data[0]
			}

			const balanceBefore = normalizeAmount(wallet.balance || 0)
			const balanceAfter = normalizeAmount(balanceBefore + amount)

			// 更新钱包余额和累计收入
			await db.collection('wallets')
				.doc(wallet._id)
				.update({
					balance: balanceAfter,
					total_income: dbCmd.inc(amount),
					update_time: now
				})

			// 记录交易流水
			await db.collection('transactions').add({
				user_id: uid,
				type: 'income',
				amount: amount,
				balance_before: balanceBefore,
				balance_after: balanceAfter,
				order_id: orderId || '',
				status: 'success',
				remark: '订单收入',
				create_time: now
			})

			return {
				code: 0,
				message: '收入入账成功',
				data: {
					balance: balanceAfter
				}
			}
		} catch (error) {
			console.error('收入入账失败:', error)
			return {
				code: 'DB_ERROR',
				message: '收入入账失败：' + error.message
			}
		}
	},

	/**
	 * 【服务端内部调用】给指定用户入账（不依赖当前登录态）
	 * @param {string} userId 用户ID（例如骑手 uid）
	 * @param {number} amount 收入金额
	 * @param {string} orderId 订单ID
	 */
	async addIncomeForUser(userId, amount, orderId) {
		// 参数校验（统一精确到分）
		amount = normalizeAmount(amount)
		if (!userId || amount <= 0) {
			return {
				code: 'INVALID_PARAM',
				message: '用户ID或金额不合法'
			}
		}

		try {
			// 获取当前钱包
			let walletRes = await db.collection('wallets')
				.where({ user_id: userId })
				.get()

			const now = Date.now()
			let wallet

			// 如果钱包不存在，创建一个
			if (walletRes.data.length === 0) {
				const addRes = await db.collection('wallets').add({
					user_id: userId,
					balance: 0,
					frozen_balance: 0,
					total_income: 0,
					total_expense: 0,
					create_time: now,
					update_time: now
				})
				wallet = {
					_id: addRes.id,
					balance: 0
				}
			} else {
				wallet = walletRes.data[0]
			}

			const balanceBefore = normalizeAmount(wallet.balance || 0)
			const balanceAfter = normalizeAmount(balanceBefore + amount)

			// 更新钱包余额和累计收入
			await db.collection('wallets')
				.doc(wallet._id)
				.update({
					balance: balanceAfter,
					total_income: dbCmd.inc(amount),
					update_time: now
				})

			// 记录交易流水
			await db.collection('transactions').add({
				user_id: userId,
				type: 'income',
				amount: amount,
				balance_before: balanceBefore,
				balance_after: balanceAfter,
				order_id: orderId || '',
				status: 'success',
				remark: '订单收入',
				create_time: now
			})

			return {
				code: 0,
				message: '收入入账成功',
				data: {
					balance: balanceAfter
				}
			}
		} catch (error) {
			console.error('收入入账失败(addIncomeForUser):', error)
			return {
				code: 'DB_ERROR',
				message: '收入入账失败：' + error.message
			}
		}
	},

	/**
	 * 【服务端内部调用】订单退款退回余额（不依赖当前登录态）
	 * - 写入 transactions(type='refund')
	 * - 余额增加
	 * - total_expense 做相应回滚（净支出减少）
	 *
	 * @param {string} userId 用户ID（下单用户 uid）
	 * @param {number} amount 退款金额（元）
	 * @param {string} orderId 订单ID
	 */
	async refundForUser(userId, amount, orderId) {
		amount = normalizeAmount(amount)
		if (!userId || amount <= 0) {
			return {
				code: 'INVALID_PARAM',
				message: '用户ID或金额不合法'
			}
		}

		try {
			// 防重：同一订单只允许退款一次
			if (orderId) {
				const existed = await db.collection('transactions')
					.where({
						user_id: userId,
						type: 'refund',
						order_id: orderId,
						status: 'success'
					})
					.limit(1)
					.get()
				if (existed.data && existed.data.length) {
					return {
						code: 0,
						message: '已退款（幂等）',
						data: { duplicated: true }
					}
				}
			}

			let walletRes = await db.collection('wallets')
				.where({ user_id: userId })
				.get()

			const now = Date.now()
			let wallet

			if (walletRes.data.length === 0) {
				const addRes = await db.collection('wallets').add({
					user_id: userId,
					balance: 0,
					frozen_balance: 0,
					total_income: 0,
					total_expense: 0,
					create_time: now,
					update_time: now
				})
				wallet = {
					_id: addRes.id,
					balance: 0
				}
			} else {
				wallet = walletRes.data[0]
			}

			const balanceBefore = normalizeAmount(wallet.balance || 0)
			const balanceAfter = normalizeAmount(balanceBefore + amount)

			await db.collection('wallets')
				.doc(wallet._id)
				.update({
					balance: balanceAfter,
					// 退款会抵扣净支出（避免 total_expense 越来越大但已退款）
					total_expense: dbCmd.inc(-amount),
					update_time: now
				})

			await db.collection('transactions').add({
				user_id: userId,
				type: 'refund',
				amount: amount,
				balance_before: balanceBefore,
				balance_after: balanceAfter,
				order_id: orderId || '',
				status: 'success',
				remark: '订单退款（退回余额）',
				create_time: now
			})

			return {
				code: 0,
				message: '退款成功',
				data: {
					balance: balanceAfter
				}
			}
		} catch (error) {
			console.error('退款失败(refundForUser):', error)
			return {
				code: 'DB_ERROR',
				message: '退款失败：' + error.message
			}
		}
	},

	/**
	 * 获取交易记录
	 * @param {object} params 查询参数
	 * @param {string} params.type 交易类型（可选）
	 * @param {number} params.page 页码
	 * @param {number} params.pageSize 每页数量
	 * @returns {object} 交易记录列表
	 */
	async getTransactionList(params = {}) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		const { type, page = 1, pageSize = 20 } = params

		try {
			// 构建查询条件
			const where = { user_id: uid }
			if (type && type !== 'all') {
				where.type = type
			}

			// 查询交易记录
			const result = await db.collection('transactions')
				.where(where)
				.orderBy('create_time', 'desc')
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.get()

			return {
				code: 0,
				message: '获取成功',
				data: result.data,
				// 兼容旧字段：前端当前不依赖精确 total，因此用当前返回的数量回填
				total: (result.data && result.data.length) ? result.data.length : 0
			}
		} catch (error) {
			console.error('获取交易记录失败:', error)
			return {
				code: 'DB_ERROR',
				message: '获取交易记录失败：' + error.message
			}
		}
	}
}
