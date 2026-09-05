/**
 * 分镜视频片段生成 · IPC handler（spec §4.4 · P5-T13）
 * @module core/packs/episode-production/handlers/render/video-segment.handler
 *
 * 暴露 channel：
 *   - ep:list-video-providers           列出可用 provider + 推断的 capabilities
 *   - ep:get-provider-capabilities      取单个 provider 的 capabilities
 *   - ep:generate-video-segment         为分镜生成视频片段
 *
 * 双端共用 handler。
 *
 * 注：本 handler 通过 base-video-provider-bridge 把既有 BaseVideoProvider 适配为
 * VideoProviderAdapter（spec 三模式契约）。具体 provider（DashScope wanx / 百炼 /
 * Volcengine）的真接入由 P5-T12 完成；本 handler 在 generate 时若该 provider 未实现
 * VideoProviderAdapter，会清晰报错给 UI 提示用户切换 provider。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import {
  VIDEO_PROVIDER_DEFINITIONS,
  isProviderImplemented,
  createVideoProvider,
} from '@core/platform/providers/video'
import type { VideoProviderType } from '@shared/types/video-provider.types'
import {
  VideoSegmentService,
  type GenerateVideoSegmentInput,
} from '@core/platform/episode-production/render/video/video-segment.service'
import type {
  VideoMode,
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from '@core/platform/episode-production/render/video/video-provider-adapter'
import { adaptBaseVideoProvider } from '@core/platform/episode-production/render/video/base-video-provider-bridge'
import { getProviderConfig } from '@core/platform/episode-production/narrative/ai/_helpers'

export function registerVideoSegmentHandlers(): void {
  ipcBridge.handle('ep:list-video-providers', handleListVideoProviders)
  ipcBridge.handle('ep:get-provider-capabilities', handleGetProviderCapabilities)
  ipcBridge.handle('ep:generate-video-segment', handleGenerateVideoSegment)
}

interface ProviderInfo {
  /** 用户配置的 providerConfigId（实际调用 generate 时用此 ID） */
  providerConfigId: string
  /** Provider 类型（bailian / dashscope / volcengine 等） */
  type: VideoProviderType
  /** 用户自定义的 provider 显示名 */
  name: string
  description: string
  implemented: boolean
  /** 该 provider 已配置 + 模型可用，UI 选了就能跑 */
  ready: boolean
  /** 推断的 capabilities */
  capabilities: VideoProviderCapabilities
  /** 用户启用的视频 model 列表（用户在 UI 还要选具体 model） */
  models: Array<{ id: string; name?: string }>
}

/**
 * 列出用户已配置的 video provider（从 provider_configs 表读 enabled，按 templateId
 * 映射到 VIDEO_PROVIDER_DEFINITIONS）。
 *
 * 与之前"静态列出 10 个 provider 类型"不同——本版本只列用户已开关的 + 已配 API key 的。
 */
async function handleListVideoProviders(): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.providerConfigs) {
      return { success: false, error: '数据库未初始化（providerConfigs 不可用）' }
    }
    const enabled = await db.providerConfigs.getEnabled()

    const list: ProviderInfo[] = []
    for (const cfg of enabled) {
      const templateId = cfg.templateId as string | undefined
      if (!templateId) continue
      // 跳过非视频 provider（templateId 不是已知 video provider 类型时）
      const def = VIDEO_PROVIDER_DEFINITIONS[templateId as VideoProviderType]
      if (!def) continue

      // 取该 cfg 下 type='video' 的模型 + 模型自带 features（真实数据，非硬编码）
      const allModels = (cfg.models ?? []) as Array<{
        id?: string
        name?: string
        type?: string
        features?: {
          textToVideo?: boolean
          imageToVideo?: boolean
          videoToVideo?: boolean
          maxDuration?: number
          supportedResolutions?: string[]
          supportedAspectRatios?: string[]
        }
      }>
      const videoModels = allModels
        .filter((m) => m.id && (m.type === 'video' || m.type === 'multimodal'))
        .map((m) => ({ id: m.id!, name: m.name, features: m.features }))

      list.push({
        providerConfigId: cfg.id,
        type: def.type,
        name: cfg.name || def.name,
        description: def.description,
        implemented: isProviderImplemented(def.type),
        ready:
          isProviderImplemented(def.type) &&
          videoModels.length > 0 &&
          (cfg.apiKey ? cfg.apiKey.length > 0 : false),
        // 用第一个 model 的真实 features 推断 capabilities；多个 model 时调用方
        // 实际选 model 后 generate-video-segment 会用具体 model 的 features 覆盖
        capabilities: deriveCapabilitiesFromModel(videoModels[0], def.type),
        models: videoModels.map((m) => ({ id: m.id, name: m.name })),
      })
    }
    return { success: true, data: list }
  } catch (e: any) {
    return { success: false, error: e?.message || '列视频 provider 失败' }
  }
}

/** 取单个 provider 的 capabilities */
async function handleGetProviderCapabilities(
  _event: any,
  providerType: VideoProviderType,
): Promise<IpcResponse> {
  try {
    const def = VIDEO_PROVIDER_DEFINITIONS[providerType]
    if (!def) {
      return { success: false, error: `未知的 provider type: ${providerType}` }
    }
    return {
      success: true,
      data: {
        type: providerType,
        capabilities: defaultCapabilitiesFor(providerType),
        implemented: isProviderImplemented(providerType),
      },
    }
  } catch (e: any) {
    return { success: false, error: e?.message || '取 capabilities 失败' }
  }
}

/**
 * 生成分镜视频片段（P5-T11 service 的 IPC 入口）。
 *
 * 当前 P5-T12 视频 provider 适配器尚未接入，本 handler 通过显式错误告知 UI
 * "暂不可用，请在设置中启用支持的 provider"。一旦 P5-T12 把真 adapter 接通，
 * 此处只需把 createAdapterForProvider() 替换为真实实现即可，service 层不变。
 */
async function handleGenerateVideoSegment(
  _event: any,
  storyboardId: string,
  opts?: {
    durationSec?: number
    width?: number
    height?: number
    forceMode?: VideoMode
    /** 用户在 UI 选择的 provider（providerConfigId） */
    providerConfigId?: string
    modelId?: string
  },
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) {
      return { success: false, error: '数据库未初始化' }
    }
    if (!db.providerConfigs) {
      return { success: false, error: '数据库未初始化（providerConfigs 不可用）' }
    }

    const adapterResult = await createAdapterForProviderWithReason(opts?.providerConfigId, opts?.modelId)
    if (!adapterResult.adapter) {
      return {
        success: false,
        error: `创建 video provider 适配失败：${adapterResult.reason}`,
      }
    }

    const svc = new VideoSegmentService(db.dataSource, adapterResult.adapter)
    const data = await svc.generateForStoryboard({
      storyboardId,
      durationSec: opts?.durationSec,
      width: opts?.width,
      height: opts?.height,
      forceMode: opts?.forceMode,
    } satisfies GenerateVideoSegmentInput)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '生成视频片段失败' }
  }
}

// ─── helpers ──────────────────────────────────────────────

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
export async function createAdapterForProviderWithReason(  providerConfigId?: string,
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
function deriveCapabilitiesFromModel(
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
function defaultCapabilitiesFor(_type: VideoProviderType): VideoProviderCapabilities {
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
