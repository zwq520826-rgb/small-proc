'use strict'

/**
 * 管理端云对象：仅管理员可调用
 * 管理员账号由 admin_accounts 表维护（账号 + 密码）
 */
const uniIdCommon = require('uni-id-common')
const crypto = require('crypto')
const db = uniCloud.database()
const dbCmd = db.command

const SETTINGS_COLLECTION = 'maintenance_settings'
const ORDER_ARCHIVE_COLLECTION = 'orders_archive'
const ORDER_CLEANUP_SETTING_ID = 'order_cleanup'
const DEFAULT_ORDER_TTL_DAYS = 7
const DASHBOARD_COUNTERS_COLLECTION = 'dashboard_counters'

const ADMIN_LOCAL_UID = 'admin-local-account'
const ADMIN_REGISTER_LIMIT = 2

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
	return { start, end, startMs: start.getTime(), endMs: end.getTime() }
}

function formatYMD(d) {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function shiftYMD(ymd, days) {
	const d = new Date(`${ymd}T00:00:00`)
	d.setDate(d.getDate() + days)
	return formatYMD(d)
}

function normalizeAmount(num) {
	const n = Number(num || 0)
	if (!n || isNaN(n)) return 0
	return Math.round(n * 100) / 100
}

/**
 * 是否允许访问管理端：
 * - 仅允许通过 admin_accounts 账号密码登录后签发的本地管理员 token
 */
async function isUserAllowlisted(uid) {
	if (!uid) return false
	const accCount = await db.collection('admin_accounts').count()
	const total = accCount.total || 0
	if (total === 0) return false
	return uid === ADMIN_LOCAL_UID
}

async function getAdminAccountCount() {
	const accCount = await db.collection('admin_accounts').count()
	return accCount.total || 0
}

async function ensureLocalAdminUser(clientInfo = {}) {
	const users = db.collection('uni-id-users')
	const now = Date.now()
	const existRes = await users.doc(ADMIN_LOCAL_UID).get()
	const row = Array.isArray(existRes.data) ? existRes.data[0] : existRes.data
	if (row) {
		const roles = Array.isArray(row.role) ? row.role : []
		if (!roles.includes('admin')) {
			await users.doc(ADMIN_LOCAL_UID).update({
				role: roles.concat('admin'),
				update_date: now
			})
		}
		return
	}

	await users.add({
		_id: ADMIN_LOCAL_UID,
		username: 'admin-local',
		nickname: 'Admin Local',
		role: ['admin'],
		status: 0,
		dcloud_appid: clientInfo.appId || '',
		register_date: now,
		register_ip: clientInfo.clientIP || '',
		last_login_date: now,
		last_login_ip: clientInfo.clientIP || ''
	})
}

async function createSuperAdminAccount({ username, password, remark = 'super-admin' } = {}) {
	const uname = String(username || '').trim().toLowerCase()
	const pwd = String(password || '')
	if (!uname || !pwd) {
		return { code: 400, message: '请输入用户名和密码' }
	}

	const total = await getAdminAccountCount()
	if (total >= ADMIN_REGISTER_LIMIT) {
		return { code: 403, message: `管理员注册名额已满（最多 ${ADMIN_REGISTER_LIMIT} 个）` }
	}

	const dup = await db.collection('admin_accounts').where({ username: uname }).limit(1).get()
	if (dup.data && dup.data.length) {
		return { code: 400, message: '用户名已存在' }
	}

	const now = Date.now()
	const digest = buildPasswordDigest(pwd)
	await db.collection('admin_accounts').add({
		username: uname,
		password_salt: digest.salt,
		password_hash: digest.hash,
		password: '',
		enabled: true,
		is_super_admin: true,
		remark: String(remark || 'super-admin'),
		last_login_date: 0,
		last_login_ip: '',
		create_time: now,
		update_time: now
	})

	const after = await getAdminAccountCount()
	return {
		code: 0,
		message: '注册成功，请使用账号密码登录',
		data: {
			registered: after,
			limit: ADMIN_REGISTER_LIMIT,
			remaining: Math.max(0, ADMIN_REGISTER_LIMIT - after)
		}
	}
}

function hashLegacyPassword(password, salt) {
	return crypto.createHmac('sha256', String(salt || '')).update(String(password || '')).digest('hex')
}

function buildPasswordDigest(password) {
	const salt = crypto.randomBytes(16).toString('hex')
	const hash = hashLegacyPassword(password, salt)
	return { salt, hash }
}

/**
 * 校验管理员（仅 admin_accounts 登录签发的 token）
 */
async function assertAdmin(uid) {
	if (!uid) {
		return { code: 401, message: '请先登录' }
	}
	const ok = await isUserAllowlisted(uid)
	if (!ok) {
		return {
			code: 403,
			message: '无权限：请使用 admin_accounts 表内账号密码登录'
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

function normalizeCleanupConfig(doc) {
	const ttlDays = Number(doc?.ttl_days)
	return {
		ttl_days: Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : DEFAULT_ORDER_TTL_DAYS,
		updated_at: doc?.updated_at || null
	}
}

async function readCleanupSettings() {
	const res = await db.collection(SETTINGS_COLLECTION).doc(ORDER_CLEANUP_SETTING_ID).get()
	const row = Array.isArray(res.data) ? res.data[0] : res.data
	return normalizeCleanupConfig(row || {})
}

async function writeCleanupSettings(ttlDays) {
	const now = Date.now()
	await db
		.collection(SETTINGS_COLLECTION)
		.doc(ORDER_CLEANUP_SETTING_ID)
		.set({ ttl_days: ttlDays, updated_at: now })
	return { ttl_days: ttlDays, updated_at: now }
}

function extractFileIds(order) {
	const ids = new Set()
	const paths = [
		['content', 'images'],
		['content', 'pickupImages'],
		['content', 'deliveryImages'],
		['content', 'delivery_images'],
		['delivery_images'],
		['proof_images']
	]
	for (const path of paths) {
		let ref = order
		for (const key of path) {
			if (!ref) break
			ref = ref[key]
		}
		if (Array.isArray(ref)) {
			ref.forEach((fileId) => {
				if (typeof fileId === 'string' && fileId.startsWith('cloud://')) {
					ids.add(fileId)
				}
			})
		}
	}
	return Array.from(ids)
}

async function deleteFiles(fileIds = []) {
	const valid = Array.from(new Set(fileIds.filter((id) => typeof id === 'string' && id.startsWith('cloud://'))))
	if (!valid.length) return 0
	const chunkSize = 20
	let deleted = 0
	for (let i = 0; i < valid.length; i += chunkSize) {
		const chunk = valid.slice(i, i + chunkSize)
		await uniCloud.deleteFile({ fileList: chunk })
		deleted += chunk.length
	}
	return deleted
}

async function readOrderCounters() {
	try {
		const res = await db.collection(DASHBOARD_COUNTERS_COLLECTION).doc('orders').get()
		const row = Array.isArray(res.data) ? res.data[0] : res.data
		return row || {}
	} catch (e) {
		return {}
	}
}

async function getRecentDailyStats(ymd, days = 7) {
	const startDate = shiftYMD(ymd, -(days - 1))
	const res = await db.collection('daily_stats')
		.where({ stat_date: dbCmd.gte(startDate).and(dbCmd.lte(ymd)) })
		.orderBy('stat_date', 'asc')
		.limit(days + 2)
		.get()
	const map = {}
	for (const row of res.data || []) {
		map[row.stat_date] = row
	}
	const list = []
	for (let i = days - 1; i >= 0; i--) {
		const d = shiftYMD(ymd, -i)
		const row = map[d] || {}
		list.push({
			stat_date: d,
			order_count: Number(row.order_count || 0),
			paid_order_count: Number(row.paid_order_count || 0),
			gmv: Number(row.gmv || 0)
		})
	}
	return list
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

		const { start, end, startMs, endMs } = date ? getDayRange(date) : getDayRange()
		const ymd = formatYMD(start)
		const recentDaily = await getRecentDailyStats(ymd, 7)
		const counters = await readOrderCounters()
		const trendOrder7d = recentDaily.map((x) => ({ date: x.stat_date, order_count: x.order_count }))
		const trendPaidOrder7d = recentDaily.map((x) => ({ date: x.stat_date, paid_order_count: x.paid_order_count }))
		const trendIncome7d = recentDaily.map((x) => ({ date: x.stat_date, gmv: Number(x.gmv.toFixed(2)) }))

		// 低成本路径：优先读取 daily_stats，如果命中直接返回
		const cacheRes = await db.collection('daily_stats').where({ stat_date: ymd }).limit(1).get()
		const cached = cacheRes.data && cacheRes.data[0]
		if (cached) {
			return {
				code: 0,
				data: {
					date: ymd,
					order_count: cached.order_count || 0,
					paid_order_count: cached.paid_order_count || 0,
					gmv: Number((cached.gmv || 0).toFixed(2)),
					total_order_all_time: Number(counters.total_order_count || 0),
					total_paid_order_all_time: Number(counters.total_paid_order_count || 0),
					total_completed_order_all_time: Number(counters.total_completed_order_count || 0),
					status_distribution: cached.status_list || [],
					type_distribution: cached.type_list || [],
					income_trend_7d: (cached.income_trend_7d && cached.income_trend_7d.length) ? cached.income_trend_7d : trendIncome7d,
					order_trend_7d: (cached.order_trend_7d && cached.order_trend_7d.length) ? cached.order_trend_7d : trendOrder7d,
					paid_order_trend_7d: trendPaidOrder7d,
					rider_rank_7d: cached.rider_rank_7d || [],
					hourly: cached.hourly || []
				}
			}
		}

		// 未命中缓存时，用聚合降本统计当日核心指标（不再返回 7 日趋势，交由离线任务）
		const matchCond = { create_time: dbCmd.gte(startMs).and(dbCmd.lte(endMs)) }

		const summaryAgg = await db.collection('orders').aggregate()
			.match(matchCond)
			.group({
				_id: null,
				order_count: dbCmd.aggregate.sum(1),
				paid_order_count: dbCmd.aggregate.sum(
					dbCmd.aggregate.cond([
						{ $eq: ['$pay_status', 'paid'] },
						1,
						0
					])
				),
				gmv: dbCmd.aggregate.sum(
					dbCmd.aggregate.cond([
						{ $eq: ['$pay_status', 'paid'] },
						'$price',
						0
					])
				)
			})
			.end()

		const byStatusAgg = await db.collection('orders').aggregate()
			.match(matchCond)
			.group({ _id: '$status', count: dbCmd.aggregate.sum(1) })
			.end()

		const byTypeAgg = await db.collection('orders').aggregate()
			.match(matchCond)
			.group({ _id: '$type', count: dbCmd.aggregate.sum(1) })
			.end()

		const summary = (summaryAgg.data && summaryAgg.data[0]) || {}
		const statusDistribution = (byStatusAgg.data || []).map((i) => ({ status: i._id || 'unknown', count: i.count || 0 }))
		const typeDistribution = (byTypeAgg.data || []).map((i) => ({ type: i._id || 'unknown', count: i.count || 0 }))

		const todayOrderCount = summary.order_count || 0
		const todayPaidCount = summary.paid_order_count || 0
		const todayGmv = Number((summary.gmv || 0).toFixed(2))

		// 写入 daily_stats 缓存，后续直接命中
		try {
			await db.collection('daily_stats').where({ stat_date: ymd }).update({
				order_count: todayOrderCount,
				paid_order_count: todayPaidCount,
				gmv: todayGmv,
				status_list: statusDistribution,
				type_list: typeDistribution,
				income_trend_7d: [],
				order_trend_7d: [],
				rider_rank_7d: [],
				hourly: [],
				update_time: Date.now()
			})
			await db.collection('daily_stats').add({
				stat_date: ymd,
				order_count: todayOrderCount,
				paid_order_count: todayPaidCount,
				gmv: todayGmv,
				status_list: statusDistribution,
				type_list: typeDistribution,
				income_trend_7d: [],
				order_trend_7d: [],
				rider_rank_7d: [],
				hourly: [],
				update_time: Date.now()
			})
		} catch (e) {
			// 已存在则 add 失败，忽略
		}

		return {
			code: 0,
			data: {
				date: ymd,
				order_count: todayOrderCount,
				paid_order_count: todayPaidCount,
				gmv: todayGmv,
				total_order_all_time: Number(counters.total_order_count || 0),
				total_paid_order_all_time: Number(counters.total_paid_order_count || 0),
				total_completed_order_all_time: Number(counters.total_completed_order_count || 0),
				status_distribution: statusDistribution,
				type_distribution: typeDistribution,
				income_trend_7d: trendIncome7d,
				order_trend_7d: trendOrder7d,
				paid_order_trend_7d: trendPaidOrder7d,
				rider_rank_7d: [],
				hourly: []
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

		const { startMs, endMs } = getDayRange(stat_date)

		const ordersRes = await db.collection('orders')
			.where({
				create_time: dbCmd.gte(startMs).and(dbCmd.lte(endMs))
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
   * 指定用户的钱包交易流水
   */
  async listUserTransactions({ userId, type = 'all', page = 1, pageSize = 20 } = {}) {
    const auth = await assertAdmin(this.uid)
    if (auth.code !== 0) return auth

    if (!userId) {
      return { code: 400, message: '缺少 userId' }
    }

    const p = Math.max(1, parseInt(page, 10) || 1)
    const ps = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20))

    const where = { user_id: userId }
    if (type && type !== 'all') {
      where.type = type
    }

    const listRes = await db.collection('transactions')
      .where(where)
      .orderBy('create_time', 'desc')
      .skip((p - 1) * ps)
      .limit(ps)
      .get()

    const totalRes = await db.collection('transactions').where(where).count()

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
   * 财务对账（按日）：骑手收入/退款/充值 vs 支付/提现
   * @param {string} date YYYY-MM-DD，默认当天
   */
  async getFinanceDaily({ date } = {}) {
    const auth = await assertAdmin(this.uid)
    if (auth.code !== 0) return auth

    const { start, end, startMs, endMs } = date ? getDayRange(date) : getDayRange()

    // 1) 交易流水（transactions）
    const txRes = await db.collection('transactions')
      .where({ create_time: dbCmd.gte(startMs).and(dbCmd.lte(endMs)) })
      .field({ type: true, amount: true })
      .get()

    let income = 0
    let refund = 0
    let recharge = 0
    let pay = 0
    let withdrawTx = 0

    for (const tx of txRes.data || []) {
      const amt = Number(tx.amount || 0)
      switch (tx.type) {
        case 'income':
          income += amt; break
        case 'refund':
          refund += amt; break
        case 'recharge':
          recharge += amt; break
        case 'pay':
          pay += amt; break
        case 'withdraw':
          withdrawTx += amt; break
        default:
          break
      }
    }

    // 2) 提现申请（withdraw_requests）- 当日创建
    const wdRes = await db.collection('withdraw_requests')
      .where({ create_time: dbCmd.gte(startMs).and(dbCmd.lte(endMs)) })
      .field({ amount: true, status: true })
      .get()

    let withdrawPending = 0
    let withdrawSuccess = 0
    let withdrawFailed = 0
    for (const row of wdRes.data || []) {
      const amt = Number(row.amount || 0)
      if (row.status === 'pending') withdrawPending += amt
      else if (row.status === 'success') withdrawSuccess += amt
      else if (row.status === 'rejected' || row.status === 'failed') withdrawFailed += amt
    }

    return {
      code: 0,
      data: {
        date: formatYMD(start),
        transactions: {
          income: Number(income.toFixed(2)),
          refund: Number(refund.toFixed(2)),
          recharge: Number(recharge.toFixed(2)),
          pay: Number(pay.toFixed(2)),
          withdraw: Number(withdrawTx.toFixed(2))
        },
        withdraw: {
          pending: Number(withdrawPending.toFixed(2)),
          success: Number(withdrawSuccess.toFixed(2)),
          failed: Number(withdrawFailed.toFixed(2))
        }
      }
    }
  },

	/**
	 * 物件价格（快递代取小/中/大/特大件）— 列表 + 默认值
	 */
	async listItemPriceConfig() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const PICKUP_TYPES = ['pickup_small', 'pickup_medium', 'pickup_large', 'pickup_extra_large']
		const SIZE_BY_TYPE = {
			pickup_small: 'small',
			pickup_medium: 'medium',
			pickup_large: 'large',
			pickup_extra_large: 'extra_large'
		}
		const LABELS = {
			pickup_small: '快递代取 · 小件',
			pickup_medium: '快递代取 · 中件',
			pickup_large: '快递代取 · 大件',
			pickup_extra_large: '快递代取 · 特大件'
		}
		const DEFAULTS = {
			pickup_small: 1.5,
			pickup_medium: 2,
			pickup_large: 3,
			pickup_extra_large: 5
		}

		const res = await db.collection('item_price_config')
			.where(dbCmd.or([
				{ type: dbCmd.in(PICKUP_TYPES) },
				{ scene: 'pickup', size: dbCmd.in(['small', 'medium', 'large', 'extra_large']) }
			]))
			.get()

		const map = {}
		for (const row of res.data || []) {
			const bySize = row.scene === 'pickup' && row.size
				? `pickup_${String(row.size)}`
				: ''
			const key = PICKUP_TYPES.includes(row.type) ? row.type : bySize
			if (key && PICKUP_TYPES.includes(key)) {
				map[key] = row
			}
		}

		const list = PICKUP_TYPES.map((t) => {
			const row = map[t]
			const price =
				row && typeof row.price === 'number'
					? row.price
					: DEFAULTS[t]
			return {
				type: t,
				scene: 'pickup',
				size: SIZE_BY_TYPE[t],
				label: LABELS[t],
				price: Math.round(Number(price) * 100) / 100,
				_id: row ? row._id : null
			}
		})

		return {
			code: 0,
			data: { list, hint: '修改后用户端下单页拉价会走 order-service.getPickupRates' }
		}
	},

	/**
	 * 保存单条物件价格（按 type  upsert）
	 */
	async saveItemPriceConfig({ type, price } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const PICKUP_TYPES = ['pickup_small', 'pickup_medium', 'pickup_large', 'pickup_extra_large']
		const META_BY_TYPE = {
			pickup_small: { scene: 'pickup', size: 'small', label: '小件（快递代取）' },
			pickup_medium: { scene: 'pickup', size: 'medium', label: '中件（快递代取）' },
			pickup_large: { scene: 'pickup', size: 'large', label: '大件（快递代取）' },
			pickup_extra_large: { scene: 'pickup', size: 'extra_large', label: '特大件（快递代取）' }
		}
		const t = String(type || '').trim()
		if (!PICKUP_TYPES.includes(t)) {
			return { code: 400, message: 'type 必须为 pickup_small / pickup_medium / pickup_large / pickup_extra_large' }
		}

		const p = Number(price)
		if (!Number.isFinite(p) || p <= 0 || p > 99999) {
			return { code: 400, message: '价格需为大于 0 的数字（元）' }
		}
		const rounded = Math.round(p * 100) / 100
		const now = Date.now()
		const meta = META_BY_TYPE[t]

		const existed = await db.collection('item_price_config').where(dbCmd.or([
			{ type: t },
			{ scene: meta.scene, size: meta.size }
		])).limit(1).get()
		if (existed.data && existed.data.length) {
			await db.collection('item_price_config').doc(existed.data[0]._id).update({
				type: t,
				scene: meta.scene,
				size: meta.size,
				label: meta.label,
				price: rounded,
				update_time: now
			})
		} else {
			await db.collection('item_price_config').add({
				type: t,
				scene: meta.scene,
				size: meta.size,
				label: meta.label,
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
		show_cta = true,
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
			show_cta: show_cta !== false,
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
	 * 登录页：是否可执行「首次创建」admin_accounts
	 */
	async getAdminLoginBootstrap() {
		const total = await getAdminAccountCount()
		return {
			code: 0,
			data: {
				canSeed: total < ADMIN_REGISTER_LIMIT,
				canRegister: total < ADMIN_REGISTER_LIMIT,
				registered: total,
				limit: ADMIN_REGISTER_LIMIT,
				remaining: Math.max(0, ADMIN_REGISTER_LIMIT - total)
			}
		}
	},

	/**
	 * 注册页：查询注册额度（最多 2 个）
	 */
	async getAdminRegisterStatus() {
		const total = await getAdminAccountCount()
		return {
			code: 0,
			data: {
				canRegister: total < ADMIN_REGISTER_LIMIT,
				registered: total,
				limit: ADMIN_REGISTER_LIMIT,
				remaining: Math.max(0, ADMIN_REGISTER_LIMIT - total)
			}
		}
	},

	/**
	 * 管理员注册（仅允许注册 2 次，注册账号均为超级管理员）
	 */
	async adminRegisterByPassword({ username, password, confirmPassword } = {}) {
		const pwd = String(password || '')
		if (!pwd) {
			return { code: 400, message: '请输入密码' }
		}
		if (confirmPassword !== undefined && String(confirmPassword) !== pwd) {
			return { code: 400, message: '两次密码输入不一致' }
		}
		return createSuperAdminAccount({ username, password: pwd, remark: 'self-register' })
	},

	/**
	 * 兼容旧接口：调用即注册超级管理员（总名额 2）
	 */
	async seedAdminAccount({ username, password } = {}) {
		return createSuperAdminAccount({ username, password, remark: 'seed' })
	},

	/**
	 * 管理端账号密码登录（校验 admin_accounts，签发本地管理员 token）
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
		let passOk = false
		if (row.password_salt && row.password_hash) {
			const oldHash = hashLegacyPassword(password, row.password_salt)
			passOk = oldHash === row.password_hash
		}
		if (!passOk && String(row.password || '')) {
			passOk = String(row.password) === String(password)
		}
		if (!passOk) {
			return { code: 401, message: '账号或密码错误' }
		}
		const clientInfo = this.getClientInfo()
		const uniIdIns = uniIdCommon.createInstance({ clientInfo })
		let tokenRes
		try {
			await ensureLocalAdminUser(clientInfo)
			tokenRes = await uniIdIns.createToken({ uid: ADMIN_LOCAL_UID })
		} catch (e) {
			console.error('[admin-service] createToken', e)
			return { code: 500, message: e.message || '签发登录失败，请稍后重试' }
		}
		if (tokenRes.errCode !== 0) {
			return { code: 500, message: '签发登录失败，请稍后重试' }
		}
		const now = Date.now()
		try {
			const updateDoc = {
				last_login_date: now,
				last_login_ip: clientInfo.clientIP || ''
			}
			if (!row.password_hash || !row.password_salt) {
				const digest = buildPasswordDigest(password)
				updateDoc.password_salt = digest.salt
				updateDoc.password_hash = digest.hash
			}
			if (row.password) {
				updateDoc.password = ''
			}
			await db.collection('admin_accounts').doc(row._id).update(updateDoc)
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
			uid: ADMIN_LOCAL_UID,
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
				message: '当前账号无权访问管理后台，请使用 admin_accounts 表内账号登录'
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
			uni_id_uid: '',
			password: '',
			is_super_admin: r.is_super_admin === true,
			remark: r.remark,
			enabled: r.enabled,
			last_login_date: r.last_login_date || 0,
			last_login_ip: r.last_login_ip || '',
			create_time: r.create_time,
			update_time: r.update_time
		}))
		return { code: 0, data: { list } }
	},

	/**
	 * 新增或更新管理员账号（仅账号密码）
	 */
	async saveAdminAccount({ id, username, password, remark, enabled = true } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth

		const uname = String(username || '').trim().toLowerCase()
		if (!uname) {
			return { code: 400, message: '用户名必填' }
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
			if (password) {
				const digest = buildPasswordDigest(password)
				doc.password_salt = digest.salt
				doc.password_hash = digest.hash
				doc.password = ''
			}
			await db.collection('admin_accounts').doc(id).update(doc)
		} else {
			const total = await getAdminAccountCount()
			if (total >= ADMIN_REGISTER_LIMIT) {
				return { code: 403, message: `管理员账号已满（最多 ${ADMIN_REGISTER_LIMIT} 个）` }
			}
			if (!password) {
				return { code: 400, message: '新增账号请设置密码' }
			}
			const digest = buildPasswordDigest(password)
			await db.collection('admin_accounts').add({
				username: uname,
				password_salt: digest.salt,
				password_hash: digest.hash,
				password: '',
				is_super_admin: true,
				remark: remark != null ? String(remark) : '',
				enabled: enabled !== false,
				last_login_date: 0,
				last_login_ip: '',
				create_time: now,
				update_time: now
			})
		}
		return { code: 0, message: '已保存' }
	},

	/**
	 * 删除管理员账号行
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

	async getOrderCleanupSettings() {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		const settings = await readCleanupSettings()
		return { code: 0, data: settings }
	},

	async saveOrderCleanupSettings({ ttlDays } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		const parsed = Number(ttlDays)
		if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
			return { code: 400, message: 'ttlDays 需在 1~365 之间' }
		}
		const rounded = Math.floor(parsed)
		const saved = await writeCleanupSettings(rounded)
		return { code: 0, data: normalizeCleanupConfig(saved) }
	},

	async cleanupExpiredOrders({ days, batchSize = 50, dryRun = false } = {}) {
		const auth = await assertAdmin(this.uid)
		if (auth.code !== 0) return auth
		const settings = await readCleanupSettings()
		const requestedDays = Number(days)
		const ttlDays = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.floor(requestedDays) : settings.ttl_days
		const limit = Math.min(Math.max(Number(batchSize) || 50, 1), 200)
		const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000
		const orderRes = await db
			.collection('orders')
			.where({
				status: dbCmd.in(['completed', 'cancelled']),
				update_time: dbCmd.lte(cutoff)
			})
			.orderBy('update_time', 'asc')
			.limit(limit)
			.get()
		const orders = orderRes.data || []
		if (!orders.length) {
			return {
				code: 0,
				message: '暂无符合条件的订单',
				data: { processed: 0, ttlDays, dryRun: !!dryRun }
			}
		}
		const archiveColl = db.collection(ORDER_ARCHIVE_COLLECTION)
		const now = Date.now()
		const fileIds = []
		if (!dryRun) {
			for (const order of orders) {
				const archiveDoc = { ...order, original_order_id: order._id, archived_at: now }
				delete archiveDoc._id
				await archiveColl.add(archiveDoc)
			}
		}
		for (const order of orders) {
			fileIds.push(...extractFileIds(order))
		}
		let deletedFiles = 0
		if (!dryRun) {
			for (const order of orders) {
				await db.collection('orders').doc(order._id).remove()
			}
			deletedFiles = await deleteFiles(fileIds)
		}
		return {
			code: 0,
			data: {
				processed: orders.length,
				ttlDays,
				dryRun: !!dryRun,
				deletedFiles: dryRun ? 0 : deletedFiles
			}
		}
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
