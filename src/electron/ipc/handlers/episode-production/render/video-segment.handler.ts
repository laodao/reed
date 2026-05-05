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

export function registerVideoSegmentHandlers(): void {
  ipcBridge.handle('ep:list-video-providers', handleListVideoProviders)
  ipcBridge.handle('ep:get-provider-capabilities', handleGetProviderCapabilities)
  ipcBridge.handle('ep:generate-video-segment', handleGenerateVideoSegment)
}

interface ProviderInfo {
  type: VideoProviderType
  name: string
  description: string
  implemented: boolean
  /** 推断的 capabilities（基于 VIDEO_PROVIDER_DEFINITIONS 静态信息） */
  capabilities: VideoProviderCapabilities
  /** P5-T12 真接入完成前为 false；UI 用此知道是否可用 */
  ready: boolean
}

/** 列出全部已知 video provider + 推断 capabilities */
async function handleListVideoProviders(): Promise<IpcResponse> {
  try {
    const list: ProviderInfo[] = Object.values(VIDEO_PROVIDER_DEFINITIONS).map((d) => ({
      type: d.type,
      name: d.name,
      description: d.description,
      implemented: isProviderImplemented(d.type),
      capabilities: defaultCapabilitiesFor(d.type),
      // P5-T12 接入 VideoProviderAdapter 后此处改为真值
      ready: false,
    }))
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
 * 占位：P5-T12 真实 adapter 接入前返回 null。
 * 真实实现：把已启用的 BaseVideoProvider 包装为 VideoProviderAdapter。
 */
async function createAdapterForProvider(
  _providerConfigId?: string,
  _modelId?: string,
): Promise<VideoProviderAdapter | null> {
  // TODO P5-T12：根据 providerConfigId 查 BaseVideoProvider，包成 adapter
  return null
}

/** 按 provider 类型给出推断的 capabilities（静态查表，UI 用）。 */
function defaultCapabilitiesFor(type: VideoProviderType): VideoProviderCapabilities {
  // 大多数 provider 同时支持 text2video + image2video，多关键帧少有支持
  switch (type) {
    case 'bailian':
    case 'dashscope':
      return {
        text: true,
        image: true,
        keyframes: true, // wanx 2.5 keyframes 模式（spec §4.4 提到）
        maxKeyframes: 2, // 当前 wanx 多帧上限保守填 2（首尾）
        maxDurationSec: 5,
      }
    case 'volcengine':
      return {
        text: true,
        image: true,
        keyframes: false,
        maxKeyframes: 0,
        maxDurationSec: 5,
      }
    case 'runway':
    case 'pika':
    case 'luma':
    case 'kling':
    case 'minimax':
    case 'zhipu':
      return {
        text: true,
        image: true,
        keyframes: false,
        maxKeyframes: 0,
        maxDurationSec: 5,
      }
    case 'custom':
    default:
      return {
        text: true,
        image: false,
        keyframes: false,
        maxKeyframes: 0,
        maxDurationSec: 4,
      }
  }
}
