/**
 * 提供商适配：现有配置体系 → AI SDK LanguageModel
 * @module core/platform/agent-runtime/provider/provider-adapter
 *
 * 契约：tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md §7（ModelResolver）。
 * 实现：包装 @core/platform/services/ai-call 的 getProviderConfig（密钥解密/默认链/SSRF
 * 单一事实源不动）+ @ai-sdk/openai-compatible 动态构造。
 *
 * 工程红线（22 号 §1.3）：ai 系包 ESM-only——一律动态 import（模块级 Promise 缓存），
 * 类型 import type。模型实例 LRU 缓存（apiKey 解密一次复用），provider 配置变更时失效。
 */

import { createLogger } from '@core/utils/logger'
import type { LanguageModel } from 'ai'
import type { ProviderInfo } from '@core/platform/services/ai-call'
import { isChatModel } from '@shared/utils/model-predicates'

const logger = createLogger('AgentProviderAdapter')

export interface ResolveModelOptions {
  providerConfigId?: string
  modelId?: string
}

/** getProviderConfig 的可注入形态（单测注入 fake，免起数据库） */
export type ProviderConfigLookup = (
  providerConfigId?: string,
) => Promise<ProviderInfo | null>

export interface ProviderAdapterDeps {
  getProviderConfig?: ProviderConfigLookup
  /** 模型实例缓存容量（缺省 8；测试可置 0 关闭缓存） */
  cacheCapacity?: number
  /** 缓存 TTL ms（缺省 10 分钟） */
  cacheTtlMs?: number
}

interface CacheEntry {
  model: LanguageModel
  createdAt: number
}

/** 从 ModelDefinition[] 挑首个支持 chat 的文本模型 id（与 ai-call 同序规则） */
function pickFirstChatModelId(
  models: Array<{ id?: string; type?: string; features?: string[] }> | undefined | null,
): string | undefined {
  if (!Array.isArray(models) || models.length === 0) return undefined
  return (
    models.find((m) => isChatModel(m))?.id ??
    models.find((m) => m?.id && (m.type === 'text' || !m.type))?.id ??
    models.find((m) => !!m?.id)?.id
  )
}

export class ProviderAdapter {
  private readonly lookup: ProviderConfigLookup
  private readonly cacheCapacity: number
  private readonly cacheTtlMs: number
  private readonly cache = new Map<string, CacheEntry>()
  /** openai-compatible 工厂（动态 import 后填充） */
  private compatFactory: ((opts: { name: string; baseURL: string; apiKey: string }) => {
    (modelId: string): LanguageModel
  }) | null = null
  private compatLoading: Promise<void> | null = null
  /** anthropic / google 原生工厂（25 号 M2 批4；动态 import 后填充） */
  private anthropicFactory: ((opts: { apiKey: string; baseURL?: string }) => {
    (modelId: string): LanguageModel
  }) | null = null
  private anthropicLoading: Promise<void> | null = null
  private googleFactory: ((opts: { apiKey: string; baseURL?: string }) => {
    (modelId: string): LanguageModel
  }) | null = null
  private googleLoading: Promise<void> | null = null

  constructor(deps: ProviderAdapterDeps = {}) {
    this.lookup = deps.getProviderConfig ?? defaultLookup
    this.cacheCapacity = deps.cacheCapacity ?? 8
    this.cacheTtlMs = deps.cacheTtlMs ?? 10 * 60_000
  }

