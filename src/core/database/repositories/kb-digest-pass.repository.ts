/**
 * 知识大脑·消化台账仓库（kb_digest_passes 表）
 * @module database/repositories/kb-digest-pass.repository
 *
 * 幂等语义（详细设计 §1.5/§3.1）：
 * - ensurePass：同 (chapterId, passKey) 的 done 行 hash 未变→返回 done 跳过；
 *   running→返回 running（防并发重复）；failed 且 attempts<3→重置 pending；
 *   不存在/ hash 变了→置 pending 重跑。
 * - chapterId=null 的文档级任务（distill/metabolize）不受 DB 唯一键保护
 *   （SQLite/PG 唯一索引对 NULL 互不相斥）——ensurePass 内按应用层查询判重。
 */
import { type DataSource, type FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import {
  KbDigestPassEntity,
  type KbDigestPassStatus,
  type KbDigestPassType,
} from '../entities/kb-brain/kb-digest-pass.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface KbDigestPassRecord {
  id: string
  userId: string | null
  knowledgeBaseId: string
  documentId: string
  chapterId: string | null
  passType: KbDigestPassType
  passKey: string
  chapterHash: string | null
  status: KbDigestPassStatus
  statsJson: string | null
  costJson: string | null
  error: string | null
  attempts: number
  createdAt: Date | null
  updatedAt: Date | null
}

/** ensurePass 的决策结果 */
export type EnsurePassDecision =
  | { action: 'run'; pass: KbDigestPassRecord }
  | { action: 'skip'; reason: 'done-same-hash' | 'running'; pass: KbDigestPassRecord }

const MAX_ATTEMPTS = 3

export class KbDigestPassRepository extends BaseRepository<KbDigestPassEntity, KbDigestPassRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbDigestPassEntity)
  }

  protected toDto(e: KbDigestPassEntity): KbDigestPassRecord {
    return {
      id: e.id,
      userId: e.userId,
      knowledgeBaseId: e.knowledgeBaseId,
      documentId: e.documentId,
      chapterId: e.chapterId ?? null,
      passType: e.passType,
      passKey: e.passKey,
      chapterHash: e.chapterHash ?? null,
      status: e.status,
      statsJson: e.statsJson ?? null,
      costJson: e.costJson ?? null,
      error: e.error ?? null,
      attempts: e.attempts,
      createdAt: e.createdAt ?? null,
      updatedAt: e.updatedAt ?? null,
    }
  }

  /**
   * 幂等入队：返回 run（应执行）或 skip（done-same-hash / running）。
   * 执行方拿到 run 后必须先 setRunning。
   */
  async ensurePass(input: {
    knowledgeBaseId: string
    documentId: string
    chapterId: string | null
    passType: KbDigestPassType
    passKey: string
    chapterHash: string | null
  }): Promise<EnsurePassDecision> {
    const existing = await this.scoped.findOne({
      ...(input.chapterId !== null ? { chapterId: input.chapterId } : {}),
      passKey: input.passKey,
    } as FindOptionsWhere<KbDigestPassEntity>)
    const now = new Date()
    if (existing) {
      if (existing.status === 'running') return { action: 'skip', reason: 'running', pass: this.toDto(existing) }
      if (existing.status === 'done' && existing.chapterHash === input.chapterHash) {
        return { action: 'skip', reason: 'done-same-hash', pass: this.toDto(existing) }
      }
      if (existing.status === 'failed' && existing.attempts >= MAX_ATTEMPTS) {
        // 超过重试上限：视同跳过（错误保留在行上，人工触发才复活）
        return { action: 'skip', reason: 'done-same-hash', pass: this.toDto(existing) }
      }
      existing.status = 'pending'
      existing.chapterHash = input.chapterHash
      existing.error = null
      existing.updatedAt = now
      await this.scoped.save(existing)
      return { action: 'run', pass: this.toDto(existing) }
    }
    const e = new KbDigestPassEntity()
    e.id = randomUUID()
    e.userId = getCurrentUserId()
    e.knowledgeBaseId = input.knowledgeBaseId
    e.documentId = input.documentId
    e.chapterId = input.chapterId
    e.passType = input.passType
    e.passKey = input.passKey
    e.chapterHash = input.chapterHash
    e.status = 'pending'
    e.attempts = 0
    e.createdAt = now
    e.updatedAt = now
    try {
      await this.scoped.save(e)
      return { action: 'run', pass: this.toDto(e) }
    } catch {
      // 章级任务的唯一键并发兜底：读回已存在行再决策
      const raced = await this.scoped.findOne({
        chapterId: input.chapterId!,
        passKey: input.passKey,
      } as FindOptionsWhere<KbDigestPassEntity>)
      if (!raced) throw new Error('[kb-digest-pass] ensurePass 冲突且读不回')
      return this.ensurePass(input)
    }
  }

  async setRunning(id: string): Promise<void> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbDigestPassEntity>)
    if (!row) return
    row.status = 'running'
    row.attempts += 1
    row.updatedAt = new Date()
    await this.scoped.save(row)
  }

  async setDone(id: string, stats: Record<string, number>, cost: Record<string, number>): Promise<void> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbDigestPassEntity>)
    if (!row) return
    row.status = 'done'
    row.statsJson = JSON.stringify(stats)
    row.costJson = JSON.stringify(cost)
    row.error = null
    row.updatedAt = new Date()
    await this.scoped.save(row)
  }

  async setFailed(id: string, error: string): Promise<void> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbDigestPassEntity>)
    if (!row) return
    row.status = 'failed'
    row.error = error.slice(0, 500)
    row.updatedAt = new Date()
    await this.scoped.save(row)
  }

  /** 启动恢复：pending 或僵死 running（>10min 无心跳）的台账行重新可跑 */
  async recoverPending(staleRunningMs = 10 * 60 * 1000): Promise<KbDigestPassRecord[]> {
    const cutoff = new Date(Date.now() - staleRunningMs)
    const rows = await this.scoped
      .qb('p')
      .where('p.status = :st', { st: 'pending' })
      .orWhere('p.status = :run AND p.updated_at < :cutoff', { run: 'running', cutoff })
      .getMany()
    return this.toDtoList(rows)
  }

  async listByDocument(documentId: string): Promise<KbDigestPassRecord[]> {
    const rows = await this.scoped.find({
      where: { documentId } as FindOptionsWhere<KbDigestPassEntity>,
    })
    return this.toDtoList(rows)
  }

  /** 单库成本聚合（成本熔断与仪表数据源） */
  async costByKb(kbId: string, since?: Date): Promise<{ calls: number; tokensIn: number; tokensOut: number }> {
    const qb = this.scoped
      .qb('p')
      .where('p.knowledge_base_id = :kbId', { kbId })
      .andWhere('p.cost_json IS NOT NULL')
    if (since) qb.andWhere('p.updated_at >= :since', { since })
    const rows = await qb.getMany()
    const total = { calls: 0, tokensIn: 0, tokensOut: 0 }
    for (const r of rows) {
      try {
        const c = JSON.parse(r.costJson ?? '{}') as { calls?: number; tokensIn?: number; tokensOut?: number }
        total.calls += c.calls ?? 0
        total.tokensIn += c.tokensIn ?? 0
        total.tokensOut += c.tokensOut ?? 0
      } catch {
        /* 损坏行忽略 */
      }
    }
    return total
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.scoped.delete({ documentId } as FindOptionsWhere<KbDigestPassEntity>)
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as FindOptionsWhere<KbDigestPassEntity>)
  }
}
