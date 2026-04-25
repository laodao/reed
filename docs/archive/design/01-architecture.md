# 架构设计文档

## 1. 架构概述

### 1.1 整体架构模式

The Bot 采用 **Electron + Vue3 + TypeScript** 架构，结合分层架构和微前端思想，实现主进程和渲染进程的职责分离。

```
┌─────────────────────────────────────────────────────────────────────┐
│                           用户界面层                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    渲染进程 (Vue 3)                          │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │   │
│  │  │   Views     │ │ Components  │ │   Stores    │           │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘           │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │              Composables (业务逻辑封装)              │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                    IPC Bridge (contextBridge)                       │
│                              │                                      │
├──────────────────────────────┼──────────────────────────────────────┤
│                              │                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    主进程 (Electron)                         │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │   │
│  │  │IPC Handlers │ │  Services   │ │  Providers  │           │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘           │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │              Database Layer (Repository)             │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    SQLite Database                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 进程职责划分

| 进程 | 职责 | 技术栈 |
|------|------|--------|
| **主进程** | 系统级操作、数据持久化、业务逻辑、AI 服务调用 | Electron + Node.js |
| **渲染进程** | UI 展示、用户交互、状态管理 | Vue 3 + Element Plus |
| **预加载脚本** | 安全桥接、API 封装 | contextBridge |

### 1.3 目录结构

```
src/
├── main/                          # 主进程
│   ├── index.ts                   # 入口文件
│   ├── database/                  # 数据库层
│   │   ├── index.ts               # DatabaseManager
│   │   └── repositories/          # 数据仓库
│   ├── ipc/                       # IPC 通信层
│   │   ├── index.ts               # 注册处理器
│   │   └── handlers/              # 各模块处理器
│   ├── providers/                 # AI 提供商
│   │   ├── base-provider.ts       # 抽象基类
│   │   ├── openai-compatible-provider.ts
│   │   └── sdk/                   # SDK 实现
│   ├── image-providers/           # 图像提供商
│   └── services/                  # 业务服务
│       ├── chat.service.ts
│       ├── secure-storage.service.ts
│       └── ...
├── preload/                       # 预加载脚本
│   └── index.ts                   # contextBridge API
├── renderer/                      # 渲染进程
│   └── src/
│       ├── main.ts                # Vue 入口
│       ├── App.vue                # 根组件
│       ├── views/                 # 页面组件
│       ├── components/            # 通用组件
│       ├── stores/                # Pinia 状态
│       ├── composables/           # 组合式函数
│       └── router/                # 路由配置
└── shared/                        # 共享代码
    └── types/                     # 类型定义
```

---

## 2. 主进程架构

### 2.1 分层设计

```
┌─────────────────────────────────────────────────────────────┐
│                      IPC Handlers 层                         │
│  职责：接收渲染进程请求，参数验证，调用服务层                │
├─────────────────────────────────────────────────────────────┤
│                      Services 层                             │
│  职责：业务逻辑处理，协调多个组件，状态管理                  │
├─────────────────────────────────────────────────────────────┤
│                      Providers 层                            │
│  职责：AI 服务调用，统一接口封装                             │
├─────────────────────────────────────────────────────────────┤
│                      Repository 层                           │
│  职责：数据访问，SQL 封装，类型转换                          │
├─────────────────────────────────────────────────────────────┤
│                      Database 层                             │
│  职责：数据库连接，表管理，迁移                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 DatabaseManager 设计

```typescript
export class DatabaseManager {
  // 单例模式
  private static instance: DatabaseManager

  // 数据库连接
  private db: Database.Database | null = null

  // 仓库实例
  public settings: SettingsRepository | null = null
  public apiKeys: ApiKeyRepository | null = null
  public dialogs: DialogRepository | null = null
  public messages: MessageRepository | null = null
  public roles: RoleRepository | null = null
  public images: ImageRepository | null = null
  public providerConfigs: ProviderConfigRepository | null = null

  // 获取单例
  public static getInstance(): DatabaseManager

  // 初始化数据库
  public initialize(): void

  // 执行迁移
  private runMigrations(): void
}
```

