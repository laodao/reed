/**
 * 平台事件保留与归档作业（10-event-system §6.1 [archived] / §7.10 / §12.2）
 * @module core/services/event-system/event-archive.service
 * @description 每日扫描（setInterval ticker，与审核超时 ticker 同款基建；量级千条/日无需 cron 库）：
 *              超保留期且 seq < min(所有游标.last_seq) 的事件 → 导出 JSONL.gz → 删行。
 *
 * 安全约束（§7.10）：
 * - 只清理所有消费者游标均已越过的 seq，保证未消费事件不被清掉；
 * - 导出先于删除（文件落盘成功才删行）；
 * - 删除前在事务内重读游标下界——期间新建的游标（last_seq=0）或 requeue 回拨
 *   会把下界拉低，只删仍安全的部分，本轮即停（剩余下轮重新评估）。
 *   已导出但未删除的事件下轮会重复导出（跨文件冗余），归档仅供审计，可接受。
 * - 无任何游标时保守跳过：未来 startFrom='earliest' 的新消费者可能依赖历史。
 *
 * 默认策略（§12.2 已定）：通用 90 天；人工/挂起类（workflow.run.review-*）全量保留。
 * 归档目录：Electron = <数据根>/event-archives；Web = <rootDataPath>/event-archives
 * （系统级跨租户归档不能落 Web 的按用户隔离目录）。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { gzipSync } from 'node:zlib'
import type { DataSource } from 'typeorm'
import type { PlatformEvent } from '@shared/types/event.types'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { PlatformEventRepository } from '@core/database/repositories/platform-event.repository'
import { getPathProvider } from '@core/interfaces/path.interface'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('EventArchive')

/** 通用保留期（§12.2 已定：默认 90 天） */
export const DEFAULT_EVENT_RETENTION_DAYS = 90
/** 全量保留类型（§12.2 已定：人工/挂起类 run 事件永不归档） */
export const DEFAULT_KEEP_FOREVER_PATTERNS = ['workflow.run.review-*']
/** 归档作业间隔（每日） */
const DEFAULT_ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000
/** 单批导出/删除大小 */
const DEFAULT_ARCHIVE_BATCH_SIZE = 1000

export interface EventArchiveOptions {
  /** 归档目录（缺省按运行端推导，见文件头；测试注入临时目录） */
  archiveDir?: string
  /** 通用保留天数（默认 90） */
  retentionDays?: number
  /** 全量保留类型模式（默认 ['workflow.run.review-*']） */
  keepForeverPatterns?: string[]
  /** 作业间隔（默认 24h；测试注入缩短） */
  intervalMs?: number
  batchSize?: number
  /** 测试注入时钟 */
  now?: () => number
  /** 测试竞态钩子（§7.10）：导出后、删除前调用（可在此期间新建游标/回拨） */
  beforeDelete?: (batch: PlatformEvent[]) => Promise<void>
}

export interface EventArchiveSummary {
  /** 实际删除行数 */
  archived: number
  /** 本轮写出的归档文件 */
  files: string[]
  /** 无任何游标 → 保守跳过（见文件头） */
  skippedNoCursors: boolean
}

export class EventArchiveService {
  private readonly repo: PlatformEventRepository
  private readonly archiveDir?: string
  private readonly retentionDays: number
  private readonly keepForeverPatterns: string[]
  private readonly intervalMs: number
  private readonly batchSize: number
  private readonly now: () => number
  private readonly beforeDelete?: (batch: PlatformEvent[]) => Promise<void>

  private timer: ReturnType<typeof setInterval> | null = null
  /** 防重入：在途作业（兜底扫描与手动触发共用） */
  private runningJob: Promise<EventArchiveSummary> | null = null

  constructor(
    private readonly dataSource: DataSource,
    opts: EventArchiveOptions = {}
  ) {
    this.repo = new PlatformEventRepository(dataSource)
    this.archiveDir = opts.archiveDir
    this.retentionDays = opts.retentionDays ?? DEFAULT_EVENT_RETENTION_DAYS
    this.keepForeverPatterns = opts.keepForeverPatterns ?? DEFAULT_KEEP_FOREVER_PATTERNS
    this.intervalMs = opts.intervalMs ?? DEFAULT_ARCHIVE_INTERVAL_MS
    this.batchSize = opts.batchSize ?? DEFAULT_ARCHIVE_BATCH_SIZE
    this.now = opts.now ?? Date.now
    this.beforeDelete = opts.beforeDelete
  }

