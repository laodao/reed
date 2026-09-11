/**
 * 知识库章节仓库（kb_chapters 表）
 * @module database/repositories/kb-chapter.repository
 *
 * 章节树数据层：文档处理时把 StructureDetector 的 sections 落库（树形），
 * 供检索上下文注入（M3）与章节树/摘要（M2/M5）消费。
 * 多租户：继承 BaseRepository，user_id 自动注入。
 */
import { type DataSource, type FindOptionsWhere, In } from 'typeorm'
import { KbChapterEntity, type ChapterSummaryStatus } from '../entities/kb-chapter.entity'
import { BaseRepository } from '../base-repository'
import { createLogger } from '@core/utils/logger'

const logger = createLogger('KbChapterRepository')

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

export class KbChapterRepository extends BaseRepository<KbChapterEntity, KbChapterRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbChapterEntity)
  }

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
      createdAt: e.createdAt,
      updatedAt: e.updatedAt ?? null,
    }
  }

  /** 批量落章节（同一文档处理时全量重建：先删后插） */
  async replaceByDocument(documentId: string, inputs: KbChapterInput[]): Promise<number> {
    await this.deleteByDocument(documentId)
    if (inputs.length === 0) return 0
    const now = new Date()
    const entities = inputs.map((inp) => {
      const e = new KbChapterEntity()
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
      e.summary = null
      e.summaryStatus = 'pending'
      e.summaryError = null
      e.createdAt = now
      e.updatedAt = now
      return e
    })
    await this.scoped.saveMany(entities)
    return entities.length
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.scoped.delete({ documentId } as FindOptionsWhere<KbChapterEntity>)
  }

  async findByDocument(documentId: string): Promise<KbChapterRecord[]> {
    const rows = await this.scoped.find({
      where: { documentId } as FindOptionsWhere<KbChapterEntity>,
      order: { ordering: 'ASC' } as never,
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

  /** 待生成摘要的章节（文档维度扫描用） */
  async findByStatuses(documentId: string, statuses: ChapterSummaryStatus[]): Promise<KbChapterRecord[]> {
    const rows = await this.scoped.find({
      where: { documentId, summaryStatus: In(statuses) } as FindOptionsWhere<KbChapterEntity>,
      order: { ordering: 'ASC' } as never,
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