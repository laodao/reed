# 模块设计文档

## 1. 模块概述

The Bot 按功能划分为以下核心模块：

| 模块 | 位置 | 职责 |
|------|------|------|
| 对话模块 | main/ipc/handlers/chat.handler.ts | AI 对话核心功能 |
| 消息模块 | main/ipc/handlers/message.handler.ts | 消息管理 |
| 对话管理模块 | main/ipc/handlers/dialog.handler.ts | 对话 CRUD |
| 提供商配置模块 | main/ipc/handlers/provider-config.handler.ts | 提供商管理 |
| 角色模块 | main/ipc/handlers/role.handler.ts | 角色管理 |
| 图像模块 | main/ipc/handlers/image.handler.ts | 图像生成 |
| 设置模块 | main/ipc/handlers/settings.handler.ts | 应用设置 |

---

## 2. 对话模块

### 2.1 模块职责

- 发送消息给 AI
- 流式响应处理
- 停止生成
- 消息重试

### 2.2 核心组件

#### ChatService

```typescript
// main/services/chat.service.ts
export class ChatService {
  // 发送消息
  async sendMessage(
    window: BrowserWindow,
    request: ChatRequest,
    onStreamEvent: (event: StreamEvent) => void
  ): Promise<{ success: boolean; error?: string }>

  // 停止生成
  stopGeneration(dialogId: string): void
}
```

#### 流式响应流程

```
用户输入 → ChatHandler → ChatService → Provider.chatStream()
                                              ↓
                                         AI API (流式)
                                              ↓
                                         onStreamEvent 回调
                                              ↓
                                         ipcRenderer.send('chat:stream')
                                              ↓
                                         渲染进程更新 UI
```

### 2.3 流式事件类型

```typescript
interface StreamEvent {
  type: 'start' | 'delta' | 'thinking' | 'done' | 'error'
  dialogId: string
  messageId?: string
  content?: string
  thinkingContent?: string
  error?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
```

---

## 3. 提供商模块

### 3.1 模块职责

- 提供商配置 CRUD
- 模型管理
- 连接测试
- 从 API 获取模型列表

### 3.2 Provider 架构

#### BaseProvider 抽象类

```typescript
// main/providers/base-provider.ts
export abstract class BaseProvider {
  abstract get id(): string
  abstract get name(): string

  // 核心方法
  abstract getModels(): Promise<ModelDefinition[]>
  abstract chatStream(
    context: ChatContext,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal,
    options?: ChatOptions
  ): Promise<string>
  abstract chatSync(context: ChatContext): Promise<ChatCompletionResponse>
  abstract testConnection(): Promise<{ success: boolean; message: string }>
}
```

#### Provider 工厂

```typescript
// main/providers/provider-factory.ts
export function createProvider(
  templateId: string,
  config: UserProviderConfig,
  template?: ProviderTemplate
): BaseProvider {
  switch (templateId) {
    case 'openai':
      return new OpenAISdkProvider(config, template)
    case 'anthropic':
      return new AnthropicSdkProvider(config, template)
    case 'google':
      return new GoogleSdkProvider(config, template)
    case 'volcengine':
      return new VolcEngineSdkProvider(config, template)
    default:
      // OpenAI 兼容 API
      return new OpenAICompatibleProvider(config, templateId, ...)
  }
}
```

### 3.3 Provider 类型

| 类型 | 实现类 | 说明 |
|------|--------|------|
| SDK Provider | OpenAISdkProvider | 使用官方 SDK |
| SDK Provider | AnthropicSdkProvider | 使用官方 SDK |
| SDK Provider | GoogleSdkProvider | 使用官方 SDK |
| SDK Provider | VolcEngineSdkProvider | 使用官方 SDK |
| 兼容 Provider | OpenAICompatibleProvider | OpenAI 兼容 API |

---

## 4. 数据存储模块

### 4.1 模块职责

- 数据库初始化
- 表结构管理
- 数据迁移
- Repository 管理

### 4.2 DatabaseManager

```typescript
// main/database/index.ts
export class DatabaseManager {
  private static instance: DatabaseManager
  private db: Database.Database | null = null

  // Repository 实例
  public settings: SettingsRepository
  public dialogs: DialogRepository
  public messages: MessageRepository
  public roles: RoleRepository
  public images: ImageRepository
  public providerConfigs: ProviderConfigRepository

  // 单例获取
  static getInstance(): DatabaseManager

  // 初始化
  initialize(): void

  // 执行迁移
  private runMigrations(): void

  // 关闭连接
  close(): void
}
```

### 4.3 Repository 模式

```typescript
// 基类
abstract class BaseRepository<T> {
  constructor(protected db: Database, protected tableName: string) {}

  abstract findById(id: string): T | undefined
  abstract findAll(): T[]
  abstract create(data: Partial<T>): T
  abstract update(id: string, data: Partial<T>): boolean
  abstract delete(id: string): boolean
}

// 具体实现
class DialogRepository extends BaseRepository<Dialog> {
  findById(id: string): Dialog | undefined { ... }
  findByRoleId(roleId: string | null): Dialog[] { ... }
  create(data: CreateDialogRequest): Dialog { ... }
  // ...
}
```

