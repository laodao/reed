/**
 * 剧集制作启动恢复（复核修复 P1-9/10）
 * @module platform/episode-production/startup-recovery
 *
 * 解决两类"中间态无 owner"问题：
 * 1. DB 状态卡死：视频/片段生成中途进程崩溃 → storyboard / ep_video_segments
 *    永久停在 generating，UI 无法判断可重试。启动时统一复位为 error（远端任务
 *    若仍在跑，产物也不会有人落库，按失败收敛让用户重试是唯一诚实终态）。
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
import { createLogger } from '@core/utils/logger'

const logger = createLogger('EpStartupRecovery')

/** temp session 目录的最大保留时长 */
const TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000

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

/** DB 中间态复位：generating → error（全局维护，不带租户过滤——见模块头注释） */
async function resetStuckGeneratingStates(): Promise<{ storyboards: number; segments: number }> {
  const db = getCoreDatabaseManager()
  if (!db.dataSource) return { storyboards: 0, segments: 0 }
  const now = new Date()
  const storyboards = await db.dataSource
    .getRepository(StoryboardEntity)
    .update({ status: 'generating' } as any, { status: 'error', updatedAt: now } as any)
    .then((r) => r.affected ?? 0)
  const segments = await db.dataSource
    .getRepository(EpVideoSegmentEntity)
    .update({ status: 'generating' } as any, { status: 'error', updatedAt: now } as any)
    .then((r) => r.affected ?? 0)
  return { storyboards, segments }
}

/**
 * 启动恢复入口（fire-and-forget，调用方不 await）。
 */
export async function runEpisodeProductionStartupRecovery(): Promise<void> {
  try {
    const stuck = await resetStuckGeneratingStates()
    if (stuck.storyboards > 0 || stuck.segments > 0) {
      logger.warn(
        `启动恢复：复位卡死中间态 storyboard=${stuck.storyboards} segment=${stuck.segments}（generating → error）`,
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
