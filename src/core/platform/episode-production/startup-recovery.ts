/**
 * 剧集制作启动恢复（复核修复 P1-9/10 + 2026-09-16 ep-hardening H5）
 * @module platform/episode-production/startup-recovery
 *
 * 解决两类"中间态无 owner"问题：
 * 1. DB 状态卡死：视频/片段生成中途进程崩溃 → storyboard / ep_video_segments
 *    永久停在 generating，UI 无法判断可重试。H5 起按 provider_task_id 分流：
 *    - 有 taskId 且 provider 是 comfyui 网关 → 先查网关 GET /api/task/{id}（20s 超时）：
 *      done+url → 下载落盘转 completed；error → 复位 error；404 → 复位 error；
 *      查询失败（网关没起）/ 仍在跑 → 保持 generating（下次启动再试）。
 *    - 无 taskId（或 provider 无法解析为 comfyui 网关）→ 维持原逻辑复位 error。
 * 2. 临时目录泄漏：缩略图 session / 参考视频抽帧 / 角色提取 / 合成中间产物都
 *    依赖调用方显式清理，崩溃/关窗即永久累积（旧注释承诺的 cron 兜底从未实现）。
 *    启动时按 mtime 清扫超过 24h 的 session 目录。
 *
 * 注意：DB 复位有意不带 user_id 过滤——启动恢复是全局维护任务，须覆盖全部租户
 * （Electron 单用户行 user_id 为 NULL，同样被覆盖）。
 * 全程 fail-soft：任何失败只打日志，绝不阻塞应用启动。
 */

import * as fs from 'fs'
import * as path from 'path'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { downloadVideoToLocal } from './render/video/base-video-provider-bridge'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('EpStartupRecovery')

/** temp session 目录的最大保留时长 */
const TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** 网关任务状态查询超时（与 comfyui-video.provider.getTaskStatus 一致） */
const GATEWAY_QUERY_TIMEOUT_MS = 20_000

/** comfyui 网关默认地址（与 ComfyUIVideoProvider.getDefaultBaseUrl 一致） */
const COMFYUI_DEFAULT_BASE_URL = 'http://127.0.0.1:8190'

/** 网关任务状态响应（与 comfyui-video.provider 的 GatewayVideoTaskResponse 同构） */
interface GatewayTaskResponse {
  ok?: boolean
  status?: 'running' | 'done' | 'error'
  path?: string
  url?: string
  error?: string | null
}

/** 各 temp root 下的 session 子目录名（与各 service 的 session 落点一一对应） */
const TEMP_SUBDIRS = [
  'ep-thumbnails', // 分镜 9 宫格 preview session
  'reference-video', // 参考视频抽帧 session
  'character-extract', // 角色提取 session
  'character-extraction',
]

