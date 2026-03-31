# 骑手认证订阅消息实施方案（加群提醒 + 审核通过提醒）

## 1. 目标

在现有骑手认证流程里增加 2 次微信订阅消息触达：

1. 用户提交骑手认证后，发送一次“请加群”提醒。
2. 管理员审核通过后，再发送一次“认证通过”提醒。

同时保证：
- 订阅授权合规（必须用户主动触发 `wx.requestSubscribeMessage`）。
- 审核流幂等（重复审核不会无限重复发消息）。
- 发送失败可降级（站内提示 + 页面弹窗二维码）。

---

## 2. 官方能力选型（对应文档）

本需求应使用：
- 小程序端：`wx.requestSubscribeMessage`
- 服务端：订阅消息发送接口（`subscribeMessage.send`）

不建议用于本场景：
- `wx.requestSubscribeDeviceMessage`（设备消息，偏硬件设备，不是普通骑手审核通知）。

结论：本项目只接入“普通订阅消息”链路即可。

---

## 3. 消息模板设计

建议在公众平台新增/选用两个模板（可复用同类目模板）：

### 模板 A：骑手认证已提交（加群提醒）
- 触发时机：`submitApplication` 成功后（状态变为 `pending`）。
- 建议字段：
  - 认证状态：审核中
  - 提交时间
  - 温馨提示：请扫码加入骑手群
  - 备注：审核结果将再次通知
- 跳转页：`/pages/mine/index`

### 模板 B：骑手认证审核通过
- 触发时机：admin 执行通过操作（`setRiderProfileStatus -> approved`）。
- 建议字段：
  - 审核结果：已通过
  - 生效时间
  - 操作提示：可切换到骑手端接单
  - 备注：如未加群请先加群
- 跳转页：`/pages/mine/index`

---

## 4. 数据结构新增

在 `rider_profiles` 新增订阅记录字段（建议）：

- `subscribe_notify`: object
  - `tpl_submit_accept`: boolean（是否同意模板A）
  - `tpl_pass_accept`: boolean（是否同意模板B）
  - `auth_time`: timestamp（授权时间）
  - `openid`: string（发送目标）
  - `last_submit_msgid`: string（提交提醒消息ID）
  - `last_pass_msgid`: string（通过提醒消息ID）
  - `last_error`: string（最近失败原因）

说明：
- 为避免查表链路过长，可冗余保存 `openid`（来源 `uni-id-users.wx_openid.mp`）。
- 仍可保留一份发送日志集合 `notify_logs`（推荐）用于排查。

---

## 5. 小程序端改造（骑手认证页）

页面：`pages/rider/verify.vue`

在“提交认证”按钮点击链路里：

1. 用户点击提交（主动交互时机）。
2. 先调用 `wx.requestSubscribeMessage`，一次传入 2 个模板 ID：A + B。 
3. 解析返回：
   - `accept` / `reject` / `ban` 等状态。
4. 再调用 `rider-service.submitApplication`，把订阅结果一起传给后端保存。

关键点：
- 不能在页面自动弹授权，必须用户主动点击触发。
- 用户拒绝订阅也不阻断认证提交。

---

## 6. 服务端改造

### 6.1 rider-service（提交认证后发“加群提醒”）

文件：`uniCloud-aliyun/cloudfunctions/rider-service/index.obj.js`

改造点：

1. `submitApplication` 入参增加 `subscribeResult`（模板同意结果）。
2. 写入 `rider_profiles.subscribe_notify`。
3. 若模板A同意：异步触发发送模板A。
4. 发送失败只记录日志，不影响 `submitApplication` 成功返回。

### 6.2 admin-service（审核通过后发“通过提醒”）

文件：`uniCloud-aliyun/cloudfunctions/admin-service/index.obj.js`

改造点：

1. 在 `setRiderProfileStatus` 里，当状态改为 `approved` 时：
   - 检查 `subscribe_notify.tpl_pass_accept === true`。
   - 幂等检查：`last_pass_msgid` 已存在则不重复发。
2. 调用订阅消息发送服务发模板B。
3. 成功写回 `last_pass_msgid`，失败写 `last_error`。

---

## 7. 微信发送服务封装

建议新增公共模块：
- `uniCloud-aliyun/cloudfunctions/common/wechat-subscribe/index.js`

职责：

1. 获取 `access_token`（建议稳定版）。
2. 统一封装 `subscribeMessage.send` 请求。
3. 标准化返回：`{ ok, msgid, errcode, errmsg }`。
4. 统一日志输出（带 `requestId`）。

发送参数建议：
- `touser`: openid
- `template_id`: 模板ID
- `page`: `/pages/mine/index`
- `data`: 模板字段对象
- `miniprogram_state`: `formal`（生产）
- `lang`: `zh_CN`

---

## 8. admin 配置项

在 `maintenance_settings` 新增一条配置文档（例如 `_id: rider_subscribe_notify`）：

- `enable`: true/false（总开关）
- `template_submit_id`: string（模板A）
- `template_pass_id`: string（模板B）
- `page_path`: string（默认 `/pages/mine/index`）
- `send_retry`: int（重试次数，默认 1~2）

在 small-admin 增加“骑手通知配置”页面，支持在线修改模板ID和开关。

---

## 9. 失败降级与用户体验

即使订阅消息失败，也要保证用户可被引导：

1. 审核中点击“成为骑手”继续弹“加群二维码”弹窗（你当前已做）。
2. 审核通过时，若订阅消息发送失败：
   - 用户进入“我的”页时给一次站内 toast / 红点提示。
3. admin 后台保留失败日志，支持人工复查。

---

## 10. 联调与验收清单

### 联调场景
1. 用户同意 A+B -> 提交后收到“加群提醒”。
2. 管理员通过 -> 用户收到“认证通过提醒”。
3. 用户拒绝订阅 -> 认证正常提交，后台不发送，前端仍可二维码引导。
4. 重复点击通过 -> 不重复发送模板B。
5. access_token 失效 -> 自动刷新后可恢复发送。

### 验收标准
- 模板消息触达成功率可统计。
- 审核链路无阻塞（消息失败不影响核心业务状态）。
- 后台可配置模板ID并动态生效。

---

## 11. 安全与风控注意

- 模板ID、AppSecret 仅服务端保存，不下发前端。
- 发送接口加限流与鉴权，避免被刷。
- 日志中禁止输出完整 openid、手机号（脱敏记录）。

---

## 12. 实施顺序（建议）

1. 配置模板（公众平台）+ admin 配置页。  
2. 封装 `wechat-subscribe` 公共发送模块。  
3. 改 rider-service 提交后发送模板A。  
4. 改 admin-service 审核通过发送模板B。  
5. 前端接入 `requestSubscribeMessage` 并透传订阅结果。  
6. 联调 + 灰度发布 + 监控。
