'use strict'

/**
 * 管理端云对象：仅管理员可调用
 * 需在 uni-id-roles 中配置 role_id 为 admin 的角色，并赋予运营账号
 */
const crypto = require('crypto')
const uniIdCommon = require('uni-id-common')
const db = uniCloud.database()
const dbCmd = db.command

/** 拥有该 role_id 的账号可调用 admin-service（与 uni-id-roles 表一致） */
const ADMIN_ROLE_IDS = ['admin']

function pad2(n) {
	return String(n).padStart(2, '0')
}

/**
 * 某日 0 点 ~ 23:59:59（服务器本地时区）
 */
function getDayRange(dateStr) {
	const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
	const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
	const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
	return { start, end }
}

function formatYMD(d) {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function normalizeAmount(num) {
	const n = Number(num || 0)
	if (!n || isNaN(n)) return 0
	return Math.round(n * 100) / 100
}

/**
 * 是否允许访问管理端：
 * - admin_accounts 中存在任意记录时：仅 uni_id_uid 命中且 enabled 的账号可访问
 * - admin_accounts 为空时：沿用 uni-id role 含 admin（便于首次部署与录入账号）
 */
async function isUserAllowlisted(uid) {
	if (!uid) return false
	const ures = await db.collection('uni-id-users').doc(uid).field({ role: true }).get()
	const row = ures.data && ures.data[0]
	if (!row) return false

	const accCount = await db.collection('admin_accounts').count()
	const total = accCount.total || 0
	if (total === 0) {
		const roles = row.role || []
		return roles.some((r) => ADMIN_ROLE_IDS.includes(r))
	}

	const accRes = await db.collection('admin_accounts').where({ uni_id_uid: uid, enabled: true }).limit(1).get()
	return !!(accRes.data && accRes.data.length > 0)
}

function hashAdminPassword(password, salt) {
	return crypto.createHmac('sha256', salt).update(String(password)).digest('hex')
}

/**
 * 校验管理员（白名单 + 兼容空表时的 admin 角色）
 */
async function assertAdmin(uid) {
	if (!uid) {
		return { code: 401, message: '请先登录' }
	}
	const ok = await isUserAllowlisted(uid)
	if (!ok) {
		return {
			code: 403,
			message:
				'无权限：若已配置 admin_accounts，请使用表内绑定的 uni-id 账号登录；表为空时需 uni-id 中分配 admin 角色'
		}
	}
	return { code: 0, uid }
}

async function initAuth(ctx) {
	const clientInfo = ctx.getClientInfo()
	const uniIdIns = uniIdCommon.createInstance({ clientInfo })
	let uid = null
	try {
		const token = ctx.getUniIdToken()
		if (token) {
			const payload = await uniIdIns.checkToken(token)
			if (payload.code === 0) {
				uid = payload.uid
			}
		}
	} catch (e) {
		console.error('[admin-service] token error', e)
	}
	return uid
}

module.exports = {
	_before: async function () {
		this.uid = await initAuth(this)
	},

	/**
	 * 健康检查
	 */
	async ping() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		return { code: 0, message: 'ok', time: Date.now() }
	},

	/**
	 * 看板汇总
	 * @param {string} [date] 可选 YYYY-MM-DD，默认今天
	 */
	async getDashboard({ date } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const { start, end } = date ? getDayRange(date) : getDayRange()
		const ymd = formatYMD(start)

		// 今日订单（全部）
		const todayOrdersRes = await db.collection('orders')
			.where({
				create_time: dbCmd.gte(start).and(dbCmd.lte(end))
			})
			.field({ status: true, type: true, price: true, pay_status: true, create_time: true, rider_id: true })
			.limit(5000)
			.get()

		const todayOrders = todayOrdersRes.data || []
		const todayOrderCount = todayOrders.length

		let todayGmv = 0
		let todayPaidCount = 0
		const statusMap = {}
		const typeMap = {}
		const hourly = Array(24).fill(0).map(() => 0)

		for (const row of todayOrders) {
			const st = row.status || 'unknown'
			statusMap[st] = (statusMap[st] || 0) + 1
			const ty = row.type || 'unknown'
			typeMap[ty] = (typeMap[ty] || 0) + 1
			if (row.pay_status === 'paid') {
				todayGmv += Number(row.price || 0)
				todayPaidCount += 1
			}
			const ct = row.create_time
			const t = ct instanceof Date ? ct : new Date(ct)
			if (!isNaN(t.getTime())) {
				const h = t.getHours()
				if (h >= 0 && h < 24) hourly[h] += 1
			}
		}

		// 订单状态分布（用于饼图）
		const statusDistribution = Object.keys(statusMap).map((k) => ({
			status: k,
			count: statusMap[k]
		}))

		// 订单类型分布（今日）
		const typeDistribution = Object.keys(typeMap).map((k) => ({
			type: k,
			count: typeMap[k]
		}))

		// 近 7 日 GMV（已支付订单按 create_time）
		const sevenStart = new Date(start)
		sevenStart.setDate(sevenStart.getDate() - 6)
		sevenStart.setHours(0, 0, 0, 0)
		const paidRangeRes = await db.collection('orders')
			.where({
				pay_status: 'paid',
				create_time: dbCmd.gte(sevenStart).and(dbCmd.lte(end))
			})
			.field({ price: true, create_time: true })
			.limit(8000)
			.get()

		const dayGmv = {}
		for (const row of paidRangeRes.data || []) {
			const ct = row.create_time
			const t = ct instanceof Date ? ct : new Date(ct)
			if (isNaN(t.getTime())) continue
			const key = formatYMD(t)
			dayGmv[key] = (dayGmv[key] || 0) + Number(row.price || 0)
		}
		const incomeTrend7d = []
		for (let i = 6; i >= 0; i--) {
			const d = new Date(start)
			d.setDate(d.getDate() - i)
			const k = formatYMD(d)
			incomeTrend7d.push({ date: k, gmv: Number((dayGmv[k] || 0).toFixed(2)) })
		}

		// 近 7 日每日订单量（按 create_time 所在自然日）
		const orders7dRes = await db.collection('orders')
			.where({
				create_time: dbCmd.gte(sevenStart).and(dbCmd.lte(end))
			})
			.field({ create_time: true })
			.limit(20000)
			.get()

		const dayOrderCount = {}
		for (const row of orders7dRes.data || []) {
			const ct = row.create_time
			const t = ct instanceof Date ? ct : new Date(ct)
			if (isNaN(t.getTime())) continue
			const key = formatYMD(t)
			dayOrderCount[key] = (dayOrderCount[key] || 0) + 1
		}
		const orderTrend7d = []
		for (let i = 6; i >= 0; i--) {
			const d = new Date(start)
			d.setDate(d.getDate() - i)
			const k = formatYMD(d)
			orderTrend7d.push({ date: k, order_count: dayOrderCount[k] || 0 })
		}

		// 骑手接单排行（近 7 日按 accept_time 统计接单量）
		const riderRankRes = await db.collection('orders')
			.where({
				rider_id: dbCmd.gt(''),
				accept_time: dbCmd.gte(sevenStart).and(dbCmd.lte(end))
			})
			.field({ rider_id: true, price: true })
			.limit(5000)
			.get()

		const riderMap = {}
		for (const row of riderRankRes.data || []) {
			const rid = row.rider_id
			if (!rid) continue
			if (!riderMap[rid]) riderMap[rid] = { rider_id: rid, order_count: 0, total_price: 0 }
			riderMap[rid].order_count += 1
			riderMap[rid].total_price += Number(row.price || 0)
		}
		let riderRanking = Object.values(riderMap)
			.sort((a, b) => b.order_count - a.order_count)
			.slice(0, 20)
			.map((r) => ({
				...r,
				total_price: Number(r.total_price.toFixed(2))
			}))

		// 无 accept_time 的老数据时，用近 7 日「已完成」单量作为排行参考
		if (riderRanking.length === 0) {
			const riderFallback = await db.collection('orders')
				.where({
					status: 'completed',
					complete_time: dbCmd.gte(sevenStart).and(dbCmd.lte(end)),
					rider_id: dbCmd.gt('')
				})
				.field({ rider_id: true, price: true })
				.limit(5000)
				.get()
			const fm = {}
			for (const row of riderFallback.data || []) {
				const rid = row.rider_id
				if (!rid) continue
				if (!fm[rid]) fm[rid] = { rider_id: rid, order_count: 0, total_price: 0 }
				fm[rid].order_count += 1
				fm[rid].total_price += Number(row.price || 0)
			}
			riderRanking = Object.values(fm)
				.sort((a, b) => b.order_count - a.order_count)
				.slice(0, 20)
				.map((r) => ({
					...r,
					total_price: Number(r.total_price.toFixed(2))
				}))
		}

		// 待处理提现笔数
		let pendingWithdrawCount = 0
		try {
			const wr = await db.collection('withdraw_requests').where({ status: 'pending' }).count()
			pendingWithdrawCount = wr.total || 0
		} catch (e) {
			console.warn('[admin-service] withdraw_requests count', e.message)
		}

		// 统计日内的异常单数量 + 最近 20 条
		let abnormalList = []
		let illegalOrderCountToday = 0
		try {
			const illCount = await db.collection('illegal-order')
				.where({
					create_time: dbCmd.gte(start).and(dbCmd.lte(end))
				})
				.count()
			illegalOrderCountToday = illCount.total || 0
			const ill = await db.collection('illegal-order')
				.orderBy('create_time', 'desc')
				.limit(20)
				.get()
			abnormalList = ill.data || []
		} catch (e) {
			console.warn('[admin-service] illegal-order', e.message)
		}

		// daily_stats 中是否有今日（可选）
		let dailyStatRow = null
		try {
			const ds = await db.collection('daily_stats').where({ stat_date: ymd }).limit(1).get()
			dailyStatRow = ds.data && ds.data[0] ? ds.data[0] : null
		} catch (e) {
			// 表未建时忽略
		}

		return {
			code: 0,
			data: {
				date: ymd,
				todayOrderCount,
				todayPaidOrderCount: todayPaidCount,
				todayGmv: Number(todayGmv.toFixed(2)),
				statusDistribution,
				typeDistribution,
				hourlyToday: hourly,
				incomeTrend7d,
				orderTrend7d,
				riderRanking,
				pendingWithdrawCount,
				illegalOrderCountToday,
				abnormalList,
				dailyStatRow
			}
		}
	},

	/**
	 * 提现列表
	 */
	async listWithdrawRequests({ status, page = 1, pageSize = 20 } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const p = Math.max(1, parseInt(page, 10) || 1)
		const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))
		const skip = (p - 1) * ps

		const cond = {}
		if (status && ['pending', 'paid', 'rejected'].includes(status)) {
			cond.status = status
		}

		const col = db.collection('withdraw_requests')
		const totalRes = await col.where(cond).count()
		const listRes = await col
			.where(cond)
			.orderBy('create_time', 'desc')
			.skip(skip)
			.limit(ps)
			.get()

		const rawList = listRes.data || []
		const uids = [...new Set(rawList.map((r) => r.user_id).filter(Boolean))]
		const profileMap = {}
		const userMap = {}
		if (uids.length) {
			try {
				const rp = await db
					.collection('rider_profiles')
					.where({ user_id: dbCmd.in(uids) })
					.field({ user_id: true, name: true, mobile: true })
					.limit(500)
					.get()
				for (const row of rp.data || []) {
					if (row.user_id) profileMap[row.user_id] = { name: row.name, mobile: row.mobile }
				}
			} catch (e) {
				console.warn('[admin-service] rider_profiles for withdraw list', e.message)
			}
			try {
				const chunkSize = 50
				for (let i = 0; i < uids.length; i += chunkSize) {
					const chunk = uids.slice(i, i + chunkSize)
					const ur = await db
						.collection('uni-id-users')
						.where({ _id: dbCmd.in(chunk) })
						.field({ nickname: true, mobile: true, username: true })
						.get()
					for (const row of ur.data || []) {
						userMap[row._id] = row
					}
				}
			} catch (e) {
				console.warn('[admin-service] uni-id-users for withdraw list', e.message)
			}
		}

		const list = rawList.map((row) => {
			const p = profileMap[row.user_id]
			const u = userMap[row.user_id]
			const name = (p && p.name) || (u && (u.nickname || u.username)) || ''
			const mobile = (p && p.mobile) || (u && u.mobile) || ''
			return {
				...row,
				rider_name: name || '—',
				rider_mobile: mobile || '—'
			}
		})

		return {
			code: 0,
			data: {
				list,
				total: totalRes.total || 0,
				page: p,
				pageSize: ps
			}
		}
	},

	/**
	 * 标记已打款：提现单 → paid；流水 pending → success；累计 total_expense
	 */
	async markWithdrawPaid({ id, remark = '' } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) return { code: 400, message: '缺少 id' }

		const cur = await db.collection('withdraw_requests').doc(id).get()
		const row0 = Array.isArray(cur.data) ? cur.data[0] : cur.data
		if (!row0) {
			return { code: 404, message: '未找到提现单' }
		}
		if (row0.status !== 'pending') {
			return { code: 400, message: '仅待打款状态可操作' }
		}

		const now = Date.now()
		const updatePayload = {
			status: 'paid',
			paid_time: now,
			paid_by_uid: this.uid,
			update_time: now
		}
		if (remark) updatePayload.remark = remark

		const res = await db.collection('withdraw_requests').doc(id).update(updatePayload)
		if (res.updated === 0) {
			return { code: 404, message: '更新失败' }
		}

		// 关联流水：pending → success（余额已在申请时扣减，此处只确认出账）
		const txId = row0.transaction_id
		const uid = row0.user_id
		const amt = normalizeAmount(row0.amount)
		if (txId) {
			await db.collection('transactions').doc(txId).update({
				status: 'success',
				remark: remark || '提现成功（人工打款）',
				update_time: now
			})
		}
		try {
			const wRes = await db.collection('wallets').where({ user_id: uid }).limit(1).get()
			const w = wRes.data && wRes.data[0]
			if (w && amt > 0) {
				await db.collection('wallets').doc(w._id).update({
					total_expense: dbCmd.inc(amt),
					update_time: now
				})
			}
		} catch (e) {
			console.warn('[admin-service] total_expense inc', e.message)
		}

		return { code: 0, message: '已标记打款', data: { withdraw_id: id, user_id: uid } }
	},

	/**
	 * 驳回提现
	 */
	async rejectWithdraw({ id, reject_reason = '' } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) return { code: 400, message: '缺少 id' }

		const cur = await db.collection('withdraw_requests').doc(id).get()
		const row0 = Array.isArray(cur.data) ? cur.data[0] : cur.data
		if (!row0) {
			return { code: 404, message: '未找到提现单' }
		}
		if (row0.status !== 'pending') {
			return { code: 400, message: '仅待打款状态可驳回' }
		}

		const uid = row0.user_id
		const amt = normalizeAmount(row0.amount)
		const txId = row0.transaction_id

		const wRes = await db.collection('wallets').where({ user_id: uid }).limit(1).get()
		if (!wRes.data || !wRes.data.length) {
			return { code: 500, message: '用户钱包不存在，无法退回' }
		}
		const wallet = wRes.data[0]
		const balanceBefore = normalizeAmount(wallet.balance || 0)
		const balanceAfter = normalizeAmount(balanceBefore + amt)
		const now = Date.now()

		// 驳回：余额退回
		await db.collection('wallets').doc(wallet._id).update({
			balance: balanceAfter,
			update_time: now
		})

		const res = await db.collection('withdraw_requests').doc(id).update({
			status: 'rejected',
			reject_reason: reject_reason || '已驳回',
			update_time: now
		})
		if (res.updated === 0) {
			return { code: 404, message: '未找到提现单' }
		}

		if (txId) {
			await db.collection('transactions').doc(txId).update({
				status: 'failed',
				remark: `提现已驳回：${reject_reason || '已驳回'}`,
				balance_after: balanceAfter,
				update_time: now
			})
		}

		return { code: 0, message: '已驳回，余额已退回' }
	},

	/**
	 * 投诉列表（管理端）
	 */
	async listComplaints({ status, page = 1, pageSize = 20 } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const p = Math.max(1, parseInt(page, 10) || 1)
		const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))
		const skip = (p - 1) * ps

		const cond = {}
		// 管理端仅两种筛选：未解决（含历史 processing）、已解决（含历史 closed）
		if (status === 'pending') {
			cond.status = dbCmd.in(['pending', 'processing'])
		} else if (status === 'resolved') {
			cond.status = dbCmd.in(['resolved', 'closed'])
		}

		const col = db.collection('complaints')
		const totalRes = await col.where(cond).count()
		const listRes = await col
			.where(cond)
			.orderBy('create_time', 'desc')
			.skip(skip)
			.limit(ps)
			.get()

		return {
			code: 0,
			data: {
				list: listRes.data || [],
				total: totalRes.total || 0,
				page: p,
				pageSize: ps
			}
		}
	},

	/**
	 * 更新投诉状态（兼容旧管理端；新流程请用 markComplaintResolved）
	 */
	async updateComplaintStatus({ id, status, admin_remark = '' } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) return { code: 400, message: '缺少 id' }
		if (!status || !['pending', 'processing', 'resolved', 'closed'].includes(status)) {
			return { code: 400, message: '状态不合法' }
		}

		const now = Date.now()
		const payload = {
			status,
			update_time: now,
			handled_by_uid: this.uid
		}
		if (admin_remark) payload.admin_remark = admin_remark

		const res = await db.collection('complaints').doc(id).update(payload)
		if (res.updated === 0) {
			return { code: 404, message: '未找到记录' }
		}
		return { code: 0, message: '已更新' }
	},

	/**
	 * 标记投诉为已解决（仅未解决 → 已解决）
	 */
	async markComplaintResolved({ id, admin_remark = '' } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) return { code: 400, message: '缺少 id' }

		const cur = await db.collection('complaints').doc(id).get()
		const row0 = Array.isArray(cur.data) ? cur.data[0] : cur.data
		if (!row0) {
			return { code: 404, message: '未找到记录' }
		}
		const st = row0.status
		if (st === 'resolved' || st === 'closed') {
			return { code: 400, message: '已是已解决状态' }
		}

		const now = Date.now()
		const payload = {
			status: 'resolved',
			update_time: now,
			handled_by_uid: this.uid
		}
		if (admin_remark) payload.admin_remark = admin_remark

		const res = await db.collection('complaints').doc(id).update(payload)
		if (res.updated === 0) {
			return { code: 404, message: '更新失败' }
		}
		return { code: 0, message: '已标记为已解决' }
	},

	/**
	 * 投诉概览：全库条数 + 类型/状态分布（状态合并为 未解决/已解决；分布最多抽样 5000 条）
	 */
	async getComplaintsSummary() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const col = db.collection('complaints')
		const totalRes = await col.count()
		const totalAll = totalRes.total || 0

		const list = await col
			.field({ type: true, status: true })
			.limit(5000)
			.get()

		const normalizeStatus = (s) => {
			if (s === 'resolved' || s === 'closed') return 'resolved'
			return 'pending'
		}

		const byType = {}
		const byStatus = { pending: 0, resolved: 0 }
		for (const row of list.data || []) {
			const t = row.type || 'other'
			byType[t] = (byType[t] || 0) + 1
			const nk = normalizeStatus(row.status)
			byStatus[nk] = (byStatus[nk] || 0) + 1
		}

		return {
			code: 0,
			data: {
				total: totalAll,
				sampleSize: (list.data || []).length,
				byType,
				byStatus
			}
		}
	},

	/**
	 * 读取 daily_stats 区间（用于图表）
	 */
	async getDailyStatsRange({ startDate, endDate } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		if (!startDate || !endDate) {
			return { code: 400, message: '需要 startDate、endDate（YYYY-MM-DD）' }
		}

		const res = await db.collection('daily_stats')
			.where({
				stat_date: dbCmd.gte(startDate).and(dbCmd.lte(endDate))
			})
			.orderBy('stat_date', 'asc')
			.limit(366)
			.get()

		return { code: 0, data: { list: res.data || [] } }
	},

	/**
	 * 根据 orders 表汇总某天的 daily_stats（可定时或手动调用）
	 */
	async regenerateDailyStat({ stat_date } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		if (!stat_date || !/^\d{4}-\d{2}-\d{2}$/.test(stat_date)) {
			return { code: 400, message: 'stat_date 需为 YYYY-MM-DD' }
		}

		const { start, end } = getDayRange(stat_date)

		const ordersRes = await db.collection('orders')
			.where({
				create_time: dbCmd.gte(start).and(dbCmd.lte(end))
			})
			.field({ price: true, pay_status: true })
			.limit(10000)
			.get()

		const rows = ordersRes.data || []
		let order_count = rows.length
		let paid_order_count = 0
		let gmv = 0
		for (const r of rows) {
			if (r.pay_status === 'paid') {
				paid_order_count += 1
				gmv += Number(r.price || 0)
			}
		}

		const now = Date.now()
		const payload = {
			stat_date,
			order_count,
			paid_order_count,
			gmv: Number(gmv.toFixed(2)),
			update_time: now
		}

		const exist = await db.collection('daily_stats').where({ stat_date }).limit(1).get()
		if (exist.data && exist.data.length) {
			await db.collection('daily_stats').doc(exist.data[0]._id).update(payload)
		} else {
			await db.collection('daily_stats').add(payload)
		}

		return { code: 0, message: '已汇总', data: payload }
	},

	/**
	 * 订单列表（管理端，绕过客户端 schema 读权限）
	 */
	async listOrders({ status, pay_status, page = 1, pageSize = 20 } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const p = Math.max(1, parseInt(page, 10) || 1)
		const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))
		const skip = (p - 1) * ps

		const cond = {}
		if (status && String(status).trim()) cond.status = status
		if (pay_status && String(pay_status).trim()) cond.pay_status = pay_status

		const col = db.collection('orders')
		const totalRes = await col.where(cond).count()
		const listRes = await col
			.where(cond)
			.orderBy('create_time', 'desc')
			.skip(skip)
			.limit(ps)
			.get()

		return {
			code: 0,
			data: {
				list: listRes.data || [],
				total: totalRes.total || 0,
				page: p,
				pageSize: ps
			}
		}
	},

	/**
	 * 订单详情
	 */
	async getOrder({ id } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) return { code: 400, message: '缺少 id' }

		const res = await db.collection('orders').doc(id).get()
		const row0 = Array.isArray(res.data) ? res.data[0] : res.data
		if (!row0) return { code: 404, message: '未找到订单' }
		return { code: 0, data: row0 }
	},

	/**
	 * 骑手认证列表
	 */
	async listRiderProfiles({ status, page = 1, pageSize = 20 } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const p = Math.max(1, parseInt(page, 10) || 1)
		const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))
		const skip = (p - 1) * ps

		const cond = {}
		if (status && ['pending', 'approved', 'rejected'].includes(status)) {
			cond.status = status
		}

		const col = db.collection('rider_profiles')
		const totalRes = await col.where(cond).count()
		const listRes = await col
			.where(cond)
			.orderBy('create_time', 'desc')
			.skip(skip)
			.limit(ps)
			.get()

		return {
			code: 0,
			data: {
				list: listRes.data || [],
				total: totalRes.total || 0,
				page: p,
				pageSize: ps
			}
		}
	},

	/**
	 * 审核骑手认证：pending → approved / rejected
	 */
	async setRiderProfileStatus({ id, status, remark = '' } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) return { code: 400, message: '缺少 id' }
		if (!status || !['approved', 'rejected'].includes(status)) {
			return { code: 400, message: 'status 需为 approved 或 rejected' }
		}

		const cur = await db.collection('rider_profiles').doc(id).get()
		const row0 = Array.isArray(cur.data) ? cur.data[0] : cur.data
		if (!row0) return { code: 404, message: '未找到认证记录' }
		if (row0.status !== 'pending') {
			return { code: 400, message: '仅待审核状态可操作' }
		}

		const now = Date.now()
		await db.collection('rider_profiles').doc(id).update({
			status,
			remark: remark || (status === 'approved' ? '已通过' : '未通过'),
			update_time: now
		})
		return { code: 0, message: '已更新' }
	},

	/**
	 * 骑手认证资料 + 钱包（余额、冻结、累计收支）
	 * 以 rider_profiles 为列表主体，按 user_id 合并 wallets
	 */
	async listRidersWithBalances({ status, page = 1, pageSize = 20, keyword = '' } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const p = Math.max(1, parseInt(page, 10) || 1)
		const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))
		const skip = (p - 1) * ps

		const parts = []
		if (status && ['pending', 'approved', 'rejected'].includes(status)) {
			parts.push({ status })
		}
		const kw = String(keyword || '').trim()
		if (kw) {
			const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			const reg = new RegExp(esc, 'i')
			parts.push(
				dbCmd.or([
					{ name: reg },
					{ mobile: reg },
					{ student_no: reg },
					{ user_id: kw }
				])
			)
		}
		let cond = {}
		if (parts.length === 1) cond = parts[0]
		else if (parts.length > 1) cond = dbCmd.and(parts)

		const rpCol = db.collection('rider_profiles')
		const totalRes = await rpCol.where(cond).count()
		const listRes = await rpCol
			.where(cond)
			.orderBy('create_time', 'desc')
			.skip(skip)
			.limit(ps)
			.get()

		const profiles = listRes.data || []
		const uids = [...new Set(profiles.map((x) => x.user_id).filter(Boolean))]
		const walletMap = {}
		if (uids.length) {
			const chunkSize = 100
			for (let i = 0; i < uids.length; i += chunkSize) {
				const chunk = uids.slice(i, i + chunkSize)
				const wRes = await db.collection('wallets').where({ user_id: dbCmd.in(chunk) }).get()
				for (const w of wRes.data || []) {
					walletMap[w.user_id] = w
				}
			}
		}

		const list = profiles.map((row) => {
			const w = walletMap[row.user_id]
			return {
				profile_id: row._id,
				user_id: row.user_id,
				name: row.name,
				mobile: row.mobile,
				student_no: row.student_no,
				college_class: row.college_class,
				cert_status: row.status,
				id_card: row.id_card,
				wallet_id: w ? w._id : null,
				balance: w ? Number(Number(w.balance || 0).toFixed(2)) : 0,
				frozen_balance: w ? Number(Number(w.frozen_balance || 0).toFixed(2)) : 0,
				total_income: w ? Number(Number(w.total_income || 0).toFixed(2)) : 0,
				total_expense: w ? Number(Number(w.total_expense || 0).toFixed(2)) : 0,
				create_time: row.create_time
			}
		})

		return {
			code: 0,
			data: {
				list,
				total: totalRes.total || 0,
				page: p,
				pageSize: ps
			}
		}
	},

	/**
	 * 物件价格（快递代取小/中/大件）— 列表 + 默认值
	 */
	async listItemPriceConfig() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const PICKUP_TYPES = ['pickup_small', 'pickup_medium', 'pickup_large']
		const LABELS = {
			pickup_small: '快递代取 · 小件',
			pickup_medium: '快递代取 · 中件',
			pickup_large: '快递代取 · 大件'
		}
		const DEFAULTS = {
			pickup_small: 1.5,
			pickup_medium: 2,
			pickup_large: 3
		}

		const res = await db.collection('item_price_config')
			.where({ type: dbCmd.in(PICKUP_TYPES) })
			.get()

		const map = {}
		for (const row of res.data || []) {
			map[row.type] = row
		}

		const list = PICKUP_TYPES.map((t) => {
			const row = map[t]
			const price =
				row && typeof row.price === 'number'
					? row.price
					: DEFAULTS[t]
			return {
				type: t,
				label: LABELS[t],
				price: Math.round(Number(price) * 100) / 100,
				_id: row ? row._id : null
			}
		})

		return {
			code: 0,
			data: { list, hint: '修改后用户端下单页拉价会走 config-service.getPickupRates' }
		}
	},

	/**
	 * 保存单条物件价格（按 type  upsert）
	 */
	async saveItemPriceConfig({ type, price } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const PICKUP_TYPES = ['pickup_small', 'pickup_medium', 'pickup_large']
		const t = String(type || '').trim()
		if (!PICKUP_TYPES.includes(t)) {
			return { code: 400, message: 'type 必须为 pickup_small / pickup_medium / pickup_large' }
		}

		const p = Number(price)
		if (!Number.isFinite(p) || p <= 0 || p > 99999) {
			return { code: 400, message: '价格需为大于 0 的数字（元）' }
		}
		const rounded = Math.round(p * 100) / 100
		const now = Date.now()

		const existed = await db.collection('item_price_config').where({ type: t }).limit(1).get()
		if (existed.data && existed.data.length) {
			await db.collection('item_price_config').doc(existed.data[0]._id).update({
				price: rounded,
				update_time: now
			})
		} else {
			await db.collection('item_price_config').add({
				type: t,
				price: rounded,
				create_time: now,
				update_time: now
			})
		}

		return { code: 0, message: '已保存' }
	},

	/**
	 * 骑手等级与抽成列表（按 min_orders 升序）
	 */
	async listRiderLevels() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const res = await db.collection('rider_levels').orderBy('min_orders', 'asc').get()

		return {
			code: 0,
			data: {
				list: res.data || [],
				hint: 'commission_rate 为平台抽成比例（0~1），骑手分成 = 1 - 抽成'
			}
		}
	},

	/**
	 * 新增或更新骑手等级
	 */
	async saveRiderLevel({ id, code, name, min_orders, commission_rate } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const codeS = String(code || '').trim()
		const nameS = String(name || '').trim()
		if (!codeS || !nameS) {
			return { code: 400, message: '等级 code 与名称必填' }
		}

		const mo = Math.max(0, parseInt(min_orders, 10) || 0)
		const cr = Number(commission_rate)
		if (!Number.isFinite(cr) || cr < 0 || cr > 1) {
			return { code: 400, message: '平台抽成比例 commission_rate 需在 0~1 之间（如 0.11 表示 11%）' }
		}

		const now = Date.now()
		const roundedCr = Math.round(cr * 10000) / 10000
		const doc = {
			code: codeS,
			name: nameS,
			min_orders: mo,
			commission_rate: roundedCr,
			update_time: now
		}

		if (id) {
			const cur = await db.collection('rider_levels').doc(id).get()
			const row0 = Array.isArray(cur.data) ? cur.data[0] : cur.data
			if (!row0) {
				return { code: 404, message: '未找到该等级' }
			}
			await db.collection('rider_levels').doc(id).update(doc)
		} else {
			doc.create_time = now
			await db.collection('rider_levels').add(doc)
		}

		return { code: 0, message: '已保存' }
	},

	/**
	 * 删除骑手等级
	 */
	async deleteRiderLevel({ id } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) {
			return { code: 400, message: '缺少 id' }
		}

		await db.collection('rider_levels').doc(id).remove()
		return { code: 0, message: '已删除' }
	},

	/**
	 * 读取首页顶部广告（管理端，多条）
	 */
	async getHomeHero() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const res = await db.collection('home_hero').orderBy('sort', 'asc').limit(100).get()
		return {
			code: 0,
			data: {
				list: res.data || [],
				hint: '建议图片尺寸：宽 702×高 280 px（对应小程序约 702rpx×280rpx），比例约 2.5:1；可配置多条轮播，排序数字越小越靠前。'
			}
		}
	},

	/**
	 * 保存首页顶部广告（新增或更新）
	 */
	async saveHomeHero({
		id,
		title,
		desc,
		cta_text,
		image_file_id,
		link_url,
		sort = 0,
		enabled = true
	} = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const now = Date.now()
		const doc = {
			title: title != null ? String(title) : '',
			desc: desc != null ? String(desc) : '',
			cta_text: cta_text != null ? String(cta_text) : '联系运营',
			image_file_id: image_file_id ? String(image_file_id).trim() : '',
			link_url: link_url ? String(link_url).trim() : '',
			sort: Math.max(0, parseInt(sort, 10) || 0),
			enabled: enabled !== false,
			update_time: now
		}

		if (id) {
			const cur = await db.collection('home_hero').doc(id).get()
			const row0 = Array.isArray(cur.data) ? cur.data[0] : cur.data
			if (!row0) {
				return { code: 404, message: '未找到广告' }
			}
			await db.collection('home_hero').doc(id).update(doc)
		} else {
			doc.create_time = now
			await db.collection('home_hero').add(doc)
		}

		return { code: 0, message: '已保存' }
	},

	/**
	 * 删除首页顶部广告
	 */
	async deleteHomeHero({ id } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) {
			return { code: 400, message: '缺少 id' }
		}
		await db.collection('home_hero').doc(id).remove()
		return { code: 0, message: '已删除' }
	},

	/**
	 * 公告列表（管理端，含禁用）
	 */
	async listHomeAnnouncements() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const res = await db.collection('home_announcements').orderBy('sort', 'asc').limit(100).get()

		return {
			code: 0,
			data: {
				list: res.data || [],
				hint: '公告轮播图建议：宽 640×高 320 px 左右（16:9 或 2:1）；与顶部广告区分用途。排序数字越小越靠前。'
			}
		}
	},

	/**
	 * 保存公告（新增或更新）
	 */
	async saveHomeAnnouncement({
		id,
		title,
		content,
		image_file_id,
		sort = 0,
		enabled = true
	} = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const titleS = String(title || '').trim()
		if (!titleS) {
			return { code: 400, message: '标题必填' }
		}

		const now = Date.now()
		const doc = {
			title: titleS,
			content: content != null ? String(content) : '',
			image_file_id: image_file_id ? String(image_file_id).trim() : '',
			sort: Math.max(0, parseInt(sort, 10) || 0),
			enabled: enabled !== false,
			update_time: now
		}

		if (id) {
			const cur = await db.collection('home_announcements').doc(id).get()
			const row0 = Array.isArray(cur.data) ? cur.data[0] : cur.data
			if (!row0) {
				return { code: 404, message: '未找到公告' }
			}
			await db.collection('home_announcements').doc(id).update(doc)
		} else {
			doc.create_time = now
			await db.collection('home_announcements').add(doc)
		}

		return { code: 0, message: '已保存' }
	},

	/**
	 * 删除公告
	 */
	async deleteHomeAnnouncement({ id } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) {
			return { code: 400, message: '缺少 id' }
		}

		await db.collection('home_announcements').doc(id).remove()
		return { code: 0, message: '已删除' }
	},

	/**
	 * 登录页：是否可执行「首次绑定」admin_accounts（表为空且已有 uni-id admin）
	 */
	async getAdminLoginBootstrap() {
		const accCount = await db.collection('admin_accounts').count()
		const total = accCount.total || 0
		if (total > 0) {
			return { code: 0, data: { canSeed: false } }
		}
		const admins = await db.collection('uni-id-users').where({ role: 'admin' }).count()
		const n = admins.total || 0
		return { code: 0, data: { canSeed: n > 0 } }
	},

	/**
	 * 首次部署：admin_accounts 为空时，将 uni-id 中已有 admin 用户绑定为可账号密码登录（仅可调用一次）
	 */
	async seedAdminAccount({ username, password } = {}) {
		const accCount = await db.collection('admin_accounts').count()
		if ((accCount.total || 0) > 0) {
			return { code: 403, message: '已存在管理员账号配置' }
		}
		const admins = await db.collection('uni-id-users').where({ role: 'admin' }).field({ _id: true }).limit(1).get()
		const uid = admins.data && admins.data[0] && admins.data[0]._id
		if (!uid) {
			return { code: 400, message: '请先在 uni-id 中注册管理员（register-admin）' }
		}
		const uname = String(username || '').trim().toLowerCase()
		if (!uname || !password) {
			return { code: 400, message: '请输入用户名和密码' }
		}
		const dup = await db.collection('admin_accounts').where({ username: uname }).limit(1).get()
		if (dup.data && dup.data.length) {
			return { code: 400, message: '用户名已存在' }
		}
		const salt = crypto.randomBytes(16).toString('hex')
		const hash = hashAdminPassword(password, salt)
		const now = Date.now()
		await db.collection('admin_accounts').add({
			username: uname,
			password_salt: salt,
			password_hash: hash,
			uni_id_uid: uid,
			enabled: true,
			remark: 'seed',
			create_time: now,
			update_time: now
		})
		return { code: 0, message: '已保存，请使用账号密码登录' }
	},

	/**
	 * 管理端账号密码登录（校验 admin_accounts，签发 uni-id token）
	 */
	async adminLoginByPassword({ username, password } = {}) {
		const uname = String(username || '').trim().toLowerCase()
		if (!uname || !password) {
			return { code: 400, message: '请输入账号和密码' }
		}
		const res = await db.collection('admin_accounts').where({ username: uname, enabled: true }).limit(1).get()
		const row = res.data && res.data[0]
		if (!row) {
			return { code: 401, message: '账号或密码错误' }
		}
		const hash = hashAdminPassword(password, row.password_salt)
		if (hash !== row.password_hash) {
			return { code: 401, message: '账号或密码错误' }
		}
		const clientInfo = this.getClientInfo()
		const uniIdIns = uniIdCommon.createInstance({ clientInfo })
		let tokenRes
		try {
			tokenRes = await uniIdIns.createToken({ uid: row.uni_id_uid })
		} catch (e) {
			console.error('[admin-service] createToken', e)
			return { code: 500, message: e.message || '签发登录失败，请检查 uni-id 用户状态' }
		}
		if (tokenRes.errCode !== 0) {
			return { code: 500, message: '签发登录失败，请检查 uni-id 用户状态' }
		}
		const now = Date.now()
		try {
			await db.collection('uni-id-users').doc(row.uni_id_uid).update({
				last_login_date: now,
				last_login_ip: clientInfo.clientIP || ''
			})
		} catch (e) {
			console.warn('[admin-service] last_login update', e)
		}
		return {
			code: 0,
			errCode: 0,
			newToken: {
				token: tokenRes.token,
				tokenExpired: tokenRes.tokenExpired
			},
			uid: row.uni_id_uid,
			passwordConfirmed: true
		}
	},

	/**
	 * 登录成功后校验是否可进入管理端（uni-admin 前端调用）
	 */
	async checkAdminAccess() {
		if (!this.uid) {
			return { code: 401, message: '请先登录' }
		}
		const ok = await isUserAllowlisted(this.uid)
		if (!ok) {
			return {
				code: 403,
				message:
					'当前账号无权访问管理后台。若已启用 admin_accounts，请使用表内绑定的账号登录'
			}
		}
		return { code: 0, message: 'ok' }
	},

	/**
	 * 管理员账号列表（admin_accounts）
	 */
	async listAdminAccounts() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		const res = await db.collection('admin_accounts').orderBy('create_time', 'desc').limit(200).get()
		const list = (res.data || []).map((r) => ({
			_id: r._id,
			username: r.username,
			uni_id_uid: r.uni_id_uid,
			remark: r.remark,
			enabled: r.enabled,
			create_time: r.create_time,
			update_time: r.update_time
		}))
		return { code: 0, data: { list } }
	},

	/**
	 * 新增或更新管理员账号（密码仅新增或修改时传入）
	 */
	async saveAdminAccount({ id, username, password, uni_id_uid, remark, enabled = true } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const uname = String(username || '').trim().toLowerCase()
		if (!uname) {
			return { code: 400, message: '用户名必填' }
		}
		const uidStr = uni_id_uid != null ? String(uni_id_uid).trim() : ''
		if (!id && !uidStr) {
			return { code: 400, message: '请填写 uni_id_uid（关联 uni-id-users._id）' }
		}

		const dup = await db.collection('admin_accounts').where({ username: uname }).limit(1).get()
		if (dup.data && dup.data.length && (!id || dup.data[0]._id !== id)) {
			return { code: 400, message: '用户名已存在' }
		}

		const now = Date.now()
		if (id) {
			const cur = await db.collection('admin_accounts').doc(id).get()
			const row0 = Array.isArray(cur.data) ? cur.data[0] : cur.data
			if (!row0) {
				return { code: 404, message: '未找到记录' }
			}
			const doc = {
				username: uname,
				remark: remark != null ? String(remark) : '',
				enabled: enabled !== false,
				update_time: now
			}
			if (uidStr) {
				const ucheck = await db.collection('uni-id-users').doc(uidStr).get()
				const urow = Array.isArray(ucheck.data) ? ucheck.data[0] : ucheck.data
				if (!urow) {
					return { code: 400, message: 'uni_id_uid 在 uni-id-users 中不存在' }
				}
				const roles = urow.role || []
				if (!roles.includes('admin')) {
					return { code: 400, message: '该 uni-id 用户需具备 admin 角色' }
				}
				doc.uni_id_uid = uidStr
			}
			if (password) {
				const salt = crypto.randomBytes(16).toString('hex')
				doc.password_salt = salt
				doc.password_hash = hashAdminPassword(password, salt)
			}
			await db.collection('admin_accounts').doc(id).update(doc)
		} else {
			const ucheck = await db.collection('uni-id-users').doc(uidStr).get()
			const urow = Array.isArray(ucheck.data) ? ucheck.data[0] : ucheck.data
			if (!urow) {
				return { code: 400, message: 'uni_id_uid 在 uni-id-users 中不存在' }
			}
			const roles = urow.role || []
			if (!roles.includes('admin')) {
				return { code: 400, message: '该 uni-id 用户需具备 admin 角色' }
			}
			if (!password) {
				return { code: 400, message: '新增账号请设置密码' }
			}
			const salt = crypto.randomBytes(16).toString('hex')
			await db.collection('admin_accounts').add({
				username: uname,
				password_salt: salt,
				password_hash: hashAdminPassword(password, salt),
				uni_id_uid: uidStr,
				remark: remark != null ? String(remark) : '',
				enabled: enabled !== false,
				create_time: now,
				update_time: now
			})
		}
		return { code: 0, message: '已保存' }
	},

	/**
	 * 删除管理员账号行（不删除 uni-id 用户）
	 */
	async deleteAdminAccount({ id } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) {
			return { code: 400, message: '缺少 id' }
		}
		await db.collection('admin_accounts').doc(id).remove()
		return { code: 0, message: '已删除' }
	},

	/**
	 * 管理员白名单列表
	 */
	async listAdminAllowlist() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		const res = await db.collection('admin_allowlist').orderBy('create_time', 'desc').limit(200).get()
		return { code: 0, data: { list: res.data || [] } }
	},

	/**
	 * 新增或更新白名单（openid 与 wx_unionid 至少填一项；unionid 跨端统一优先）
	 */
	async saveAdminAllowlist({ id, openid, wx_unionid, remark, enabled = true } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const oid = openid != null ? String(openid).trim() : ''
		const unionStr = wx_unionid != null ? String(wx_unionid).trim() : ''
		if (!oid && !unionStr) {
			return { code: 400, message: '请至少填写 openid 或 wx_unionid 之一' }
		}

		const now = Date.now()
		const doc = {
			openid: oid,
			wx_unionid: unionStr,
			remark: remark != null ? String(remark) : '',
			enabled: enabled !== false,
			update_time: now
		}

		if (id) {
			const cur = await db.collection('admin_allowlist').doc(id).get()
			const row0 = Array.isArray(cur.data) ? cur.data[0] : cur.data
			if (!row0) {
				return { code: 404, message: '未找到记录' }
			}
			await db.collection('admin_allowlist').doc(id).update(doc)
		} else {
			doc.create_time = now
			await db.collection('admin_allowlist').add(doc)
		}
		return { code: 0, message: '已保存' }
	},

	/**
	 * 删除白名单
	 */
	async deleteAdminAllowlist({ id } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		if (!id) {
			return { code: 400, message: '缺少 id' }
		}
		await db.collection('admin_allowlist').doc(id).remove()
		return { code: 0, message: '已删除' }
	}
}
