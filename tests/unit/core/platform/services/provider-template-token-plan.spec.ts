/**
 * 阿里百炼 Token Plan 接入单测
 * @module tests/unit/core/platform/services/provider-template-token-plan
 *
 * 需求：AI 模型配置新增「阿里百炼 Token Plan」（个人版/团队版订阅套餐）支持。
 * 锁死的事实（阿里云官方文档，2026-09-10 核对）：
 * - OpenAI 兼容 Base URL：https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
 * - Anthropic 兼容 Base URL：https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic
 * - API Key 以 sk-sp- 开头，与按量计费（sk-）的 Key/Base URL 完全隔离
 * - 两个端点官方标注「仅文本生成类」模型
 *
 * 本测试也顺带锁死两条链路修复：
 * - createProvider 按模板 category 分发（Anthropic 协议端点不再落回 OpenAI 兼容实现）
 * - AnthropicSdkProvider 的 baseURL 能回退模板默认端点
 */
import { describe, it, expect, vi } from 'vitest'

// ===== mock 两个 SDK：只记录构造参数，绝不发起真实网络请求 =====
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    apiKey: string
    baseURL?: string
    constructor(opts: any) {
      this.apiKey = opts.apiKey
      this.baseURL = opts.baseURL
    }
  }
}))

vi.mock('openai', () => ({
  default: class {
    apiKey: string
    baseURL?: string
    constructor(opts: any) {
      this.apiKey = opts.apiKey
      this.baseURL = opts.baseURL
    }
    models = { list: vi.fn().mockResolvedValue({ data: [] }) }
    chat = { completions: { create: vi.fn() } }
  }
}))

// import 必须在 vi.mock 之后
import {
  PROVIDER_TEMPLATES,
  providerTemplateService
} from '@core/platform/services/provider-template.service'
import { createProvider } from '@core/platform/providers/llm'
import { OpenAISdkProvider } from '@core/platform/providers/llm/sdk/openai-sdk-provider'
import { AnthropicSdkProvider } from '@core/platform/providers/llm/sdk/anthropic-sdk-provider'
import type { ProviderTemplate } from '@shared/types'

const OPENAI_TPL_ID = 'bailian-token-plan'
const ANTHROPIC_TPL_ID = 'bailian-token-plan-anthropic'
const OPENAI_BASE_URL = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'
const ANTHROPIC_BASE_URL = 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic'

/** 官方 Token Plan 个人版「支持的模型」表中属于文本/推理类的模型 ID */
const EXPECTED_TEXT_MODEL_IDS = [
  'qwen3.8-max',
  'qwen3.8-flash',
  'qwen3.7-max',
  'qwen3.7-plus',
  'qwen3.6-flash',
  'deepseek-v4-pro',
  'deepseek-v4-pro-0813',
  'deepseek-v4-flash-0731',
  'glm-5.2'
]

function getTemplate(id: string): ProviderTemplate {
  const tpl = PROVIDER_TEMPLATES.find((t) => t.id === id)
  if (!tpl) throw new Error(`模板 ${id} 不存在`)
  return tpl
}

/** 取 mock SDK 实例上的 baseURL（provider 内部 private client） */
function clientBaseUrl(provider: unknown): string | undefined {
  return (provider as { client?: { baseURL?: string } }).client?.baseURL
}

