/**
 * 知识大脑·卡片仓库（kb_notes 表）
 * @module database/repositories/kb-note.repository
 */
import { In, type DataSource, type FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import {
  KbNoteEntity,
  type KbNoteOrigin,
  type KbNoteStatus,
  type KbNoteType,
} from '../entities/kb-brain/kb-note.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface KbNoteRecord {
  id: string
  userId: string | null
  knowledgeBaseId: string
  title: string
  description: string
  body: string
  type: KbNoteType
  status: KbNoteStatus
  evidence: string
  origin: KbNoteOrigin
  version: number
  patternSkeleton: string | null
  patternInstances: string | null
  lensAttention: string | null
  classicScore: number
  supersededNoteId: string | null
  tags: string
  fsrsStability: number | null
  fsrsDifficulty: number | null
  lastReviewAt: Date | null
  reviewCount: number
  lapseCount: number
  citedCount: number
  lastCitedAt: Date | null
  dueAt: Date | null
  fsrsState: number | null
  createdAt: Date | null
  updatedAt: Date | null
}

export interface KbNoteInput {
  title: string
  description: string
  body?: string
  type: KbNoteType
  evidence?: string
  origin?: KbNoteOrigin
  patternSkeleton?: string | null
  patternInstances?: string | null
  lensAttention?: string | null
  tags?: string
}

