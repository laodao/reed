/**
 * 知识库章节仓库（kb_chapters 表）
 * @module database/repositories/kb-chapter.repository
 *
 * 章节树数据层：文档处理时把 StructureDetector 的 sections 落库（树形），
 * 供检索上下文注入（M3）与章节树/摘要（M2/M5）消费。
 * 多租户：继承 BaseRepository，user_id 自动注入。
 */
import { type DataSource, type FindOptionsWhere, In, IsNull } from 'typeorm'
import { KbChapterEntity, type ChapterSummaryStatus } from '../entities/kb-chapter.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

/** 章节 DTO */
export interface KbChapterRecord {
  id: string
  userId: string | null
  documentId: string
  knowledgeBaseId: string
  title: string
  level: number
  parentTitle: string | null
  parentId: string | null
  ordering: number
  startOffset: number | null
  endOffset: number | null
  content: string | null
  contentHash: string | null
  summary: string | null
  summaryStatus: ChapterSummaryStatus
  summaryError: string | null
  /** 章级结构化阅读卡 JSON（v4；默认不随 findByDocument 返回，见 FindChaptersOptions） */
  brainCard: string | null
  brainCardHash: string | null
  createdAt: Date
  updatedAt: Date | null
}

/** 章节树节点（对前端/检索消费的形态） */
export interface KbChapterTreeNode extends KbChapterRecord {
  children: KbChapterTreeNode[]
}

/** 批量插入章节入参 */
export interface KbChapterInput {
  id: string
  documentId: string
  knowledgeBaseId: string
  title: string
  level: number
  parentTitle?: string | null
  parentId?: string | null
  ordering: number
  startOffset?: number | null
  endOffset?: number | null
  content?: string | null
  contentHash?: string | null
}

/** 章节摘要更新入参 */
export interface ChapterSummaryPatch {
  summary: string
  status: ChapterSummaryStatus
  error?: string | null
}

/** findByDocument 取列/分页选项 */
export interface FindChaptersOptions {
  /**
   * 是否返回章节正文 content。
   * 默认 false —— content 是全文冗余存储（真实案例：单文档 2470 章合计 7.14 MB），
   * 全量拉取会压垮 SQLite 的临时存储并抛 SQLITE_CANTOPEN。多数调用方（检索上下文
   * 注入、章节树、进度统计、章序判定）只需要元信息，不应为它们付出这个代价。
   */
  includeContent?: boolean
  /**
   * 是否返回阅读卡 brainCard（v4）。
   * 默认 false——卡 JSON 每章 2-4KB，千章书全量 2-4MB，与 content 同量级；
   * 只有书级漏斗消费方（名册聚合/编年段/覆盖记账）显式 opt-in。
   */
  includeCard?: boolean
  /** 分页：每页条数（不传=不分页） */
  limit?: number
  /** 分页：偏移量（不传=0） */
  offset?: number
}

