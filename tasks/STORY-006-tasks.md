# STORY-006: Provider抽象层

**Epic:** EPIC-001 AI对话核心系统
**优先级:** Must Have
**点数:** 5
**依赖:** STORY-003 (已完成 ✓), STORY-004 (待实现)

## 用户故事

> 作为开发者，我想要实现Provider抽象层，以便可以统一管理多个AI提供商

## 验收标准

- [ ] IAIProvider接口定义
- [ ] BaseProvider抽象类
- [ ] ProviderManager实现
- [ ] 提供商注册机制
- [ ] 类型定义完整

---

## 任务清单

### 任务 6.1: 定义 Provider 类型接口
**描述:** 在 shared/types 中定义完整的 Provider 类型
**文件:** `src/shared/types/provider.types.ts`
**预计时间:** 45分钟

**接口定义:**
```typescript
// AI 提供商类型
type AIProviderType = 'qwen' | 'doubao' | 'glm' | 'deepseek' | 'ollama'

// 模型信息
interface ModelInfo {
  id: string
  name: string
  type: 'chat' | 'completion' | 'embedding'
  maxTokens: number
  supportStream: boolean
}

// 聊天消息
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 聊天请求
interface ChatRequest {
  messages: ChatMessage[]
  model: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

// 聊天响应
interface ChatResponse {
  id: string
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// 流式响应块
interface StreamChunk {
  id: string
  content: string
  done: boolean
}

// 提供商配置
interface ProviderConfig {
  provider: AIProviderType
  apiKey: string
  endpoint?: string
  defaultModel?: string
}
```

**完成标准:**
- [ ] `AIProviderType` 类型定义
- [ ] `ModelInfo` 接口定义
- [ ] `ChatMessage` / `ChatRequest` / `ChatResponse` 定义
- [ ] `StreamChunk` 接口定义
- [ ] `ProviderConfig` 接口定义

---

### 任务 6.2: 创建 IAIProvider 接口
**描述:** 定义 AI Provider 的统一接口
**文件:** `src/main/providers/interfaces/ai-provider.interface.ts`
**预计时间:** 30分钟

**接口定义:**
```typescript
interface IAIProvider {
  // 提供商信息
  readonly name: AIProviderType
  readonly displayName: string

  // 获取可用模型列表
  getModels(): Promise<ModelInfo[]>

  // 测试连接
  testConnection(): Promise<boolean>

  // 聊天（非流式）
  chat(request: ChatRequest): Promise<ChatResponse>

  // 聊天（流式）
  chatStream(
    request: ChatRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ChatResponse>

  // 获取 Token 数量估算
  countTokens(messages: ChatMessage[]): number
}
```

**完成标准:**
- [ ] 接口定义完整
- [ ] 包含所有必要方法
- [ ] 类型导入正确

---

### 任务 6.3: 创建 BaseProvider 抽象类
**描述:** 实现 Provider 基类，提供通用功能
**文件:** `src/main/providers/base/base.provider.ts`
**预计时间:** 1小时

**实现内容:**
```typescript
abstract class BaseProvider implements IAIProvider {
  protected config: ProviderConfig
  protected models: ModelInfo[] = []

  constructor(config: ProviderConfig) {
    this.config = config
  }

  abstract readonly name: AIProviderType
  abstract readonly displayName: string
  abstract getModels(): Promise<ModelInfo[]>
  abstract testConnection(): Promise<boolean>
  abstract chat(request: ChatRequest): Promise<ChatResponse>
  abstract chatStream(
    request: ChatRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ChatResponse>

  // 通用方法
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    }
  }

  protected handleError(error: unknown): Error {
    // 统一错误处理
  }

  countTokens(messages: ChatMessage[]): number {
    // 简单估算，子类可覆盖
    return messages.reduce((sum, m) => sum + m.content.length / 4, 0)
  }
}
```

**完成标准:**
- [ ] 抽象类实现
- [ ] 通用方法实现
- [ ] 错误处理机制
- [ ] Token 估算方法

---

### 任务 6.4: 实现 ProviderManager
**描述:** 创建 Provider 管理器，统一管理所有提供商
**文件:** `src/main/providers/provider.manager.ts`
**预计时间:** 1小时

