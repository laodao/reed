# 聊天模块设计文档

## 概述

聊天模块负责 AI 对话功能，包括模型选择、消息发送、流式响应处理等核心功能。

## 数据流图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端 (渲染进程)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ChatHeader.vue          Chat.vue             useChat.ts      dialog.ts     │
│  ┌─────────────┐        ┌─────────┐          ┌────────┐      ┌─────────┐   │
│  │ 模型选择器   │───────>│handleUp │─────────>│update  │─────>│update   │   │
│  │ handleModel │ emit    │dateConfig│  调用    │Dialog  │ IPC  │Dialog   │   │
│  │ Change()    │        │()       │          │Config()│      │()       │   │
│  └─────────────┘        └─────────┘          └────────┘      └────┬────┘   │
│                                                              IPC│         │
│  ┌─────────────┐                                            ↓  │         │
│  │ selectedMod │<───────────────────────────────────────────┘  │         │
│  │ elKey       │    watch(props.dialog) 更新选中状态              │         │
│  └─────────────┘                                                   │         │
│                                                                    │         │
│  sendMessage() ───────────────────────────────────────────────────>│         │
│  (content, options)                                                │         │
│                                                                    ↓         │
└─────────────────────────────────────────────────────────────────────────────┘
                                              IPC
                                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                              后端 (主进程)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  chat.service.ts                           providers/index.ts               │
│  ┌──────────────────────────────┐          ┌──────────────────────┐        │
│  │ sendMessage()                │          │ createProvider()      │        │
│  │  1. 获取 dialog               │          │                       │        │
│  │  2. 获取 providerConfig       │─────────>│ 根据 templateId       │        │
│  │  3. 获取 template             │          │ 创建对应的 Provider   │        │
│  │  4. createProvider()          │          │ 实例                 │        │
│  │ 5. provider.chatStream()      │<─────────│                       │        │
│  │ 6. 处理流式事件               │          └──────────────────────┘        │
│  └──────────────────────────────┘                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. 前端组件

#### ChatHeader.vue
- **职责**: 显示对话标题和模型选择器
- **状态**:
  - `selectedModelKey`: 当前选中的模型键（格式：`providerConfigId:modelId`）
  - `providerConfigs`: 提供商配置列表
  - `providerTemplates`: 提供商模板列表
- **关键方法**:
  - `handleModelChange(modelKey)`: 处理模型变更，发送 `updateConfig` 事件
  - `watch(props.dialog)`: 监听 dialog 变化，更新选中状态

#### Chat.vue
- **职责**: 聊天页面容器，协调子组件
- **关键方法**:
  - `handleUpdateConfig(dialogId, config)`: 接收配置更新事件，调用 `updateDialogConfig`

#### useChat.ts
- **职责**: 聊天功能的 composable，封装业务逻辑
- **关键方法**:
  - `updateDialogConfig(dialogId, config)`: 更新对话配置
  - `sendMessage(content, options)`: 发送消息

#### dialog.ts (Pinia Store)
- **职责**: 对话状态管理
- **关键状态**:
  - `currentDialog`: 当前对话
  - `messages`: 消息列表
  - `streamState`: 流式状态
- **关键方法**:
  - `updateDialog(id, data)`: 更新对话，发送 IPC 请求
  - `sendMessage(content, options)`: 发送消息，处理流式响应
  - `handleStreamEvent(event, data)`: 处理流式事件

### 2. 后端服务

#### chat.service.ts
- **职责**: 处理 AI 对话的核心服务
- **关键流程**:
  1. 获取对话信息
  2. 获取提供商配置
  3. 解密 API 密钥
  4. 获取模板
  5. 创建 Provider 实例
  6. 处理联网搜索
  7. 流式调用 AI
  8. 更新消息内容和元数据

### 3. Provider 系统

#### BaseProvider (抽象类)
- **职责**: 所有 AI 提供商的基类
- **关键方法**:
  - `chatStream(context, onEvent, signal, options)`: 流式聊天

#### OpenAISdkProvider
- **职责**: OpenAI 及兼容平台的 Provider
- **思维链处理**:
  ```typescript
  const isDeepSeekR1 = model.toLowerCase().includes('deepseek-reasoner') ||
                       model.toLowerCase().includes('deepseek-r1')

  if (isDeepSeekR1) {
    const thinkingContent = (chunk.choices[0]?.delta as any)?.reasoning_content
    if (thinkingContent) {
      onEvent({ type: 'thinking', thinkingContent })
    }
  }
  ```

