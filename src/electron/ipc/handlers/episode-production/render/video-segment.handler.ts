/**
 * 分镜视频片段生成 · IPC handler（spec §4.4 · P5-T13）
 * @module electron/ipc/handlers/episode-production/render/video-segment.handler
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
} from '@core/video-providers'
import type { VideoProviderType } from '@shared/types/video-provider.types'
import {
  VideoSegmentService,
  type GenerateVideoSegmentInput,
} from '@core/modules/episode-production/render/video/video-segment.service'
import type {
  VideoMode,
  VideoProviderAdapter,
  VideoProviderCapabilities,
} from '@core/modules/episode-production/render/video/video-provider-adapter'
import { adaptBaseVideoProvider } from '@core/modules/episode-production/render/video/base-video-provider-bridge'

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

    const adapter = await createAdapterForProvider(opts?.providerConfigId, opts?.modelId)
    if (!adapter) {
      return {
        success: false,
        error:
          '当前没有可用的视频生成 provider 适配（P5-T12 接入待完成）。' +
          '请到「设置 → 模型服务」启用一个支持视频生成的 provider，' +
          '或等待后续版本对 DashScope wanx 视频 / 百炼视频的真接入。',
      }
    }

    const svc = new VideoSegmentService(db.dataSource, adapter)
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
async function createAdapterForProvider(
  providerConfigId?: string,
  modelId?: string,
): Promise<VideoProviderAdapter | null> {
  if (!providerConfigId || !modelId) return null

  const db = getCoreDatabaseManager()
  if (!db.providerConfigs) return null

  const cfg = await db.providerConfigs.getById(providerConfigId)
  if (!cfg) return null

  // 把 templateId（'bailian' / 'dashscope' / 'volcengine' 等）映射到 VideoProviderType
  // 模板 ID 即 provider 类型字面值（用户配置时已对齐）
  const providerType = cfg.templateId as VideoProviderType | undefined
  if (!providerType) return null
  if (!isProviderImplemented(providerType)) return null

  const apiKey = cfg.apiKey ?? ''

  // 选定 model 的真实 features 驱动 capabilities（不再硬编码 provider 能力）
  const allModels = (cfg.models ?? []) as Array<{
    id?: string
    type?: string
    features?: any
  }>
  const selectedModel = allModels.find((m) => m.id === modelId)
  if (!selectedModel) {
    console.warn(
      `[video-segment.handler] model ${modelId} 不在 provider config ${providerConfigId} 已启用列表内`,
    )
    return null
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

  return await adaptBaseVideoProvider(baseProvider, {
    modelId,
    providerConfigId,
    capabilitiesOverride,
  })
}

/**
 * 从 user model features 推导 capabilities（真实数据驱动）。
 *
 * 规则：
 * - text / image：直读 features.textToVideo / imageToVideo
 * - keyframes：BaseVideoProvider 的 features 不暴露此维度；
 *   通过 customParams.videoCapabilities.keyframes 由用户/运维手工开启
 *   （未开则保守 false，避免 capability-matcher 选错模式调用失败）
 * - maxDurationSec：直读 features.maxDuration（默认 5）
 *
 * 不再硬编码任何 provider 类型的能力；type 仅用于 maxKeyframes 默认值（仍是
 * "未声明 keyframes 维度时的兜底"，是合理的兜底常量而非欺骗用户的假数据）。
 */
function deriveCapabilitiesFromModel(
  model: { features?: any } | undefined,
  _type: VideoProviderType,
): VideoProviderCapabilities {
  const f = model?.features ?? {}
  return {
    text: !!f.textToVideo,
    image: !!f.imageToVideo,
    keyframes: false, // 默认关闭：BaseVideoProvider features 没此维度，保守降级到 image2video
    maxKeyframes: 0,
    maxDurationSec: typeof f.maxDuration === 'number' && f.maxDuration > 0 ? f.maxDuration : 5,
  }
}

/** 仍保留兜底版本：handler.handleGetProviderCapabilities 在没有具体 cfg/model 时用 */
function defaultCapabilitiesFor(_type: VideoProviderType): VideoProviderCapabilities {
  return {
    text: true,
    image: true,
    keyframes: false,
    maxKeyframes: 0,
    maxDurationSec: 5,
  }
}
