/**
 * 视频 Provider 适配器工厂（平台层）
 * @module platform/episode-production/render/video/adapter-factory
 *
 * 2026-09-16 自 packs handler（video-segment.handler）上提：ep-agent 后半程工具
 * （generate_segment_video）与 handler 双方都需要"按已配置 provider 构造视频适配器"，
 * 留在 handler 层会造成 platform→packs 反向依赖或实现复制（架构统一原则）。
 * handler 通过 re-export 保持既有消费方（segment.handler 等）零改动。
 */

import {
  isProviderImplemented,
  createVideoProvider,
} from '@core/platform/providers/video'
import type { VideoProviderType } from '@shared/types/video-provider.types'
import { adaptBaseVideoProvider } from './base-video-provider-bridge'
import type {
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from './video-provider-adapter'
import { getProviderConfig } from '../../narrative/ai/_helpers'

/**
 * P5-T12：把已配置的 BaseVideoProvider 包装为 VideoProviderAdapter。
 *
 * 流程：
 *   1. 取 providerConfigId 对应的 ProviderConfig（含 type / API key 等）
 *   2. 用 createVideoProvider 实例化 BaseVideoProvider
 *   3. 用 adaptBaseVideoProvider 包成 spec 三模式契约
 *
 * 不支持的 provider 类型 / 未配置时返回 null（caller 给清晰错误）。
 */
export async function createAdapterForProviderWithReason(
  providerConfigId?: string,
  modelId?: string,
): Promise<{ adapter: VideoProviderAdapter | null; reason: string }> {
  if (!providerConfigId || !modelId) {
    return { adapter: null, reason: `缺 providerConfigId(${providerConfigId})/modelId(${modelId})` }
  }

  // P7-bug-3 修复：复用 _helpers.getProviderConfig（与 callAI 同一份解密路径，避免实现漂移）
  const providerInfo = await getProviderConfig(providerConfigId)
  if (!providerInfo) {
    return { adapter: null, reason: `getProviderConfig 失败（cfg/template/apiKey 解密任一缺失，${providerConfigId}）` }
  }
  const { config: cfg, apiKey } = providerInfo

  const providerType = cfg.templateId as VideoProviderType | undefined
  if (!providerType) return { adapter: null, reason: `provider config 缺 templateId` }
  if (!isProviderImplemented(providerType)) {
    return { adapter: null, reason: `provider type=${providerType} 未实现 BaseVideoProvider` }
  }

  // 选定 model 的真实 features 驱动 capabilities（不再硬编码 provider 能力）
  const allModels = (cfg.models ?? []) as Array<{
    id?: string
    type?: string
    features?: any
  }>
  const selectedModel = allModels.find((m) => m.id === modelId)
  if (!selectedModel) {
    return {
      adapter: null,
      reason: `model ${modelId} 不在 provider config ${providerConfigId} 启用模型列表 (${allModels.map((m) => m.id).join(',')})`,
    }
  }

  // 用户可在 customParams.videoCapabilities 进一步覆盖（启用 keyframes 等高级特性）
  const capabilitiesOverride: VideoProviderCapabilities | undefined =
    ((cfg.customParams as any)?.videoCapabilities as VideoProviderCapabilities | undefined) ??
    deriveCapabilitiesFromModel(selectedModel, providerType)

  const baseProvider = createVideoProvider(providerType, {
    id: providerConfigId,
    apiKey,
    baseUrl: cfg.videoBaseUrl ?? cfg.baseUrl ?? undefined,
  })

  const adapter = await adaptBaseVideoProvider(baseProvider, {
    modelId,
    providerConfigId,
    capabilitiesOverride,
  })
  return { adapter, reason: 'ok' }
}

/**
 * 从 user model 推导 capabilities（多源数据驱动）。
 *
 * 数据源优先级（由强到弱）：
 *   1. features 是对象（VideoModelFeatures shape）→ 直读 textToVideo/imageToVideo/maxDuration
 *      （这是 spec 期待的形式；当前 user provider config 实际填的是字符串数组）
 *   2. 按 model.id 命名约定推断（实际生产用得最多的路径）：
 *        - 含 't2v' / 'text2video' / 'text-to-video' → text=true
 *        - 含 'i2v' / 'image2video' / 'image-to-video' → image=true
 *        - 都不含 → 同时开 text=true + image=true（最宽松默认，让 capability-matcher
 *          按 keyframeCount 自选，单步失败再降级）
 *   3. type='video' 但 id 无线索 → 假设支持 text + image
 *
 * keyframes 维度：BaseVideoProvider features 不声明，需用户在
 *   customParams.videoCapabilities.keyframes 显式开启（避免 matcher 选错调用失败）。
 *
 * P7-bug-2 修复：之前直接 `!!f.textToVideo` 假设对象，但用户填字符串数组
 *   `["chat","streaming"]` 时全部回落 false，导致 wan2.7-i2v 被判"无能力"无法生成。
 */
export function deriveCapabilitiesFromModel(
  model: { id?: string; type?: string; features?: any } | undefined,
  type: VideoProviderType,
): VideoProviderCapabilities {
  const f = model?.features
  const subjectSupport = inferSubjectSupport(type, model?.id ?? '')
  const maxSubjects = subjectSupport ? inferMaxSubjects(type) : 0
  // Path 1：features 是 VideoModelFeatures 对象
  if (f && typeof f === 'object' && !Array.isArray(f) &&
      ('textToVideo' in f || 'imageToVideo' in f || 'maxDuration' in f)) {
    return {
      text: !!f.textToVideo,
      image: !!f.imageToVideo,
      keyframes: false,
      maxKeyframes: 0,
      maxDurationSec: typeof f.maxDuration === 'number' && f.maxDuration > 0 ? f.maxDuration : 5,
      subjectSupport,
      maxSubjects,
    }
  }
  // Path 2：按 model.id 命名约定推断
  const id = (model?.id ?? '').toLowerCase()
  let text = false
  let image = false
  if (id.includes('t2v') || id.includes('text2video') || id.includes('text-to-video')) {
    text = true
  }
  if (id.includes('i2v') || id.includes('image2video') || id.includes('image-to-video')) {
    image = true
  }
  // Path 3：type='video' 但 id 无线索 → 默认两种都开（最宽松）
  if (!text && !image && model?.type === 'video') {
    text = true
    image = true
  }
  return {
    text,
    image,
    keyframes: false,
    maxKeyframes: 0,
    maxDurationSec: 5,
    subjectSupport,
    maxSubjects,
  }
}

/**
 * 推断 provider 是否支持原生 subject（spec 2026-05-09 ep-redesign §3.2 C1 / P-20）。
 *
 * Kling O3/O1 / Midjourney V7 / Seedance 2.0+ 支持；其他默认 false。
 * caller（keyframe-generation）按此值决定走 subjectAPI 还是通用 referenceImagePaths。
 */
export function inferSubjectSupport(type: string, modelId: string): boolean {
  const id = (modelId ?? '').toLowerCase()
  if (type === 'kling' && /^(o[13]|3\.0|2\.6)/.test(id)) return true
  if (type === 'midjourney' && id.includes('v7')) return true
  if (type === 'dashscope' && /seedance.*[2-9]\.\d/.test(id)) return true
  // bailian 托管的 kling-v3 也能用 element_list（subject 接口的别名）
  if (type === 'bailian' && id.startsWith('kling-')) return true
  return false
}

/** Provider 同时可注入的 subject 数 */
export function inferMaxSubjects(type: string): number {
  if (type === 'kling') return 4
  if (type === 'bailian') return 10  // 百炼托管的 kling element_list 支持 10
  if (type === 'midjourney') return 1
  if (type === 'dashscope') return 9
  return 0
}

/** 仍保留兜底版本：handler.handleGetProviderCapabilities 在没有具体 cfg/model 时用 */
export function defaultCapabilitiesFor(_type: VideoProviderType): VideoProviderCapabilities {
  return {
    text: true,
    image: true,
    keyframes: false,
    maxKeyframes: 0,
    maxDurationSec: 5,
    subjectSupport: false,
    maxSubjects: 0,
  }
}
