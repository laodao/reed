# F01-03 - 模型选择

## 1. 功能概述

| 属性 | 值 |
|-----|-----|
| 所属模块 | M01 - AI对话 |
| 功能编号 | F01-03 |
| 功能名称 | 模型选择 |
| 优先级 | P0 |
| 功能描述 | 选择对话使用的AI模型，模型来自系统设置中配置的提供商 |

## 2. 操作流程

### 2.1 查看可用模型

```
用户点击模型选择器
    │
    ▼
调用 loadAvailableModels()
    │
    ▼
调用 provider:list IPC
    │
    ▼
主进程返回已配置API密钥的提供商列表
    │
    ▼
调用 provider:get-models IPC
    │
    ▼
获取每个提供商的可用模型
    │
    ▼
合并显示所有可用模型
```

### 2.2 选择模型

```
用户选择模型
    │
    ▼
更新当前对话的 modelId
    │
    ▼
如果是对话进行中
    │
    ├── 保存到数据库
    │
    ├── 后续消息使用新模型
    │
    ▼
显示新模型名称
```

## 3. 界面设计

### 3.1 模型选择器

```
┌─────────────────────────────────────────────┐
│  模型: [qwen-turbo                     ▼]  │
└─────────────────────────────────────────────┘
```

下拉列表：
```
┌─────────────────────────────────────────────┐
│  通义千问                                    │
│  ├── qwen-turbo        (快速，适合日常对话) │
│  ├── qwen-plus         (均衡，综合能力强)   │
│  └── qwen-max          (强大，复杂任务)     │
│                                              │
│  豆包                                        │
│  └── doubao-pro-32k    (长上下文)           │
│                                              │
│  DeepSeek                                    │
│  ├── deepseek-chat     (通用对话)           │
│  └── deepseek-coder    (代码专用)           │
│                                              │
│  GLM                                         │
│  └── glm-4             (最新模型)           │
└─────────────────────────────────────────────┘
```

### 3.2 未配置提示

```
┌─────────────────────────────────────────────┐
│  模型: [暂无可用模型 ▼]                     │
│                                              │
│  ⚠️ 请先在设置中配置AI提供商的API密钥       │
│                               [去设置]       │
└─────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据类型

```typescript
// 模型信息
interface Model {
  id: string                    // 模型ID
  provider: string              // 提供商标识
  providerName: string          // 提供商显示名称
  name: string                  // 模型显示名称
  description?: string          // 描述
  maxTokens: number             // 最大Token数
  contextWindow: number         // 上下文窗口大小
  features: string[]            // 支持的功能
}

// 提供商信息
interface Provider {
  id: string                    // 提供商标识
  name: string                  // 显示名称
  configured: boolean           // 是否已配置
  models: Model[]               // 可用模型
}
```

## 5. 涉及文件

### 5.1 前端文件

| 文件路径 | 描述 |
|---------|------|
| `src/renderer/src/stores/dialog.ts` | 对话状态管理 |
| `src/renderer/src/components/dialog/ModelSelector.vue` | 模型选择器组件 |

### 5.2 后端文件

| 文件路径 | 描述 |
|---------|------|
| `src/main/ipc/handlers/provider.handler.ts` | 提供商IPC处理器 |
| `src/main/services/provider.service.ts` | 提供商服务 |

### 5.3 共享文件

| 文件路径 | 描述 |
|---------|------|
| `src/shared/types/provider.types.ts` | Provider类型定义 |

## 6. 函数设计

### 6.1 前端函数

#### stores/dialog.ts

```typescript
/**
 * 可用模型列表
 */
const availableModels = ref<Model[]>([])

/**
 * 当前选中的模型
 */
const currentModel = ref<Model | null>(null)

/**
 * 加载可用模型
 * @returns Promise<void>
 * 逻辑：
 * 1. 调用 provider:list 获取已配置的提供商
 * 2. 对每个提供商调用 provider:get-models
 * 3. 合并所有模型到 availableModels
 */
async function loadAvailableModels(): Promise<void>

/**
 * 选择模型
 * @param model - 模型对象
 * @returns void
 * 逻辑：
 * 1. 更新 currentModel
 * 2. 如果有当前对话，更新对话的 modelId
 */
function selectModel(model: Model): void
```

#### components/dialog/ModelSelector.vue

```typescript
/**
 * 按提供商分组的模型
 */
const groupedModels = computed(() => {
  // 按 provider 分组
})

/**
 * 处理模型选择
 * @param model - 模型对象
 */
function handleSelect(model: Model): void
```

### 6.2 后端函数

#### provider.handler.ts

```typescript
/**
 * 处理获取提供商列表
 * @returns Promise<{ success: boolean, providers: Provider[] }>
 * 逻辑：
 * 1. 获取所有预定义的提供商
 * 2. 检查每个是否已配置API密钥
 * 3. 返回列表
 */
async function handleListProviders(): Promise<{ success: boolean, providers: Provider[] }>

/**
 * 处理获取提供商的模型列表
 * @param provider - 提供商标识
 * @returns Promise<{ success: boolean, models: Model[] }>
 * 逻辑：
 * 1. 获取提供商配置
 * 2. 返回该提供商支持的模型列表
 */
async function handleGetModels(provider: string): Promise<{ success: boolean, models: Model[] }>

/**
 * 处理测试提供商连接
 * @param provider - 提供商标识
 * @returns Promise<{ success: boolean, message: string }>
 */
async function handleTestProvider(provider: string): Promise<{ success: boolean, message: string }>
```

## 7. 边界检查

| 场景 | 处理方式 |
|-----|---------|
| 无可用模型 | 显示提示，引导去设置 |
| 提供商API密钥失效 | 标记为不可用 |
| 网络错误 | 使用缓存的模型列表 |

## 8. 测试用例

| 用例ID | 描述 | 步骤 | 预期结果 |
|-------|------|-----|---------|
| TC001 | 查看模型列表 | 点击选择器 | 显示所有可用模型 |
| TC002 | 选择模型 | 点击模型 | 更新当前模型 |
| TC003 | 切换模型 | 对话中切换 | 后续消息用新模型 |
| TC004 | 无可用模型 | 未配置API密钥 | 显示提示 |