  /** 启动定时归档（幂等）。不在 boot 时立即跑——避免拖慢启动，首个周期后执行 */
  start(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => {
      void this.runArchiveOnce().catch(e =>
        logger.error('[EventArchive] 归档作业失败（下轮继续）', e)
      )
    }, this.intervalMs)
    this.timer.unref?.()
    logger.info(
      `[EventArchive] 归档作业已启动（间隔 ${this.intervalMs}ms，保留 ${this.retentionDays} 天，` +
        `全量保留：${this.keepForeverPatterns.join(', ') || '无'}）`
    )
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  /** 手动/定时触发一轮归档（防重入：在途时返回同一 Promise） */
  runArchiveOnce(): Promise<EventArchiveSummary> {
    if (!this.runningJob) {
      this.runningJob = this.doArchive().finally(() => {
        this.runningJob = null
      })
    }
    return this.runningJob
  }

  private async doArchive(): Promise<EventArchiveSummary> {
    const bound = await this.repo.getMinCursorLastSeq()
    if (bound === null) {
      // 无游标 → 保守不归档（未来 earliest 消费者可能依赖历史，§7.10）
      return { archived: 0, files: [], skippedNoCursors: true }
    }
    const cutoff = new Date(this.now() - this.retentionDays * 86_400_000)
    const dir = this.resolveArchiveDir()
    const files: string[] = []
    let archived = 0

    for (;;) {
      const batch = await this.repo.findArchivableEvents(
        bound,
        cutoff,
        this.keepForeverPatterns,
        this.batchSize
      )
      if (batch.length === 0) break
      const events = batch.map(e => this.repo.toPlatformEvent(e))

      // 1) 先导出（文件落盘成功才删行）
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, this.archiveFileName(events))
      const jsonl = events.map(e => JSON.stringify(e)).join('\n') + '\n'
      fs.writeFileSync(file, gzipSync(Buffer.from(jsonl, 'utf8')))
      files.push(file)

      // 2) 竞态守卫（§7.10）：删除前事务内重读游标下界，只删仍安全的部分
      await this.beforeDelete?.(events)
      const deleted = await this.dataSource.transaction(async manager => {
        const rebound = await this.repo.getMinCursorLastSeq(manager)
        const safeBound = Math.min(bound, rebound ?? 0)
        const deletable = events.filter(e => e.seq < safeBound).map(e => e.seq)
        return await this.repo.deleteEventsBySeqs(deletable, manager)
      })
      archived += deleted
      // 下界收紧（本轮有未删部分）→ 停止，下轮重新评估
      if (deleted < events.length) break
      if (batch.length < this.batchSize) break
    }

    if (archived > 0) {
      logger.info(`[EventArchive] 归档 ${archived} 条事件 → ${files.join(', ')}`)
    }
    return { archived, files, skippedNoCursors: false }
  }

  /** 归档文件名：platform-events-<首seq>-<末seq>-<时间戳>.jsonl.gz */
  private archiveFileName(events: PlatformEvent[]): string {
    const ts = new Date(this.now()).toISOString().replace(/[:.]/g, '-')
    return `platform-events-${events[0].seq}-${events[events.length - 1].seq}-${ts}.jsonl.gz`
  }

  private resolveArchiveDir(): string {
    if (this.archiveDir) return this.archiveDir
    const provider = getPathProvider()
    // Electron 端 getAppDataPath() 是 OS 级目录（~/.config 等），归档属应用数据 → 数据根目录；
    // Web 端 getDataPath() 按 ALS 用户隔离，系统级归档不能落单租户目录 → getAppDataPath()=rootDataPath
    const base = process.versions?.electron ? provider.getDataPath() : provider.getAppDataPath()
    return path.join(base, 'event-archives')
  }
}

// ─── 单例（boot 装配取用，与事件总线同生命周期） ─────────────────────────────

let singleton: EventArchiveService | null = null

/**
 * 启动归档作业单例（幂等）。数据源未就绪返回 null（基础设施不阻断应用启动）。
 * 与事件总线同为平台级底座，boot 装配借道 workflow-boot 双端共用入口。
 */
export function startEventArchiveJob(opts?: EventArchiveOptions): EventArchiveService | null {
  // 已有单例：start 幂等——覆盖"reset 停表 → 再次 boot"场景（timer 重建）
  if (singleton) {
    singleton.start()
    return singleton
  }
  const ds = getCoreDatabaseManager().dataSource
  if (!ds) {
    logger.warn('[EventArchive] 数据源未就绪，归档作业未启动')
    return null
  }
  singleton = new EventArchiveService(ds, opts)
  singleton.start()
  return singleton
}

/** 关停单例（应用退出/测试用） */
export function stopEventArchiveJob(): void {
  singleton?.stop()
  singleton = null
}
