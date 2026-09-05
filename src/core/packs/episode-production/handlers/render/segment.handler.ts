/**
 * 视频片段（视频片段制）· IPC handler（tasks/2026-09-04-ep-video-segment-redesign §3/§5）
 * @module core/packs/episode-production/handlers/render/segment.handler
 *
 * 暴露 channel（双端共用）：
 *   - ep:recompute-segments      输入 episodeId → 幂等重算分段，返回预览
 *   - ep:list-segments           输入 episodeId → 当前分段预览（不重算）
 *   - ep:generate-segment-video  输入 segmentId → 片段级一次视频调用，写 segment.video_path
 *
 * 单镜生成 ep:generate-video-segment 保留不动（video-segment.handler.ts）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { EpSegmentationService } from '@core/platform/episode-production/render/video/ep-segmentation.service'
import {
  SegmentVideoService,
  type GenerateSegmentVideoInput,
} from '@core/platform/episode-production/render/video/segment-video.service'
import type { VideoMode } from '@core/platform/episode-production/render/video/video-provider-adapter'
import { createAdapterForProviderWithReason } from './video-segment.handler'

export function registerSegmentHandlers(): void {
  ipcBridge.handle('ep:recompute-segments', handleRecomputeSegments)
  ipcBridge.handle('ep:list-segments', handleListSegments)
  ipcBridge.handle('ep:generate-segment-video', handleGenerateSegmentVideo)
}

async function handleRecomputeSegments(
  _event: any,
  episodeId: string,
  opts?: { budgetSec?: number },
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new EpSegmentationService(db.dataSource)
    const data = await svc.recompute(episodeId, opts)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '重新分段失败' }
  }
}

async function handleListSegments(
  _event: any,
  episodeId: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new EpSegmentationService(db.dataSource)
    const data = await svc.preview(episodeId)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '读取分段失败' }
  }
}

async function handleGenerateSegmentVideo(
  _event: any,
  segmentId: string,
  opts?: {
    durationSec?: number
    width?: number
    height?: number
    forceMode?: VideoMode
    providerConfigId?: string
    modelId?: string
  },
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }

    const adapterResult = await createAdapterForProviderWithReason(
      opts?.providerConfigId,
      opts?.modelId,
    )
    if (!adapterResult.adapter) {
      return {
        success: false,
        error: `创建 video provider 适配失败：${adapterResult.reason}`,
      }
    }

    const svc = new SegmentVideoService(db.dataSource, adapterResult.adapter)
    const data = await svc.generateForSegment({
      segmentId,
      durationSec: opts?.durationSec,
      width: opts?.width,
      height: opts?.height,
      forceMode: opts?.forceMode,
      providerId: opts?.providerConfigId,
      modelId: opts?.modelId,
    } satisfies GenerateSegmentVideoInput)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '生成片段视频失败' }
  }
}
