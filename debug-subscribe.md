# 订阅消息推送问题排查清单

## 问题现象
- ✅ 能收到授权弹窗
- ✅ 用户点击同意授权
- ❌ 但没有收到消息推送

## 排查步骤

### 1. 检查前端授权结果是否正确获取

在 `pages/client/forms/pickup.vue` 的 `requestOrderSubscribeAuth` 函数中添加日志：

```javascript
const requestOrderSubscribeAuth = async () => {
  // ... 现有代码 ...
  
  const result = reqRes || {}
  const accepted = tmplIds.some((id) => result[id] === 'accept')
  
  // 🔍 添加调试日志
  console.log('订阅授权结果:', result)
  console.log('模板ID列表:', tmplIds)
  console.log('是否有接受的模板:', accepted)
  
  if (!accepted) {
    uni.showToast({ title: '未同意订阅，后续将收不到接单/送达通知', icon: 'none' })
  }
  return result
}
```

### 2. 检查订单数据中是否包含订阅结果

在 `handlePayClick` 函数中添加日志：

```javascript
const handlePayClick = async () => {
  // ... 现有代码 ...
  
  const subscribeResult = await requestOrderSubscribeAuth()
  
  // 🔍 添加调试日志
  console.log('准备传递的订阅结果:', subscribeResult)
  
  onPayConfirm('wechat', subscribeResult)
}
```

### 3. 检查云端是否正确接收和保存

在云函数 `order-service/index.obj.js` 的 `createOrder` 方法中（第664-671行）添加日志：

```javascript
const subscribeResult = orderData.subscribe_result || orderData.subscribeResult || {}
const subscribeNotify = {
  tpl_accept_accept: resolveSubscribeAccept(subscribeResult, subscribeCfg.template_accept_id),
  tpl_deliver_accept: resolveSubscribeAccept(subscribeResult, subscribeCfg.template_deliver_id),
  auth_time: Date.now(),
  update_time: Date.now()
}

// 🔍 添加调试日志
console.log('接收到的订阅结果:', subscribeResult)
console.log('订阅配置:', subscribeCfg)
console.log('解析后的订阅通知:', subscribeNotify)
```

### 4. 检查数据库中订单的 subscribe_notify 字段

在 uniCloud 控制台查询订单数据：
```javascript
db.collection('orders')
  .where({ user_id: '你的用户ID' })
  .orderBy('create_time', 'desc')
  .limit(1)
  .get()
```

检查返回的订单中 `content.subscribe_notify` 字段：
- `tpl_accept_accept` 应该为 `true`（如果用户同意了接单通知）
- `tpl_deliver_accept` 应该为 `true`（如果用户同意了送达通知）

### 5. 检查微信配置

#### 5.1 检查 uni-id 配置文件

确认 `uniCloud-aliyun/cloudfunctions/common/uni-config-center/uni-id/config.json` 中配置了微信小程序的 appid 和 appsecret：

```json
{
  "mp-weixin": {
    "oauth": {
      "weixin": {
        "appid": "你的小程序appid",
        "appsecret": "你的小程序appsecret"
      }
    }
  }
}
```

#### 5.2 检查订阅消息模板ID

在 `uniCloud-aliyun/database/db_init.json` 中检查模板ID是否正确：

```json
{
  "_id": "order_subscribe_notify",
  "enable": true,
  "template_accept_id": "你的接单通知模板ID",
  "template_deliver_id": "你的送达通知模板ID",
  "page_path_accept": "/pages/client/orders/detail",
  "page_path_deliver": "/pages/client/orders/detail"
}
```

确认这些模板ID与微信公众平台后台的订阅消息模板ID一致。

### 6. 检查用户的 openid

在骑手接单时，云函数会尝试发送消息。检查 `uni-id-users` 表中用户的 `wx_openid` 字段：

```javascript
db.collection('uni-id-users')
  .where({ _id: '你的用户ID' })
  .get()
```

确认 `wx_openid.mp` 字段有值。

### 7. 检查消息发送日志

在骑手接单后，检查订单的 `content.subscribe_notify` 字段：
- `last_accept_msgid`: 如果有值，说明消息发送成功
- `last_error`: 如果有值，说明发送失败，查看错误信息

### 8. 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 43101 | 用户拒绝接受消息 | 用户点击了"拒绝" |
| 47003 | 模板参数不合法 | 检查模板参数格式 |
| 40037 | 订阅模板id为空 | 检查模板ID配置 |
| 43104 | 订阅关系失效 | 用户需要重新授权 |
| 40003 | openid错误 | 检查用户openid |

## 最可能的原因

根据你的描述"能收到授权弹窗，授权同意后没有收到消息"，最可能的原因是：

### ⚠️ 原因1：订阅授权结果没有正确保存到订单

检查 `pages/client/forms/pickup.vue` 第325行的 `subscribeResult` 是否正确传递。

### ⚠️ 原因2：微信配置问题

- appid/appsecret 未配置或配置错误
- 模板ID不正确
- 用户的 openid 未获取

### ⚠️ 原因3：订阅消息只能发送一次

微信订阅消息的特点：
- 用户每次授权只能发送一次消息
- 如果用户授权了两个模板，每个模板只能各发送一次
- 发送后需要用户重新授权才能再次发送

## 快速验证方案

1. 创建一个测试订单
2. 在云函数中打印日志
3. 让骑手接单
4. 查看云函数日志，确认是否调用了 `sendSubscribeMessage`
5. 查看返回结果中的 `errcode` 和 `errmsg`
