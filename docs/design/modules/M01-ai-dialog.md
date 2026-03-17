# M01 - AI对话模块设计

## 1. 模块概述

| 属性 | 值 |
|-----|-----|
| 模块编号 | M01 |
| 模块名称 | AI对话 |
| 模块代码 | ai-dialog |
| 优先级 | P0 |
| 描述 | 提供多模型AI对话功能，支持创建对话、管理历史、选择模型、配置角色等 |

## 2. 功能列表

| 功能编号 | 功能名称 | 功能描述 | 优先级 |
|---------|---------|---------|-------|
| F01-01 | 对话管理 | 创建、查看、删除对话 | P0 |
| F01-02 | 消息发送 | 发送消息并获取AI回复 | P0 |
| F01-03 | 模型选择 | 选择对话使用的AI模型 | P0 |
| F01-04 | 角色管理 | 创建和管理对话角色模板 | P1 |
| F01-05 | 流式输出 | 支持流式响应显示 | P0 |
| F01-06 | 对话导出 | 导出对话记录 | P2 |
| F01-07 | 上下文管理 | 管理对话上下文长度 | P1 |

## 3. 界面设计

### 3.1 对话主界面布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌────────────────────────────────────────────────────┐ │
│ │              │ │  对话标题                            [模型选择 ▼]  │ │
│ │   对话列表    │ ├────────────────────────────────────────────────────┤ │
│ │              │ │                                                    │ │
│ │  ┌────────┐  │ │   ┌──────────────────────────────────────────┐    │ │
│ │  │ + 新建 │  │ │   │ 👤 用户消息                              │    │ │
│ │  └────────┘  │ │   │    你好，请介绍一下你自己                 │    │ │
│ │              │ │   └──────────────────────────────────────────┘    │ │
│ │  ┌────────┐  │ │                                                    │ │
│ │  │对话1   │  │ │   ┌──────────────────────────────────────────┐    │ │
│ │  │今天    │  │ │   │ 🤖 AI回复                                │    │ │
│ │  └────────┘  │ │   │    你好！我是...                          │    │ │
│ │              │ │   └──────────────────────────────────────────┘    │ │
│ │  ┌────────┐  │ │                                                    │ │
│ │  │对话2   │  │ │   ┌──────────────────────────────────────────┐    │ │
│ │  │昨天    │  │ │   │ 👤 用户消息                              │    │ │
│ │  └────────┘  │ │   │    请帮我写一段代码                       │    │ │
│ │              │ │   └──────────────────────────────────────────┘    │ │
│ │     ...      │ │                                                    │ │
│ │              │ ├────────────────────────────────────────────────────┤ │
│ └──────────────┘ │  [角色选择 ▼] [────────────────────────] [发送]   │ │
│                  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 新建对话对话框

```
┌─────────────────────────────────────┐
│  新建对话                            │
├─────────────────────────────────────┤
│                                      │
│  对话标题  [                    ]    │
│              可选，留空自动生成       │
│                                      │
│  选择模型  [qwen-turbo ▼]            │
│                                      │
│  选择角色  [无 ▼]                    │
│              可选，预设角色模板       │
│                                      │
├─────────────────────────────────────┤
│                [取消]  [创建]        │
└─────────────────────────────────────┘
```

### 3.3 角色管理界面

```
┌─────────────────────────────────────────────────────────────┐
│  角色管理                                         [+ 新建]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🎭 代码助手                                              ││
│  │    你是一个专业的编程助手，擅长多种编程语言...           ││
│  │    [编辑] [删除]                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ✍️ 写作助手                                              ││
│  │    你是一个专业的写作助手，擅长各类文体写作...           ││
│  │    [编辑] [删除]                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🌐 翻译助手                                              ││
│  │    你是一个专业的翻译，精通多国语言...                   ││
│  │    [编辑] [删除]                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 角色编辑对话框

```
┌─────────────────────────────────────────────┐
│  编辑角色                                    │
├─────────────────────────────────────────────┤
│                                              │
│  角色名称  [                          ]      │
│                                              │
│  角色图标  [😀] [选择图标]                   │
│                                              │
│  系统提示词                                  │
│  ┌────────────────────────────────────────┐ │
│  │                                        │ │
│  │  你是一个...                           │ │
│  │                                        │ │
│  │                                        │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  描述（可选）                                │
│  ┌────────────────────────────────────────┐ │
│  │                                        │ │
│  └────────────────────────────────────────┘ │
│                                              │
├─────────────────────────────────────────────┤
│                    [取消]  [保存]            │
└─────────────────────────────────────────────┘
```

## 4. 数据设计

### 4.1 数据结构

```typescript
// 对话
interface Dialog {
  id: string                    // 对话ID
  title: string                 // 对话标题
  modelId: string               // 使用的模型ID
  roleId?: string               // 角色ID（可选）
  systemPrompt?: string         // 系统提示词
  createdAt: Date               // 创建时间
  updatedAt: Date               // 更新时间
  messageCount: number          // 消息数量
}

