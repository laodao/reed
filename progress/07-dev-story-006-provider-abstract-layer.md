# STORY-006: Provider抽象层 开发日志

**开始时间:** 2026-02-28
**完成时间:** 2026-02-28
**开发者:** Claude Code
**状态:** ✅ 已完成

---

## 故事概述

**用户故事:**
> 作为开发者，我想要实现Provider抽象层，以便可以统一管理多个AI提供商

**Epic:** EPIC-001 AI对话核心系统
**优先级:** Must Have
**点数:** 5

**依赖:**
- STORY-003 (IPC通信基础) ✓ 已完成
- STORY-004 (安全存储实现) - 待实现（但 API Key Service 已存在）

---

## 验收标准

- [x] IAIProvider接口定义
- [x] BaseProvider抽象类
- [x] ProviderManager实现
- [x] 提供商注册机制
- [x] 类型定义完整

---

## 实现内容

### 1. 类型定义增强 (`src/shared/types/provider.types.ts`)

新增类型：
- `AIProviderType` - 具体提供商类型 (qwen, doubao, glm, deepseek, ollama)
- `ModelType` - 模型类型 (chat, completion, embedding, image, video, voice)
- `ModelInfo` - 模型信息接口
- `StreamChunk` - 流式响应块
- `ProviderConfig` - 提供商配置
- `ProviderInfo` - 提供商信息（用于列表展示）

增强了 `IAIProvider` 接口，添加了 `getModels()` 和 `chatStream()` 方法。

### 2. BaseProvider 抽象类 (`src/main/providers/base/base.provider.ts`)

功能：
- 实现 `IAIProvider` 接口的通用方法
- 提供统一的错误处理 (`ProviderError`)
- 提供 Token 估算方法
- 提供通用的 HTTP 请求头构建
- 提供带超时的 fetch 封装

### 3. ProviderManager (`src/main/providers/provider.manager.ts`)

功能：
- 单例模式管理所有 Provider 实例
- Provider 工厂函数注册机制
- 从 ApiKeyService 获取配置并初始化 Provider
- 获取 Provider 信息和模型列表
- 测试 Provider 连接

### 4. IPC Handlers (`src/main/ipc/handlers/provider.handler.ts`)

新增 IPC 通道：
- `provider:list` - 获取所有 Provider 信息
- `provider:get-models` - 获取指定 Provider 的模型列表
- `provider:test` - 测试 Provider 连接
- `provider:init` - 初始化 Provider

### 5. Preload 脚本更新 (`src/preload/index.ts`)

新增方法：
- `providerList()` - 获取 Provider 列表
- `providerGetModels(provider)` - 获取模型列表
- `providerTest(provider)` - 测试连接
- `providerInit(provider, apiKey?, endpoint?)` - 初始化 Provider

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/shared/types/provider.types.ts` | 修改 | 增强类型定义 |
| `src/shared/types/ipc.types.ts` | 修改 | 添加 Provider IPC 类型和通道 |
| `src/main/providers/index.ts` | 新增 | Provider 导出索引 |
| `src/main/providers/base/base.provider.ts` | 新增 | BaseProvider 抽象类 |
| `src/main/providers/provider.manager.ts` | 新增 | ProviderManager 实现 |
| `src/main/ipc/handlers/provider.handler.ts` | 新增 | Provider IPC 处理器 |
| `src/main/ipc/handlers/index.ts` | 修改 | 导出 Provider handlers |
| `src/preload/index.ts` | 修改 | 添加 Provider API 方法 |

---

## 架构图

```
┌─────────────────────────────────────────────┐
│              ProviderManager                 │
│  - registerFactory()  - getProvider()       │
│  - initializeProvider()  - getModels()      │
└──────────────────┬──────────────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
       ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Qwen    │ │  Doubao  │ │  GLM     │  ...
│ Provider │ │ Provider │ │ Provider │
└──────────┘ └──────────┘ └──────────┘
       │           │           │
       └───────────┼───────────┘
                   │
                   ▼
         BaseProvider (抽象类)
                   │
                   ▼
         IAIProvider 接口
```

---

## 测试验证

- [x] TypeScript 编译无错误
- [x] LSP 诊断无错误
- [ ] 单元测试（待 STORY-007 实现具体 Provider 后编写）
- [ ] 集成测试（待后续验证）

---

## 下一步

1. 实现 STORY-007: 通义千问 Provider（使用 BaseProvider）
2. 编写 Provider 相关单元测试
3. 在 UI 中集成 Provider 选择功能
