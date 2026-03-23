'use strict';

// 通用配置查询云对象：用于读取价格等配置

const db = uniCloud.database()
const dbCmd = db.command

module.exports = {
	/**
	 * 获取快递代取小/中/大件价格
	 * 数据来源：item_price_config 集合
	 * 期望文档结构示例：
	 * { type: 'pickup_small',  price: 1.5 }
	 * { type: 'pickup_medium', price: 2   }
	 * { type: 'pickup_large',  price: 3   }
	 */
	async getPickupRates() {
		try {
			const res = await db.collection('item_price_config')
				.where({
					type: db.command.in(['pickup_small', 'pickup_medium', 'pickup_large'])
				})
				.get()

			const list = res.data || []

			// 默认值，防止配置缺失时报错
			const rates = {
				small: 1.5,
				medium: 2,
				large: 3
			}

			list.forEach(item => {
				if (item.type === 'pickup_small' && typeof item.price === 'number') {
					rates.small = item.price
				} else if (item.type === 'pickup_medium' && typeof item.price === 'number') {
					rates.medium = item.price
				} else if (item.type === 'pickup_large' && typeof item.price === 'number') {
					rates.large = item.price
				}
			})

			return {
				code: 0,
				data: rates
			}
		} catch (error) {
			console.error('获取快递代取价格失败:', error)
			return {
				code: 'DB_ERROR',
				message: '获取价格配置失败：' + error.message
			}
		}
	},

	/**
	 * 用户首页：顶部广告位 + 公告列表（无需登录）
	 */
	async getHomeContent() {
		try {
			const heroRes = await db
				.collection('home_hero')
				.where(
					dbCmd.or([
						{ enabled: true },
						{ enabled: dbCmd.exists(false) }
					])
				)
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
					image_file_id: row.image_file_id ? String(row.image_file_id) : '',
					link_url: row.link_url ? String(row.link_url) : '',
					sort: row.sort != null ? row.sort : 0
				}))

			const annRes = await db
				.collection('home_announcements')
				.where(
					dbCmd.or([
						{ enabled: true },
						{ enabled: dbCmd.exists(false) }
					])
				)
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

			return {
				code: 0,
				data: {
					heroes,
					announcements
				}
			}
		} catch (error) {
			console.error('getHomeContent', error)
			return {
				code: 'DB_ERROR',
				message: '获取首页内容失败：' + error.message
			}
		}
	}
}