describe('阿里百炼 Token Plan 模板定义', () => {
  it('注册了 OpenAI 兼容与 Anthropic 兼容两张独立模板卡', () => {
    const openaiTpl = getTemplate(OPENAI_TPL_ID)
    const anthropicTpl = getTemplate(ANTHROPIC_TPL_ID)

    expect(openaiTpl.name).toContain('Token Plan')
    expect(anthropicTpl.name).toContain('Token Plan')
    // 两个端点协议不同，必须落在不同 category（createProvider/前端均按 category 判定）
    expect(openaiTpl.category).toBe('openai-compatible')
    expect(anthropicTpl.category).toBe('anthropic')
  })

  it('使用官方 Token Plan 专属 Base URL（与按量计费 bailian 模板严格区分）', () => {
    expect(getTemplate(OPENAI_TPL_ID).apiConfig.baseUrl).toBe(OPENAI_BASE_URL)
    expect(getTemplate(ANTHROPIC_TPL_ID).apiConfig.baseUrl).toBe(ANTHROPIC_BASE_URL)

    // 与既有「阿里百炼平台」（按量计费）不同 id、不同 baseUrl——密钥与端点隔离，混用会被官方拒绝
    const paygTpl = getTemplate('bailian')
    expect(paygTpl.apiConfig.baseUrl).not.toBe(OPENAI_BASE_URL)
    expect(paygTpl.id).not.toBe(OPENAI_TPL_ID)
  })

  it('认证方式与端点与官方文档一致', () => {
    const openaiTpl = getTemplate(OPENAI_TPL_ID)
    expect(openaiTpl.apiConfig.authType).toBe('bearer')
    expect(openaiTpl.apiConfig.authHeader).toBe('Authorization')
    expect(openaiTpl.apiConfig.authPrefix).toBe('Bearer ')
    expect(openaiTpl.apiConfig.requestFormat).toBe('openai')
    expect(openaiTpl.apiConfig.chatEndpoint).toBe('/chat/completions')
    expect(openaiTpl.apiConfig.modelsEndpoint).toBe('/models')

    const anthropicTpl = getTemplate(ANTHROPIC_TPL_ID)
    expect(anthropicTpl.apiConfig.authType).toBe('api-key')
    expect(anthropicTpl.apiConfig.authHeader).toBe('x-api-key')
    expect(anthropicTpl.apiConfig.requestFormat).toBe('anthropic')
    // Anthropic SDK 在 baseURL 后自行拼 /v1/messages
    expect(anthropicTpl.apiConfig.chatEndpoint).toBe('/v1/messages')
    expect(anthropicTpl.apiConfig.defaultHeaders?.['anthropic-version']).toBe('2023-06-01')
  })

  it('只声明 chat 能力（官方标注这两个端点「仅文本生成类」）', () => {
    for (const id of [OPENAI_TPL_ID, ANTHROPIC_TPL_ID]) {
      const tpl = getTemplate(id)
      expect(tpl.capabilities).toEqual(['chat'])
      expect(tpl.capabilities).not.toContain('image')
      expect(tpl.supportedParams.stream).toBe(true)
      expect(tpl.allowCustomModels).toBe(true)
    }
  })

  it('声明 sk-sp- 密钥前缀与使用须知（地域/限额/密钥隔离/官方使用范围）', () => {
    for (const id of [OPENAI_TPL_ID, ANTHROPIC_TPL_ID]) {
      const tpl = getTemplate(id)
      expect(tpl.apiKeyPrefix).toBe('sk-sp-')
      expect(tpl.usageNotes && tpl.usageNotes.length).toBeGreaterThanOrEqual(3)
      const notes = (tpl.usageNotes || []).join('\n')
      expect(notes).toContain('sk-sp-')      // 密钥不可混用
      expect(notes).toContain('华北2（北京）') // 地域限制
      expect(notes).toContain('交互式')        // 官方限定使用范围
    }
  })

  it('模型清单 = 官方 Token Plan 文本/推理模型（两张模板一致，且各自持有副本）', () => {
    const openaiModels = getTemplate(OPENAI_TPL_ID).models
    const anthropicModels = getTemplate(ANTHROPIC_TPL_ID).models

    expect(openaiModels.map((m) => m.id)).toEqual(EXPECTED_TEXT_MODEL_IDS)
    expect(anthropicModels.map((m) => m.id)).toEqual(EXPECTED_TEXT_MODEL_IDS)
    // 各自持有独立数组，避免一处变更污染另一张模板
    expect(openaiModels).not.toBe(anthropicModels)
    expect(openaiModels[0]).not.toBe(anthropicModels[0])
  })

  it('模型规格与能力取自官方文档（上下文/输出上限、推理、工具、视觉）', () => {
    const models = getTemplate(OPENAI_TPL_ID).models
    const byId = (id: string) => {
      const m = models.find((x) => x.id === id)
      if (!m) throw new Error(`模型 ${id} 不存在`)
      return m
    }

    // 全部为推理模型（官方「模型能力」列均含"推理模型"）
    for (const m of models) {
      expect(m.supportsThinking).toBe(true)
      expect(m.supportsTools).toBe(true)   // 官方明细页 Function Calling=支持
      expect(m.contextWindow).toBeGreaterThan(0)
      expect(m.maxOutputTokens).toBeGreaterThan(0)
      expect(m.type === 'text' || m.type === 'multimodal').toBe(true)
    }

    // 视觉理解：官方 Token Plan 表标注的三款为多模态
    expect(byId('qwen3.8-max').type).toBe('multimodal')
    expect(byId('qwen3.8-flash').type).toBe('multimodal')
    expect(byId('qwen3.7-plus').type).toBe('multimodal')
    expect(byId('qwen3.6-flash').type).toBe('multimodal')
    // qwen3.7-max / deepseek 系 / glm-5.2 官方只标「推理模型、文本生成」
    expect(byId('qwen3.7-max').type).toBe('text')
    expect(byId('deepseek-v4-pro').type).toBe('text')
    expect(byId('glm-5.2').type).toBe('text')

    // 规格（官方明细页 上下文长度 / 最大输出长度）
    expect(byId('qwen3.8-max').contextWindow).toBe(1_000_000)
    expect(byId('qwen3.8-max').maxOutputTokens).toBe(131_072)
    expect(byId('qwen3.6-flash').maxOutputTokens).toBe(65_536)
    expect(byId('deepseek-v4-pro').contextWindow).toBe(1_000_000)
    expect(byId('deepseek-v4-pro').maxOutputTokens).toBe(393_216)
    expect(byId('glm-5.2').contextWindow).toBe(1_048_576)
  })
})