export class KbChapterRepository extends BaseRepository<KbChapterEntity, KbChapterRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbChapterEntity)
  }

  /**
   * 取列白名单（**实体属性名**，不是 DB 列名——TypeORM 的 select 按属性解析）。
   * 不含 content：多数消费方只要元信息，不该为全文付出全量读取的代价。
   */
  private static readonly META_COLUMNS = [
    'userId',
    'id',
    'documentId',
    'knowledgeBaseId',
    'title',
    'level',
    'parentTitle',
    'parentId',
    'ordering',
    'startOffset',
    'endOffset',
    'contentHash',
    'summary',
    'summaryStatus',
    'summaryError',
    'createdAt',
    'updatedAt',
  ] as const

  protected toDto(e: KbChapterEntity): KbChapterRecord {
    return {
      id: e.id,
      userId: e.userId,
      documentId: e.documentId,
      knowledgeBaseId: e.knowledgeBaseId,
      title: e.title,
      level: e.level,
      parentTitle: e.parentTitle ?? null,
      parentId: e.parentId ?? null,
      ordering: e.ordering,
      startOffset: e.startOffset ?? null,
      endOffset: e.endOffset ?? null,
      content: e.content ?? null,
      contentHash: e.contentHash ?? null,
      summary: e.summary ?? null,
      summaryStatus: e.summaryStatus,
      summaryError: e.summaryError ?? null,
      brainCard: e.brainCard ?? null,
      brainCardHash: e.brainCardHash ?? null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt ?? null,
    }
  }

  /**
   * 批量落章节（同一文档处理时全量重建：事务内先删后插）。
   *
   * 摘要复用（review 修复）：内容指纹 contentHash 未变的章节沿用旧摘要（status='done'），
   * 避免每次重处理都重新调 LLM 生成全部摘要；hash 变化/新增章节重置 pending。
   */
  async replaceByDocument(documentId: string, inputs: KbChapterInput[]): Promise<number> {
    // 复用基线：旧章节中已完成摘要的 contentHash → summary；
    // v4：阅读卡同 hash 复用（卡只随章内容变化重做，重处理不重产）
    const previous = await this.scoped.find({
      where: { documentId } as FindOptionsWhere<KbChapterEntity>,
    })
    const reusable = new Map<string, string>()
    for (const row of previous) {
      if (row.summaryStatus === 'done' && row.contentHash && row.summary) {
        reusable.set(row.contentHash, row.summary)
      }
    }
    const reusableCards = new Map<string, { card: string; hash: string }>()
    for (const row of previous) {
      if (row.brainCard && row.brainCardHash && row.contentHash) {
        reusableCards.set(row.contentHash, { card: row.brainCard, hash: row.brainCardHash })
      }
    }

    const userId = getCurrentUserId()
    const now = new Date()
    const entities = inputs.map((inp) => {
      const e = new KbChapterEntity()
      e.userId = userId
      e.id = inp.id
      e.documentId = inp.documentId
      e.knowledgeBaseId = inp.knowledgeBaseId
      e.title = inp.title
      e.level = inp.level
      e.parentTitle = inp.parentTitle ?? null
      e.parentId = inp.parentId ?? null
      e.ordering = inp.ordering
      e.startOffset = inp.startOffset ?? null
      e.endOffset = inp.endOffset ?? null
      e.content = inp.content ?? null
      e.contentHash = inp.contentHash ?? null
      const reused = inp.contentHash ? reusable.get(inp.contentHash) : undefined
      e.summary = reused ?? null
      e.summaryStatus = reused ? 'done' : 'pending'
      e.summaryError = null
      const reusedCard = inp.contentHash ? reusableCards.get(inp.contentHash) : undefined
      e.brainCard = reusedCard?.card ?? null
      e.brainCardHash = reusedCard?.hash ?? null
      e.createdAt = now
      e.updatedAt = now
      return e
    })

    // 事务：删除 + 插入原子化，中途失败不会留下"章节全丢"的中间态
    await this.dataSource.transaction(async (manager) => {
      const where = userId
        ? { documentId, userId }
        : { documentId, userId: IsNull() }
      await manager.delete(KbChapterEntity, where as never)
      if (entities.length > 0) await manager.save(entities)
    })
    return entities.length
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.scoped.delete({ documentId } as FindOptionsWhere<KbChapterEntity>)
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as FindOptionsWhere<KbChapterEntity>)
  }

  /** 单章读取（精读等按 id 取正文的消费方） */
  async findById(id: string): Promise<KbChapterRecord | null> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbChapterEntity>)
    return row ? this.toDto(row) : null
  }

  /**
   * 按文档取章节（ordering ASC）。
   *
   * **默认不返回正文 content**（见 FindChaptersOptions 注释）：只有确实要消费章节
   * 全文的调用方（消化/书级汇总/画像采样等）才显式传 includeContent:true。
   */
  async findByDocument(
    documentId: string,
    opts: FindChaptersOptions = {},
  ): Promise<KbChapterRecord[]> {
    return await this.queryChapters(documentId, opts)
  }

  /**
   * 按文档分页取章节——**大批量消费正文时用这个**，逐页读取量有界，
   * 避免一次性把整本文档的章节正文拉进内存（SQLITE_CANTOPEN 的真实成因）。
   */
  async findByDocumentPaged(
    documentId: string,
    opts: FindChaptersOptions & { limit: number; offset?: number },
  ): Promise<KbChapterRecord[]> {
    return await this.queryChapters(documentId, opts)
  }

  /** findByDocument / findByDocumentPaged 共用查询体（取列裁剪 + 可选分页） */
  private async queryChapters(
    documentId: string,
    opts: FindChaptersOptions,
  ): Promise<KbChapterRecord[]> {
    const columns = opts.includeContent
      ? undefined // 全列（含 content/brain_card）
      : opts.includeCard
        ? [...KbChapterRepository.META_COLUMNS, 'brainCard', 'brainCardHash']
        : [...KbChapterRepository.META_COLUMNS]
    const rows = await this.scoped.find({
      where: { documentId } as FindOptionsWhere<KbChapterEntity>,
      order: { ordering: 'ASC' } as never,
      ...(columns ? { select: columns as never } : {}),
      ...(opts.limit != null ? { take: opts.limit } : {}),
      ...(opts.offset != null ? { skip: opts.offset } : {}),
    })
    return this.toDtoList(rows)
  }

  /**
   * 文档章节树（平铺 → 树；parent_id 引用同文档内章节）。
   * 孤儿子节点（parent 缺失）挂到根（防御脏数据）。
   */
  async treeOf(documentId: string): Promise<KbChapterTreeNode[]> {
    const records = await this.findByDocument(documentId)
    const byId = new Map<string, KbChapterTreeNode>()
    const roots: KbChapterTreeNode[] = []
    for (const r of records) {
      byId.set(r.id, { ...r, children: [] })
    }
    const attach = (node: KbChapterTreeNode, parentId: string | null): void => {
      if (parentId && byId.has(parentId)) {
        byId.get(parentId)!.children.push(node)
      } else {
        roots.push(node)
      }
    }
    for (const record of records) {
      attach(byId.get(record.id)!, record.parentId)
    }
    return roots
  }

  /** 章节摘要更新（done/failed 均从此入口，failed 可重试） */
  async updateSummary(id: string, patch: ChapterSummaryPatch): Promise<KbChapterRecord | null> {
    await this.scoped.update(
      { id } as FindOptionsWhere<KbChapterEntity>,
      {
        summary: patch.summary,
        summaryStatus: patch.status,
        summaryError: patch.error ?? null,
        updatedAt: new Date(),
      } as never,
    )
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbChapterEntity>)
    return row ? this.toDto(row) : null
  }

  /**
   * 章级阅读卡写入（替换式；card=null 清卡——内容重排后旧卡失效的兜底入口）。
   * 卡的有效性由章级台账（passType='card'）管理，此处只存内容。
   */
  async updateBrainCard(
    id: string,
    patch: { card: string | null; hash: string | null },
  ): Promise<void> {
    await this.scoped.update(
      { id } as FindOptionsWhere<KbChapterEntity>,
      { brainCard: patch.card, brainCardHash: patch.hash, updatedAt: new Date() } as never,
    )
  }

  /** 待生成摘要的章节（文档维度扫描用）。默认不返回正文，摘要调度按需 opt-in。 */
  async findByStatuses(
    documentId: string,
    statuses: ChapterSummaryStatus[],
    opts: { includeContent?: boolean } = {},
  ): Promise<KbChapterRecord[]> {
    const columns = opts.includeContent ? undefined : [...KbChapterRepository.META_COLUMNS]
    const rows = await this.scoped.find({
      where: { documentId, summaryStatus: In(statuses) } as FindOptionsWhere<KbChapterEntity>,
      order: { ordering: 'ASC' } as never,
      ...(columns ? { select: columns as never } : {}),
    })
    return this.toDtoList(rows)
  }

  /** 某文档摘要进度统计（前端展示/完成判断） */
  async summaryStats(documentId: string): Promise<{ total: number; done: number; failed: number }> {
    const rows = await this.findByDocument(documentId)
    return {
      total: rows.length,
      done: rows.filter((r) => r.summaryStatus === 'done').length,
      failed: rows.filter((r) => r.summaryStatus === 'failed').length,
    }
  }
}