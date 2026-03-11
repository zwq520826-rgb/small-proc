// 地址服务云对象
'use strict';

const uniID = require('uni-id-common')
const db = uniCloud.database()

// 独立的登录检查函数，避免依赖 this._checkAuth 方式
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
	 * 初始化 uni-id 实例，校验 token，获取 uid
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

	/**
	 * 获取当前用户的地址列表
	 */
	async getAddressList() {
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
	 * @param {object} addressData
	 * @param {string} addressData.name 收件人姓名
	 * @param {string} addressData.phone 手机号
	 * @param {string} addressData.detail 详细地址
	 * @param {string} addressData.schoolArea 校区
	 * @param {boolean} addressData.isDefault 是否默认地址
	 */
	async addAddress(addressData) {
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
			// 如果本条设置为默认地址，先清除当前用户其他默认地址
			if (doc.is_default) {
				await db.collection('addresses')
					.where({
						user_id: uid,
						is_default: true
					})
					.update({
						is_default: false
					})
			}

			const res = await db.collection('addresses').add(doc)

			return {
				code: 0,
				message: '新增地址成功',
				data: {
					_id: res.id,
					...doc
				}
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
	 * @param {string} id 地址ID（_id）
	 * @param {object} addressData 更新字段
	 */
	async updateAddress(id, addressData = {}) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		if (!id) {
			return {
				code: 'INVALID_PARAM',
				message: '地址ID不能为空'
			}
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
			return {
				code: 'INVALID_PARAM',
				message: '没有需要更新的字段'
			}
		}

		try {
			// 确保只能修改自己的地址
			const collection = db.collection('addresses')
			const findRes = await collection.where({
				_id: id,
				user_id: uid
			}).limit(1).get()

			if (findRes.data.length === 0) {
				return {
					code: 'NOT_FOUND',
					message: '地址不存在或无权访问'
				}
			}

			// 如果本条设置为默认地址，先清除当前用户其他默认地址
			if (updateDoc.is_default) {
				await collection.where({
					user_id: uid,
					is_default: true,
					_id: db.command.neq(id)
				}).update({
					is_default: false
				})
			}

			await collection.doc(id).update(updateDoc)

			return {
				code: 0,
				message: '更新地址成功'
			}
		} catch (error) {
			console.error('更新地址失败:', error)
			return {
				code: 'DB_ERROR',
				message: '更新地址失败：' + error.message
			}
		}
	},

	/**
	 * 删除地址
	 * @param {string} id 地址ID（_id）
	 */
	async deleteAddress(id) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		if (!id) {
			return {
				code: 'INVALID_PARAM',
				message: '地址ID不能为空'
			}
		}

		try {
			const collection = db.collection('addresses')
			const findRes = await collection.where({
				_id: id,
				user_id: uid
			}).limit(1).get()

			if (findRes.data.length === 0) {
				return {
					code: 'NOT_FOUND',
					message: '地址不存在或无权访问'
				}
			}

			await collection.doc(id).remove()

			return {
				code: 0,
				message: '删除地址成功'
			}
		} catch (error) {
			console.error('删除地址失败:', error)
			return {
				code: 'DB_ERROR',
				message: '删除地址失败：' + error.message
			}
		}
	},

	/**
	 * 设为默认地址（以云端为准）
	 * @param {string} id 地址ID（_id）
	 */
	async setDefaultAddress(id) {
		const authResult = checkAuth(this)
		if (authResult.code) {
			return authResult
		}
		const uid = authResult.uid

		if (!id) {
			return {
				code: 'INVALID_PARAM',
				message: '地址ID不能为空'
			}
		}

		try {
			const collection = db.collection('addresses')

			// 确认是当前用户的地址
			const findRes = await collection.where({
				_id: id,
				user_id: uid
			}).limit(1).get()

			if (findRes.data.length === 0) {
				return {
					code: 'NOT_FOUND',
					message: '地址不存在或无权访问'
				}
			}

			// 先清除当前用户其他默认地址
			await collection.where({
				user_id: uid,
				is_default: true,
				_id: db.command.neq(id)
			}).update({
				is_default: false
			})

			// 再将当前地址设为默认
			await collection.doc(id).update({
				is_default: true
			})

			return {
				code: 0,
				message: '设置默认地址成功'
			}
		} catch (error) {
			console.error('设置默认地址失败:', error)
			return {
				code: 'DB_ERROR',
				message: '设置默认地址失败：' + error.message
			}
		}
	}
}
