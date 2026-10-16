# 数据实体设计

## 1. 概述

本文档描述 The Bot 应用中存储的数据实体及其关系，包括字段说明、约束条件和业务规则。

## 2. 实体关系图

```
┌─────────────────┐     ┌─────────────────┐
│  ProviderConfig │     │      Role       │
├─────────────────┤     ├─────────────────┤
│ id              │     │ id              │
│ name            │     │ name            │
│ templateId      │     │ systemPrompt    │
│ isEnabled       │     │ defaultModelId  │◄──────┐
│ isDefault       │     │ ...             │       │
│ models[]        │     └─────────────────┘       │
│ ...             │               │               │
└─────────────────┘               │               │
        │                         │               │
        │                         ▼               │
        │               ┌─────────────────┐       │
        │               │     Dialog      │       │
        │               ├─────────────────┤       │
        ├──────────────►│ id              │       │
        │               │ title           │       │
        │               │ modelId         │       │
        │               │ providerConfigId│       │
        │               │ roleId          │───────┘
        │               │ systemPrompt    │
        │               │ contextConfig   │
        │               │ messageCount    │
        │               └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │    Message      │
        │               ├─────────────────┤
        │               │ id              │
        │               │ dialogId        │
        │               │ role            │
        │               │ content         │
        │               │ modelId         │
        │               │ tokensUsed      │
        │               │ attachments[]   │
        │               │ metadata        │
        │               └─────────────────┘
        │
        ▼
┌─────────────────┐
│    ImageTask    │
├─────────────────┤
│ id              │
│ prompt          │
│ providerConfigId│
│ model           │
│ size            │
│ status          │
│ imageUrl        │
│ localPath       │
│ ...             │
└─────────────────┘
```

## 3. 实体定义

### 3.1 提供商配置 (ProviderConfig)

**用途**：存储 AI 服务提供商的配置信息

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | UUID，唯一标识 |
| name | string | 是 | 配置名称，如 "OpenAI"、"DeepSeek" |
| shortId | string | 否 | 短 ID，用于显示 |
| templateId | string | 否 | 关联的模板 ID，如 "openai"、"deepseek" |
| isEnabled | boolean | 是 | 是否启用，默认 true |
| isDefault | boolean | 是 | 是否为默认提供商，默认 false |
| baseUrl | string | 否 | API 基础 URL |
| customHeaders | object | 否 | 自定义请求头，键值对 |
| models | array | 是 | 启用的模型列表 |
| createdAt | datetime | 是 | 创建时间 |
| updatedAt | datetime | 是 | 更新时间 |

**模型对象 (ModelDefinition)**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 模型 ID，如 "gpt-4o" |
| name | string | 是 | 显示名称 |
| type | string | 否 | 模型类型：text/multimodal/image/video/audio/embedding/rerank |
| contextWindow | number | 否 | 上下文窗口大小（Token） |
| maxOutputTokens | number | 否 | 最大输出 Token |
| supportsThinking | boolean | 否 | 是否支持深度思考 |
| supportsWebSearch | boolean | 否 | 是否支持联网搜索 |
| supportsTools | boolean | 否 | 是否支持工具调用 |

**业务规则**：
- 只能有一个默认提供商
- 禁用的提供商不在对话界面显示
- 删除提供商时，关联对话的 providerConfigId 置空

---

### 3.2 角色 (Role)

**用途**：存储 AI 助手角色配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | UUID 或内置 ID |
| name | string | 是 | 角色名称 |
| description | string | 否 | 角色描述 |
| avatar | string | 否 | 头像（emoji 或图片 URL） |
| systemPrompt | string | 否 | 系统提示词 |
| defaultModelId | string | 否 | 默认模型 ID |
| defaultProviderConfigId | string | 否 | 默认提供商配置 ID |
| generationConfig | object | 否 | 生成参数配置 |
| isBuiltin | boolean | 是 | 是否内置角色 |
| createdAt | datetime | 是 | 创建时间 |
| updatedAt | datetime | 是 | 更新时间 |

**生成配置 (GenerationConfig)**：

| 字段 | 类型 | 说明 |
|------|------|------|
| temperature | number | 温度参数（0-2） |
| topP | number | Top P 参数（0-1） |
| maxTokens | number | 最大输出 Token |
| presencePenalty | number | 存在惩罚（-2 到 2） |
| frequencyPenalty | number | 频率惩罚（-2 到 2） |
| stop | array | 停止词列表 |

**业务规则**：
- 内置角色（isBuiltin=true）不能编辑和删除
- 删除角色时，关联对话的 roleId 置空

---

### 3.3 对话 (Dialog)

**用途**：存储对话记录

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | UUID |
| title | string | 是 | 对话标题 |
| modelId | string | 否 | 当前使用的模型 ID |
| providerConfigId | string | 否 | 当前提供商配置 ID |
| roleId | string | 否 | 关联的角色 ID |
| systemPrompt | string | 否 | 系统提示词 |
| contextConfig | object | 否 | 上下文配置 |
| messageCount | number | 是 | 消息数量，默认 0 |
| createdAt | datetime | 是 | 创建时间 |
| updatedAt | datetime | 是 | 更新时间 |

