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
import { getPathProvider } from '@core/interfaces/path.interface'
import * as path from 'path'
import * as fs from 'fs'

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

    // P7-T3 修复：outputPath 为空 / 含 ~ / 不是绝对路径时，回落到 user data 默认输出目录
    const resolvedOutputPath = resolveOutputPath(outputPath, episodeScriptId)

    const runner = new FluentFfmpegRunner()
    const writer = new NodeFileWriter(opts?.projectId ?? 'default')
    const svc = new EpisodeMp4ExporterService(db.dataSource, runner, writer)

    const result = await svc.exportEpisodeToMp4({
      episodeScriptId,
      outputPath: resolvedOutputPath,
      width: opts?.width,
      height: opts?.height,
      burnSubtitles: opts?.burnSubtitles,
    })

    return { success: true, data: result }
  } catch (e: any) {
    return { success: false, error: e?.message || 'MP4 导出失败' }
  }
}

/**
 * 把用户传的 outputPath 规范成可用的绝对路径：
 * - 空 / undefined → 默认：$userData/episode-production/exports/<epScriptId>-<timestamp>.mp4
 * - 以 ~ 开头 → 替换为 home dir
 * - 相对路径 → 相对于 user data path
 * - 父目录不存在 → 自动创建
 */
function resolveOutputPath(outputPath: string, episodeScriptId: string): string {
  const userDataPath = getPathProvider().getUserDataPath()
  const defaultDir = path.join(userDataPath, 'episode-production', 'exports')

  let resolved: string
  if (!outputPath || !outputPath.trim()) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    resolved = path.join(defaultDir, `${episodeScriptId}-${stamp}.mp4`)
  } else if (outputPath.startsWith('~/')) {
    const home = process.env.HOME || process.env.USERPROFILE || userDataPath
    resolved = path.join(home, outputPath.slice(2))
  } else if (path.isAbsolute(outputPath)) {
    resolved = outputPath
  } else {
    resolved = path.resolve(defaultDir, outputPath)
  }

  // 确保父目录存在
  const dir = path.dirname(resolved)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return resolved
}