describe('createProvider 按模板分发（Token Plan）', () => {
  it('OpenAI 兼容模板 → OpenAISdkProvider，默认 baseURL 为 Token Plan compatible-mode', () => {
    const tpl = getTemplate(OPENAI_TPL_ID)
    const provider = createProvider(OPENAI_TPL_ID, { apiKey: 'sk-sp-test' }, tpl)

    expect(provider).toBeInstanceOf(OpenAISdkProvider)
    // 用户未填 baseUrl 时必须落到 Token Plan 端点，而不是 api.openai.com
    expect(clientBaseUrl(provider)).toBe(OPENAI_BASE_URL)
  })

  it('Anthropic 兼容模板 → AnthropicSdkProvider，baseURL 回退模板默认端点', () => {
    const tpl = getTemplate(ANTHROPIC_TPL_ID)
    const provider = createProvider(ANTHROPIC_TPL_ID, { apiKey: 'sk-sp-test' }, tpl)

    expect(provider).toBeInstanceOf(AnthropicSdkProvider)
    expect(clientBaseUrl(provider)).toBe(ANTHROPIC_BASE_URL)
  })

  it('用户自定义 baseUrl 优先于模板默认值（代理/中转场景）', () => {
    const tpl = getTemplate(OPENAI_TPL_ID)
    const provider = createProvider(
      OPENAI_TPL_ID,
      { apiKey: 'sk-sp-test', baseUrl: 'https://proxy.example.com/v1' },
      tpl
    )
    expect(clientBaseUrl(provider)).toBe('https://proxy.example.com/v1')
  })
})

describe('testConnection 透出模板声明能力（离线）', () => {
  it('Anthropic 协议模板（无 /models 接口）返回预置模型清单与能力', async () => {
    const result = await providerTemplateService.testConnection({
      templateId: ANTHROPIC_TPL_ID,
      apiKey: 'sk-sp-test'
    })

    expect(result.success).toBe(true)
    expect(result.models?.map((m) => m.id)).toEqual(EXPECTED_TEXT_MODEL_IDS)

    const qwen = result.models?.find((m) => m.id === 'qwen3.8-max')
    // 关键：qwen3.8-max 官方支持视觉理解，但名字里没有 vl，纯字符串推断会漏判
    expect(qwen?.type).toBe('multimodal')
    expect(qwen?.supportsThinking).toBe(true)
    expect(qwen?.supportsTools).toBe(true)
    expect(qwen?.contextWindow).toBe(1_000_000)
    expect(qwen?.maxOutputTokens).toBe(131_072)

    const glm = result.models?.find((m) => m.id === 'glm-5.2')
    expect(glm?.type).toBe('text')
    expect(glm?.contextWindow).toBe(1_048_576)
  })
})
