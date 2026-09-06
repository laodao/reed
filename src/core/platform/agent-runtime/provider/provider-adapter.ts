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
    models.find(
      (m) =>
        m?.id && (m.type === 'text' || !m.type) && Array.isArray(m.features) && m.features.includes('chat'),
    )?.id ??
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

  constructor(deps: ProviderAdapterDeps = {}) {
    this.lookup = deps.getProviderConfig ?? defaultLookup
    this.cacheCapacity = deps.cacheCapacity ?? 8
    this.cacheTtlMs = deps.cacheTtlMs ?? 10 * 60_000
  }

  /** 解析模型对象（spike 验证按请求构造；命中缓存直接返回——显式 (provider,model) 先查缓存免 lookup） */
  async resolveModel(opts: ResolveModelOptions = {}): Promise<LanguageModel> {
    // 前置缓存：调用方显式给出 (providerConfigId, modelId) 时无需 lookup（避免重复 DB 读+解密）
    const earlyKey = `${opts.providerConfigId ?? '*'}:${opts.modelId ?? '*'}`
    if (opts.modelId) {
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
    })

    if (this.cacheCapacity > 0) {
      const entry = { model, createdAt: Date.now() }
      this.cache.set(cacheKey, entry)
      this.cache.set(earlyKey, entry) // 前置键与解析键双登记（同一实例）
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
  }): Promise<LanguageModel> {
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
    const provider = factory({ name: opts.name, baseURL: opts.baseURL, apiKey: opts.apiKey })
    return provider(opts.modelId)
  }
}

/** 类型化错误（23 号 §9；IPC 边界扁平化为 code+message） */
export class AgentProviderNotConfiguredError extends Error {
  readonly code = 'AGENT_PROVIDER_NOT_CONFIGURED'
  constructor(message = '未配置 AI 提供商，请先在设置中添加提供商配置') {
    super(message)
    this.name = 'AgentProviderNotConfiguredError'
  }
}

/** 缺省查找：延迟 require ai-call（避免模块加载期绑定数据库单例） */
function defaultLookup(providerConfigId?: string): Promise<ProviderInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getProviderConfig } = require('@core/platform/services/ai-call') as {
    getProviderConfig: ProviderConfigLookup
  }
  return getProviderConfig(providerConfigId)
}
