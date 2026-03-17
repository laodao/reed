# STORY-007: 通义千问 Provider

**Epic:** EPIC-001 AI对话核心系统
**优先级:** Must Have
**点数:** 5
**依赖:** STORY-006 (待实现)

## 用户故事

> 作为用户，我想要使用通义千问进行对话，以便获得AI回答

## 验收标准

- [ ] QwenProvider实现
- [ ] 流式响应支持（SSE）
- [ ] 连接测试功能
- [ ] 错误处理和重试
- [ ] 集成到ProviderManager

---

## 任务清单

### 任务 7.1: 研究 API 文档
**描述:** 研究通义千问 API 的接口规范
**预计时间:** 30分钟

**研究内容:**
- API 端点: `https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
- 认证方式: Bearer Token
- 请求格式: JSON
- 响应格式: JSON / SSE (流式)
- 错误码定义

**输出文档:**
- API 请求示例
- 响应格式说明
- 错误处理指南

**完成标准:**
- [ ] API 端点确认
- [ ] 请求/响应格式明确
- [ ] 流式响应格式明确
- [ ] 错误码列表

---

### 任务 7.2: 创建 QwenProvider 类
**描述:** 实现通义千问 Provider 基础结构
**文件:** `src/main/providers/implementations/qwen.provider.ts`
**预计时间:** 30分钟

**基础结构:**
```typescript
class QwenProvider extends BaseProvider {
  readonly name = 'qwen' as const
  readonly displayName = '通义千问'

  private readonly baseUrl = 'https://dashscope.aliyuncs.com/api/v1'

  constructor(config: ProviderConfig) {
    super(config)
    this.models = [
      { id: 'qwen-turbo', name: '通义千问-Turbo', type: 'chat', maxTokens: 8192, supportStream: true },
      { id: 'qwen-plus', name: '通义千问-Plus', type: 'chat', maxTokens: 32768, supportStream: true },
      { id: 'qwen-max', name: '通义千问-Max', type: 'chat', maxTokens: 32768, supportStream: true }
    ]
  }

  async getModels(): Promise<ModelInfo[]> {
    return this.models
  }