function rmrfSafe(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) return false
    fs.rmSync(dir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

function isOlderThan(dir: string, maxAgeMs: number): boolean {
  try {
    const st = fs.statSync(dir)
    return Date.now() - st.mtimeMs > maxAgeMs
  } catch {
    return false
  }
}

/** 清扫已知 temp root 下超龄的 session 子目录 */
function sweepTempDirs(): { root: string; removed: number }[] {
  const pp = getPathProvider()
  const removed: { root: string; removed: number }[] = []
  const sweepOne = (root: string): number => {
    if (!fs.existsSync(root)) return 0
    let n = 0
    for (const entry of fs.readdirSync(root)) {
      const full = path.join(root, entry)
      if (fs.existsSync(full) && fs.statSync(full).isDirectory() && isOlderThan(full, TEMP_MAX_AGE_MS)) {
        if (rmrfSafe(full)) n++
      }
    }
    return n
  }

  const tempRoot = pp.getTempPath()
  for (const sub of TEMP_SUBDIRS) {
    const root = path.join(tempRoot, sub)
    const n = sweepOne(root)
    if (n > 0) removed.push({ root, removed: n })
  }

  // 用户数据下的项目级 temp：
  // - compose-temp（MP4 导出 SRT / 场景合成中间产物）
  // - story-to-video/{projectId}/temp（视频合成的项目级 temp）
  try {
    const userData = pp.getUserDataPath()
    const epRoot = path.join(userData, 'episode-production')
    if (fs.existsSync(epRoot)) {
      let n = 0
      for (const projectId of fs.readdirSync(epRoot)) {
        const composeTemp = path.join(epRoot, projectId, 'compose-temp')
        if (fs.existsSync(composeTemp) && isOlderThan(composeTemp, TEMP_MAX_AGE_MS)) {
          if (rmrfSafe(composeTemp)) n++
        }
      }
      if (n > 0) removed.push({ root: epRoot + '/*/compose-temp', removed: n })
    }
    const stvRoot = path.join(userData, 'story-to-video')
    if (fs.existsSync(stvRoot)) {
      let n = 0
      for (const projectId of fs.readdirSync(stvRoot)) {
        const tempDir = path.join(stvRoot, projectId, 'temp')
        if (fs.existsSync(tempDir) && isOlderThan(tempDir, TEMP_MAX_AGE_MS)) {
          if (rmrfSafe(tempDir)) n++
        }
      }
      if (n > 0) removed.push({ root: stvRoot + '/*/temp', removed: n })
    }
  } catch { /* 用户数据清扫失败不阻塞 */ }

  return removed
}

// ─── H5：generating 行按 provider_task_id 分流恢复 ─────────────────────

interface RecoveryStats {
  /** 网关已完成 → 下载落库转 completed */
  completed: number
  /** 复位 error（无 taskId / 网关报错 / 任务不存在 / provider 不可解析） */
  error: number
  /** 保持 generating（网关查询失败或任务仍在跑，下次启动再试） */
  kept: number
}

interface RecoverableRow {
  kind: 'storyboard' | 'segment'
  id: string
  providerTaskId: string | null
  providerConfigId: string | null
  videoMode: string | null
}

function emptyStats(): RecoveryStats {
  return { completed: 0, error: 0, kept: 0 }
}

/** 把网关相对下载路径拼成完整 URL（与 comfyui-video.provider.absoluteFileUrl 同构） */
function absoluteGatewayFileUrl(baseUrl: string, urlOrPath: string): string {
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath
  return `${baseUrl.replace(/\/+$/, '')}/${urlOrPath.replace(/^\/+/, '')}`
}

/** 复位单行为 error（原 H5 前语义）。storyboards 表无 error 列，原因只进日志。 */
async function resetRowToError(row: RecoverableRow, reason: string): Promise<void> {
  const db = getCoreDatabaseManager()
  const now = new Date()
  if (row.kind === 'storyboard') {
    await db.dataSource!.getRepository(StoryboardEntity)
      .update({ id: row.id } as any, { status: 'error', updatedAt: now } as any)
  } else {
    await db.dataSource!.getRepository(EpVideoSegmentEntity)
      .update({ id: row.id } as any, { status: 'error', error: reason, updatedAt: now } as any)
  }
  console.log(`[EpStartupRecovery] ${row.kind} ${row.id} → error（${reason}）`)
}

/** 网关任务已完成：下载产物落盘 + 行转 completed */
async function completeRowFromGateway(
  row: RecoverableRow,
  providerConfigId: string,
  videoUrl: string,
): Promise<void> {
  const db = getCoreDatabaseManager()
  const now = new Date()
  const videoPath = await downloadVideoToLocal(videoUrl)
  if (row.kind === 'storyboard') {
    await db.dataSource!.getRepository(StoryboardEntity).update({ id: row.id } as any, {
      status: 'completed',
      videoPath,
      // H3 为参考图生视频（refs 必填），恢复完成的 mode 恒为 image2video
      videoMode: row.videoMode ?? 'image2video',
      videoProviderId: providerConfigId,
      updatedAt: now,
    } as any)
  } else {
    await db.dataSource!.getRepository(EpVideoSegmentEntity).update({ id: row.id } as any, {
      status: 'completed',
      videoPath,
      videoMode: row.videoMode ?? 'image2video',
      providerId: providerConfigId,
      error: null,
      updatedAt: now,
    } as any)
  }
  console.log(
    `[EpStartupRecovery] ${row.kind} ${row.id} 任务 ${row.providerTaskId} 网关已完成，下载落库 → completed（video_path=${videoPath}）`,
  )
}

/**
 * 单行恢复判定：
 *   无 taskId / provider 非 comfyui 网关 → error（原逻辑）
 *   网关 done+url → 下载转 completed；done 无 url / 下载失败 → kept（下次再试）
 *   网关 error → error；404（任务不存在）→ error
 *   查询失败（网关没起/超时/非 404 HTTP 错/响应非法）→ kept
 *   running/pending → kept
 */
async function recoverOneRow(row: RecoverableRow, stats: RecoveryStats): Promise<void> {
  const db = getCoreDatabaseManager()
  if (!row.providerTaskId) {
    await resetRowToError(row, '进程重启时处于 generating 且无 provider_task_id，无法回查远端任务')
    stats.error++
    return
  }

  // 解析 provider config：只认 comfyui 网关（其他 provider 的任务协议未接入恢复）
  const cfg = row.providerConfigId
    ? await db.providerConfigs?.getById(row.providerConfigId).catch(() => null)
    : null
  if (!cfg || cfg.templateId !== 'comfyui') {
    await resetRowToError(
      row,
      `provider_task_id=${row.providerTaskId} 但 provider 非 comfyui 网关或配置已删除，无法回查`,
    )
    stats.error++
    return
  }
  const baseUrl = cfg.videoBaseUrl || cfg.baseUrl || COMFYUI_DEFAULT_BASE_URL

  let resp: Response
  try {
    resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/task/${encodeURIComponent(row.providerTaskId)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(GATEWAY_QUERY_TIMEOUT_MS),
    })
  } catch (e) {
    console.log(
      `[EpStartupRecovery] ${row.kind} ${row.id} 任务 ${row.providerTaskId} 网关查询失败（保持 generating，下次启动再试）:`,
      e instanceof Error ? e.message : e,
    )
    stats.kept++
    return
  }

  if (resp.status === 404) {
    await resetRowToError(row, `网关任务 ${row.providerTaskId} 不存在（404）`)
    stats.error++
    return
  }
  if (!resp.ok) {
    console.log(
      `[EpStartupRecovery] ${row.kind} ${row.id} 任务 ${row.providerTaskId} 网关返回 HTTP ${resp.status}（保持 generating，下次启动再试）`,
    )
    stats.kept++
    return
  }

  let data: GatewayTaskResponse
  try {
    data = JSON.parse(await resp.text())
  } catch {
    console.log(
      `[EpStartupRecovery] ${row.kind} ${row.id} 任务 ${row.providerTaskId} 网关响应非法（保持 generating，下次启动再试）`,
    )
    stats.kept++
    return
  }

  if (data.status === 'done' && data.url) {
    try {
      await completeRowFromGateway(row, cfg.id, absoluteGatewayFileUrl(baseUrl, data.url))
      stats.completed++
    } catch (e) {
      console.log(
        `[EpStartupRecovery] ${row.kind} ${row.id} 任务 ${row.providerTaskId} 产物下载失败（保持 generating，下次启动再试）:`,
        e instanceof Error ? e.message : e,
      )
      stats.kept++
    }
    return
  }
  if (data.status === 'error') {
    await resetRowToError(row, `网关任务 ${row.providerTaskId} 失败：${data.error ?? '未知错误'}`)
    stats.error++
    return
  }
  // running / pending / done 但缺 url → 任务仍在跑或产物不可达，保持 generating
  console.log(
    `[EpStartupRecovery] ${row.kind} ${row.id} 任务 ${row.providerTaskId} 网关状态 ${data.status ?? '未知'}（保持 generating，下次启动再试）`,
  )
  stats.kept++
}

