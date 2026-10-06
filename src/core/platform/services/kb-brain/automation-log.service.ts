/**
 * 自动化动作日志与撤销（v2 P4）：最近动作时间线 + undo（归档该批产物卡）
 * @module platform/services/kb-brain/automation-log.service
 *
 * 信任 UX：后台自动化可查可撤销。undo 语义：归档 detail.noteIds 列出的卡
 * （演进过的卡不回滚版本，只下架）；undone 置位后不可重复撤销。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbAutomationLogRepository, KbAutomationLogRecord } from '@core/database/repositories/kb-automation-log.repository'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'

const logger = createLogger('KbAutomationLog')

interface LogRepos {
  logs: KbAutomationLogRepository
  notes: KbNoteRepository
}

export interface AutomationLogDeps {
  repos?: () => LogRepos | null
}

export class KbAutomationLogService {
  private readonly reposFn: () => LogRepos | null

  constructor(deps: AutomationLogDeps = {}) {
    this.reposFn =
      deps.repos ??
      ((): LogRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbAutomationLogs || !db.kbNotes) return null
        return { logs: db.kbAutomationLogs, notes: db.kbNotes }
      })
  }

  /** 动作落账（automation 各步骤在产物产出后调用；detail.noteIds=撤销依据） */
  async record(kbId: string, action: string, detail: Record<string, unknown>): Promise<KbAutomationLogRecord | null> {
    const repos = this.reposFn()
    if (!repos) return null
    return repos.logs.record(kbId, action, detail)
  }

  /** 面板时间线（最近动作 + 是否可撤销） */
  async listRecent(kbId: string, limit = 10): Promise<Array<KbAutomationLogRecord & { noteCount: number; undoable: boolean }>> {
    const repos = this.reposFn()
    if (!repos) return []
    const rows = await repos.logs.listRecent(kbId, limit)
    return rows.map((r) => {
      const noteIds = parseNoteIds(r)
      return { ...r, noteCount: noteIds.length, undoable: !r.undone && noteIds.length > 0 }
    })
  }

  /** 撤销：归档该动作产出的卡（不可逆操作只做下架，可人工恢复） */
  async undo(logId: string): Promise<{ ok: boolean; archived: number; error?: string }> {
    const repos = this.reposFn()
    if (!repos) return { ok: false, archived: 0, error: '日志仓储未装配' }
    const log = await repos.logs.findById(logId)
    if (!log) return { ok: false, archived: 0, error: '日志不存在' }
    if (log.undone) return { ok: false, archived: 0, error: '该动作已撤销过' }
    const noteIds = parseNoteIds(log)
    if (noteIds.length === 0) return { ok: false, archived: 0, error: '该动作没有可撤销的产物' }
    let archived = 0
    for (const id of noteIds) {
      try {
        const rejected = await repos.notes.reject(id)
        if (rejected) archived += 1
      } catch {
        /* 单卡失败继续（可能已被人工处理） */
      }
    }
    await repos.logs.markUndone(logId)
    logger.info(`[kb-auto-log] 撤销 ${log.action}（${log.id}）：归档 ${archived}/${noteIds.length} 张卡`)
    return { ok: true, archived }
  }
}

function parseNoteIds(log: KbAutomationLogRecord): string[] {
  try {
    const detail = JSON.parse(log.detailJson ?? '{}') as { noteIds?: unknown }
    return Array.isArray(detail.noteIds) ? detail.noteIds.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

let singleton: KbAutomationLogService | null = null

export function getKbAutomationLogService(): KbAutomationLogService {
  if (!singleton) singleton = new KbAutomationLogService()
  return singleton
}
