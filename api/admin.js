/**
 * 管理端对接云对象 admin-service（与同级目录 small-admin/api/admin.js 建议保持同步）
 */
const adminService = uniCloud.importObject('admin-service')

export function assertAdminResponse(res, opt = {}) {
	if (!res || typeof res !== 'object') {
		const err = new Error('服务无响应')
		err.code = -1
		err.raw = res
		throw err
	}
	if (res.code !== 0) {
		const err = new Error(res.message || '请求失败')
		err.code = res.code
		err.raw = res
		throw err
	}
	return opt.dataOnly ? res.data : res
}

export { adminService }

export async function ping() {
	const res = await adminService.ping()
	return assertAdminResponse(res)
}

export async function getDashboard(params = {}) {
	const res = await adminService.getDashboard(params)
	return assertAdminResponse(res, { dataOnly: true })
}

export async function listWithdrawRequests(params = {}) {
	const res = await adminService.listWithdrawRequests(params)
	return assertAdminResponse(res, { dataOnly: true })
}

export async function markWithdrawPaid(params = {}) {
	const res = await adminService.markWithdrawPaid(params)
	return assertAdminResponse(res)
}

export async function rejectWithdraw(params = {}) {
	const res = await adminService.rejectWithdraw(params)
	return assertAdminResponse(res)
}

export async function listComplaints(params = {}) {
	const res = await adminService.listComplaints(params)
	return assertAdminResponse(res, { dataOnly: true })
}

export async function getComplaintsSummary() {
	const res = await adminService.getComplaintsSummary()
	return assertAdminResponse(res, { dataOnly: true })
}

export async function listInterventionOrders(params = {}) {
	const res = await adminService.listInterventionOrders(params)
	return assertAdminResponse(res, { dataOnly: true })
}

export async function updateInterventionOrder(params = {}) {
	const res = await adminService.updateInterventionOrder(params)
	return assertAdminResponse(res)
}

export async function updateComplaintStatus(params = {}) {
	const res = await adminService.updateComplaintStatus(params)
	return assertAdminResponse(res)
}

export async function getDailyStatsRange(params = {}) {
	const res = await adminService.getDailyStatsRange(params)
	return assertAdminResponse(res, { dataOnly: true })
}

export async function regenerateDailyStat(params = {}) {
	const res = await adminService.regenerateDailyStat(params)
	return assertAdminResponse(res)
}

export async function listOrders(params = {}) {
	const res = await adminService.listOrders(params)
	return assertAdminResponse(res, { dataOnly: true })
}

export async function getOrder(params = {}) {
	const res = await adminService.getOrder(params)
	return assertAdminResponse(res, { dataOnly: true })
}

export async function listRiderProfiles(params = {}) {
	const res = await adminService.listRiderProfiles(params)
	return assertAdminResponse(res, { dataOnly: true })
}

export async function setRiderProfileStatus(params = {}) {
	const res = await adminService.setRiderProfileStatus(params)
	return assertAdminResponse(res)
}

export async function listRidersWithBalances(params = {}) {
  const res = await adminService.listRidersWithBalances(params)
  return assertAdminResponse(res, { dataOnly: true })
}

export async function revokeRiderIdentity(params = {}) {
  const res = await adminService.revokeRiderIdentity(params)
  return assertAdminResponse(res)
}

export async function removeLegacyRiderMenus() {
  const res = await adminService.removeLegacyRiderMenus()
  return assertAdminResponse(res, { dataOnly: true })
}

export async function listUserTransactions(params = {}) {
  const res = await adminService.listUserTransactions(params)
  return assertAdminResponse(res, { dataOnly: true })
}

export async function getFinanceDaily(params = {}) {
  const res = await adminService.getFinanceDaily(params)
  return assertAdminResponse(res, { dataOnly: true })
}

export async function getAdminRegisterStatus() {
	const res = await adminService.getAdminRegisterStatus()
	return assertAdminResponse(res, { dataOnly: true })
}

export async function adminRegisterByPassword(params = {}) {
	const res = await adminService.adminRegisterByPassword(params)
	return assertAdminResponse(res, { dataOnly: true })
}
