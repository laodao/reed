/**
 * episode-production · 合成相关 · IPC handler（spec §6.2 · P6-T5）
 * @module core/packs/episode-production/handlers/compose.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 *
 * Channels：
 *   - ep:build-timeline      装配整剧时间线（pure 数据查询）
 *   - ep:preview-subtitle    预览整剧字幕 SRT（pure 计算）
 *   - ep:export-mp4          整剧导出为 MP4（PC 端用 fluent-ffmpeg；Web 端报"暂不支持"）
 *   - ep:list-export-history S-07 导出留档：读取该集最近 5 条导出记录
 */

import { ipcBridge } from '@core/ipc/bridge-adapter'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { IpcResponse } from '@shared/types/ipc.types'
import { isElectron, loadElectronModules } from '@electron/ipc/handlers/_platform'
import { TimelineBuilderService } from '@core/platform/episode-production/compose/timeline-builder.service'
import { SubtitleService } from '@core/platform/episode-production/compose/subtitle.service'
import { EpisodeMp4ExporterService } from '@core/platform/episode-production/compose/episode-mp4-exporter.service'
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
  ipcBridge.handle('ep:open-export-folder', handleOpenExportFolder)
  // S-07 导出版本留档：合成页「导出记录」读最近 5 条
  ipcBridge.handle('ep:list-export-history', handleListExportHistory)
}

/** S-07：导出留档列表（最近 5 条；表不存在等异常返回空列表而非报错，页面可正常渲染） */
async function handleListExportHistory(
  _event: any,
  episodeId: string,
): Promise<IpcResponse> {
  try {
    if (!episodeId) return { success: false, error: '缺少 episodeId' }
    const db = getCoreDatabaseManager()
    if (!db.dataSource) return { success: false, error: '数据库未初始化' }
    const ds = db.dataSource
    const isPg = ds.options.type === 'postgres'
    const rows: Array<{
      id: string
      episode_id: string
      output_path: string
      duration_sec: number | null
      created_at: string | Date
    }> = await ds.query(
      `SELECT id, episode_id, output_path, duration_sec, created_at
       FROM ep_export_history
       WHERE episode_id = ${isPg ? '$1' : '?'}
       ORDER BY created_at DESC
       LIMIT 5`,
      [episodeId],
    )
    return {
      success: true,
      data: rows.map(r => ({
        id: r.id,
        episodeId: r.episode_id,
        outputPath: r.output_path,
        durationSec: r.duration_sec,
        createdAt: r.created_at instanceof Date ? r.created_at.getTime() : new Date(r.created_at).getTime(),
      })),
    }
  } catch (e: any) {
    // 老库/测试库表未建时不报错，留档区显示空
    if (/no such table|does not exist/i.test(e?.message ?? '')) {
      return { success: true, data: [] }
    }
    return { success: false, error: e?.message || '读取导出记录失败' }
  }
}

/** 在系统文件管理器中显示导出文件（仅 PC 端；Web 端不可用） */
async function handleOpenExportFolder(
  _event: any,
  filePath: string,
): Promise<IpcResponse> {
  try {
    if (!isElectron) return { success: false, error: 'Web 端不支持打开本地目录' }
    if (!filePath) return { success: false, error: '缺少文件路径' }
    const { shell } = loadElectronModules()
    shell.showItemInFolder(filePath)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || '打开目录失败' }
  }
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

    // 附带 dataPath 相对路径：渲染端 toVideoUrl(local-video://) 只认 dataPath 相对路径，
    // 绝对路径会被错误拼到 dataPath 之后（resolveProtocolUrlToFile 不识别 POSIX 绝对路径）。
    const dataPath = getPathProvider().getDataPath()
    const rel = path.relative(dataPath, resolvedOutputPath)
    const relPath = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : undefined

    return { success: true, data: { ...result, outputPath: resolvedOutputPath, relPath } }
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
