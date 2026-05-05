/**
 * episode-production · 合成相关 · IPC handler（spec §6.2 · P6-T5）
 * @module electron/ipc/handlers/episode-production/compose.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 *
 * Channels：
 *   - ep:build-timeline      装配整剧时间线（pure 数据查询）
 *   - ep:preview-subtitle    预览整剧字幕 SRT（pure 计算）
 *   - ep:export-mp4          整剧导出为 MP4（PC 端用 fluent-ffmpeg；Web 端报"暂不支持"）
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { TimelineBuilderService } from '@core/modules/episode-production/compose/timeline-builder.service'
import { SubtitleService } from '@core/modules/episode-production/compose/subtitle.service'
import { EpisodeMp4ExporterService } from '@core/modules/episode-production/compose/episode-mp4-exporter.service'
import {
  FluentFfmpegRunner,
  NodeFileWriter,
} from './compose/episode-mp4-exporter.runner'

export function registerComposeHandlers(): void {
  ipcBridge.handle('ep:build-timeline', handleBuildTimeline)
  ipcBridge.handle('ep:preview-subtitle', handlePreviewSubtitle)
  ipcBridge.handle('ep:export-mp4', handleExportMp4)
}

/** 装配整剧时间线（spec §5.3） */
async function handleBuildTimeline(
  _event: any,
  episodeScriptId: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const svc = new TimelineBuilderService(db.dataSource)
    const data = await svc.buildEpisodeTimeline(episodeScriptId)
    return { success: true, data }
  } catch (e: any) {
    return { success: false, error: e?.message || '装配时间线失败' }
  }
}

/** 预览整剧字幕 SRT（spec §5.3 · 不写文件，仅返回字符串） */
async function handlePreviewSubtitle(
  _event: any,
  episodeScriptId: string,
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const tlSvc = new TimelineBuilderService(db.dataSource)
    const subSvc = new SubtitleService(db.dataSource)
    const timeline = await tlSvc.buildEpisodeTimeline(episodeScriptId)
    const srt = await subSvc.buildSrt(timeline)
    return { success: true, data: { srt, timeline } }
  } catch (e: any) {
    return { success: false, error: e?.message || '生成字幕预览失败' }
  }
}

/** 整剧导出为 MP4（spec §6.2 · 末端硬锁：所有分镜需有 video） */
async function handleExportMp4(
  _event: any,
  episodeScriptId: string,
  outputPath: string,
  opts?: {
    width?: number
    height?: number
    burnSubtitles?: boolean
    projectId?: string
  },
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }

    const runner = new FluentFfmpegRunner()
    const writer = new NodeFileWriter(opts?.projectId ?? 'default')
    const svc = new EpisodeMp4ExporterService(db.dataSource, runner, writer)

    const result = await svc.exportEpisodeToMp4({
      episodeScriptId,
      outputPath,
      width: opts?.width,
      height: opts?.height,
      burnSubtitles: opts?.burnSubtitles,
    })

    return { success: true, data: result }
  } catch (e: any) {
    return { success: false, error: e?.message || 'MP4 导出失败' }
  }
}
