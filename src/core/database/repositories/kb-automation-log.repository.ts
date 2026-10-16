/**
 * 知识大脑·自动化动作日志仓库（kb_automation_log，v2 P4）
 * @module database/repositories/kb-automation-log.repository
 *
 * undo 语义：undone=1 后不再重复撤销；detail.noteIds 为该动作产出的卡
 * （undo = 归档这批卡——演进过的卡不回滚版本，只下架）。
 */
import { type DataSource, type FindOptionsWhere, LessThan } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbAutomationLogEntity } from '../entities/kb-brain/kb-automation-log.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface KbAutomationLogRecord {
  id: string
  kbId: string
  action: string
  detailJson: string | null
  undone: boolean
  createdAt: Date | null
}

export class KbAutomationLogRepository extends BaseRepository<KbAutomationLogEntity, KbAutomationLogRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbAutomationLogEntity)
  }

  protected toDto(e: KbAutomationLogEntity): KbAutomationLogRecord {
    return {
      id: e.id,
      kbId: e.kbId,
      action: e.action,
      detailJson: e.detailJson ?? null,
      undone: e.undone === 1,
      createdAt: e.createdAt ?? null,
    }
  }

  async record(kbId: string, action: string, detail: Record<string, unknown>): Promise<KbAutomationLogRecord> {
    const now = new Date()
    const e = new KbAutomationLogEntity()
    e.id = randomUUID()
    e.userId = getCurrentUserId()
    e.kbId = kbId
    e.action = action
    e.detailJson = JSON.stringify(detail)
    e.undone = 0
    e.createdAt = now
    await this.scoped.save(e)
    return this.toDto(e)
  }

  async listRecent(kbId: string, limit: number): Promise<KbAutomationLogRecord[]> {
    const rows = await this.scoped
      .qb('l')
      .where('l.kb_id = :kbId', { kbId })
      .orderBy('l.created_at', 'DESC')
      .take(limit)
      .getMany()
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<KbAutomationLogRecord | null> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbAutomationLogEntity>)
    return row ? this.toDto(row) : null
  }

  async markUndone(id: string): Promise<void> {
    await this.scoped.update(
      { id } as FindOptionsWhere<KbAutomationLogEntity>,
      { undone: 1 } as never,
    )
  }

  async pruneOlderThan(cutoff: Date): Promise<void> {
    await this.scoped.delete({ createdAt: LessThan(cutoff) } as FindOptionsWhere<KbAutomationLogEntity>)
  }
}