**数据库配置**：
- 使用 `better-sqlite3` 同步访问
- 启用 WAL 模式提高并发性能
- 启用外键约束保证数据完整性

### 2.3 Repository 模式

```typescript
// 基类设计
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
  findById(id: string): Dialog | undefined {
    const row = this.db.prepare('SELECT * FROM dialogs WHERE id = ?').get(id)
    return row ? this.mapToEntity(row) : undefined
  }

  findByRoleId(roleId: string | null): Dialog[] { ... }
  updateMessageCount(id: string, count: number): void { ... }

  private mapToEntity(row: any): Dialog { ... }
}
```

### 2.4 IPC Handler 设计

```typescript
// 注册处理器
export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:list', handleListDialogs)
  ipcMain.handle('dialog:get', handleGetDialog)
  ipcMain.handle('dialog:create', handleCreateDialog)
  ipcMain.handle('dialog:update', handleUpdateDialog)
  ipcMain.handle('dialog:delete', handleDeleteDialog)
}

// 处理器实现
async function handleCreateDialog(
  _event: IpcMainInvokeEvent,
  request: CreateDialogRequest
): Promise<{ success: boolean; dialog?: Dialog; error?: string }> {
  try {
    const dialog = db.dialogs!.create(request)
    return { success: true, dialog }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
```

**统一返回格式**：
```typescript
interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

---

## 3. Provider 架构

### 3.1 Provider 继承体系

```
                    BaseProvider (抽象基类)
                          │
          ┌───────────────┼───────────────┐
          │               │               │
  OpenAISdkProvider  AnthropicSdkProvider  ...
          │
  OpenAICompatibleProvider (兼容实现)
          │
    用于 DeepSeek、智谱、阿里百炼等
```

### 3.2 BaseProvider 抽象类

```typescript
export abstract class BaseProvider {
  // 基本信息
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