// 消息
interface Message {
  id: string                    // 消息ID
  dialogId: string              // 对话ID
  role: 'user' | 'assistant' | 'system'  // 角色
  content: string               // 消息内容
  createdAt: Date               // 创建时间
  tokenCount?: number           // Token数量
}

// 角色
interface Role {
  id: string                    // 角色ID
  name: string                  // 角色名称
  icon: string                  // 角色图标
  systemPrompt: string          // 系统提示词
  description?: string          // 描述
  createdAt: Date               // 创建时间
  updatedAt: Date               // 更新时间
}

// 模型
interface Model {
  id: string                    // 模型ID
  provider: string              // 提供商
  name: string                  // 显示名称
  description?: string          // 描述
  maxTokens: number             // 最大Token数
  supports: string[]            // 支持的功能
}

// 对话创建请求
interface CreateDialogRequest {
  title?: string                // 标题（可选）
  modelId: string               // 模型ID
  roleId?: string               // 角色ID（可选）
}

// 消息发送请求
interface SendMessageRequest {
  dialogId: string              // 对话ID
  content: string               // 消息内容
}

// 消息发送响应（流式）
interface SendMessageResponse {
  messageId: string             // 消息ID
  content: string               // 内容片段
  done: boolean                 // 是否完成
  error?: string                // 错误信息
}
```

### 4.2 数据库表

```sql
-- 对话表
CREATE TABLE dialogs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  model_id TEXT NOT NULL,
  role_id TEXT,
  system_prompt TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  message_count INTEGER DEFAULT 0
);

-- 消息表
CREATE TABLE dialog_messages (
  id TEXT PRIMARY KEY,
  dialog_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  token_count INTEGER,
  FOREIGN KEY (dialog_id) REFERENCES dialogs(id) ON DELETE CASCADE
);

-- 角色表
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🎭',
  system_prompt TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_dialogs_updated_at ON dialogs(updated_at DESC);
CREATE INDEX idx_messages_dialog_id ON dialog_messages(dialog_id, created_at);
```

## 5. IPC接口设计

### 5.1 对话管理

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| dialog:list | GET | - | { success, dialogs: Dialog[] } | 获取对话列表 |
| dialog:get | GET | id: string | { success, dialog: Dialog } | 获取单个对话 |
| dialog:create | CREATE | request: CreateDialogRequest | { success, dialog: Dialog } | 创建对话 |
| dialog:delete | DELETE | id: string | { success } | 删除对话 |

### 5.2 消息管理

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| dialog:messages | GET | dialogId: string | { success, messages: Message[] } | 获取消息列表 |
| dialog:send | SEND | request: SendMessageRequest | EventChannel | 发送消息（流式） |

### 5.3 角色管理

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| role:list | GET | - | { success, roles: Role[] } | 获取角色列表 |
| role:get | GET | id: string | { success, role: Role } | 获取单个角色 |
| role:create | CREATE | role: Partial<Role> | { success, role: Role } | 创建角色 |
| role:update | UPDATE | id: string, role: Partial<Role> | { success } | 更新角色 |
| role:delete | DELETE | id: string | { success } | 删除角色 |

### 5.4 模型管理

| 通道 | 方法 | 参数 | 返回值 | 描述 |
|-----|------|-----|-------|------|
| provider:list | GET | - | { success, providers: Provider[] } | 获取提供商列表 |
| provider:get-models | GET | provider: string | { success, models: Model[] } | 获取模型列表 |
| provider:test | TEST | provider: string | { success, message } | 测试提供商连接 |

## 6. 文件结构

```
src/
├── main/
│   ├── database/
│   │   └── repositories/
│   │       ├── dialog.repository.ts      # 对话数据访问
│   │       ├── message.repository.ts     # 消息数据访问
│   │       └── role.repository.ts        # 角色数据访问
│   ├── ipc/
│   │   └── handlers/
│   │       ├── dialog.handler.ts         # 对话IPC处理
│   │       ├── message.handler.ts        # 消息IPC处理
│   │       └── role.handler.ts           # 角色IPC处理
│   ├── services/
│   │   └── dialog.service.ts             # 对话业务服务
│   └── providers/
│       ├── base-provider.ts              # 提供商基类
│       ├── qwen-provider.ts              # 通义千问
│       ├── doubao-provider.ts            # 豆包
│       ├── glm-provider.ts               # GLM
│       └── deepseek-provider.ts          # DeepSeek
├── renderer/
│   └── src/
│       ├── views/
│       │   ├── DialogView.vue            # 对话主页面
│       │   └── RoleManageView.vue        # 角色管理页面
│       ├── stores/
│       │   ├── dialog.ts                 # 对话状态管理
│       │   └── role.ts                   # 角色状态管理
│       └── components/
│           └── dialog/
│               ├── DialogList.vue        # 对话列表组件
│               ├── MessageList.vue       # 消息列表组件
│               ├── MessageInput.vue      # 消息输入组件
│               ├── ModelSelector.vue     # 模型选择器
│               ├── RoleSelector.vue      # 角色选择器
│               ├── RoleCard.vue          # 角色卡片
│               └── RoleDialog.vue        # 角色编辑对话框
└── shared/
    └── types/
        ├── dialog.types.ts               # 对话类型
        ├── message.types.ts              # 消息类型
        ├── role.types.ts                 # 角色类型
        └── provider.types.ts             # 提供商类型
