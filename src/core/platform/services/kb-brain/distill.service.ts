/**
 * 知识大脑·提炼流水线（T14，详细设计 §6.2 P-4 两段式反思）
 * @module platform/services/kb-brain/distill.service
 *
 * 取材（supported 增量）→ 嵌入聚类（簇 8-30）→ 每簇两段式反思 → 思想卡
 * 草稿（proposed）→ 提议去重（同题改版）。AI 产物永不直接 published。
 * 手动触发（IPC kb:brain:distill）+ 重要性账户自动触发（编排器）。
 */
import { createLogger } from '@core/utils/logger'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbAtomRepository, KbAtomRecord } from '@core/database/repositories/kb-atom.repository'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { DISTILL_SYSTEM, buildDistillUser } from './prompts'
import { defaultBrainLlm, type BrainLlmFn } from './llm'

const logger = createLogger('KbBrainDistill')

/** 聚类参数 */
const CLUSTER_MIN = 4
const CLUSTER_MAX = 30
const COSINE_CLUSTER_THRESHOLD = 0.72

export interface DistillDeps {
  llm?: BrainLlmFn
  embed?: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
  repos?: () => { atoms: KbAtomRepository; notes: KbNoteRepository } | null
}

export interface DistillOutcome {
  cardsProposed: number
  clustersFormed: number
  duplicatesSkipped: number
  atomsConsumed: number
}

export class KbDistillService {
  private readonly llm: BrainLlmFn
  private readonly embedFn: NonNullable<DistillDeps['embed']>
  private readonly reposFn: NonNullable<DistillDeps['repos']>

  constructor(deps: DistillDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate') // 高档：提炼走裁决档
    this.embedFn = deps.embed ?? (async () => null)
    this.reposFn =
      deps.repos ??
      (() => {
        const db = getCoreDatabaseManager()
        if (!db.kbAtoms || !db.kbNotes) return null
        return { atoms: db.kbAtoms, notes: db.kbNotes }
      })
  }

  /** 提炼入口：返回产出统计。scope 限文档子集（缺省全库 supported） */
  async distill(kbId: string, embeddingConfig: string | null, scope?: { documentIds?: string[] }): Promise<DistillOutcome> {
    const repos = this.reposFn()
    if (!repos) return emptyOutcome()
    const outcome: DistillOutcome = { cardsProposed: 0, clustersFormed: 0, duplicatesSkipped: 0, atomsConsumed: 0 }

    // 1. 取材：method/insight/claim 优先（fact 密度太高不适合直接出卡）
    const pool = await repos.atoms.findByKb(kbId, {
      status: ['supported'],
      limit: 400,
    })
    let candidates = pool.filter((a) => ['method', 'insight', 'claim', 'open-question'].includes(a.type))
    if (scope?.documentIds?.length) {
      const allow = new Set(scope.documentIds)
      candidates = candidates.filter((a) => allow.has(a.sourceDocumentId))
    }
    if (candidates.length < CLUSTER_MIN) return outcome
    outcome.atomsConsumed = candidates.length

    // 2. 嵌入聚类（贪心种子聚类：阈值内归簇；嵌入失败 → 按 type 分组降级）
    const vectors = await this.embedFn(candidates.map((a) => a.statement), { id: kbId, embeddingConfig })
    const clusters: KbAtomRecord[][] =
      vectors && vectors.length === candidates.length
        ? clusterByEmbedding(candidates, vectors)
        : clusterByType(candidates)
    outcome.clustersFormed = clusters.length

    // 3. 每簇两段式反思 → 思想卡草稿
    for (const cluster of clusters) {
      if (cluster.length < CLUSTER_MIN) continue
      const card = await this.reflect(kbId, cluster)
      if (!card) continue
      // 提议去重：同题 → 归档新提议由人审定夺（findSimilarTitle 命中时标记改版提案标题）
      const similar = await repos.notes.findSimilarTitle(kbId, card.title)
      // 仅精确同名且非 archived 的卡拦截（archived=用户已拒绝该思路，放行重提）；
      // 模糊命中不拦截（标题前缀相似≠同题）
      if (similar.some((s) => s.title === card.title && s.status !== 'archived')) {
        outcome.duplicatesSkipped++
        continue
      }
      await repos.notes.propose(kbId, {
        title: card.title,
        description: card.description,
        body: card.body,
        type: 'insight',
        evidence: JSON.stringify(cluster.slice(0, 12).map((a) => ({ atomId: a.id, statement: a.statement }))),
        origin: 'ai-distill',
      })
      outcome.cardsProposed++
    }
    logger.info(
      `[kb-distill] kb=${kbId} 簇=${outcome.clustersFormed} 提议=${outcome.cardsProposed} 同题跳过=${outcome.duplicatesSkipped}`,
    )
    return outcome
  }