  // ... 其他方法
}
```

**完成标准:**
- [ ] 类结构创建
- [ ] 模型列表定义
- [ ] 继承 BaseProvider

---

### 任务 7.3: 实现非流式聊天
**描述:** 实现普通的聊天请求（非流式）
**文件:** `src/main/providers/implementations/qwen.provider.ts`
**预计时间:** 1小时

**实现要点:**
```typescript
async chat(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${this.baseUrl}/services/aigc/text-generation/generation`, {
    method: 'POST',
    headers: this.buildHeaders(),
    body: JSON.stringify({
      model: request.model,
      input: {
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      },
      parameters: {
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        result_format: 'message'
      }
    })
  })

  if (!response.ok) {
    throw this.handleError(response)
  }

  const data = await response.json()
  return this.parseResponse(data)
}
```

**完成标准:**
- [ ] 正确发送请求
- [ ] 正确解析响应
- [ ] 错误处理
- [ ] 返回 ChatResponse

---

### 任务 7.4: 实现流式聊天
**描述:** 实现 SSE 流式响应处理
**文件:** `src/main/providers/implementations/qwen.provider.ts`
**预计时间:** 1.5小时

**实现要点:**
```typescript
async chatStream(
  request: ChatRequest,
  onChunk: (chunk: StreamChunk) => void
): Promise<ChatResponse> {
  const response = await fetch(`${this.baseUrl}/services/aigc/text-generation/generation`, {
    method: 'POST',
    headers: {
      ...this.buildHeaders(),
      'Accept': 'text/event-stream',
      'X-DashScope-SSE': 'enable'
    },
    body: JSON.stringify({
      model: request.model,
      input: {
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      },
      parameters: {
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        result_format: 'message',
        incremental_output: true
      }
    })
  })

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  let fullContent = ''
  let id = ''

  while (reader) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = JSON.parse(line.slice(5))
        const content = data.output?.choices?.[0]?.message?.content || ''

        if (content) {
          fullContent += content
          id = data.request_id || id

          onChunk({
            id,
            content,
            done: false
          })
        }
      }
    }
  }

  onChunk({ id, content: '', done: true })

  return {
    id,
    content: fullContent,
    model: request.model
  }
}
```

**完成标准:**
- [ ] SSE 连接建立
- [ ] 实时接收数据块
- [ ] 正确解析增量内容
- [ ] 回调函数正确调用
- [ ] 完成时发送 done 信号

---

### 任务 7.5: 实现连接测试
**描述:** 实现测试 API 密钥是否有效的功能
**文件:** `src/main/providers/implementations/qwen.provider.ts`
**预计时间:** 30分钟

**实现要点:**
```typescript
async testConnection(): Promise<boolean> {
  try {
    const response = await this.chat({
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'qwen-turbo',
      maxTokens: 10
    })
    return !!response.content
  } catch (error) {
    return false
  }
}
```

**完成标准:**
- [ ] 发送测试请求
- [ ] 正确判断结果
- [ ] 返回布尔值

---

### 任务 7.6: 实现错误处理
**描述:** 实现统一的错误处理和重试机制
**文件:** `src/main/providers/implementations/qwen.provider.ts`
**预计时间:** 45分钟

**错误类型:**
- 认证错误 (401)
- 速率限制 (429)
- 服务器错误 (5xx)
- 网络错误
- 超时错误

**实现要点:**
```typescript
protected handleError(error: unknown): ProviderError {
  if (error instanceof Response) {
    switch (error.status) {
      case 401:
        return new ProviderError('API密钥无效', 'AUTH_ERROR')
      case 429:
        return new ProviderError('请求过于频繁，请稍后重试', 'RATE_LIMIT')
      case 500:
      case 502:
      case 503:
        return new ProviderError('服务器错误，请稍后重试', 'SERVER_ERROR')
      default:
        return new ProviderError(`请求失败: ${error.statusText}`, 'REQUEST_ERROR')
    }
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new ProviderError('请求超时', 'TIMEOUT')
    }
    return new ProviderError(error.message, 'UNKNOWN')
  }

  return new ProviderError('未知错误', 'UNKNOWN')
}
```

**完成标准:**
- [ ] 错误类型定义
- [ ] 错误码映射
- [ ] 友好错误消息

---

### 任务 7.7: 注册到 ProviderManager
**描述:** 将 QwenProvider 注册到 ProviderManager
**文件:** `src/main/providers/index.ts`
**预计时间:** 15分钟

**实现要点:**
```typescript
// 导出所有 provider
export { QwenProvider } from './implementations/qwen.provider'

// 自动注册函数
export function registerQwenProvider(manager: ProviderManager, config: ProviderConfig) {
  const provider = new QwenProvider(config)
  manager.register('qwen', provider)
}
```

**完成标准:**
- [ ] 导出 QwenProvider
- [ ] 注册函数实现
- [ ] 在主进程中调用注册

---

### 任务 7.8: 创建 Provider IPC Handler 更新
**描述:** 更新 Provider handler 以支持通义千问测试
**文件:** `src/main/ipc/handlers/provider.handler.ts`
**预计时间:** 30分钟

**更新内容:**
- 实现具体的连接测试逻辑
- 使用 ProviderManager 测试

**完成标准:**
- [ ] 测试连接功能可用
- [ ] 返回正确结果

---

### 任务 7.9: 编写单元测试
**描述:** 为 QwenProvider 编写单元测试
**文件:** `src/main/providers/__tests__/qwen.provider.test.ts`
**预计时间:** 45分钟

**测试用例:**
- [ ] 初始化正确
- [ ] getModels() 返回正确
- [ ] chat() 请求格式正确
- [ ] chatStream() 流式处理正确
- [ ] 错误处理正确
- [ ] testConnection() 工作正常

**注意:** 需要 mock fetch API

---

### 任务 7.10: 集成测试与验证
**描述:** 使用真实 API 密钥测试
**预计时间:** 30分钟

**验证步骤:**
- [ ] 应用启动无错误
- [ ] QwenProvider 注册成功
- [ ] 获取模型列表成功
- [ ] 非流式聊天成功
- [ ] 流式聊天成功（观察增量输出）
- [ ] 错误处理正常
- [ ] 连接测试正常

**注意:** 需要有效的通义千问 API 密钥

---

## 技术说明

### 通义千问 API 端点

| 功能 | 端点 | 方法 |
|------|------|------|
| 文本生成 | /services/aigc/text-generation/generation | POST |
| 模型列表 | 内置定义 | - |

### 支持的模型

| 模型 ID | 名称 | 上下文长度 | 说明 |
|---------|------|------------|------|
| qwen-turbo | 通义千问-Turbo | 8K | 快速响应 |
| qwen-plus | 通义千问-Plus | 32K | 平衡性能 |
| qwen-max | 通义千问-Max | 32K | 最强能力 |

### 请求示例

```json
{
  "model": "qwen-turbo",
  "input": {
    "messages": [
      { "role": "system", "content": "你是一个有用的AI助手" },
      { "role": "user", "content": "你好" }
    ]
  },
  "parameters": {
    "temperature": 0.7,
    "max_tokens": 2000,
    "result_format": "message",
    "incremental_output": true
  }
}
```

### 响应示例（非流式）

```json
{
  "request_id": "xxx",
  "output": {
    "choices": [
      {
        "finish_reason": "stop",
        "message": {
          "role": "assistant",
          "content": "你好！有什么我可以帮助你的吗？"
        }
      }
    ]
  },
  "usage": {
    "input_tokens": 10,
    "output_tokens": 15,
    "total_tokens": 25
  }
}
```

---

## 依赖

- Provider 抽象层 (STORY-006)
- API 密钥存储 (STORY-004)
- IPC 通信 (STORY-003 ✓)
