/**
 * 统一支付入口
 * 支持余额支付和微信支付
 */
import { useWalletStore } from './wallet'

// 导入云对象
const paymentService = uniCloud.importObject('payment-service')

/**
 * 统一支付方法
 * @param {Object} params
 * @param {String} params.method - 支付方式：'balance' | 'wechat'
 * @param {String} params.orderId - 订单ID（orders._id）
 * @param {Number} params.amount - 支付金额（可选，用于校验）
 * @returns {Object} { success: boolean, reason?: string }
 */
export async function payForOrder({ method, orderId, amount }) {
  if (!method || !orderId) {
    return {
      success: false,
      reason: '支付方式和订单ID不能为空'
    }
  }

  try {
    if (method === 'balance') {
      // 余额支付
      const walletStore = useWalletStore()
      const payRes = await walletStore.pay(amount || 0, orderId)
      
      if (!payRes?.success) {
        return {
          success: false,
          reason: payRes?.reason || '余额不足'
        }
      }

      // 余额支付成功，更新订单状态
      // 注意：这里假设 wallet-service.pay 已经处理了订单状态更新
      // 如果没有，需要在这里调用 order-service 更新订单状态
      return {
        success: true
      }
    } else if (method === 'wechat') {
      // 微信支付
      uni.showLoading({ title: '正在调起支付...' })

      try {
        // 1. 调用云对象创建微信支付订单，获取支付参数
        const res = await paymentService.createJsapiOrder({ orderId })
        
        if (res.code !== 0) {
          uni.hideLoading()
          return {
            success: false,
            reason: res.message || '创建支付订单失败'
          }
        }

        const { appId, timeStamp, nonceStr, package: packageValue, signType, paySign } = res.data

        // 2. 调起微信支付
        return new Promise((resolve) => {
          uni.requestPayment({
            provider: 'wxpay',
            appId,
            timeStamp,
            nonceStr,
            package: packageValue,
            signType,
            paySign,
            success: async (payRes) => {
              console.log('微信支付成功:', payRes)
              uni.hideLoading()
              
              // 3. 支付成功，提示用户支付处理中
              uni.showToast({
                title: '支付处理中...',
                icon: 'none',
                duration: 2000
              })

              // 4. 可选：轮询查询订单状态，直到支付完成或失败
              // 注意：实际支付结果由回调处理，这里只是前端确认
              // 可以轮询几次确认支付状态
              const queryResult = await queryPaymentStatus(res.data.outTradeNo)
              
              if (queryResult.success) {
                resolve({
                  success: true
                })
              } else {
                // 即使查询失败，也认为支付成功（因为微信支付已经返回成功）
                // 最终状态由回调确认
                resolve({
                  success: true,
                  reason: '支付成功，订单处理中'
                })
              }
            },
            fail: (err) => {
              console.error('微信支付失败:', err)
              uni.hideLoading()
              
              // 用户取消支付
              if (err.errMsg && err.errMsg.includes('cancel')) {
                resolve({
                  success: false,
                  reason: '用户取消支付'
                })
              } else {
                resolve({
                  success: false,
                  reason: err.errMsg || '支付失败，请重试'
                })
              }
            }
          })
        })
      } catch (error) {
        uni.hideLoading()
        console.error('微信支付异常:', error)
        return {
          success: false,
          reason: error.message || '支付失败，请重试'
        }
      }
    } else {
      return {
        success: false,
        reason: `不支持的支付方式: ${method}`
      }
    }
  } catch (error) {
    console.error('payForOrder 异常:', error)
    return {
      success: false,
      reason: error.message || '支付失败，请重试'
    }
  }
}

/**
 * 查询支付状态（轮询）
 * @param {String} outTradeNo - 商户订单号
 * @param {Number} maxRetries - 最大重试次数，默认5次
 * @param {Number} interval - 轮询间隔（毫秒），默认2000ms
 * @returns {Object} { success: boolean, tradeState?: string }
 */
async function queryPaymentStatus(outTradeNo, maxRetries = 5, interval = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await paymentService.queryOrder({ outTradeNo })
      
      if (res.code === 0 && res.data) {
        const { trade_state } = res.data
        
        if (trade_state === 'SUCCESS') {
          return {
            success: true,
            tradeState: trade_state
          }
        } else if (trade_state === 'CLOSED' || trade_state === 'REVOKED') {
          return {
            success: false,
            tradeState: trade_state,
            reason: '订单已关闭'
          }
        }
        // 其他状态（NOTPAY、USERPAYING等）继续轮询
      }
      
      // 等待后继续下一次查询
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    } catch (error) {
      console.error('查询支付状态失败:', error)
      // 查询失败也继续重试
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, interval))
      }
    }
  }
  
  // 达到最大重试次数，返回未知状态
  // 注意：实际支付结果由回调处理，这里只是前端确认
  return {
    success: true, // 即使查询超时，也认为可能成功（由回调最终确认）
    tradeState: 'UNKNOWN'
  }
}