  /** P-4 两段式反思（校验失败重试 1 次，复用 atomize 的解析纪律） */
  private async reflect(
    kbId: string,
    cluster: KbAtomRecord[],
  ): Promise<{ title: string; description: string; body: string } | null> {
    void kbId
    const items = cluster.map((a, i) => ({ idx: i, statement: a.statement, type: a.type }))
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        attempt === 0
          ? buildDistillUser({ clusterStatements: items })
          : `${buildDistillUser({ clusterStatements: items })}\n\n【上次输出不合法，请修正】\n${lastError}\n请重新输出完整合法的 JSON。`
      try {
        const raw = await this.llm({ system: DISTILL_SYSTEM, user, maxTokens: 3000 })
        const parsed = extractJsonFromResponse(raw) as Partial<{ title: string; description: string; body: string }>
        const title = String(parsed.title ?? '').trim()
        const description = String(parsed.description ?? '').trim()
        const body = String(parsed.body ?? '').trim()
        if (!title || title.length < 8) throw new Error('title 缺失或过短（须为完整论断句）')
        if (title.length > 60) throw new Error('title 过长（论断句应 ≤60 字）')
        if (!description) throw new Error('description 缺失')
        return { title, description, body }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    logger.warn(`[kb-distill] 簇反思两次失败：${lastError.slice(0, 120)}`)
    return null
  }
}

function emptyOutcome(): DistillOutcome {
  return { cardsProposed: 0, clustersFormed: 0, duplicatesSkipped: 0, atomsConsumed: 0 }
}

/** 贪心种子聚类：余弦 ≥ 阈值归簇；簇超上限拆尾 */
function clusterByEmbedding(atoms: KbAtomRecord[], vectors: number[][]): KbAtomRecord[][] {
  const clusters: Array<{ atoms: KbAtomRecord[]; centroid: number[] }> = []
  const dim = vectors[0]?.length ?? 0
  for (let i = 0; i < atoms.length; i++) {
    const v = vectors[i]
    let best: { idx: number; sim: number } | null = null
    for (let c = 0; c < clusters.length; c++) {
      const sim = cosine(v, clusters[c].centroid)
      if (sim >= COSINE_CLUSTER_THRESHOLD && (!best || sim > best.sim)) best = { idx: c, sim }
    }
    if (best && clusters[best.idx].atoms.length < CLUSTER_MAX) {
      const cl = clusters[best.idx]
      cl.atoms.push(atoms[i])
      // 增量质心
      const n = cl.atoms.length
      for (let d = 0; d < dim; d++) cl.centroid[d] = (cl.centroid[d] * (n - 1) + v[d]) / n
    } else {
      clusters.push({ atoms: [atoms[i]], centroid: [...v] })
    }
  }
  return clusters.map((c) => c.atoms)
}

/** 降级：按 type 分组（每 type 一簇，超上限截断） */
function clusterByType(atoms: KbAtomRecord[]): KbAtomRecord[][] {
  const byType = new Map<string, KbAtomRecord[]>()
  for (const a of atoms) {
    if (!byType.has(a.type)) byType.set(a.type, [])
    if (byType.get(a.type)!.length < CLUSTER_MAX) byType.get(a.type)!.push(a)
  }
  return [...byType.values()]
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}