#### VolcEngineSdkProvider
- **职责**: 火山引擎专用 Provider
- **特点**:
  - 数据面 API（对话）: `https://ark.cn-beijing.volces.com/api/v3`
  - 管控面 API（模型列表）: `https://ark.cn-beijing.volcengineapi.com`
  - 使用推理接入点 ID 作为模型参数

## 数据传递流程

### 模型切换流程

```
用户选择模型
    ↓
ChatHeader.handleModelChange()
    ↓ 解析 "providerConfigId:modelId"
emit('updateConfig', dialogId, { modelId, providerConfigId })
    ↓
Chat.handleUpdateConfig()
    ↓
useChat.updateDialogConfig()
    ↓
dialogStore.updateDialog()
    ↓
window.electronAPI.dialog.update(id, data)
    ↓ IPC
dialog.handler.handleUpdateDialog()
    ↓
dialog.repository.update()
    ↓
数据库更新 provider_config_id 和 model_id
    ↓
前端 watch 检测到变化
    ↓
更新 selectedModelKey
```

### 发送消息流程

```
用户输入消息
    ↓
dialogStore.sendMessage()
    ↓
window.electronAPI.chat.send({ dialogId, content, ... })
    ↓ IPC
chat.service.sendMessage()
    ↓
1. 获取 dialog (包含 modelId 和 providerConfigId)
2. 获取 providerConfig (根据 providerConfigId)
3. 解密 API 密钥
4. 获取 template (根据 templateId)
5. createProvider(templateId, config, template, providerConfig)
6. 处理联网搜索（如果启用）
7. provider.chatStream(context, onEvent, signal, options)
    ↓ 流式响应
onEvent({ type: 'thinking', thinkingContent })  ← 思维链
onEvent({ type: 'delta', content })              ← 内容增量
onEvent({ type: 'done' })                        ← 完成
    ↓
前端 handleStreamEvent() 处理事件
    ↓
更新 messages 和 streamState
    ↓
UI 更新显示
```

## 已识别的问题

### 问题 1: 模型切换可能的问题

**现象**: 用户报告模型切换后不能正确切换提供商

**可能原因**:
1. IPC 请求参数传递问题
2. 数据库更新未生效
3. 前端响应式更新问题

**检查点**:
- [ ] ChatHeader.handleModelChange 是否正确解析 providerConfigId
- [ ] IPC 请求是否正确发送
- [ ] 数据库是否正确更新 provider_config_id
- [ ] chat.service 是否正确使用 dialog.providerConfigId

### 问题 2: 思维链显示问题

**现象**: 用户报告思维链不显示

**可能原因**:
1. DeepSeek API 响应格式变化
2. OpenAISdkProvider 未正确处理 reasoning_content
3. 前端事件处理问题
4. 消息 metadata 未正确保存

**检查点**:
- [ ] DeepSeek R1 模型 ID 匹配逻辑
- [ ] reasoning_content 字段是否正确读取
- [ ] thinking 事件是否正确发送
- [ ] 前端 handleStreamEvent 是否正确处理
- [ ] 消息 metadata 是否正确保存到数据库

## Provider 创建逻辑

```typescript
// providers/index.ts
export function createProvider(templateId, config, template, userConfig) {
  // OpenAI 兼容平台
  if (templateId in OPENAI_COMPATIBLE_CONFIGS) {
    return new OpenAISdkProvider(config, templateId, name, baseUrl, template, userConfig)
  }

  // Anthropic
  if (templateId === 'anthropic') {
    return new AnthropicSdkProvider(config, template, userConfig)
  }

  // Google
  if (templateId === 'google') {
    return new GoogleSdkProvider(config, template, userConfig)
  }

  // 火山引擎
  if (templateId === 'volcengine') {
    return new VolcEngineSdkProvider(config, templateId, '火山引擎', baseUrl, managementUrl, template, userConfig)
  }

  // 其他
  return new OpenAICompatibleProvider(config, templateId, name, baseUrl, template, userConfig)
}
```

## 待确认事项

1. **模型切换**: 需要验证 providerConfigId 是否正确传递到后端
2. **思维链**: 需要验证 DeepSeek API 响应中 reasoning_content 的格式
3. **火山引擎**: 已确认数据面 API 和管控面 API 的 URL 正确

## 下一步行动

1. 添加详细日志跟踪模型切换完整流程
2. 检查 DeepSeek R1 的 API 响应格式
3. 验证前端事件处理逻辑