```

## 7. 核心流程

### 7.1 发送消息流程（流式）

```
用户输入消息
    │
    ▼
前端验证（非空）
    │
    ▼
创建用户消息，显示在界面
    │
    ▼
调用 dialog:send IPC（带EventChannel）
    │
    ▼
主进程接收请求
    │
    ▼
获取对话信息和历史消息
    │
    ├── 构建上下文（系统提示词 + 历史消息 + 用户消息）
    │
    ▼
调用对应Provider的API
    │
    ▼
流式返回内容
    │   ┌─────────────────────────────┐
    ├──▶│ EventChannel 发送内容片段  │
    │   └─────────────────────────────┘
    │
    ▼
前端接收并实时显示
    │
    ▼
流式完成
    │
    ├── 保存AI消息到数据库
    │
    ├── 更新对话的updated_at
    │
    ▼
前端标记消息完成
```

### 7.2 创建对话流程

```
用户点击"新建对话"
    │
    ▼
显示新建对话对话框
    │
    ▼
用户选择模型和角色（可选）
    │
    ▼
调用 dialog:create IPC
    │
    ▼
主进程创建对话记录
    │
    ├── 如果有角色，获取角色的系统提示词
    │
    ├── 生成对话ID
    │
    ├── 保存到数据库
    │
    ▼
返回对话信息
    │
    ▼
前端跳转到新对话
```

### 7.3 模型调用流程

```
构建请求
    │
    ├── 系统提示词（如果有）
    │
    ├── 历史消息（根据上下文限制截取）
    │
    ├── 当前用户消息
    │
    ▼
根据modelId获取Provider
    │
    ▼
检查API密钥是否配置
    │
    ├── 未配置 → 返回错误
    │
    ▼
调用Provider的chat方法
    │
    ▼
Provider构建API请求
    │
    ▼
发送到AI平台API
    │
    ▼
接收流式响应
    │
    ▼
解析并转发给前端
```

## 8. 错误处理

| 错误场景 | 错误码 | 错误信息 | 处理方式 |
|---------|-------|---------|---------|
| 消息为空 | E101 | 请输入消息内容 | 前端提示 |
| 对话不存在 | E102 | 对话不存在 | 返回列表页 |
| API密钥未配置 | E103 | 请先配置{provider}的API密钥 | 弹窗提示 |
| API调用失败 | E104 | AI服务调用失败：{原因} | 显示在消息中 |
| Token超限 | E105 | 对话内容过长，请开启新对话 | 弹窗提示 |
| 网络错误 | E106 | 网络连接失败 | 弹窗提示 |

## 9. 性能优化

### 9.1 消息加载
- 分页加载历史消息（每页20条）
- 滚动到顶部时加载更多
- 虚拟滚动处理大量消息

### 9.2 上下文管理
- 限制历史消息数量（默认10条）
- 超出时自动截取最近的对话
- 支持用户手动清除上下文

### 9.3 流式输出
- 使用EventChannel实现实时通信
- 打字机效果显示AI回复
- 支持中断生成

## 10. 测试要点

### 10.1 功能测试
- [ ] 创建对话
- [ ] 发送消息并接收回复
- [ ] 流式输出显示
- [ ] 模型切换
- [ ] 角色选择
- [ ] 角色CRUD操作
- [ ] 对话删除
- [ ] 历史消息加载

### 10.2 边界测试
- [ ] 空消息处理
- [ ] 超长消息处理
- [ ] 大量历史消息
- [ ] 网络断开重连
- [ ] API限流处理

### 10.3 性能测试
- [ ] 100+条消息的对话加载速度
- [ ] 流式输出延迟
- [ ] 内存占用