---

## 5. 安全存储模块

### 5.1 模块职责

- API 密钥加密存储
- 敏感数据加密
- 密钥管理

### 5.2 SecureStorageService

```typescript
// main/services/secure-storage.service.ts
export class SecureStorageService {
  private masterKey: Buffer

  constructor() {
    this.initializeMasterKey()
  }

  // 加密
  encrypt(plaintext: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plaintext).toString('base64')
    }
    return this.encryptWithKey(plaintext)
  }

  // 解密
  decrypt(ciphertext: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
    }
    return this.decryptWithKey(ciphertext)
  }

  // AES-256-GCM 加密
  private encryptWithKey(plaintext: string): string {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv)
    let encrypted = cipher.update(plaintext, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    const authTag = cipher.getAuthTag()
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
  }

  // AES-256-GCM 解密
  private decryptWithKey(ciphertext: string): string {
    const [ivBase64, authTagBase64, encrypted] = ciphertext.split(':')
    const iv = Buffer.from(ivBase64, 'base64')
    const authTag = Buffer.from(authTagBase64, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }
}
```

---

## 6. 图像生成模块

### 6.1 模块职责

- 图像生成任务管理
- 任务状态追踪
- 图像下载存储

### 6.2 ImageService

```typescript
// main/services/image.service.ts
export class ImageService {
  // 创建生成任务
  async createTask(request: ImageGenerateRequest): Promise<ImageTask>

  // 获取任务状态
  getTaskStatus(taskId: string): ImageTask | undefined

  // 获取任务列表
  getTasks(options?: { page?: number; pageSize?: number }): ImageTask[]

  // 删除任务
  deleteTask(taskId: string): boolean
}
```

### 6.3 图像生成流程

```
用户请求 → ImageHandler → ImageService → ImageProvider.generate()
                                          ↓
                                     AI 图像 API
                                          ↓
                                     轮询任务状态
                                          ↓
                                     下载图像到本地
                                          ↓
                                     更新任务状态
                                          ↓
                                     返回结果给渲染进程
```

---

## 7. 前端模块

### 7.1 Store 模块

#### DialogStore

```typescript
// stores/dialog.ts
export const useDialogStore = defineStore('dialog', () => {
  // 状态
  const dialogs = ref<Dialog[]>([])
  const currentDialog = ref<Dialog | null>(null)
  const messagesCache = ref(new Map<string, Message[]>())
  const streamStateCache = ref(new Map<string, StreamState>())
  const streamStateVersion = ref(0)

  // 计算属性
  const messages = computed(() => messagesCache.value.get(currentDialog.value?.id) || [])
  const streamState = computed(() => {
    streamStateVersion.value // 依赖触发
    return streamStateCache.value.get(currentDialog.value?.id) || defaultState
  })

  // 方法
  async function sendMessage(content: string, options?: SendOptions): Promise<boolean>
  async function stopGeneration(): Promise<void>
  async function clearMessages(): Promise<boolean>

  return { dialogs, currentDialog, messages, streamState, sendMessage, stopGeneration }
})
```

### 7.2 Composable 模块

#### useChat

```typescript
// composables/useChat.ts
export function useChat() {
  const dialogStore = useDialogStore()
  const roleStore = useRoleStore()

  // 状态
  const currentTab = ref<SidebarTab>('assistants')
  const selectedRole = ref<Role | null>(null)

  // 计算属性
  const isGenerating = computed(() => dialogStore.streamState.isStreaming)
  const messages = computed(() => dialogStore.messages)

  // 方法
  async function sendMessage(content: string, options?: {}): Promise<boolean> {
    return dialogStore.sendMessage(content, options)
  }

  async function stopGeneration(): Promise<void> {
    await dialogStore.stopGeneration()
  }

  return {
    currentTab, selectedRole, isGenerating, messages,
    sendMessage, stopGeneration
  }
}
```

### 7.3 组件层级

```
页面组件
├── 布局组件
│   ├── Sidebar
│   └── MainContent
├── 业务组件
│   ├── ChatMain
│   │   ├── ChatHeader
│   │   ├── MessageList
│   │   │   └── MessageItem
│   │   └── ChatInput
│   └── ImageGenerator
└── 通用组件
    ├── CodeBlock
    ├── MarkdownRenderer
    └── LoadingSpinner
```

---

## 8. 模块间通信

### 8.1 主进程内部通信

```
IPC Handler → Service → Provider → AI API
     ↓           ↓
Repository ← Database
```

### 8.2 跨进程通信

```
渲染进程                主进程
    │                     │
    │ ipcRenderer.invoke │
    │────────────────────>│
    │                     │
    │ ipcRenderer.on      │
    │<────────────────────│
    │                     │
```

### 8.3 Store 间通信

```typescript
// Store A 访问 Store B
const storeA = useStoreA()
const storeB = useStoreB()

// 在 Store A 的方法中
function someMethod() {
  const dataFromB = storeB.someData
  // ...
}
```
