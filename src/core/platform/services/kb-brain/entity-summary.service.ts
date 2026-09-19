/**
 * 知识大脑·实体摘要演化（T13a，详细设计 §3.1 步骤 7 / Zep 模式）
 * @module platform/services/kb-brain/entity-summary.service
 *
 * 消化完成后：pending 实体 → 按挂点论断生成 2-3 句演化摘要（重写非追加，
 * 代谢整固时凝练=要义强化）→ 入池（ent:<id> 向量 + 倒排）。
 * fail-soft：单实体失败标 failed 可重试；并发 3（worker-pool 先例）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import type { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { tokenizeForIndex } from '@core/platform/services/kb-tokenize'
import { defaultBrainLlm, type BrainLlmFn } from './llm'

const logger = createLogger('KbBrainEntitySummary')

const SUMMARY_SYSTEM =
  '你是知识库编辑。根据实体的关联论断，为该实体写一段 2~3 句的中文摘要：它是什么、核心特征/关系、' +
  '在库中的意义。基于给定论断归纳，不要编造论断之外的信息。只输出摘要正文。'

export interface EntitySummaryDeps {
  llm?: BrainLlmFn
  embed?: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
  /** 覆盖仓储（测试注入；生产 getCoreDatabaseManager） */
  repos?: () => { entities: KbEntityRepository; atoms: KbAtomRepository; vectors: { createBatch(rows: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }>): Promise<void> } | null; inverted: { insertBatch(rows: Array<{ term: string; chunkId: string; knowledgeBaseId: string; termFrequency: number }>): Promise<void> } | null } | null
  concurrency?: number
}

export class KbEntitySummaryService {
  private readonly llm: BrainLlmFn
  private readonly embedFn: NonNullable<EntitySummaryDeps['embed']>
  private readonly reposFn: NonNullable<EntitySummaryDeps['repos']>
  private readonly concurrency: number

  constructor(deps: EntitySummaryDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-atomize')
    this.concurrency = deps.concurrency ?? 3
    this.embedFn = deps.embed ?? (async () => null)
    this.reposFn =
      deps.repos ??
      (() => {
        const db = getCoreDatabaseManager()
        if (!db.kbBrainEntities || !db.kbAtoms) return null
        return { entities: db.kbBrainEntities, atoms: db.kbAtoms, vectors: db.kbVectors, inverted: db.kbInvertedIndex }
      })
  }

  /** 单实体的关联论断聚合文本（挂点+基础遍，截断 2000 字） */
  private async gatherEvidence(kbId: string, entityId: string, limit = 24): Promise<string> {
    const repos = this.reposFn()
    if (!repos) return ''
    const atoms = await repos.atoms.findByEntities(kbId, [entityId], {
      lensNoteId: null,
      statuses: ['supported'],
    })
    return atoms
      .slice(0, limit)
      .map((a) => `- ${a.statement}`)
      .join('\n')
      .slice(0, 2000)
  }

  async summarizePending(kbId: string, embeddingConfig: string | null, limit = 20): Promise<{ done: number; failed: number }> {
    const repos = this.reposFn()
    if (!repos) return { done: 0, failed: 0 }
    const pending = await repos.entities.pendingSummaries(kbId, limit)
    let done = 0
    let failed = 0
    const concurrency = this.concurrency
    const queue = [...pending]
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (;;) {
        const ent = queue.shift()
        if (!ent) return
        const ok = await this.summarizeOne(kbId, ent.id, ent.name, embeddingConfig)
        if (ok) done++
        else failed++
      }
    })
    await Promise.all(workers)
    return { done, failed }
  }

  async summarizeOne(kbId: string, entityId: string, name: string, embeddingConfig: string | null): Promise<boolean> {
    const repos = this.reposFn()
    if (!repos) return false
    try {
      const evidence = await this.gatherEvidence(kbId, entityId)
      if (!evidence.trim()) {
        // 无证据不生成（摘要必须有据）——保持 pending，等下一批论断
        return false
      }
      const text = (await this.llm({ system: SUMMARY_SYSTEM, user: `实体：${name}\n关联论断：\n${evidence}`, maxTokens: 1200 })).trim()
      if (!text) throw new Error('空摘要')
      await repos.entities.replaceSummary(entityId, text, 'done')
      // 入池：ent:<id> 向量 + 倒排（实体摘要参与检索——SiReRAG 关联树思想）
      if (repos.vectors) {
        const vectors = await this.embedFn([`${name}：${text}`], { id: kbId, embeddingConfig })
        if (vectors && vectors.length === 1) {
          await repos.vectors.createBatch([{ chunkId: `ent:${entityId}`, knowledgeBaseId: kbId, vector: vectors[0] }])
        }
      }
      if (repos.inverted) {
        const terms = new Map<string, number>()
        for (const t of tokenizeForIndex(`${name} ${text}`)) terms.set(t, (terms.get(t) ?? 0) + 1)
        await repos.inverted.insertBatch([...terms.entries()].map(([term, tf]) => ({ term, chunkId: `ent:${entityId}`, knowledgeBaseId: kbId, termFrequency: tf })))
      }
      return true
    } catch (e) {
      logger.warn(`[kb-entity-summary] 实体摘要失败 entity=${entityId}: ${e instanceof Error ? e.message : String(e)}`)
      await repos.entities.replaceSummary(entityId, '', 'failed').catch(() => {})
      return false
    }
  }
}
