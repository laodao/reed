/**
 * 知识大脑·实体仓库（kb_entities 表）
 * @module database/repositories/kb-entity.repository
 */
import { In, type DataSource, type FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbEntityEntity } from '../entities/kb-brain/kb-entity.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface KbEntityRecord {
  id: string
  userId: string | null
  knowledgeBaseId: string
  name: string
  aliases: string[]
  entityType: string
  summary: string | null
  summaryStatus: 'pending' | 'done' | 'failed'
  status: 'active' | 'merged'
  targetEntityId: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

export interface KbEntityMentionInput {
  name: string
  type: string
  aliases?: string[]
}

export class KbEntityRepository extends BaseRepository<KbEntityEntity, KbEntityRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbEntityEntity)
  }

  protected toDto(e: KbEntityEntity): KbEntityRecord {
    return {
      id: e.id,
      userId: e.userId,
      knowledgeBaseId: e.knowledgeBaseId,
      name: e.name,
      aliases: safeParseArray(e.aliases),
      entityType: e.entityType,
      summary: e.summary ?? null,
      summaryStatus: e.summaryStatus,
      status: e.status,
      targetEntityId: e.targetEntityId ?? null,
      createdAt: e.createdAt ?? null,
      updatedAt: e.updatedAt ?? null,
    }
  }

  async findById(id: string): Promise<KbEntityRecord | null> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbEntityEntity>)
    return row ? this.toDto(row) : null
  }

  /** 规范名/别名双路查找（仅 active 实体） */
  async findByName(kbId: string, names: string[]): Promise<KbEntityRecord[]> {
    if (names.length === 0) return []
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId, name: In(names) } as FindOptionsWhere<KbEntityEntity>,
    })
    const byName = new Map(rows.map((r) => [r.name, r]))
    const missing = names.filter((n) => !byName.has(n))
    if (missing.length > 0) {
      // 别名回查：mention 用了别名也能归并到规范实体
      const aliasRows = await this.scoped
        .qb('e')
        .where('e.knowledge_base_id = :kbId', { kbId })
        .andWhere(`e.aliases LIKE ${this.dataSource.options.type === 'postgres' ? 'ANY(:names2)' : ':names2'}`, {
          names2: `%${missing[0]}%`,
        })
        .getMany()
      for (const r of aliasRows) if (!byName.has(r.name)) byName.set(r.name, r)
    }
    return [...byName.values()].map((r) => this.toDto(r))
  }

  /**
   * mention 上翻为实体：找到（规范名或别名命中）即返回并合并别名；
   * 找不到建新行。UNIQUE(kb_id, name) 冲突按已存在行处理（并发安全兜底）。
   */
  async upsertMention(kbId: string, mention: KbEntityMentionInput): Promise<KbEntityRecord> {
    const name = mention.name.trim()
    const existing = await this.scoped.findOne({ knowledgeBaseId: kbId, name } as FindOptionsWhere<KbEntityEntity>)
    const now = new Date()
    if (existing) {
      const merged = mergeAliases(existing.aliases, mention.aliases ?? [])
      const typeChanged = existing.entityType !== mention.type && existing.entityType === 'concept'
      if (merged !== existing.aliases || typeChanged) {
        existing.aliases = merged
        if (typeChanged) existing.entityType = mention.type
        existing.updatedAt = now
        await this.scoped.save(existing)
      }
      return this.toDto(existing)
    }
    const e = new KbEntityEntity()
    e.id = randomUUID()
    e.userId = getCurrentUserId()
    e.knowledgeBaseId = kbId
    e.name = name
    e.aliases = JSON.stringify(mention.aliases ?? [])
    e.entityType = mention.type
    e.summary = null
    e.summaryStatus = 'pending'
    e.status = 'active'
    e.createdAt = now
    e.updatedAt = now
    try {
      await this.scoped.save(e)
      return this.toDto(e)
    } catch {
      // 并发下唯一键冲突：读回已存在行
      const raced = await this.scoped.findOne({
        knowledgeBaseId: kbId,
        name,
      } as FindOptionsWhere<KbEntityEntity>)
      if (raced) return this.toDto(raced)
      throw new Error(`[kb-entity] upsertMention 失败且无已存在行: ${name}`)
    }
  }

  /**
   * 实体合并（消歧）实体侧：from 并入 to——别名吸收 + from 置 merged。
   * 边端点与论断挂点的改指由调用方协调：edges.redirectNode + atoms 侧更新，
   * 不在此越表操作。
   */
  async merge(fromId: string, toId: string): Promise<void> {
    const now = new Date()
    const from = await this.scoped.findOne({ id: fromId } as FindOptionsWhere<KbEntityEntity>)
    const to = await this.scoped.findOne({ id: toId } as FindOptionsWhere<KbEntityEntity>)
    if (!from || !to) throw new Error(`[kb-entity] merge 目标不存在: ${fromId} → ${toId}`)
    to.aliases = mergeAliases(to.aliases, [from.name, ...safeParseArray(from.aliases)])
    to.updatedAt = now
    await this.scoped.save(to)
    from.status = 'merged'
    from.targetEntityId = toId
    from.updatedAt = now
    await this.scoped.save(from)
  }

  async replaceSummary(id: string, summary: string, status: 'done' | 'failed'): Promise<void> {
    await this.scoped.update(
      { id } as FindOptionsWhere<KbEntityEntity>,
      { summary, summaryStatus: status, updatedAt: new Date() } as never,
    )
  }

  async pendingSummaries(kbId: string, limit: number): Promise<KbEntityRecord[]> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId, summaryStatus: 'pending' } as FindOptionsWhere<KbEntityEntity>,
      take: limit,
    })
    return this.toDtoList(rows)
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as FindOptionsWhere<KbEntityEntity>)
  }
}

function safeParseArray(raw: string | null): string[] {
  try {
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function mergeAliases(raw: string | null, incoming: string[]): string {
  const set = new Set(safeParseArray(raw))
  for (const a of incoming) {
    const t = a?.trim()
    if (t) set.add(t)
  }
  return JSON.stringify([...set])
}