/**
 * DB 中间态恢复（全局维护，不带租户过滤——见模块头注释）。
 * H5 起逐行判定：有 provider_task_id 的 comfyui 网关任务先回查终态再收敛。
 */
async function resetStuckGeneratingStates(): Promise<{ storyboards: RecoveryStats; segments: RecoveryStats }> {
  const db = getCoreDatabaseManager()
  const stats = { storyboards: emptyStats(), segments: emptyStats() }
  if (!db.dataSource) return stats

  const sbRows = await db.dataSource
    .getRepository(StoryboardEntity)
    .find({ where: { status: 'generating' } as any })
  for (const sb of sbRows) {
    await recoverOneRow(
      {
        kind: 'storyboard',
        id: sb.id,
        providerTaskId: sb.providerTaskId ?? null,
        providerConfigId: sb.videoProviderId ?? null,
        videoMode: sb.videoMode ?? null,
      },
      stats.storyboards,
    ).catch((e) => {
      console.log(`[EpStartupRecovery] storyboard ${sb.id} 恢复异常（跳过）:`, e)
      stats.storyboards.kept++
    })
  }

  const segRows = await db.dataSource
    .getRepository(EpVideoSegmentEntity)
    .find({ where: { status: 'generating' } as any })
  for (const seg of segRows) {
    await recoverOneRow(
      {
        kind: 'segment',
        id: seg.id,
        providerTaskId: seg.providerTaskId ?? null,
        providerConfigId: seg.providerId ?? null,
        videoMode: seg.videoMode ?? null,
      },
      stats.segments,
    ).catch((e) => {
      console.log(`[EpStartupRecovery] segment ${seg.id} 恢复异常（跳过）:`, e)
      stats.segments.kept++
    })
  }

  return stats
}

function formatStats(s: RecoveryStats): string {
  return `completed=${s.completed} error=${s.error} kept=${s.kept}`
}

/**
 * 启动恢复入口（fire-and-forget，调用方不 await）。
 */
export async function runEpisodeProductionStartupRecovery(): Promise<void> {
  try {
    const stats = await resetStuckGeneratingStates()
    const total = stats.storyboards.completed + stats.storyboards.error + stats.storyboards.kept
      + stats.segments.completed + stats.segments.error + stats.segments.kept
    if (total > 0) {
      logger.warn(
        `启动恢复：storyboard(${formatStats(stats.storyboards)}) segment(${formatStats(stats.segments)})`,
      )
    }
  } catch (e) {
    logger.warn('启动恢复：DB 中间态复位失败（跳过）:', e)
  }
  try {
    const removed = sweepTempDirs()
    if (removed.length > 0) {
      logger.info(`启动恢复：清扫超龄 temp session：${JSON.stringify(removed)}`)
    }
  } catch (e) {
    logger.warn('启动恢复：temp 目录清扫失败（跳过）:', e)
  }
}
