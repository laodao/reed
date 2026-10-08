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
  | { action: 'skip'; reason: 'done-same-hash' | 'running' | 'exhausted'; pass: KbDigestPassRecord }

export const MAX_ATTEMPTS = 3

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
    // 主键查找：章级按 (chapterId, passKey)；文档级（chapterId=null）按 (documentId, passKey)
    // ——UNIQUE 对 NULL 不生效（F7）
    let existing = await this.scoped.findOne({
      ...(input.chapterId !== null ? { chapterId: input.chapterId } : { documentId: input.documentId }),
      passKey: input.passKey,
    } as FindOptionsWhere<KbDigestPassEntity>)
    // 兜底键（review P1：reprocess 后章节 id 全新，主键查找必 miss → 未变章全量重萃取）：
    // 同文档同 passKey 同 chapterHash 的历史行命中即复用（内容没变就不重跑），并把
    // chapterId 改指新章节。代价：同文档两章正文完全相同的极端场景会被并案（可接受——
    // 论断本就相同，出处指向先到章）。
    if (!existing && input.chapterId !== null && input.chapterHash) {
      existing = await this.scoped.findOne({
        documentId: input.documentId,
        passKey: input.passKey,
        chapterHash: input.chapterHash,
        status: 'done',
      } as FindOptionsWhere<KbDigestPassEntity>)
      if (existing && existing.chapterId !== input.chapterId) {
        existing.chapterId = input.chapterId
        existing.updatedAt = new Date()
        await this.scoped.save(existing)
      }
    }
    const now = new Date()
    if (existing) {
      if (existing.status === 'running') return { action: 'skip', reason: 'running', pass: this.toDto(existing) }
      if (existing.status === 'done' && existing.chapterHash === input.chapterHash) {
        return { action: 'skip', reason: 'done-same-hash', pass: this.toDto(existing) }
      }
      if (existing.status === 'failed' && existing.attempts >= MAX_ATTEMPTS) {
        // 超过重试上限：跳过（错误保留在行上，人工触发才复活）。reason 必须可辨——
        // 上游据此把文档标为部分失败而非谎报 digested
        return { action: 'skip', reason: 'exhausted', pass: this.toDto(existing) }
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
      // 章级任务的唯一键并发兜底：读回已存在行，原子抢占 pending→running。
      // 递归重判会让双方都拿到 run（pending 不在 skip 分支）→ 整章重复消化
      const raced = await this.scoped.findOne({
        chapterId: input.chapterId!,
        passKey: input.passKey,
      } as FindOptionsWhere<KbDigestPassEntity>)
      if (!raced) throw new Error('[kb-digest-pass] ensurePass 冲突且读不回')
      if (raced.status === 'running') return { action: 'skip', reason: 'running', pass: this.toDto(raced) }
      const claimed = await this.scoped.update(
        { id: raced.id, status: 'pending' } as unknown as FindOptionsWhere<KbDigestPassEntity>,
        { status: 'running', attempts: raced.attempts + 1, chapterHash: input.chapterHash, updatedAt: new Date() } as never,
      )
      if (claimed > 0) {
        raced.status = 'running'
        raced.attempts += 1
        return { action: 'run', pass: this.toDto(raced) }
      }
      return { action: 'skip', reason: 'running', pass: this.toDto(raced) }
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

  /**
   * 耗尽封账（review M5）：云内容审核拦截等重试无意义的失败，attempts 直接顶格——
   * ensurePass 对 failed+耗尽行一律 skip，续跑不再重撞；reviveExhaustedForDocument
   * 仍可人工复活（换模型/供应商后重试）。
   */
  async markExhausted(id: string, error: string): Promise<void> {
    const row = await this.scoped.findOne({ id } as FindOptionsWhere<KbDigestPassEntity>)
    if (!row) return
    row.status = 'failed'
    row.attempts = MAX_ATTEMPTS
    row.error = error.slice(0, 500)
    row.updatedAt = new Date()
    await this.scoped.save(row)
  }

  /**
   * 跨租户恢复扫描（后台任务专用）：裸 repo 查询不带 user_id 过滤——
   * 显式安全性确认：仅返回 id/documentId/userId/status 最小字段供按用户重放，
   * 不外泄内容；ALS 无用户（boot）时 scoped 生成 IS NULL 查不到任何行，
   * 恢复扫描必须走裸仓库（base-repository 头注允许的跨租户管理场景）。
   */
  async recoverPendingAllUsers(staleRunningMs = 10 * 60 * 1000): Promise<Array<{ id: string; documentId: string; userId: string | null; status: string }>> {
    const cutoff = new Date(Date.now() - staleRunningMs)
    const rows = await this.repo
      .createQueryBuilder('p')
      .select(['p.id', 'p.documentId', 'p.userId', 'p.status'])
      .where('p.status = :st', { st: 'pending' })
      .orWhere('p.status = :run AND p.updated_at < :cutoff', { run: 'running', cutoff })
      .getMany()
    return rows.map((r) => ({ id: r.id, documentId: r.documentId, userId: r.userId, status: r.status }))
  }

  /** 僵死 running 复位 pending（recover 调用；ensurePass 对 running 一律 skip，不复位就永久封死） */
  /** 跨租户复位（与扫描同款裸仓库豁免）：boot 时 ALS 为空，scoped 会按 IS NULL 过滤导致静默 no-op */
  async resetToPending(id: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(KbDigestPassEntity)
      .set({ status: 'pending', updatedAt: new Date() })
      .where('id = :id AND status = :st', { id, st: 'running' })
      .execute()
  }

  /**
   * 手动重试：某文档耗尽的章级台账（failed 且 attempts>=MAX_ATTEMPTS）复位 pending。
   * ensurePass 对耗尽行一律 skip——不复活的话「提取知识」按钮永远重不动失败章。
   * 仅手动入队路径调用（人工意图明确）；自动恢复 recover 不碰耗尽行。
   */
  async reviveExhaustedForDocument(documentId: string): Promise<number> {
    const now = new Date()
    const rows = await this.scoped.find({
      where: { documentId, status: 'failed' } as FindOptionsWhere<KbDigestPassEntity>,
    })
    const exhausted = rows.filter((r) => r.attempts >= MAX_ATTEMPTS)
    for (const r of exhausted) {
      r.status = 'pending'
      r.error = null
      r.updatedAt = now
      await this.scoped.save(r)
    }
    return exhausted.length
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

  /**
   * 冶炼层成本记账（v2 P1，A5）：一次性写入的 done 行——不经 ensurePass 的
   * 重试/幂等语义（冶炼幂等在卡层：同题去重+实例合并），台账行只为成本熔断
   * （costByKb 聚合）与仪表提供可见性。documentId 用 kbId 占位（KB 级任务
   * 无属主文档；recover 兜底对非法文档 id 是 no-op）。
   */
  async recordCompletedPass(input: {
    knowledgeBaseId: string
    documentId: string
    passType: KbDigestPassType
    passKey: string
    stats: Record<string, number>
    cost: Record<string, number>
  }): Promise<void> {
    const now = new Date()
    const e = new KbDigestPassEntity()
    e.id = randomUUID()
    e.userId = getCurrentUserId()
    e.knowledgeBaseId = input.knowledgeBaseId
    e.documentId = input.documentId
    e.chapterId = null
    e.passType = input.passType
    e.passKey = input.passKey
    e.chapterHash = null
    e.status = 'done'
    e.statsJson = JSON.stringify(input.stats)
    e.costJson = JSON.stringify(input.cost)
    e.attempts = 1
    e.createdAt = now
    e.updatedAt = now
    try {
      await this.scoped.save(e)
    } catch {
      // 记账失败不影响冶炼产物（成本可见性尽力而为）
    }
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as FindOptionsWhere<KbDigestPassEntity>)
  }
}