export class KbNoteRepository extends BaseRepository<KbNoteEntity, KbNoteRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbNoteEntity)
  }

  protected toDto(e: KbNoteEntity): KbNoteRecord {
    return {
      id: e.id,
      userId: e.userId,
      knowledgeBaseId: e.knowledgeBaseId,
      title: e.title,
      description: e.description,
      body: e.body ?? '',
      type: e.type,
      status: e.status,
      evidence: e.evidence ?? '[]',
      origin: e.origin,
      version: e.version,
      patternSkeleton: e.patternSkeleton ?? null,
      patternInstances: e.patternInstances ?? null,
      lensAttention: e.lensAttention ?? null,
      classicScore: e.classicScore,
      supersededNoteId: e.supersededNoteId ?? null,
      tags: e.tags ?? '[]',
      fsrsStability: e.fsrsStability ?? null,
      fsrsDifficulty: e.fsrsDifficulty ?? null,
      lastReviewAt: e.lastReviewAt ?? null,
      reviewCount: e.reviewCount,
      lapseCount: e.lapseCount,
      citedCount: e.citedCount,
      lastCitedAt: e.lastCitedAt ?? null,
      dueAt: e.dueAt ?? null,
      fsrsState: e.fsrsState ?? null,
      createdAt: e.createdAt ?? null,
      updatedAt: e.updatedAt ?? null,
    }
  }

  async findById(id: string): Promise<KbNoteRecord | null> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbNoteEntity>)
    return row ? this.toDto(row) : null
  }

  /** 提议入库：status=proposed（AI 产物唯一入口，永不直接 published） */
  async propose(kbId: string, input: KbNoteInput): Promise<KbNoteRecord> {
    const now = new Date()
    const e = new KbNoteEntity()
    e.id = randomUUID()
    e.userId = getCurrentUserId()
    e.knowledgeBaseId = kbId
    e.title = input.title
    e.description = input.description
    e.body = input.body ?? ''
    e.type = input.type
    e.status = 'proposed'
    e.evidence = input.evidence ?? '[]'
    e.origin = input.origin ?? 'ai-distill'
    e.version = 1
    e.patternSkeleton = input.patternSkeleton ?? null
    e.patternInstances = input.patternInstances ?? null
    e.lensAttention = input.lensAttention ?? null
    e.classicScore = 0
    e.tags = input.tags ?? '[]'
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.save(e)
    return this.toDto(e)
  }

  /** 批准（可带改写）：version+1 的语义是「内容演进」——首次批准保持 v1 */
  async publish(
    id: string,
    patch?: { title?: string; body?: string; description?: string },
  ): Promise<KbNoteRecord | null> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbNoteEntity>)
    if (!row) return null
    const edited = !!(patch?.title || patch?.body || patch?.description)
    if (patch?.title) row.title = patch.title
    if (patch?.body) row.body = patch.body
    if (patch?.description) row.description = patch.description
    if (edited) row.version += 1 // 改写后批准=一次演进
    row.status = 'published'
    row.updatedAt = new Date()
    await this.scoped.save(row)
    return this.toDto(row)
  }

  /** 拒绝：archived 留档（不物理删） */
  async reject(id: string): Promise<KbNoteRecord | null> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbNoteEntity>)
    if (!row) return null
    row.status = 'archived'
    row.updatedAt = new Date()
    await this.scoped.save(row)
    return this.toDto(row)
  }

  async listByStatus(
    kbId: string,
    status: KbNoteStatus,
    page: number,
    pageSize: number,
    type?: KbNoteType,
  ): Promise<{ rows: KbNoteRecord[]; total: number }> {
    const where: Record<string, unknown> = { knowledgeBaseId: kbId, status }
    if (type) where.type = type
    const [rows, total] = await this.scoped.findAndCount({
      where: where as FindOptionsWhere<KbNoteEntity>,
      order: { createdAt: 'DESC' } as never,
      skip: (page - 1) * pageSize,
      take: pageSize,
    })
    return { rows: this.toDtoList(rows), total }
  }

  /** 提议去重：同题词面命中（精确+前缀模糊；嵌入相似在 DistillService 侧算） */
  async findSimilarTitle(kbId: string, title: string): Promise<KbNoteRecord[]> {
    const exact = await this.scoped.find({
      where: { knowledgeBaseId: kbId, title } as FindOptionsWhere<KbNoteEntity>,
    })
    if (exact.length > 0) return this.toDtoList(exact)
    // 模糊：取标题前 12 字做 LIKE 前缀（中文标题的高信号片段）
    const prefix = title.slice(0, 12)
    const rows = await this.scoped
      .qb('n')
      .where('n.knowledge_base_id = :kbId', { kbId })
      .andWhere('n.title LIKE :p', { p: `%${prefix}%` })
      .getMany()
    return this.toDtoList(rows)
  }

  async listLens(kbId: string): Promise<KbNoteRecord[]> {
    const rows = await this.scoped.find({
      where: { knowledgeBaseId: kbId, type: 'lens' } as FindOptionsWhere<KbNoteEntity>,
      order: { createdAt: 'DESC' } as never,
    })
    return this.toDtoList(rows)
  }

  /** 创建/更新视角卡（视角卡是配置性卡片：直接 published，不走提议队列） */
  async upsertLens(
    kbId: string,
    input: { id?: string; title: string; description: string; lensAttention: string },
  ): Promise<KbNoteRecord> {
    const now = new Date()
    if (input.id) {
      const row = await this.scoped.findOne({ id: input.id } as FindOptionsWhere<KbNoteEntity>)
      if (row) {
        row.title = input.title
        row.description = input.description
        row.lensAttention = input.lensAttention
        row.version += 1
        row.updatedAt = now
        await this.scoped.save(row)
        return this.toDto(row)
      }
    }
    const e = new KbNoteEntity()
    e.id = randomUUID()
    e.userId = getCurrentUserId()
    e.knowledgeBaseId = kbId
    e.title = input.title
    e.description = input.description
    e.body = ''
    e.type = 'lens'
    e.status = 'published'
    e.evidence = '[]'
    e.origin = 'human'
    e.version = 1
    e.lensAttention = input.lensAttention
    e.createdAt = now
    e.updatedAt = now
    await this.scoped.save(e)
    return this.toDto(e)
  }

  /**
   * 经典性重算（浮现式：引用×实例；P4 周期）。返回重算卡数。
   * classicScore = ln(1+citedCount) * (1 + ln(1+instanceCount))——引用为主、实例加成。
   * 覆盖类型：思想卡/情节与设定模式卡（lens/skill-seed 不参与）。
   */
  async recomputeClassic(kbId: string): Promise<number> {
    const rows = await this.scoped.find({
      where: {
        knowledgeBaseId: kbId,
        type: In(['setting-pattern', 'plot-pattern', 'insight', 'methodology', 'synthesis']),
      } as FindOptionsWhere<KbNoteEntity>,
    })
    let n = 0
    for (const note of rows) {
      let instanceCount = 0
      try {
        instanceCount = note.patternInstances ? (JSON.parse(note.patternInstances) as unknown[]).length : 0
      } catch {
        instanceCount = 0
      }
      const score = Math.log(1 + note.citedCount) * (1 + Math.log(1 + instanceCount))
      if (Math.abs(score - note.classicScore) > 1e-6) {
        await this.scoped.update({ id: note.id } as FindOptionsWhere<KbNoteEntity>, { classicScore: score, updatedAt: new Date() } as never)
        n++
      }
    }
    return n
  }

  /** FSRS 当前态缓存回写（评分历史在 kb_note_reviews） */
  async updateFsrsState(
    id: string,
    patch: { stability: number; difficulty: number; lastReviewAt: Date; dueAt: Date; lapses: number; state: number },
  ): Promise<void> {
    await this.scoped.update(
      { id } as FindOptionsWhere<KbNoteEntity>,
      {
        fsrsStability: patch.stability,
        fsrsDifficulty: patch.difficulty,
        fsrsState: patch.state,
        lastReviewAt: patch.lastReviewAt,
        dueAt: patch.dueAt,
        lapseCount: patch.lapses,
        reviewCount: () => 'review_count + 1',
        updatedAt: new Date(),
      } as never,
    )
  }

  /** 到期复习队列：published 且 due_at ≤ now，到期最早优先 */
  async dueReviews(kbId: string, now: Date, limit: number): Promise<KbNoteRecord[]> {
    const rows = await this.scoped
      .qb('n')
      .where('n.knowledge_base_id = :kbId', { kbId })
      .andWhere("n.status = 'published'")
      .andWhere('n.type != :lens', { lens: 'lens' })
      .andWhere('n.due_at IS NOT NULL AND n.due_at <= :now', { now })
      .orderBy('n.due_at', 'ASC')
      .take(limit)
      .getMany()
    return this.toDtoList(rows)
  }

  /** 创作引用计数（消化率仪表与代谢晋升/衰减的输入） */
  async incCited(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.scoped.update(
      { id: In(ids) } as never,
      { citedCount: () => 'cited_count + 1', lastCitedAt: new Date() } as never,
    )
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as FindOptionsWhere<KbNoteEntity>)
  }

  async findByIds(ids: string[]): Promise<KbNoteRecord[]> {
    if (ids.length === 0) return []
    const rows = await this.scoped.find({ where: { id: In(ids) } as FindOptionsWhere<KbNoteEntity> })
    return this.toDtoList(rows)
  }
}
