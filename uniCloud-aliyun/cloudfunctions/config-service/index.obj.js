'use strict';

// 通用配置查询云对象：用于读取价格等配置

const db = uniCloud.database()

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
	}
}

