/**
 * 知识大脑·场面事件仓库（kb_events 表，v2 设计 §7 原料层/P0）
 * @module database/repositories/kb-event.repository
 *
 * 故事轨原料仓储：替换式重建（重跑前 deleteByChapter）、按库/按类型取材
 * （pattern-induct 聚类用）、随文档级联清理。
 */
import { type DataSource, type FindOptionsWhere, In } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbEventEntity, KB_SCENE_TYPES, type KbSceneType } from '../entities/kb-brain/kb-event.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

/** 参与者条目（entityId 由消化链路实体解析回填） */
export interface KbEventParticipant {
  name: string
  entityId?: string | null
}

export interface KbEventInput {
  knowledgeBaseId: string
  sourceDocumentId: string
  sourceChapterId: string
  sourceChapterHash: string | null
  sceneType: string
  summary: string
  participants: KbEventParticipant[]
  cause?: string | null
  outcome?: string | null
  sourceQuote: string
  startOffset?: number | null
  endOffset?: number | null
}

export interface KbEventRecord {
  id: string
  userId: string | null
  knowledgeBaseId: string
  sourceDocumentId: string
  sourceChapterId: string
  sourceChapterHash: string | null
  sceneType: KbSceneType
  summary: string
  participants: string
  cause: string | null
  outcome: string | null
  sourceQuote: string
  startOffset: number | null
  endOffset: number | null
  createdAt: Date | null
}

export class KbEventRepository extends BaseRepository<KbEventEntity, KbEventRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbEventEntity)
  }

  protected toDto(e: KbEventEntity): KbEventRecord {
    return {
      id: e.id,
      userId: e.userId ?? null,
      knowledgeBaseId: e.knowledgeBaseId,
      sourceDocumentId: e.sourceDocumentId,
      sourceChapterId: e.sourceChapterId,
      sourceChapterHash: e.sourceChapterHash ?? null,
      sceneType: e.sceneType,
      summary: e.summary,
      participants: e.participants ?? '[]',
      cause: e.cause ?? null,
      outcome: e.outcome ?? null,
      sourceQuote: e.sourceQuote,
      startOffset: e.startOffset ?? null,
      endOffset: e.endOffset ?? null,
      createdAt: e.createdAt ?? null,
    }
  }

  async createBatch(rows: KbEventInput[]): Promise<KbEventRecord[]> {
    if (rows.length === 0) return []
    const userId = getCurrentUserId()
    const now = new Date()
    const entities = rows.map((r) => {
      const e = new KbEventEntity()
      e.id = randomUUID()
      e.userId = userId
      e.knowledgeBaseId = r.knowledgeBaseId
      e.sourceDocumentId = r.sourceDocumentId
      e.sourceChapterId = r.sourceChapterId
      e.sourceChapterHash = r.sourceChapterHash
      e.sceneType = KB_SCENE_TYPES.includes(r.sceneType as KbSceneType) ? (r.sceneType as KbSceneType) : 'other'
      e.summary = r.summary
      e.participants = JSON.stringify(r.participants ?? [])
      e.cause = r.cause ?? null
      e.outcome = r.outcome ?? null
      e.sourceQuote = r.sourceQuote
      e.startOffset = r.startOffset ?? null
      e.endOffset = r.endOffset ?? null
      e.createdAt = now
      return e
    })
    await this.dataSource.transaction(async (manager) => {
      await manager.save(entities)
    })
    return this.toDtoList(entities)
  }

  /** 按库取材（pattern-induct 聚类的原料入口；sceneType/documentId 可选过滤） */
  async findByKb(
    kbId: string,
    opts?: { sceneType?: string; documentId?: string; limit?: number },
  ): Promise<KbEventRecord[]> {
    const where: FindOptionsWhere<KbEventEntity> = { knowledgeBaseId: kbId }
    if (opts?.sceneType) where.sceneType = opts.sceneType as KbSceneType
    if (opts?.documentId) where.sourceDocumentId = opts.documentId
    const rows = await this.scoped.find({ where, take: opts?.limit ?? 5000 })
    return this.toDtoList(rows)
  }

  async countByKb(kbId: string): Promise<number> {
    return this.scoped.count({ knowledgeBaseId: kbId } as FindOptionsWhere<KbEventEntity>)
  }

  async findByDocument(documentId: string): Promise<KbEventRecord[]> {
    const rows = await this.scoped.find({
      where: { sourceDocumentId: documentId } as FindOptionsWhere<KbEventEntity>,
    })
    return this.toDtoList(rows)
  }

  /** 场面类型分布（试点门质检/类型偏斜监控用） */
  async statsBySceneType(kbId: string): Promise<Record<string, number>> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId } as FindOptionsWhere<KbEventEntity>,
      select: { sceneType: true } as never,
    })
    const out: Record<string, number> = {}
    for (const r of rows) out[r.sceneType] = (out[r.sceneType] ?? 0) + 1
    return out
  }

  /** 章级替换式重建（重跑前清旧场面——hash 变更/补采重试场景防重复堆积） */
  async deleteByChapter(chapterId: string): Promise<void> {
    await this.scoped.delete({ sourceChapterId: chapterId } as FindOptionsWhere<KbEventEntity>)
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.scoped.delete({ sourceDocumentId: documentId } as FindOptionsWhere<KbEventEntity>)
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as FindOptionsWhere<KbEventEntity>)
  }

  async findByIds(ids: string[]): Promise<KbEventRecord[]> {
    if (ids.length === 0) return []
    const rows = await this.scoped.find({ where: { id: In(ids) } as FindOptionsWhere<KbEventEntity> })
    return this.toDtoList(rows)
  }
}
