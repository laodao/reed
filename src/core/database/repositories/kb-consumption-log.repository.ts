/**
 * 知识大脑·消费记账仓库（kb_consumption_log 表，v3 M3）
 * @module database/repositories/kb-consumption-log.repository
 */
import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbConsumptionLogEntity } from '../entities/kb-brain/kb-consumption-log.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface KbConsumptionRecord {
  id: string
  userId: string | null
  knowledgeBaseId: string
  tool: string
  mode: string
  sceneType: string | null
  taskExcerpt: string
  packChars: number
  createdAt: Date | null
}

export interface KbConsumptionInput {
  knowledgeBaseId: string
  tool: string
  mode: string
  sceneType?: string | null
  taskExcerpt?: string
  packChars?: number
}

export class KbConsumptionLogRepository extends BaseRepository<KbConsumptionLogEntity, KbConsumptionRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbConsumptionLogEntity)
  }

  protected toDto(e: KbConsumptionLogEntity): KbConsumptionRecord {
    return {
      id: e.id,
      userId: e.userId,
      knowledgeBaseId: e.knowledgeBaseId,
      tool: e.tool,
      mode: e.mode,
      sceneType: e.sceneType ?? null,
      taskExcerpt: e.taskExcerpt ?? '',
      packChars: e.packChars ?? 0,
      createdAt: e.createdAt ?? null,
    }
  }

  /** 记一笔（fail-soft：记账失败不抛——消费主链路优先） */
  async record(input: KbConsumptionInput): Promise<void> {
    const e = new KbConsumptionLogEntity()
    e.id = randomUUID()
    e.userId = getCurrentUserId()
    e.knowledgeBaseId = input.knowledgeBaseId
    e.tool = input.tool
    e.mode = input.mode
    e.sceneType = input.sceneType ?? null
    e.taskExcerpt = (input.taskExcerpt ?? '').slice(0, 120)
    e.packChars = input.packChars ?? 0
    e.createdAt = new Date()
    try {
      await this.scoped.save(e)
    } catch {
      /* 记账失败静默（仪表尽力而为） */
    }
  }

  /** 近 N 条（仪表/验收证据） */
  async listRecent(kbId: string, limit = 50): Promise<KbConsumptionRecord[]> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId } as FindOptionsWhere<KbConsumptionLogEntity>,
      order: { createdAt: 'DESC' } as never,
      take: limit,
    })
    return this.toDtoList(rows)
  }

  /** 计数（按通路分组；消化率仪表「被 agent 用了多少」数据源） */
  async countByTool(kbId: string): Promise<Record<string, number>> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId } as FindOptionsWhere<KbConsumptionLogEntity>,
    })
    const out: Record<string, number> = {}
    for (const r of rows) out[r.tool] = (out[r.tool] ?? 0) + 1
    return out
  }
}
