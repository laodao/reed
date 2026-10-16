# Electron 应用 E2E 测试指南

## 概述

本项目使用 Playwright 通过 Chrome DevTools Protocol (CDP) 连接 Electron 应用进行自动化测试。

## 测试环境设置

### 已安装的依赖

- `@playwright/test` - Playwright 测试框架

### 目录结构

```
tests/
├── electron.setup.ts       # Electron 连接辅助工具
└── e2e/
    ├── app.spec.ts         # 基础应用测试
    └── image-generation.spec.ts  # 图像生成功能测试
```

## 使用方法

### 方式一：手动启动应用后运行测试（推荐）

1. 启动 Electron 应用并开启调试端口：

```bash
npm run dev:debug
```

2. 在另一个终端运行测试：

```bash
npm run test:e2e
```

### 方式二：自动启动应用

直接运行测试，测试框架会自动启动应用：

```bash
npm run test:e2e
```

### 其他命令

```bash
# 带UI界面运行测试
npm run test:e2e:ui

# 调试模式
npm run test:e2e:debug

# 运行特定测试文件
npx playwright test tests/e2e/image-generation.spec.ts

# 运行特定测试用例
npx playwright test -g "应该能使用 wan2.7-image-pro"
```

## 编写测试

### 基本示例

```typescript
import { test, expect } from '@playwright/test'
import { ElectronTestHelper, createElectronHelper } from '../electron.setup'

let helper: ElectronTestHelper

test.beforeAll(async () => {
  helper = createElectronHelper({ debugPort: 9222 })
  await helper.startApp()
})

test.afterAll(async () => {
  await helper.close()
})

test('测试示例', async () => {
  await helper.waitForElectronAPI()

  // 调用 electronAPI
  const result = await helper.invokeElectronAPI('settings.get')
  expect(result).toBeDefined()
})
```

### ElectronTestHelper API

| 方法 | 说明 |
|------|------|
| `startApp()` | 启动/连接 Electron 应用 |
| `getPage()` | 获取 Playwright Page 实例 |
| `getContext()` | 获取 BrowserContext 实例 |
| `getBrowser()` | 获取 Browser 实例 |
| `invokeElectronAPI(method, ...args)` | 调用 electronAPI 方法 |
| `waitForElectronAPI(timeout)` | 等待 electronAPI 准备就绪 |
| `isElectronAPIReady()` | 检查 electronAPI 是否可用 |
| `navigateTo(route)` | 导航到指定路由 |
| `close()` | 关闭应用连接 |

### invokeElectronAPI 使用示例

```typescript
// 获取设置
await helper.invokeElectronAPI('settings.get')

// 获取提供商配置列表
await helper.invokeElectronAPI('providerConfig.list')

// 生成图像
await helper.invokeElectronAPI('image.generate', {
  providerId: 'xxx',
  modelId: 'wan2.7-image-pro',
  prompt: '一只猫',
  width: 1024,
  height: 1024
})

// 带参数的方法
await helper.invokeElectronAPI('image.list', 1, 10, false, 'completed')
```

## 调试技巧

1. **查看控制台输出**
   ```typescript
   const page = helper.getPage()
   page.on('console', msg => console.log('浏览器日志:', msg.text()))
   ```

2. **截图**
   ```typescript
   const page = helper.getPage()
   await page.screenshot({ path: 'debug.png' })
   ```

3. **暂停测试**
   ```typescript
   await page.pause()
   ```

4. **查看 Electron 日志**
   启动应用时，控制台会输出 `[Electron stdout]` 和 `[Electron stderr]` 日志

## 注意事项

1. 测试前确保端口 9222 未被占用
2. 测试结束后正确关闭连接，避免进程残留
3. 如果测试失败，检查 Electron 应用是否正常运行
4. `autoClose: false` 便于调试，生产测试可设为 `true`