/**
 * 知识大脑·质检日志仓库（kb_qa_log，v2 P4）
 * @module database/repositories/kb-qa-log.repository
 */
import { type DataSource, type FindOptionsWhere, LessThan } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbQaLogEntity } from '../entities/kb-brain/kb-qa-log.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface KbQaLogRecord {
  id: string
  kbId: string
  noteId: string
  score: number
  reason: string | null
  createdAt: Date | null
}

export class KbQaLogRepository extends BaseRepository<KbQaLogEntity, KbQaLogRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbQaLogEntity)
  }

  protected toDto(e: KbQaLogEntity): KbQaLogRecord {
    return {
      id: e.id,
      kbId: e.kbId,
      noteId: e.noteId,
      score: e.score,
      reason: e.reason ?? null,
      createdAt: e.createdAt ?? null,
    }
  }

  async insertBatch(rows: Array<{ kbId: string; noteId: string; score: number; reason: string }>): Promise<number> {
    if (rows.length === 0) return 0
    const now = new Date()
    const userId = getCurrentUserId()
    await this.scoped.saveMany(
      rows.map((r) => {
        const e = new KbQaLogEntity()
        e.id = randomUUID()
        e.userId = userId
        e.kbId = r.kbId
        e.noteId = r.noteId
        e.score = r.score
        e.reason = r.reason ?? null
        e.createdAt = now
        return e
      }),
    )
    return rows.length
  }

  /** 滚动窗口均分（质量门数据源：近 N 次抽检的均值） */
  async recentScores(kbId: string, limit: number): Promise<number[]> {
    const rows = await this.scoped
      .qb('q')
      .where('q.kb_id = :kbId', { kbId })
      .orderBy('q.created_at', 'DESC')
      .take(limit)
      .getMany()
    return rows.map((r) => r.score)
  }

  /** 近期已抽过的卡 id（按时间倒序去重）——抽样轮换依据：避免同一批卡反复白烧 judge（10-07 H2 饥饿） */
  async recentNoteIds(kbId: string, limit: number): Promise<string[]> {
    const rows = await this.scoped
      .qb('q')
      .where('q.kb_id = :kbId', { kbId })
      .orderBy('q.created_at', 'DESC')
      .take(limit)
      .getMany()
    return [...new Set(rows.map((r) => r.noteId))]
  }

  /** 按时间裁剪（日志体积护栏：只留近 N 天） */
  async pruneOlderThan(cutoff: Date): Promise<void> {
    await this.scoped.delete({ createdAt: LessThan(cutoff) } as FindOptionsWhere<KbQaLogEntity>)
  }
}
