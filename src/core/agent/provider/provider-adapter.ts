/**
 * 提供商适配：现有配置体系 → AI SDK LanguageModel
 * @module core/agent/provider/provider-adapter
 *
 * 包装 ai-call.ts 的 getProviderConfig（指定ID→默认→首个启用 + 密钥解密 + 模型 fallback 链），
 * 产出 @ai-sdk/openai-compatible 的模型对象。spike 已验证按请求动态构造可行。
 *
 * 职责：
 *   resolveModel(opts?: { providerConfigId?: string; modelId?: string }): Promise<LanguageModel>
 *
 * 要点：
 * - fallback 链与 ai-call.ts 完全一致：显式 modelId → config.defaultModel → 用户启用首个文本模型 → 模板内置
 * - 每次调用新建 provider 实例（apiKey 运行时解密，不可缓存实例）
 * - validateOutboundUrl 的 SSRF 防护沿用（Web 多租户）
 */

import type { LanguageModel } from 'ai'

/** 模型解析选项（与旧 AgentWorkflowService.sendMessage opts 对齐） */
export interface ResolveModelOptions {
  providerConfigId?: string
  modelId?: string
}

/** M0 实现：见调研文档 H 节 spike ⑦ */
export async function resolveModel(_opts?: ResolveModelOptions): Promise<LanguageModel> {
  throw new Error('M0: 待实现——包装 getProviderConfig + createOpenAICompatible')
}
