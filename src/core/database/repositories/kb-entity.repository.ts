/**
 * 知识大脑·实体仓库（kb_entities 表）
 * @module database/repositories/kb-entity.repository
 */
import { In, Not, type DataSource, type FindOptionsWhere } from 'typeorm'
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
  /** 作用域（v2 P3；旧行缺省 book） */
  scope: 'book' | 'corpus'
  /** 体系树属性槽 JSON（v3 M2；普通实体 null） */
  attrs: string | null
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
      scope: e.scope === 'corpus' ? 'corpus' : 'book',
      attrs: e.attrs ?? null,
      createdAt: e.createdAt ?? null,
      updatedAt: e.updatedAt ?? null,
    }
  }

  async findById(id: string): Promise<KbEntityRecord | null> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbEntityEntity>)
    return row ? this.toDto(row) : null
  }

  /** 规范名/别名双路查找（仅 active 实体） */
  /** 体系树属性槽更新（v3 M2：attrs JSON 演进重写） */
  async updateAttrs(id: string, attrs: string): Promise<boolean> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbEntityEntity>)
    if (!row) return false
    row.attrs = attrs
    row.updatedAt = new Date()
    await this.scoped.save(row)
    return true
  }

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
    let existing = await this.scoped.findOne({ knowledgeBaseId: kbId, name } as FindOptionsWhere<KbEntityEntity>)
    // 合并过的实体：mention 必须落到规范实体（沿 target 链；防新挂点指向 dead 节点——
    // v2 P3 corpus-merge 之后必然出现 merged 行，此处不解析则图谱持续引用已并实体）
    let hops = 0
    while (existing?.status === 'merged' && existing.targetEntityId && hops++ < 5) {
      const next = await this.scoped.findOne({ id: existing.targetEntityId } as FindOptionsWhere<KbEntityEntity>)
      if (!next) break
      existing = next
    }
    const now = new Date()
    if (existing) {
      const merged = mergeAliases(existing.aliases, [name, ...(mention.aliases ?? [])])
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

  /** 全部 active 实体（id+规范名+别名+类型+摘要；PPR 种子/挂点提示/设定卡归纳/人物册用） */
  async listActiveWithAliases(
    kbId: string,
    limit: number,
    opts?: { excludeTypes?: string[]; orderByUpdated?: boolean },
  ): Promise<Array<{ id: string; name: string; aliases: string[]; entityType: string; summary: string | null; attrs: string | null }>> {
    const where: Record<string, unknown> = { knowledgeBaseId: kbId, status: 'active' }
    if (opts?.excludeTypes?.length) where.entityType = Not(In(opts.excludeTypes))
    const rows = await this.scoped.find({
      where: where as FindOptionsWhere<KbEntityEntity>,
      // 默认按创建序（稳定）；orderByUpdated 供设定卡归纳（近期活跃优先，防新实体饿死）
      order: (opts?.orderByUpdated ? { updatedAt: 'DESC' } : { createdAt: 'ASC' }) as never,
      take: limit,
    })
    return rows.map((r) => ({ id: r.id, name: r.name, aliases: safeParseArray(r.aliases), entityType: r.entityType, summary: r.summary ?? null, attrs: r.attrs ?? null }))
  }

  /** 体系树节点（v3 M4：attrs 非空的体系节点——含暂无关系边的） */
  async listWithAttrs(kbId: string, limit: number): Promise<Array<{ id: string; name: string }>> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId, status: 'active' } as FindOptionsWhere<KbEntityEntity>,
      order: { createdAt: 'ASC' } as never,
      take: limit,
    })
    return rows.filter((r) => (r.attrs ?? '').trim()).map((r) => ({ id: r.id, name: r.name }))
  }

  /** 全部 active 实体规范名（原子化的挂点提示词表；按创建时间稳定排序） */
  async listActiveNames(kbId: string, limit: number): Promise<string[]> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId, status: 'active' } as FindOptionsWhere<KbEntityEntity>,
      order: { createdAt: 'ASC' } as never,
      take: limit,
    })
    return rows.map((r) => r.name)
  }

  async pendingSummaries(kbId: string, limit: number): Promise<KbEntityRecord[]> {
    // createdAt ASC 轮转（盲审：无 order 的集合不稳定，僵尸 pending 恒占坑）
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId, summaryStatus: 'pending' } as FindOptionsWhere<KbEntityEntity>,
      order: { createdAt: 'ASC' } as never,
      take: limit,
    })
    return this.toDtoList(rows)
  }

  /** 批量标注作用域（v2 P3 corpus-merge：挂点论断跨 ≥2 书的实体标 corpus） */
  async markScope(ids: string[], scope: 'book' | 'corpus'): Promise<number> {
    if (ids.length === 0) return 0
    await this.scoped.update(
      { id: In(ids) } as FindOptionsWhere<KbEntityEntity>,
      { scope, updatedAt: new Date() } as never,
    )
    return ids.length
  }

  /** 候选实体清单（v2 P3：归并候选与变体矩阵取材——includeTypes 白名单圈定） */
  async listActiveByTypes(
    kbId: string,
    includeTypes: string[],
    limit: number,
  ): Promise<Array<{ id: string; name: string; aliases: string[]; entityType: string; scope: 'book' | 'corpus' }>> {
    if (includeTypes.length === 0) return []
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId, status: 'active', entityType: In(includeTypes) } as FindOptionsWhere<KbEntityEntity>,
      order: { createdAt: 'ASC' } as never,
      take: limit,
    })
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      aliases: safeParseArray(r.aliases),
      entityType: r.entityType,
      scope: r.scope === 'corpus' ? 'corpus' : 'book',
    }))
  }

  /** 体检：active 实体总数 */
  async countActive(kbId: string): Promise<number> {
    return this.scoped.count({ knowledgeBaseId: kbId, status: 'active' } as FindOptionsWhere<KbEntityEntity>)
  }

  /** 体检：缺演化摘要的 pending 实体数 */
  async countPendingSummaries(kbId: string): Promise<number> {
    return this.scoped.count({ knowledgeBaseId: kbId, summaryStatus: 'pending', status: 'active' } as FindOptionsWhere<KbEntityEntity>)
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
