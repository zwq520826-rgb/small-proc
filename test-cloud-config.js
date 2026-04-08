// 测试云函数配置的方法
// 在 HBuilderX 中运行这段代码来测试

const testConfig = async () => {
  const uniIdCo = uniCloud.importObject("uni-id-co", {
    customUI: true
  })

  try {
    // 尝试调用一个测试方法（如果存在）
    const result = await uniIdCo.testWeixinConfig()
    console.log('配置测试结果:', result)
  } catch (e) {
    console.error('测试失败:', e)
  }
}

// 或者直接查看错误详情
const testLogin = async () => {
  const uniIdCo = uniCloud.importObject("uni-id-co", {
    customUI: true
  })

  try {
    // 使用一个假的 code 测试
    await uniIdCo.loginByWeixin({ code: 'test_code_123' })
  } catch (e) {
    console.error('登录错误详情:', e)
    console.error('错误消息:', e.message)
    console.error('错误代码:', e.errCode)
  }
}

// 在控制台运行: testLogin()
