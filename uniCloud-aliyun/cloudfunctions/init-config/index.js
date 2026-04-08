'use strict';
exports.main = async (event, context) => {
	const db = uniCloud.database()
	const maintenance = db.collection('maintenance_settings')
	const now = Date.now()

	// 订单订阅通知配置
	const orderConfig = {
		_id: 'order_subscribe_notify',
		enable: true,
		template_accept_id: 'PSEMI1JuVylugL_S4desPcoEpIwfjTV5TufCgQxylJw',
		template_deliver_id: 'd-epVcwVVoWk9ZuzGPUVUeE4Uy3DgixAEYetadc-2U8',
		page_path_accept: '/pages/client/orders/detail',
		page_path_deliver: '/pages/client/orders/detail',
		update_time: now
	}

	// 骑手订阅通知配置
	const riderConfig = {
		_id: 'rider_subscribe_notify',
		enable: true,
		template_submit_id: '',
		template_pass_id: '',
		page_path: '/pages/mine/index',
		update_time: now
	}

	try {
		// 查询是否已存在
		const [orderExist, riderExist] = await Promise.all([
			maintenance.doc('order_subscribe_notify').get(),
			maintenance.doc('rider_subscribe_notify').get()
		])

		const results = []

		// 更新或添加订单配置
		if (orderExist.data && orderExist.data.length > 0) {
			await maintenance.doc('order_subscribe_notify').update(orderConfig)
			results.push('订单订阅配置已更新')
		} else {
			await maintenance.add(orderConfig)
			results.push('订单订阅配置已创建')
		}

		// 更新或添加骑手配置
		if (riderExist.data && riderExist.data.length > 0) {
			await maintenance.doc('rider_subscribe_notify').update(riderConfig)
			results.push('骑手订阅配置已更新')
		} else {
			await maintenance.add(riderConfig)
			results.push('骑手订阅配置已创建')
		}

		return {
			code: 0,
			message: results.join('; ')
		}
	} catch (e) {
		return {
			code: -1,
			message: '配置写入失败: ' + e.message
		}
	}
}