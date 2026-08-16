/**
 * OpenAISdkProvider 集成单测
 * @module tests/unit/core/providers/openai-sdk-provider
 *
 * 锁死「读落库能力字段 + reasoning_content 字段存在即解析」两条核心路径，
 * 回归 AI 对话空响应 bug（deepseek-v4-pro 等 reasoning_content 被丢弃）。
 *
 * 通过 vi.mock('openai') 替换 SDK，让 chat.completions.create 返回可控的伪流。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ===== mock openai SDK =====
// 构造一个 async iterable 作为 stream 返回值
function makeStream(chunks: any[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c
    }
  }
}

const createMock = vi.fn()
vi.mock('openai', () => {
  return {
    default: class {
      apiKey: string
      baseURL: string
      constructor(opts: any) {
        this.apiKey = opts.apiKey
        this.baseURL = opts.baseURL
      }
      chat = {
        completions: {
          create: createMock
        }
      }
      models = { list: vi.fn().mockResolvedValue({ data: [] }) }
    }
  }
})

// import 必须在 vi.mock 之后
import { OpenAISdkProvider } from '@core/providers/sdk/openai-sdk-provider'
import type { ProviderTemplate, UserProviderConfig, ModelDefinition } from '@shared/types'

function makeProvider(opts: {
  modelId?: string
  userModels?: ModelDefinition[]
} = {}) {
  const template: Partial<ProviderTemplate> = {
    id: 'deepseek',
    name: 'DeepSeek',
    supportedParams: { stream: true, temperature: true, maxTokens: true, topP: false, custom: [] }
  }
  const userConfig: Partial<UserProviderConfig> = {
    id: 'pc_test',
    name: 'test',
    templateId: 'deepseek',
    apiKey: 'sk-test',
    baseUrl: 'https://api.deepseek.com/v1',
    isEnabled: true,
    models: opts.userModels
  }
  const provider = new OpenAISdkProvider(
    { apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1', defaultModel: opts.modelId ?? 'm' },
    'deepseek',
    'DeepSeek',
    'https://api.deepseek.com/v1',
    template as ProviderTemplate,
    userConfig as UserProviderConfig
  )
  return provider
}

describe('OpenAISdkProvider - 视觉能力（读落库 type 字段）', () => {
  beforeEach(() => createMock.mockReset())

  it('type=multimodal + 带图消息 → 请求体含 image_url（主路径）', async () => {
    const provider = makeProvider({
      modelId: 'm1',
      userModels: [{
        id: 'm1', name: 'm1', type: 'multimodal',
        contextWindow: 8192, maxOutputTokens: 4096, features: ['chat', 'streaming']
      }]
    })
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }
    ]))

    const events: any[] = []
    await provider.chatStream(
      {
        systemPrompt: '',
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: '看图' }, { type: 'image', image_url: { url: 'data:image/png;base64,xxx' } }] as any
        }]
      } as any,
      (e: any) => events.push(e)
    )

    const callArgs = createMock.mock.calls[0][0]
    const userMsg = callArgs.messages.find((m: any) => m.role === 'user')
    expect(Array.isArray(userMsg.content)).toBe(true)
    expect(userMsg.content.some((b: any) => b.type === 'image_url')).toBe(true)
  })

  it('type=text + 带图消息 → 图片转占位符文本', async () => {
    const provider = makeProvider({
      modelId: 'm1',
      userModels: [{
        id: 'm1', name: 'm1', type: 'text',
        contextWindow: 8192, maxOutputTokens: 4096, features: ['chat', 'streaming']
      }]
    })
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }
    ]))

    await provider.chatStream(
      {
        systemPrompt: '',
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: '看图' }, { type: 'image', image_url: { url: 'data:x' } }] as any
        }]
      } as any,
      () => {}
    )

    const userMsg = createMock.mock.calls[0][0].messages.find((m: any) => m.role === 'user')
    // 不支持视觉时图片被转成占位符文本块（content 为数组，含占位符文本，不含 image_url）
    const contentStr = Array.isArray(userMsg.content)
      ? userMsg.content.map((b: any) => b.text || '').join('')
      : String(userMsg.content)
    expect(contentStr).toContain('不支持图片识别')
    const hasImageUrl = Array.isArray(userMsg.content)
      ? userMsg.content.some((b: any) => b.type === 'image_url')
      : false
    expect(hasImageUrl).toBe(false)
  })

  it('userConfig.models 为空 + modelId=gpt-4o → 字符串兜底仍发图（向后兼容）', async () => {
    const provider = makeProvider({ modelId: 'gpt-4o', userModels: [] })
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }
    ]))

    await provider.chatStream(
      {
        systemPrompt: '',
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: '看图' }, { type: 'image', image_url: { url: 'data:x' } }] as any
        }]
      } as any,
      () => {}
    )

    const userMsg = createMock.mock.calls[0][0].messages.find((m: any) => m.role === 'user')
    expect(userMsg.content.some((b: any) => b.type === 'image_url')).toBe(true)
  })
})

describe('OpenAISdkProvider - 思维链解析（字段存在即解析，防空响应）', () => {
  beforeEach(() => createMock.mockReset())

  it('supportsThinking=false 但 API 返回 reasoning_content → 仍发 thinking 事件（最强兜底）', async () => {
    // 关键回归：这正是 deepseek-v4-pro 空响应 bug 的场景——能力字段未标思考，但 API 实际返回了 reasoning_content
    const provider = makeProvider({
      modelId: 'm1',
      userModels: [{
        id: 'm1', name: 'm1', type: 'text', supportsThinking: false,
        contextWindow: 8192, maxOutputTokens: 4096, features: ['chat', 'streaming']
      }]
    })
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: { reasoning_content: '我在思考' } }] },
      { choices: [{ delta: { content: '答案是' }, finish_reason: 'stop' }] }
    ]))

    const events: any[] = []
    await provider.chatStream(
      { systemPrompt: '', messages: [{ role: 'user', content: '1+1' }] } as any,
      (e: any) => events.push(e)
    )

    expect(events.some(e => e.type === 'thinking' && e.thinkingContent === '我在思考')).toBe(true)
    expect(events.some(e => e.type === 'delta' && e.content === '答案是')).toBe(true)
  })

  it('正常 content 流 → 收到 delta 事件', async () => {
    const provider = makeProvider({ modelId: 'm1', userModels: [{
      id: 'm1', name: 'm1', type: 'text', contextWindow: 8192, maxOutputTokens: 4096, features: ['chat', 'streaming']
    }] })
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: { content: '你好' } }] },
      { choices: [{ delta: { content: '世界' }, finish_reason: 'stop' }] }
    ]))

    const events: any[] = []
    await provider.chatStream(
      { systemPrompt: '', messages: [{ role: 'user', content: 'hi' }] } as any,
      (e: any) => events.push(e)
    )

    const deltas = events.filter(e => e.type === 'delta').map(e => e.content).join('')
    expect(deltas).toBe('你好世界')
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('流结束 content=0 且 thinking=0 → 抛空响应错误（带模型名）', async () => {
    const provider = makeProvider({ modelId: 'm1', userModels: [{
      id: 'm1', name: 'm1', type: 'text', contextWindow: 8192, maxOutputTokens: 4096, features: ['chat', 'streaming']
    }] })
    // 返回若干 chunk 但全是空 content / 空 reasoning
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: {}, finish_reason: 'stop' }] }
    ]))

    await expect(
      provider.chatStream(
        { systemPrompt: '', messages: [{ role: 'user', content: 'hi' }] } as any,
        () => {}
      )
    ).rejects.toThrow(/内容为空|未返回任何数据|模型/)
  })
})

describe('OpenAISdkProvider - max_tokens / temperature 动态取值（消除硬编码）', () => {
  beforeEach(() => createMock.mockReset())

  it('max_tokens 优先用 options.maxTokens', async () => {
    const provider = makeProvider({ modelId: 'm1', userModels: [{
      id: 'm1', name: 'm1', type: 'text', maxOutputTokens: 4096, contextWindow: 8192, features: ['chat', 'streaming']
    }] })
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }
    ]))

    await provider.chatStream(
      { systemPrompt: '', messages: [{ role: 'user', content: 'hi' }] } as any,
      () => {},
      undefined,
      { maxTokens: 12000 }
    )

    expect(createMock.mock.calls[0][0].max_tokens).toBe(12000)
  })

  it('max_tokens 无 options 时用模型定义 maxOutputTokens（不再写死 4096）', async () => {
    const provider = makeProvider({ modelId: 'm1', userModels: [{
      id: 'm1', name: 'm1', type: 'text', maxOutputTokens: 16000, contextWindow: 8192, features: ['chat', 'streaming']
    }] })
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }
    ]))

    await provider.chatStream(
      { systemPrompt: '', messages: [{ role: 'user', content: 'hi' }] } as any,
      () => {}
    )

    expect(createMock.mock.calls[0][0].max_tokens).toBe(16000)
  })

  it('temperature 从 options 读取（来源 role.temperature）', async () => {
    const provider = makeProvider({ modelId: 'm1', userModels: [{
      id: 'm1', name: 'm1', type: 'text', contextWindow: 8192, maxOutputTokens: 4096, features: ['chat', 'streaming']
    }] })
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }
    ]))

    await provider.chatStream(
      { systemPrompt: '', messages: [{ role: 'user', content: 'hi' }] } as any,
      () => {},
      undefined,
      { temperature: 0.3 }
    )

    expect(createMock.mock.calls[0][0].temperature).toBe(0.3)
  })

  it('无 options.temperature 时默认 0.7', async () => {
    const provider = makeProvider({ modelId: 'm1', userModels: [{
      id: 'm1', name: 'm1', type: 'text', contextWindow: 8192, maxOutputTokens: 4096, features: ['chat', 'streaming']
    }] })
    createMock.mockResolvedValue(makeStream([
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }
    ]))

    await provider.chatStream(
      { systemPrompt: '', messages: [{ role: 'user', content: 'hi' }] } as any,
      () => {}
    )

    expect(createMock.mock.calls[0][0].temperature).toBe(0.7)
  })
})
