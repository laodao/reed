/**
 * 主编模型选择解析（W1.5 / 09-20 §8）：stage 配置权威
 * @module utils/resolve-initial-model
 *
 * 背景：loadModels 的兜底链要求 stage 配置值必须命中 provider 模型列表，
 * 配置了列表外模型（如手填自定义 id）时返回空串，最终落到 modelOptions[0]
 * （可能是完全无关的模型）并写回 stage 配置——用户的显式配置被静默覆盖。
 *
 * 语义：按 story-room → overview → chapter 顺序取 stage 配置；
 * 命中列表 → 直接用；配置的 provider 启用但模型不在列表 → 注入合成项
 * （尊重用户显式配置）；provider 未启用 → 跳过下一档；全部无配置 → 空串
 * （调用方回退第一个模型）。
 */

export interface StageModelCfg {
  stage: string
  providerConfigId?: string
  modelId?: string
}

export interface ModelOption {
  value: string
  label: string
}

export interface ProviderLookupEntry {
  name?: string
  enabled: boolean
}

export interface ResolvedModelSelection {
  /** `${providerConfigId}|${modelId}`；空串 = 无任何 stage 配置（调用方回退） */
  value: string
  /** 配置的模型不在列表但 provider 启用——调用方按此 label 注入合成选项 */
  syntheticLabel?: string
}

export function resolveInitialModelSelection(
  stageCfgs: StageModelCfg[],
  options: ModelOption[],
  providerLookup: Map<string, ProviderLookupEntry>,
  stageOrder: string[] = ['story-room', 'overview', 'chapter'],
): ResolvedModelSelection {
  for (const stage of stageOrder) {
    const hit = stageCfgs.find((c) => c.stage === stage)
    if (!hit?.providerConfigId || !hit.modelId) continue
    const value = `${hit.providerConfigId}|${hit.modelId}`
    if (options.some((o) => o.value === value)) return { value }
    const provider = providerLookup.get(hit.providerConfigId)
    if (!provider?.enabled) continue
    return { value, syntheticLabel: `${provider.name || hit.providerConfigId} / ${hit.modelId}` }
  }
  return { value: '' }
}