**功能:**
```typescript
class ProviderManager {
  private providers: Map<AIProviderType, IAIProvider> = new Map()
  private configs: Map<AIProviderType, ProviderConfig> = new Map()

  // 注册提供商
  register(type: AIProviderType, provider: IAIProvider): void

  // 注销提供商
  unregister(type: AIProviderType): void

  // 获取提供商
  getProvider(type: AIProviderType): IAIProvider | undefined

  // 获取所有已注册的提供商
  getRegisteredProviders(): AIProviderType[]

  // 初始化提供商（从数据库加载配置）
  async initializeProvider(
    type: AIProviderType,
    apiKey: string,
    endpoint?: string
  ): Promise<IAIProvider>

  // 检查提供商是否可用
  isAvailable(type: AIProviderType): boolean

  // 获取提供商的模型列表
  async getModels(type: AIProviderType): Promise<ModelInfo[]>
}
```

**完成标准:**
- [ ] 注册/注销方法
- [ ] 获取 Provider 方法
- [ ] 初始化方法（从 ApiKeyService 获取密钥）
- [ ] 可用性检查

---

### 任务 6.5: 创建 Provider IPC Handlers
**描述:** 为 Provider 管理创建 IPC handlers
**文件:** `src/main/ipc/handlers/provider.handler.ts`
**预计时间:** 45分钟

**Handlers:**
- `provider:list` - 获取所有已注册的提供商
- `provider:get-models` - 获取指定提供商的模型列表
- `provider:test` - 测试提供商连接

**完成标准:**
- [ ] `PROVIDER_LIST` handler
- [ ] `PROVIDER_GET_MODELS` handler
- [ ] `PROVIDER_TEST` handler
- [ ] 注册到 ipcRegistry

---

### 任务 6.6: 添加 IPC 通道类型
**描述:** 在类型定义中添加 Provider 相关的 IPC 通道
**文件:** `src/shared/types/ipc.types.ts`
**预计时间:** 15分钟

**新增类型:**
```typescript
// IPC 通道
PROVIDER_LIST: 'provider:list',
PROVIDER_GET_MODELS: 'provider:get-models',
PROVIDER_TEST: 'provider:test',

// 请求/响应类型
interface ProviderListResponse {
  providers: Array<{
    type: AIProviderType
    name: string
    isAvailable: boolean
  }>
}

interface ProviderGetModelsRequest {
  provider: AIProviderType
}

interface ProviderGetModelsResponse {
  models: ModelInfo[]
}

interface ProviderTestRequest {
  provider: AIProviderType
}

interface ProviderTestResponse {
  success: boolean
  message: string
}
```

**完成标准:**
- [ ] IPC 通道常量添加
- [ ] 请求/响应类型定义

---

### 任务 6.7: 更新 Preload 脚本
**描述:** 添加 Provider 相关的 API
**文件:** `src/preload/index.ts`
**预计时间:** 15分钟

**新增方法:**
- `providerList()`
- `providerGetModels(provider)`
- `providerTest(provider)`

**完成标准:**
- [ ] 三个方法添加完成
- [ ] 类型定义正确

---

### 任务 6.8: 编写单元测试
**描述:** 为 ProviderManager 编写单元测试
**文件:** `src/main/providers/__tests__/provider.manager.test.ts`
**预计时间:** 45分钟

**测试用例:**
- [ ] 注册/注销 Provider
- [ ] 获取 Provider
- [ ] 检查可用性
- [ ] 获取模型列表

---

### 任务 6.9: 集成测试与验证
**描述:** 验证 Provider 抽象层工作正常
**预计时间:** 30分钟

**验证步骤:**
- [ ] 应用启动无错误
- [ ] ProviderManager 初始化成功
- [ ] IPC handlers 注册成功
- [ ] 测试连接接口可用

---

## 技术说明

### Provider 架构图

```
┌─────────────────────────────────────────────┐
│              ProviderManager                 │
│  - register()  - unregister()               │
│  - getProvider()  - getModels()             │
│  - initializeProvider()                     │
└──────────────────┬──────────────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
       ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Qwen    │ │  Doubao  │ │  GLM     │
│ Provider │ │ Provider │ │ Provider │
└──────────┘ └──────────┘ └──────────┘
       │           │           │
       └───────────┼───────────┘
                   │
                   ▼
         IAIProvider Interface
```

### 支持的 Provider 类型

| Provider | 类型 | API 端点 |
|----------|------|----------|
| 通义千问 | qwen | dashscope.aliyuncs.com |
| 豆包 | doubao | ark.cn-beijing.volces.com |
| GLM | glm | open.bigmodel.cn |
| DeepSeek | deepseek | api.deepseek.com |
| Ollama | ollama | localhost:11434 |

---

## 依赖

- IPC 通信 (STORY-003 ✓)
- API 密钥存储 (STORY-004)
- 类型系统 (STORY-001 ✓)
