/**
 * 知识大脑·提炼维度仓库（kb_dimensions 表，v3 M1）
 * @module database/repositories/kb-dimension.repository
 *
 * 多租户：继承 BaseRepository，user_id 自动注入。
 */
import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbDimensionEntity } from '../entities/kb-brain/kb-dimension.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface KbDimensionRecord {
  id: string
  userId: string | null
  knowledgeBaseId: string
  name: string
  definition: string
  hint: string
  enabled: boolean
  source: 'seed' | 'induced' | 'human'
  createdAt: Date | null
  updatedAt: Date | null
}

export interface KbDimensionInput {
  id?: string
  name: string
  definition?: string
  hint?: string
  enabled?: boolean
  source?: 'seed' | 'induced' | 'human'
}

export class KbDimensionRepository extends BaseRepository<KbDimensionEntity, KbDimensionRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbDimensionEntity)
  }

  protected toDto(e: KbDimensionEntity): KbDimensionRecord {
    return {
      id: e.id,
      userId: e.userId,
      knowledgeBaseId: e.knowledgeBaseId,
      name: e.name,
      definition: e.definition ?? '',
      hint: e.hint ?? '',
      enabled: e.enabled === 1,
      source: (e.source ?? 'seed') as KbDimensionRecord['source'],
      createdAt: e.createdAt ?? null,
      updatedAt: e.updatedAt ?? null,
    }
  }

  async listAll(kbId: string): Promise<KbDimensionRecord[]> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId } as FindOptionsWhere<KbDimensionEntity>,
      order: { createdAt: 'ASC' } as never,
    })
    return this.toDtoList(rows)
  }

  async listEnabled(kbId: string): Promise<KbDimensionRecord[]> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId, enabled: 1 } as FindOptionsWhere<KbDimensionEntity>,
      order: { createdAt: 'ASC' } as never,
    })
    return this.toDtoList(rows)
  }

  /** 按名取（维度去重判据：同库同名不重复） */
  async findByName(kbId: string, name: string): Promise<KbDimensionRecord | null> {
    const row = await this.scoped.findOne({ knowledgeBaseId: kbId, name } as FindOptionsWhere<KbDimensionEntity>)
    return row ? this.toDto(row) : null
  }

  /** 插入（同名幂等跳过）。返回是否实际新建。 */
  async insertIfAbsent(kbId: string, input: KbDimensionInput): Promise<boolean> {
    if (await this.findByName(kbId, input.name)) return false
    const e = new KbDimensionEntity()
    e.id = input.id ?? randomUUID()
    e.userId = getCurrentUserId()
    e.knowledgeBaseId = kbId
    e.name = input.name
    e.definition = input.definition ?? ''
    e.hint = input.hint ?? ''
    e.enabled = input.enabled === false ? 0 : 1
    e.source = input.source ?? 'seed'
    const now = new Date()
    e.createdAt = now
    e.updatedAt = now
    try {
      await this.scoped.save(e)
      return true
    } catch {
      // 并发同名：唯一索引兜底，幂等跳过
      return false
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbDimensionEntity>)
    if (!row) return false
    row.enabled = enabled ? 1 : 0
    row.updatedAt = new Date()
    await this.scoped.save(row)
    return true
  }
}
