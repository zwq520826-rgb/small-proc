# 微信支付回调云函数配置说明

## 功能说明

`wechat-pay-notify` 是用于接收微信支付异步通知的 HTTP 云函数。

## 配置步骤

### 1. 配置 URL 化

1. 登录 [uniCloud 后台](https://unicloud.dcloud.net.cn/)
2. 进入【云函数】→ 找到 `wechat-pay-notify` → 点击【详情】
3. 在【云函数 URL 化】中设置访问路径，例如：`/wechat-pay-notify`
4. 如果提示“URL 化不可用”，需要先绑定域名（使用平台赠送的默认域名或自定义域名）
5. 获取 HTTPS 访问地址，格式：`https://你的域名/http/wechat-pay-notify`

### 2. 配置回调地址

将获取到的 HTTPS 地址填入：
- `wechat-pay.json` 的 `notify_url` 字段
- 微信商户平台的【支付配置】→【支付回调 URL】

### 3. 下载并配置平台证书（重要）

**平台证书用于验证微信回调的签名，必须配置才能正常工作。**

#### 获取平台证书：

1. 登录 [微信商户平台](https://pay.weixin.qq.com/)
2. 进入【账户中心】→【API安全】→【平台证书】
3. 点击【下载证书】，选择 `.pem` 格式
4. 将下载的证书文件重命名为 `wechatpay_platform_cert.pem`
5. 放到项目目录：`uniCloud-aliyun/certs/wechatpay_platform_cert.pem`

**注意：**
- 如果 `certs` 目录不存在，请先创建
- 证书文件需要与 `wechat-pay.json` 中的 `serial_no` 匹配
- 如果证书序列号不匹配，回调验证会失败

#### 证书目录结构：

```
uniCloud-aliyun/
  ├── certs/
  │   └── wechatpay_platform_cert.pem  ← 平台证书放这里
  └── cloudfunctions/
      └── wechat-pay-notify/
          └── index.js
```

## 测试

1. 部署云函数到 uniCloud
2. 在微信商户平台配置回调 URL
3. 发起一笔测试支付
4. 查看云函数日志，确认回调是否正常处理

## 常见问题

### Q: 签名验证失败怎么办？

A: 检查以下几点：
1. 平台证书是否正确下载并放到指定路径
2. 证书序列号是否与 `wechat-pay.json` 中的 `serial_no` 匹配
3. 证书文件格式是否正确（.pem 格式）

### Q: 解密失败怎么办？

A: 检查 `wechat-pay.json` 中的 `api_v3_key` 是否正确

### Q: 回调没有收到怎么办？

A: 检查：
1. 回调 URL 是否正确配置在微信商户平台
2. 云函数是否已部署
3. URL 化是否已正确配置
4. 查看云函数日志是否有错误

## 后续优化

- [ ] 实现通过 API 动态获取平台证书（避免手动下载）
- [ ] 支持多个平台证书（证书轮换场景）
- [ ] 添加更详细的日志记录
- [ ] 添加回调重试机制