  /** 解析模型对象（spike 验证按请求构造；命中缓存直接返回） */
  async resolveModel(opts: ResolveModelOptions = {}): Promise<LanguageModel> {
    // 前置缓存仅对「双显式 (providerConfigId, modelId)」启用：键唯一确定配置。
    // 半显式（仅 modelId）不启用——否则用户切换默认提供商后，`*:modelId` 命中
    // 旧提供商实例（TTL 内 baseURL/apiKey 全错，深度 review P2-8 实证）；
    // 半显式走完整 lookup（一次 DB 读换正确性）
    const earlyKey =
      opts.providerConfigId && opts.modelId ? `${opts.providerConfigId}:${opts.modelId}` : null
    if (earlyKey) {
      const early = this.cache.get(earlyKey)
      if (early && Date.now() - early.createdAt < this.cacheTtlMs) {
        this.cache.delete(earlyKey)
        this.cache.set(earlyKey, early)
        return early.model
      }
    }

    const info = await this.lookup(opts.providerConfigId)
    if (!info) {
      throw new AgentProviderNotConfiguredError()
    }
    const { config, template, apiKey } = info

    // 模型 fallback 链与 ai-call 一致：显式 → config.defaultModel → 用户启用首个 → 模板内置
    const fromConfigDefault = (config as { defaultModel?: string }).defaultModel
    const fromUserModels = pickFirstChatModelId(config.models as never)
    const fromTemplateModels = pickFirstChatModelId((template as { models?: unknown }).models as never)
    const effectiveModelId = opts.modelId || fromConfigDefault || fromUserModels || fromTemplateModels
    if (!effectiveModelId) {
      throw new AgentProviderNotConfiguredError(
        '未指定模型 — 请在 设置 → 提供商配置 中为该提供商启用至少一个文本/对话模型',
      )
    }

    const cacheKey = `${config.id}:${effectiveModelId}`
    const hit = this.cache.get(cacheKey)
    if (hit && Date.now() - hit.createdAt < this.cacheTtlMs) {
      this.cache.delete(cacheKey)
      this.cache.set(cacheKey, hit) // LRU 触碰
      return hit.model
    }

    const model = await this.createModel({
      name: template.id,
      baseURL: config.baseUrl || template.apiConfig.baseUrl,
      apiKey,
      modelId: effectiveModelId,
      category: (template as { category?: string }).category,
      // 供应商配置的自定义参数（如 vLLM 的 chat_template_kwargs.enable_thinking=false）
      // 经请求体合并透传——与旧版 OpenAICompatibleProvider 的 customParams 行为对齐
      customParams: (config as { customParams?: Record<string, unknown> | null }).customParams ?? undefined,
    })

    if (this.cacheCapacity > 0) {
      const entry = { model, createdAt: Date.now() }
      this.cache.set(cacheKey, entry)
      if (earlyKey) this.cache.set(earlyKey, entry) // 前置键与解析键双登记（同一实例；仅双显式）
      while (this.cache.size > this.cacheCapacity) {
        this.cache.delete(this.cache.keys().next().value as string)
      }
    }
    return model
  }

  /** 列模型（definition 调试/前端选择器复用） */
  async listModels(providerConfigId?: string): Promise<Array<{ id: string; label?: string }>> {
    const info = await this.lookup(providerConfigId)
    if (!info) throw new AgentProviderNotConfiguredError()
    const models = [
      ...((info.config.models as Array<{ id: string; label?: string; name?: string }>) ?? []),
      ...(((info.template as { models?: Array<{ id: string; label?: string; name?: string }> }).models) ?? []),
    ]
    const seen = new Set<string>()
    const out: Array<{ id: string; label?: string }> = []
    for (const m of models) {
      if (!m?.id || seen.has(m.id)) continue
      seen.add(m.id)
      out.push({ id: m.id, label: m.label ?? m.name })
    }
    return out
  }

  /** provider 配置变更时清缓存（事件系统接入点；测试直接调用） */
  invalidateCache(): void {
    this.cache.clear()
  }

  private async createModel(opts: {
    name: string
    baseURL: string
    apiKey: string
    modelId: string
    /** 提供商模板类别（25 号 M2 批4）：anthropic/google 走原生 SDK，其余 OpenAI 兼容 */
    category?: string
    /** 供应商配置自定义参数，OpenAI 兼容链路经自定义 fetch 合并进请求体顶层 */
    customParams?: Record<string, unknown>
  }): Promise<LanguageModel> {
    const category = opts.category ?? 'openai-compatible'
    if (category === 'anthropic') {
      this.anthropicLoading ??= import('@ai-sdk/anthropic').then((m) => {
        this.anthropicFactory = m.createAnthropic as never
      })
      try {
        await this.anthropicLoading
      } catch (e) {
        this.anthropicLoading = null // 允许重试
        logger.error('[provider-adapter] 加载 @ai-sdk/anthropic 失败', e)
        throw new AgentProviderNotConfiguredError('AI SDK provider 模块加载失败（anthropic）')
      }
      const factory = this.anthropicFactory
      if (!factory) throw new AgentProviderNotConfiguredError('AI SDK provider 模块加载失败（anthropic）')
      // 官方根地址省略 baseURL（SDK 默认含 /v1 路径）；自定义地址（中转/代理）原样透传
      const provider = factory({ apiKey: opts.apiKey, ...anthropicBaseURLOpts(opts.baseURL) })
      return provider(opts.modelId)
    }
    if (category === 'google') {
      this.googleLoading ??= import('@ai-sdk/google').then((m) => {
        this.googleFactory = m.createGoogleGenerativeAI as never
      })
      try {
        await this.googleLoading
      } catch (e) {
        this.googleLoading = null // 允许重试
        logger.error('[provider-adapter] 加载 @ai-sdk/google 失败', e)
        throw new AgentProviderNotConfiguredError('AI SDK provider 模块加载失败（google）')
      }
      const factory = this.googleFactory
      if (!factory) throw new AgentProviderNotConfiguredError('AI SDK provider 模块加载失败（google）')
      const provider = factory({ apiKey: opts.apiKey, ...googleBaseURLOpts(opts.baseURL) })
      return provider(opts.modelId)
    }
    // openai-compatible / custom 及未知类别：同一协议族（兼容面最大）
    this.compatLoading ??= import('@ai-sdk/openai-compatible').then((m) => {
      this.compatFactory = m.createOpenAICompatible as never
    })
    try {
      await this.compatLoading
    } catch (e) {
      this.compatLoading = null // 允许重试
      logger.error('[provider-adapter] 加载 @ai-sdk/openai-compatible 失败', e)
      throw new AgentProviderNotConfiguredError('AI SDK provider 模块加载失败')
    }
    const factory = this.compatFactory
    if (!factory) throw new AgentProviderNotConfiguredError('AI SDK provider 模块加载失败')
    const provider = factory({
      name: opts.name,
      baseURL: opts.baseURL,
      apiKey: opts.apiKey,
      ...(opts.customParams && Object.keys(opts.customParams).length > 0
        ? { fetch: mergeBodyFetch(opts.customParams) }
        : {}),
    })
    return provider(opts.modelId)
  }
}