**上下文配置 (ContextConfig)**：

| 字段 | 类型 | 说明 |
|------|------|------|
| maxTokens | number | 最大上下文 Token |
| truncationStrategy | string | 截断策略：oldest/summary |
| includeSystemPrompt | boolean | 是否包含系统提示词 |

**业务规则**：
- 删除对话时，级联删除所有消息
- 发送消息后，自动更新 messageCount 和 updatedAt
- 新对话默认标题为"新对话"

---

### 3.4 消息 (Message)

**用途**：存储对话中的单条消息

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | UUID |
| dialogId | string | 是 | 所属对话 ID |
| role | string | 是 | 角色：user/assistant |
| content | string | 是 | 消息内容 |
| modelId | string | 否 | 使用的模型（AI 消息） |
| tokensUsed | number | 否 | Token 用量 |
| attachments | array | 否 | 附件列表 |
| metadata | object | 否 | 元数据 |
| createdAt | datetime | 是 | 创建时间 |

**附件对象 (Attachment)**：

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 类型：image/document |
| url | string | 文件路径或 URL |
| name | string | 文件名 |
| mimeType | string | MIME 类型 |
| size | number | 文件大小（字节） |

**元数据 (Metadata)**：

| 字段 | 类型 | 说明 |
|------|------|------|
| thinkingChain | string | 思维链内容 |
| webSearchResults | array | 联网搜索结果 |
| edited | boolean | 是否已编辑 |
| editedAt | datetime | 编辑时间 |

**业务规则**：
- 删除用户消息时，对应的 AI 回复也删除
- 消息按 createdAt 排序
- 编辑消息后，标记 edited=true

---

### 3.5 图像任务 (ImageTask)

**用途**：存储图像生成任务记录

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | UUID |
| prompt | string | 是 | 正向提示词 |
| negativePrompt | string | 否 | 负面提示词 |
| providerConfigId | string | 是 | 提供商配置 ID |
| model | string | 是 | 模型 ID |
| size | string | 否 | 尺寸，如 "1024x1024" |
| style | string | 否 | 风格 |
| quality | string | 否 | 质量 |
| seed | number | 否 | 种子值 |
| n | number | 否 | 生成数量，默认 1 |
| status | string | 是 | 状态：pending/processing/completed/failed |
| progress | number | 否 | 进度（0-100） |
| error | string | 否 | 错误信息 |
| imageUrl | string | 否 | 生成的图像 URL |
| localPath | string | 否 | 本地保存路径 |
| createdAt | datetime | 是 | 创建时间 |
| completedAt | datetime | 否 | 完成时间 |

**业务规则**：
- 任务创建时 status=pending
- 生成完成后 status=completed，记录 completedAt
- 生成失败时 status=failed，记录 error
- 删除任务时，同时删除本地图像文件

---

### 3.6 应用设置 (Settings)

**用途**：存储应用全局设置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key | string | 是 | 设置键（主键） |
| value | any | 否 | 设置值 |
| updatedAt | datetime | 是 | 更新时间 |

**常用设置项**：

| Key | 类型 | 说明 |
|-----|------|------|
| theme | string | 主题：light/dark/auto |
| language | string | 语言：zh-CN/en-US |
| defaultProviderConfigId | string | 默认提供商 ID |
| defaultModelId | string | 默认模型 ID |
| sendOnEnter | boolean | Enter 发送消息 |

---

## 4. 数据关系

### 4.1 关系说明

| 关系 | 类型 | 说明 |
|------|------|------|
| ProviderConfig → Dialog | 一对多 | 一个提供商可被多个对话使用 |
| Role → Dialog | 一对多 | 一个角色可关联多个对话 |
| Dialog → Message | 一对多 | 一个对话包含多条消息 |
| ProviderConfig → ImageTask | 一对多 | 一个提供商可生成多个图像 |

### 4.2 级联删除规则

| 删除操作 | 级联影响 |
|----------|----------|
| 删除 ProviderConfig | Dialog.providerConfigId → null |
| 删除 Role | Dialog.roleId → null |
| 删除 Dialog | 删除所有关联 Message |
| 删除 ImageTask | 删除本地图像文件 |

---

## 5. 数据存储位置

| 数据类型 | 存储位置 |
|----------|----------|
| 结构化数据 | `{userData}/the_bot.db` (SQLite) |
| 图像文件 | `{userData}/images/` |
| 附件文件 | `{userData}/attachments/` |
| 日志文件 | `{userData}/logs/` |

**路径说明**：
- Windows: `%APPDATA%/the_bot/`
- macOS: `~/Library/Application Support/the_bot/`
- Linux: `~/.config/the_bot/`

---

## 6. 数据安全

### 6.1 敏感数据

以下数据需要加密存储：
- API 密钥
- Access Key Secret
- 自定义请求头中的敏感信息

### 6.2 数据备份

用户可导出的数据：
- 对话记录（JSON 格式）
- 提供商配置（不含 API 密钥）
- 角色配置

### 6.3 数据清理

用户可清理的数据：
- 所有对话记录
- 所有图像生成记录
- 应用缓存
