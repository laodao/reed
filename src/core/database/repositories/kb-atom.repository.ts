/**
 * 知识大脑·论断仓库（kb_atoms 表）
 * @module database/repositories/kb-atom.repository
 *
 * 多租户：继承 BaseRepository，user_id 自动注入。
 * 批量写入走事务 + getCurrentUserId() 显式带租户（base-repository 纪律：
 * 事务/批量路径 scoped 不可用时手动注入）。
 */
import { In, IsNull, MoreThanOrEqual, Not, type DataSource, type FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbAtomEntity, KB_ATOM_LAYERS, type KbAtomLayer, type KbAtomStatus, type KbAtomType } from '../entities/kb-brain/kb-atom.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

/** 论断 DTO */
export interface KbAtomRecord {
  id: string
  userId: string | null
  knowledgeBaseId: string
  statement: string
  type: KbAtomType
  layer: KbAtomLayer
  status: KbAtomStatus
  certainty: number
  validFrom: string | null
  validUntil: string | null
  sourceDocumentId: string
  sourceChapterId: string | null
  sourceChapterHash: string | null
  sourceChunkId: string | null
  sourceQuote: string
  startOffset: number | null
  endOffset: number | null
  subjectEntityId: string | null
  objectEntityId: string | null
  lensNoteId: string | null
  extractionPass: string
  origin: 'ai' | 'human'
  useCount: number
  lastUsedAt: Date | null
  supersededByAtomId: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

/** 批量插入入参（id 可选，缺省生成） */
export type KbAtomInput = Partial<Pick<KbAtomRecord, 'id' | 'validFrom' | 'validUntil' | 'sourceChapterId' | 'sourceChapterHash' | 'sourceChunkId' | 'startOffset' | 'endOffset' | 'subjectEntityId' | 'objectEntityId' | 'lensNoteId' | 'supersededByAtomId' | 'layer'>> & {
  knowledgeBaseId: string
  statement: string
  sourceDocumentId: string
  sourceQuote: string
  type: KbAtomType
  certainty?: number
  extractionPass?: string
  origin?: 'ai' | 'human'
}

export class KbAtomRepository extends BaseRepository<KbAtomEntity, KbAtomRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbAtomEntity)
  }

  protected toDto(e: KbAtomEntity): KbAtomRecord {
    return {
      id: e.id,
      userId: e.userId,
      knowledgeBaseId: e.knowledgeBaseId,
      statement: e.statement,
      type: e.type,
      layer: KB_ATOM_LAYERS.includes(e.layer as KbAtomLayer) ? (e.layer as KbAtomLayer) : 'detail',
      status: e.status,
      certainty: e.certainty,
      validFrom: e.validFrom ?? null,
      validUntil: e.validUntil ?? null,
      sourceDocumentId: e.sourceDocumentId,
      sourceChapterId: e.sourceChapterId ?? null,
      sourceChapterHash: e.sourceChapterHash ?? null,
      sourceChunkId: e.sourceChunkId ?? null,
      sourceQuote: e.sourceQuote,
      startOffset: e.startOffset ?? null,
      endOffset: e.endOffset ?? null,
      subjectEntityId: e.subjectEntityId ?? null,
      objectEntityId: e.objectEntityId ?? null,
      lensNoteId: e.lensNoteId ?? null,
      extractionPass: e.extractionPass,
      origin: e.origin,
      useCount: e.useCount,
      lastUsedAt: e.lastUsedAt ?? null,
      supersededByAtomId: e.supersededByAtomId ?? null,
      createdAt: e.createdAt ?? null,
      updatedAt: e.updatedAt ?? null,
    }
  }

  async createBatch(rows: KbAtomInput[]): Promise<KbAtomRecord[]> {
    if (rows.length === 0) return []
    const userId = getCurrentUserId()
    const now = new Date()
    const entities = rows.map((r) => {
      const e = new KbAtomEntity()
      e.id = r.id ?? randomUUID()
      e.userId = userId
      e.knowledgeBaseId = r.knowledgeBaseId
      e.statement = r.statement
      e.type = r.type
      e.layer = KB_ATOM_LAYERS.includes(r.layer as KbAtomLayer) ? (r.layer as KbAtomLayer) : 'detail'
      e.status = 'supported'
      e.certainty = r.certainty ?? 0.8
      e.validFrom = r.validFrom ?? null
      e.validUntil = r.validUntil ?? null
      e.sourceDocumentId = r.sourceDocumentId
      e.sourceChapterId = r.sourceChapterId ?? null
      e.sourceChapterHash = r.sourceChapterHash ?? null
      e.sourceChunkId = r.sourceChunkId ?? null
      e.sourceQuote = r.sourceQuote
      e.startOffset = r.startOffset ?? null
      e.endOffset = r.endOffset ?? null
      e.subjectEntityId = r.subjectEntityId ?? null
      e.objectEntityId = r.objectEntityId ?? null
      e.lensNoteId = r.lensNoteId ?? null
      e.extractionPass = r.extractionPass ?? 'base#1'
      e.origin = r.origin ?? 'ai'
      e.useCount = 0
      e.supersededByAtomId = r.supersededByAtomId ?? null
      e.createdAt = now
      e.updatedAt = now
      return e
    })
    await this.dataSource.transaction(async (manager) => {
      await manager.save(entities)
    })
    return entities.map((e) => this.toDto(e))
  }

  async findById(id: string): Promise<KbAtomRecord | null> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbAtomEntity>)
    return row ? this.toDto(row) : null
  }

  /** 近期入库的计分论断（重要性账户用；仅 ai 来源） */
  async findRecentByTypes(kbId: string, since: Date): Promise<KbAtomRecord[]> {
    const rows = await this.scoped.find({
      where: {
        knowledgeBaseId: kbId,
        status: In(['supported', 'suspected']),
        createdAt: MoreThanOrEqual(since),
      } as FindOptionsWhere<KbAtomEntity>,
    })
    return this.toDtoList(rows)
  }

  /** 按库查（面板论断列表；可选 status/type/types/origin/layers 过滤，创建时间倒序） */
  async findByKb(
    kbId: string,
    opts?: { status?: KbAtomStatus[]; type?: string; types?: string[]; origin?: string; documentId?: string; layers?: KbAtomLayer[]; limit?: number },
  ): Promise<KbAtomRecord[]> {
    const where: Record<string, unknown> = { knowledgeBaseId: kbId }
    if (opts?.documentId) where.sourceDocumentId = opts.documentId
    if (opts?.status?.length) where.status = In(opts.status)
    if (opts?.origin) where.origin = opts.origin
    if (opts?.type) where.type = opts.type // SQL 层过滤：type 独立于 take 截断（悬而未决视图不受 5000 上限漏数据）
    if (opts?.types?.length) where.type = In(opts.types)
    if (opts?.layers?.length) where.layer = In(opts.layers)
    const rows = await this.scoped.find({
      where: where as FindOptionsWhere<KbAtomEntity>,
      order: { createdAt: 'DESC' } as never,
      take: opts?.limit ?? 200,
    })
    const typeSet = opts?.types?.length ? new Set(opts.types) : null
    const layerSet = opts?.layers?.length ? new Set(opts.layers) : null
    return this.toDtoList(rows).filter(
      (r) =>
        (!opts?.type || r.type === opts.type) &&
        (!typeSet || typeSet.has(r.type)) &&
        (!layerSet || layerSet.has(r.layer)) &&
        (!opts?.origin || r.origin === opts.origin),
    )
  }

  async findByDocument(
    documentId: string,
    opts?: { status?: KbAtomStatus[]; lensNoteId?: string | null },
  ): Promise<KbAtomRecord[]> {
    const where: Record<string, unknown> = { sourceDocumentId: documentId }
    if (opts?.status?.length) where.status = In(opts.status)
    if (opts && 'lensNoteId' in opts) {
      // 显式区分「公共层（null）」与「某视角」——裁决分域的查询边界
      where.lensNoteId = opts.lensNoteId === null ? IsNull() : opts.lensNoteId
    }
    const rows = await this.scoped.find({ where: where as FindOptionsWhere<KbAtomEntity> })
    return this.toDtoList(rows)
  }

  /** 裁决候选集：同库同实体挂点的现存论断（严格分域：lensNoteId 相同才算同域） */
  async findByEntities(
    kbId: string,
    entityIds: string[],
    opts?: { lensNoteId?: string | null; statuses?: KbAtomStatus[] },
  ): Promise<KbAtomRecord[]> {
    if (entityIds.length === 0) return []
    const qb = this.scoped
      .qb('a')
      .where('a.knowledge_base_id = :kbId', { kbId })
      .andWhere('(a.subject_entity_id IN (:...eids) OR a.object_entity_id IN (:...eids))', {
        eids: entityIds,
      })
    if (opts && 'lensNoteId' in opts) {
      if (opts.lensNoteId === null) qb.andWhere('a.lens_note_id IS NULL')
      else qb.andWhere('a.lens_note_id = :lens', { lens: opts.lensNoteId })
    }
    qb.andWhere('a.status IN (:...sts)', { sts: opts?.statuses?.length ? opts.statuses : ['supported', 'suspected'] })
    const rows = await qb.getMany()
    return this.toDtoList(rows)
  }

  async findByIds(ids: string[]): Promise<KbAtomRecord[]> {
    if (ids.length === 0) return []
    const rows = await this.scoped.find({ where: { id: In(ids) } as FindOptionsWhere<KbAtomEntity> })
    return this.toDtoList(rows)
  }

  async findByChapterHash(documentId: string, chapterHash: string): Promise<KbAtomRecord[]> {
    const rows = await this.scoped.find({
      where: { sourceDocumentId: documentId, sourceChapterHash: chapterHash } as FindOptionsWhere<KbAtomEntity>,
    })
    return this.toDtoList(rows)
  }

  async updateStatus(
    id: string,
    patch: { status: KbAtomStatus; supersededByAtomId?: string | null },
  ): Promise<void> {
    await this.scoped.update(
      { id } as FindOptionsWhere<KbAtomEntity>,
      {
        status: patch.status,
        ...(patch.supersededByAtomId !== undefined ? { supersededByAtomId: patch.supersededByAtomId } : {}),
        updatedAt: new Date(),
      } as never,
    )
  }

  /** 分层补标：按目标层分组批量改写（补标是幂等维护动作，只动 layer 不碰状态机） */
  async updateLayers(groups: Array<{ layer: KbAtomLayer; ids: string[] }>): Promise<number> {
    let n = 0
    for (const g of groups) {
      if (!KB_ATOM_LAYERS.includes(g.layer) || g.ids.length === 0) continue
      await this.scoped.update(
        { id: In(g.ids) } as never,
        { layer: g.layer, updatedAt: new Date() } as never,
      )
      n += g.ids.length
    }
    return n
  }

  /** 使用即再巩固：检索命中/创作引用时计数（§5.3 机制 2） */
  async incUse(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.scoped.update(
      { id: In(ids) } as never,
      { useCount: () => 'use_count + 1', lastUsedAt: new Date() } as never,
    )
  }

  /** 重链：reprocess 后按 offsets 重新指向新 chunk（D5，出处跳转恢复） */
  async relinkChunk(id: string, chunkId: string): Promise<void> {
    await this.scoped.update(
      { id } as FindOptionsWhere<KbAtomEntity>,
      { sourceChunkId: chunkId, updatedAt: new Date() } as never,
    )
  }

  /** 实体挂点回填（裁决落库后按 mention→实体 解析结果更新） */
  async relinkEntity(id: string, subjectEntityId: string | null, objectEntityId: string | null): Promise<void> {
    await this.scoped.update(
      { id } as FindOptionsWhere<KbAtomEntity>,
      { subjectEntityId, objectEntityId, updatedAt: new Date() } as never,
    )
  }

  /** 实体合并的挂点改指（v2 P3 corpus-merge）：subject/object 指向 from 的论断全部改指 to */
  async redirectEntityRefs(fromEntityId: string, toEntityId: string): Promise<void> {
    const now = new Date()
    await this.scoped.update(
      { subjectEntityId: fromEntityId } as FindOptionsWhere<KbAtomEntity>,
      { subjectEntityId: toEntityId, updatedAt: now } as never,
    )
    await this.scoped.update(
      { objectEntityId: fromEntityId } as FindOptionsWhere<KbAtomEntity>,
      { objectEntityId: toEntityId, updatedAt: now } as never,
    )
  }

  /** 视角遍生命周期：同章「非当前遍次前缀」的旧观感置 stale（hash 或 version 变更都覆盖） */
  async staleLensAtoms(documentId: string, lensNoteId: string, chapterId: string, currentHash: string | null, currentPassPrefix: string): Promise<number> {
    const rows = await this.scoped.find({
      where: {
        sourceDocumentId: documentId,
        lensNoteId,
        sourceChapterId: chapterId,
        status: In(['supported', 'suspected']),
      } as FindOptionsWhere<KbAtomEntity>,
    })
    let n = 0
    for (const a of rows) {
      // 当前遍次前缀相同且 hash 未变 → 保留；否则（旧 version 或旧 hash）置 stale
      const samePass = a.extractionPass.startsWith(currentPassPrefix)
      const sameHash = a.sourceChapterHash === currentHash
      if (samePass && sameHash) continue
      await this.updateStatus(a.id, { status: 'stale' })
      n++
    }
    return n
  }

  /** 章节内容变更后，未被新萃取覆盖的旧论断标记 stale（防幽灵论断，D2） */
  async markChapterStale(documentId: string, keepIds: string[]): Promise<number> {
    const where: Record<string, unknown> = {
      sourceDocumentId: documentId,
      status: In(['supported', 'suspected']),
    }
    if (keepIds.length > 0) where.id = Not(In(keepIds))
    return this.scoped.update(where as never, { status: 'stale', updatedAt: new Date() } as never)
  }

  /** 删除文档全部论断（文档删除级联；倒排/向量按返回的 id 列表另行清理） */
  async deleteByDocument(documentId: string): Promise<KbAtomRecord[]> {
    const rows = await this.findByDocument(documentId)
    if (rows.length > 0) {
      await this.scoped.delete({ sourceDocumentId: documentId } as FindOptionsWhere<KbAtomEntity>)
    }
    return rows
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<KbAtomRecord[]> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId } as FindOptionsWhere<KbAtomEntity>,
    })
    if (rows.length > 0) {
      await this.scoped.delete({ knowledgeBaseId } as FindOptionsWhere<KbAtomEntity>)
    }
    return this.toDtoList(rows)
  }

  async statsByKb(kbId: string): Promise<{
    total: number
    byStatus: Record<string, number>
    byType: Record<string, number>
    byLayer: Record<string, number>
    humanOrigin: number
    cited: number
    openQuestions: number
  }> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId } as FindOptionsWhere<KbAtomEntity>,
    })
    const byStatus: Record<string, number> = {}
    const byType: Record<string, number> = {}
    const byLayer: Record<string, number> = {}
    let humanOrigin = 0
    let cited = 0
    let openQuestions = 0
    // 工作集口径：与面板列表缺省一致（superseded/archived 不计入 humanOrigin/openQuestions）
    const working = new Set(['supported', 'suspected', 'stale'])
    for (const r0 of rows) {
      byStatus[r0.status] = (byStatus[r0.status] ?? 0) + 1
      byType[r0.type] = (byType[r0.type] ?? 0) + 1
      byLayer[r0.layer] = (byLayer[r0.layer] ?? 0) + 1
      if (!working.has(r0.status)) continue
      if (r0.origin === 'human') humanOrigin++
      if (r0.useCount > 0) cited++
      if (r0.type === 'open-question') openQuestions++
    }
    return { total: rows.length, byStatus, byType, byLayer, humanOrigin, cited, openQuestions }
  }
}
