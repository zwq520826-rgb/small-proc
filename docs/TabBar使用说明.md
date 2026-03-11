# 自定义 TabBar 使用说明

## 📋 概述

本项目实现了一个自定义 TabBar 组件，支持在**用户端 (Client)** 和**骑手端 (Rider)** 两种模式之间无缝切换。

## 🎯 功能特性

1. **双模式支持**：
   - **用户端**：首页、订单、我的
   - **骑手端**：大厅、任务、我的

2. **智能高亮**：根据当前页面路径自动高亮对应的 Tab

3. **模式切换**：在"我的"页面中一键切换模式

4. **状态持久化**：使用本地存储保存用户模式选择

## 📁 文件结构

```
components/
  └── TheTabBar.vue          # 自定义 TabBar 组件

store/
  └── user.js                # 用户模式状态管理

pages/
  ├── client/
  │   ├── home.vue           # 用户端首页（已集成 TabBar）
  │   └── orders/list.vue    # 用户端订单列表（已集成 TabBar）
  ├── rider/
  │   ├── hall.vue           # 骑手端大厅（已集成 TabBar）
  │   └── tasks/list.vue     # 骑手端任务列表（已集成 TabBar）
  └── mine/
      └── index.vue          # 我的页面（已集成 TabBar，包含切换逻辑）
```

## 🔧 配置说明

### pages.json 配置

```json
{
  "tabBar": {
    "custom": true,  // 启用自定义 TabBar
    "list": [
      {
        "pagePath": "pages/client/home",
        "text": "首页"
      },
      {
        "pagePath": "pages/client/orders/list",
        "text": "订单"
      },
      {
        "pagePath": "pages/rider/hall",
        "text": "大厅"
      },
      {
        "pagePath": "pages/rider/tasks/list",
        "text": "任务"
      },
      {
        "pagePath": "pages/mine/index",
        "text": "我的"
      }
    ]
  }
}
```

**注意**：虽然 `tabBar.list` 中包含了所有 5 个页面，但实际显示的 Tab 由 `TheTabBar.vue` 组件根据 `user_mode` 动态控制。

## 💻 使用方法

### 1. 在页面中引入 TabBar

```vue
<template>
  <view class="page">
    <!-- 页面内容 -->
  </view>
  <TheTabBar />
</template>

<script setup>
import TheTabBar from '@/components/TheTabBar.vue'
</script>
```

### 2. 模式切换逻辑

在"我的"页面中，已经实现了切换逻辑：

```javascript
import { switchToRider, switchToClient } from '@/store/user.js'

// 切换到骑手端
goBecomeRider() {
  switchToRider()
  uni.reLaunch({ url: '/pages/rider/hall' })
}

// 切回用户端
goClientMode() {
  switchToClient()
  uni.reLaunch({ url: '/pages/client/home' })
}
```

### 3. 状态管理 API

```javascript
import { 
  getUserMode,      // 获取当前模式
  setUserMode,      // 设置模式
  switchToRider,    // 切换到骑手端
  switchToClient,   // 切换到用户端
  isRiderMode,      // 判断是否为骑手模式
  isClientMode      // 判断是否为用户端模式
} from '@/store/user.js'

// 示例
if (isRiderMode()) {
  console.log('当前是骑手模式')
}
```

## 🎨 组件 API

### TheTabBar 组件

**Props**：无（自动检测当前路由和模式）

**功能**：
- 自动根据 `user_mode` 显示对应的 Tab 列表
- 自动高亮当前页面对应的 Tab
- 点击 Tab 时使用 `switchTab` 或 `reLaunch` 进行页面跳转

## 🔄 工作流程

1. **初始化**：
   - 应用启动时，从本地存储读取 `user_mode`
   - 默认值为 `'client'`（用户端）

2. **显示 TabBar**：
   - `TheTabBar` 组件读取 `user_mode`
   - 如果是 `'rider'`，显示：大厅、任务、我的
   - 如果是 `'client'`，显示：首页、订单、我的

3. **切换模式**：
   - 用户在"我的"页面点击"成为骑手"或"切回用户端"
   - 更新本地存储的 `user_mode`
   - 使用 `reLaunch` 跳转到对应模式的首页

4. **高亮逻辑**：
   - 组件通过 `getCurrentPages()` 获取当前页面路径
   - 与 Tab 配置的 `pagePath` 进行匹配
   - 匹配成功则添加 `active` 类名

## ⚠️ 注意事项

1. **页面路径**：确保所有 Tab 页面的路径与 `pages.json` 中的配置一致

2. **跳转方式**：
   - Tab 之间的跳转使用 `uni.switchTab()`（如果页面在 tabBar 配置中）
   - 如果 `switchTab` 失败，会自动降级为 `uni.reLaunch()`

3. **模式切换**：
   - 切换模式时必须使用 `uni.reLaunch()`，不能用 `switchTab()`
   - 因为需要清空页面栈并重新初始化

4. **安全区域**：
   - TabBar 已适配 iPhone 等设备的安全区域（底部刘海）

## 🐛 常见问题

**Q: TabBar 不显示？**
A: 检查页面是否引入了 `<TheTabBar />` 组件，以及 `pages.json` 中是否设置了 `"custom": true`

**Q: 切换模式后 TabBar 没有更新？**
A: 确保使用了 `reLaunch` 而不是 `navigateTo`，并且检查本地存储的 `user_mode` 是否正确更新

**Q: Tab 高亮不正确？**
A: 检查页面路径是否与 Tab 配置中的 `pagePath` 完全匹配（注意前导斜杠）

## 📝 更新日志

- 2024-01-XX: 初始版本，支持用户端和骑手端双模式切换