/** 生成把 customParams 合并进 JSON 请求体顶层的 fetch（对齐旧版 OpenAICompatibleProvider
 * 的 customParams 行为——SDK 版 provider 原生不支持额外 body 字段，vLLM 的
 * chat_template_kwargs 等参数只能在此层注入） */
function mergeBodyFetch(customParams: Record<string, unknown>): typeof fetch {
  return async (input, init) => {
    let nextInit = init
    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body)
        Object.assign(body, customParams)
        nextInit = { ...init, body: JSON.stringify(body) }
      } catch {
        // 非 JSON 体（如 multipart）原样放行
      }
    }
    return fetch(input, nextInit)
  }
}

/** 官方根地址（模板缺省值）——此时省略 baseURL，让 SDK 使用其规范 API 路径
 *（anthropic 默认 https://api.anthropic.com/v1、google 默认 .../v1beta；
 *  误拼根地址会把请求打到 /messages 而 404） */
const ANTHROPIC_OFFICIAL_ROOTS = new Set(['https://api.anthropic.com', 'https://api.anthropic.com/'])
const GOOGLE_OFFICIAL_ROOTS = new Set([
  'https://generativelanguage.googleapis.com',
  'https://generativelanguage.googleapis.com/',
])

/** 版本段——baseUrl 允许带或不带版本段（如 DeepSeek 官方根地址），缺失时下方补 /v1 */
const VERSION_SEGMENT_RE = /\/v\d+[a-z]*$/i

/**
 * Anthropic baseURL 规整。
 *
 * 两条 Anthropic 链路对 baseUrl 的期望不同，必须区分：
 * - `@ai-sdk/anthropic`（本适配器）：请求 `${baseURL}/messages`，故 baseURL 必须含版本段
 *   （其官方默认值就是 `https://api.anthropic.com/v1`）；
 * - `@anthropic-ai/sdk`（createProvider 链路）：请求 `${baseURL}/v1/messages`，baseURL 为根地址。
 *
 * 而官方文档给第三方 Anthropic 兼容端点时给的是**根地址**（如阿里百炼 Token Plan 的
 * `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic`），模板 baseUrl 保持文档原样，
 * 故在此处补版本段——否则会打到 `.../apps/anthropic/messages` 而 404。
 */
function anthropicBaseURLOpts(baseURL: string): { baseURL?: string } {
  const trimmed = (baseURL || '').replace(/\/+$/, '')
  // 官方根地址/空值 → 省略，交给 SDK 默认（等价于 .../v1）
  if (!trimmed || ANTHROPIC_OFFICIAL_ROOTS.has(trimmed)) return {}
  return { baseURL: VERSION_SEGMENT_RE.test(trimmed) ? trimmed : `${trimmed}/v1` }
}

function googleBaseURLOpts(baseURL: string): { baseURL?: string } {
  return GOOGLE_OFFICIAL_ROOTS.has(baseURL) ? {} : { baseURL: baseURL.replace(/\/$/, '') }
}

/** 类型化错误（23 号 §9；IPC 边界扁平化为 code+message） */
export class AgentProviderNotConfiguredError extends Error {
  readonly code = 'AGENT_PROVIDER_NOT_CONFIGURED'
  constructor(message = '未配置 AI 提供商，请先在设置中添加提供商配置') {
    super(message)
    this.name = 'AgentProviderNotConfiguredError'
  }
}

/** 缺省查找：动态 import（延迟绑定数据库单例；⚠️ 不能用 require——vite 只重写
 * import 语句，运行时 require('@core/...') 在产物里无法解析，UI 实跑实证） */
async function defaultLookup(providerConfigId?: string): Promise<ProviderInfo | null> {
  const { getProviderConfig } = await import('@core/platform/services/ai-call')
  return getProviderConfig(providerConfigId)
}