  // 工具方法
  protected buildMessages(context: ChatContext): MessageParam[]
  protected parseStreamEvent(data: string): StreamEvent | null
}
```

### 3.3 Provider 工厂

```typescript
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
    case 'deepseek':
    case 'zhipu':
    case 'bailian':
    case 'minimax':
      return new OpenAICompatibleProvider(config, templateId, ...)
    default:
      return new OpenAICompatibleProvider(config, templateId, ...)
  }
}
```

---

## 4. 渲染进程架构

### 4.1 组件层级

```
App.vue
├── MainLayout.vue
│   ├── Sidebar.vue
│   │   └── NavMenu.vue
│   └── router-view
│       ├── Chat.vue
│       │   ├── ChatSidebar.vue
│       │   │   ├── AssistantList.vue
│       │   │   └── TopicList.vue
│       │   └── ChatMain.vue
│       │       ├── ChatHeader.vue
│       │       ├── MessageList.vue
│       │       │   └── MessageItem.vue
│       │       └── ChatInput.vue
│       ├── Image.vue
│       │   ├── ImageSidebar.vue
│       │   ├── ImageGenerator.vue
│       │   └── ImageResult.vue
│       ├── Assistant.vue
│       └── Settings.vue
```

### 4.2 Pinia Store 设计

```typescript
// 对话 Store
export const useDialogStore = defineStore('dialog', () => {
  // 状态
  const dialogs = ref<Dialog[]>([])
  const currentDialog = ref<Dialog | null>(null)
  const messagesCache = ref(new Map<string, Message[]>())
  const streamStateCache = ref(new Map<string, StreamState>())

  // 计算属性
  const messages = computed(() =>
    messagesCache.value.get(currentDialog.value?.id) || []
  )

  const streamState = computed(() =>
    streamStateCache.value.get(currentDialog.value?.id) || defaultState
  )

  // 方法
  async function loadDialogs(): Promise<void> { ... }
  async function selectDialog(dialog: Dialog): Promise<void> { ... }
  async function sendMessage(content: string, options?: {}): Promise<boolean> { ... }

  return {
    dialogs, currentDialog, messages, streamState,
    loadDialogs, selectDialog, sendMessage
  }
})
```

### 4.3 Composable 设计

```typescript
// 对话功能封装
export function useChat() {
  const dialogStore = useDialogStore()
  const roleStore = useRoleStore()

  // 状态
  const currentTab = ref<SidebarTab>('assistants')
  const selectedRole = ref<Role | null>(null)
  const isGenerating = computed(() => dialogStore.streamState.isStreaming)

  // 方法
  async function sendMessage(content: string, options?: {}): Promise<boolean> {
    return dialogStore.sendMessage(content, options)
  }

  async function stopGeneration(): Promise<void> {
    await dialogStore.stopGeneration()
  }

  return {
    currentTab, selectedRole, isGenerating,
    sendMessage, stopGeneration
  }
}
```

---

## 5. IPC 通信设计

### 5.1 通道命名规范

```
模块:操作
例如：
- dialog:list
- dialog:create
- dialog:update
- chat:send
- chat:stream
- provider-config:list
```

### 5.2 预加载脚本 API 暴露

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  // 对话
  dialog: {
    list: () => ipcRenderer.invoke('dialog:list'),
    create: (request) => ipcRenderer.invoke('dialog:create', request),
    update: (id, data) => ipcRenderer.invoke('dialog:update', id, data),
    delete: (id) => ipcRenderer.invoke('dialog:delete', id)
  },

  // 聊天（流式）
  chat: {
    send: (request) => ipcRenderer.invoke('chat:send', request),
    stop: (dialogId) => ipcRenderer.invoke('chat:stop', dialogId),
    onStream: (callback) => {
      const handler = (_event, data) => callback(_event, data)
      ipcRenderer.on('chat:stream', handler)
      return () => ipcRenderer.removeListener('chat:stream', handler)
    }
  },

  // ... 其他 API
})
```

### 5.3 流式通信机制

```
渲染进程                      主进程                        AI API
    │                           │                            │
    │ chat:send                 │                            │
    │──────────────────────────>│                            │
    │                           │  HTTP Stream Request       │
    │                           │───────────────────────────>│
    │                           │                            │
    │                           │<──── chunk ────────────────│
    │  chat:stream (delta)      │                            │
    │<──────────────────────────│                            │
    │                           │<──── chunk ────────────────│
    │  chat:stream (delta)      │                            │
    │<──────────────────────────│                            │
    │                           │<──── done ─────────────────│
    │  chat:stream (done)       │                            │
    │<──────────────────────────│                            │
```

---

## 6. 安全设计

### 6.1 contextBridge 安全机制

- 渲染进程无法直接访问 Node.js API
- 所有主进程调用必须通过暴露的 API
- 参数在主进程进行验证

### 6.2 API 密钥加密存储

```typescript
export class SecureStorageService {
  // 优先使用系统级加密
  encrypt(data: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(data).toString('base64')
    }
    // 回退到 AES-256-GCM
    return this.encryptWithKey(data)
  }

  decrypt(encryptedData: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(
        Buffer.from(encryptedData, 'base64')
      )
    }
    return this.decryptWithKey(encryptedData)
  }
}
```

### 6.3 数据安全

- 敏感数据加密存储
- 数据库文件位于用户数据目录
- 不上传用户数据到云端

---

## 7. 性能优化

### 7.1 数据库优化

- WAL 模式提高并发性能
- 索引优化查询速度
- 预编译语句减少解析开销

### 7.2 前端优化

- 组件懒加载
- 虚拟列表处理大量消息
- 状态缓存避免重复请求
- keep-alive 缓存页面组件

### 7.3 流式响应优化

- 事件驱动实时更新
- 状态缓存独立管理
- AbortController 支持取消请求
