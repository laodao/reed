/**
 * 视频片段（视频片段制）· IPC handler（tasks/2026-09-04-ep-video-segment-redesign §3/§5）
 * @module core/packs/episode-production/handlers/render/segment.handler
 *
 * 暴露 channel（双端共用）：
 *   - ep:recompute-segments      输入 episodeId → 幂等重算分段，返回预览
 *   - ep:list-segments           输入 episodeId → 当前分段预览（不重算，默认排除 superseded）
 *   - ep:generate-segment-video  输入 segmentId → 片段级一次视频调用，写 segment.video_path
 *   - ep:delete-segment          输入 segmentId → 移除片段（generating 拒绝；
 *                                物理删除行，磁盘视频文件保留）
 *   - ep:merge-segments          输入 segIdA, segIdB → S-03 手动合并相邻片段（返回重排后的预览）
 *   - ep:split-segment           输入 segmentId, afterShotId → S-03 断点镜后拆分（返回重排后的预览）
 *   - ep:move-segment            输入 segmentId, direction → S-07 同场景相邻交换 seq（返回分段预览）
 *
 * 单镜生成 ep:generate-video-segment 保留不动（video-segment.handler.ts）。
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { EpSegmentationService } from '@core/platform/episode-production/render/video/ep-segmentation.service'
import { EpVideoSegmentRepository } from '@core/database/repositories/video-segment.repository'
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
  ipcBridge.handle('ep:delete-segment', handleDeleteSegment)
  // S-03 手动分段（tasks/2026-09-16-ep-studio-polish）
  ipcBridge.handle('ep:merge-segments', handleMergeSegments)
  ipcBridge.handle('ep:split-segment', handleSplitSegment)
  // S-07 片段排序：同场景相邻交换 seq
  ipcBridge.handle('ep:move-segment', handleMoveSegment)
}

/** S-07：上移/下移片段（同场景相邻交换 seq；返回交换后的分段预览） */
async function handleMoveSegment(
  _event: any,
  segmentId: string,
  direction: 'up' | 'down',
): Promise<IpcResponse> {
  try {
    if (!segmentId) return { success: false, error: 'segmentId 不能为空' }
    if (direction !== 'up' && direction !== 'down') {
      return { success: false, error: "direction 只能是 'up' 或 'down'" }
    }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new EpSegmentationService(db.dataSource)
    const data = await svc.moveSegment(segmentId, direction)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '移动片段失败' }
  }
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
  opts?: { includeSuperseded?: boolean },
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new EpSegmentationService(db.dataSource)
    const data = await svc.preview(episodeId, opts)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '读取分段失败' }
  }
}

async function handleDeleteSegment(
  _event: any,
  segmentId: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const repo = new EpVideoSegmentRepository(db.dataSource)
    const seg = await repo.getById(segmentId)
    if (!seg) return { success: false, error: '片段不存在或已被移除' }
    if (seg.status === 'generating') {
      return { success: false, error: '片段正在生成中，不能移除' }
    }
    // 注：segmentRepo.delete 是物理删除（scoped.delete），非 deleted_at 软删；
    // 磁盘上的 video_path 文件不删，仅移除片段行及其后续合成/导出资格
    await repo.delete(segmentId)
    return { success: true, data: { segmentId, hardDeleted: true } }
  } catch (e: any) {
    return { success: false, error: e?.message || '移除片段失败' }
  }
}

/** S-03：合并两个相邻片段（校验在 service 内；返回重排后的分段预览） */
async function handleMergeSegments(
  _event: any,
  segIdA: string,
  segIdB: string,
): Promise<IpcResponse> {
  try {
    if (!segIdA || !segIdB) return { success: false, error: 'segIdA/segIdB 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new EpSegmentationService(db.dataSource)
    const data = await svc.mergeSegments(segIdA, segIdB)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '合并片段失败' }
  }
}

/** S-03：在断点镜之后拆分片段（返回重排后的分段预览） */
async function handleSplitSegment(
  _event: any,
  segmentId: string,
  afterShotId: string,
): Promise<IpcResponse> {
  try {
    if (!segmentId || !afterShotId) return { success: false, error: 'segmentId/afterShotId 不能为空' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new EpSegmentationService(db.dataSource)
    const data = await svc.splitSegment(segmentId, afterShotId)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '拆分片段失败' }
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
    /** E3：人工强制跳过关键帧闸门 */
    force?: boolean
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
      force: opts?.force,
    } satisfies GenerateSegmentVideoInput)
    return { success: true, data }
  } catch (e: any) {
    // E3：闸门拦截返回结构化错误（code + 逐帧 failures），UI 可展示并引导重生/强制
    if (e?.code === 'KEYFRAME_GATE_BLOCKED') {
      return { success: false, error: e.message, code: e.code, frames: e.frames } as IpcResponse
    }
    return { success: false, error: e?.message || '生成片段视频失败' }
  }
}
