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
import {
  DISTILL_SYSTEM,
  buildDistillUser,
  SETTING_PATTERN_SYSTEM,
  buildSettingPatternUser,
  CHARACTER_PATTERN_SYSTEM,
  buildCharacterPatternUser,
} from './prompts'
import type { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { defaultBrainLlm, type BrainLlmFn } from './llm'

const logger = createLogger('KbBrainDistill')

/** 聚类参数 */
const CLUSTER_MIN = 4
const CLUSTER_MAX = 30
const COSINE_CLUSTER_THRESHOLD = 0.72

export interface DistillDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  embed?: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
  repos?: () => { atoms: KbAtomRepository; notes: KbNoteRepository; entities: KbEntityRepository } | null
  /** 设定模式卡开关（brainConfig.patterns.settingEnabled；缺省开） */
  settingPatternEnabled?: boolean
  /** 人物原型卡开关（brainConfig.patterns.characterEnabled；缺省关） */
  characterPatternEnabled?: boolean
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

  private readonly settingPatternEnabled: boolean
  private readonly characterPatternEnabled: boolean

  constructor(deps: DistillDeps = {}) {
    this.settingPatternEnabled = deps.settingPatternEnabled ?? true
    this.characterPatternEnabled = deps.characterPatternEnabled ?? false
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride) // 高档：提炼走裁决档
    this.embedFn = deps.embed ?? (async () => null)
    this.reposFn =
      deps.repos ??
      (() => {
        const db = getCoreDatabaseManager()
        if (!db.kbAtoms || !db.kbNotes || !db.kbBrainEntities) return null
        return { atoms: db.kbAtoms, notes: db.kbNotes, entities: db.kbBrainEntities }
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
    if (candidates.length < CLUSTER_MIN && !this.settingPatternEnabled && !this.characterPatternEnabled) return outcome
    if (candidates.length >= CLUSTER_MIN) outcome.atomsConsumed = candidates.length

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

    // T19 设定模式卡（P-5）：setting-system 实体的规则论断跨书归纳
    if (this.settingPatternEnabled) {
      try {
        const patternCards = await this.distillSettingPatterns(kbId, embeddingConfig)
        outcome.cardsProposed += patternCards
      } catch (e) {
        logger.warn(`[kb-distill] 设定模式卡归纳失败（不阻塞）: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // G4 人物原型卡（P-7）：人物论断跨书嵌入聚类归纳
    if (this.characterPatternEnabled) {
      try {
        const characterCards = await this.distillCharacterPatterns(kbId, embeddingConfig)
        outcome.cardsProposed += characterCards
      } catch (e) {
        logger.warn(`[kb-distill] 人物原型卡归纳失败（不阻塞）: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    logger.info(
      `[kb-distill] kb=${kbId} 簇=${outcome.clustersFormed} 提议=${outcome.cardsProposed} 同题跳过=${outcome.duplicatesSkipped}`,
    )
    return outcome
  }

  /** P-5：按 setting-system 实体分组 → 规则论断跨书归纳 → setting-pattern 卡（proposed） */
  private async distillSettingPatterns(kbId: string, _embeddingConfig: string | null): Promise<number> {
    const repos = this.reposFn()
    if (!repos) return 0
    // 只对非人物/地点类实体归纳（盲审 P2：人物实体论断最多，会产出伪设定卡）；
    // updatedAt 序 + cap 20（近期活跃优先，防新实体饿死）
    let proposed = 0
    const allActive = await repos.entities.listActiveWithAliases(kbId, 20, {
      excludeTypes: ['character', 'location', 'organization', 'item', 'plot-motif'],
      orderByUpdated: true,
    })
    for (const ent of allActive) {
      const atoms = await repos.atoms.findByEntities(kbId, [ent.id], { lensNoteId: null, statuses: ['supported'] })
      const ruleAtoms = atoms.filter((a) => ['fact', 'method', 'insight'].includes(a.type))
      if (ruleAtoms.length < 3) continue
      const card = await this.reflectSettingPattern(ent.name, ruleAtoms)
      if (!card) continue
      const similar = await repos.notes.findSimilarTitle(kbId, card.title)
      if (similar.some((s) => s.title === card.title && s.status !== 'archived')) continue
      await repos.notes.propose(kbId, {
        title: card.title,
        description: card.description,
        body: card.body,
        type: 'setting-pattern',
        evidence: JSON.stringify(ruleAtoms.slice(0, 12).map((a) => ({ atomId: a.id, statement: a.statement }))),
        origin: 'ai-distill',
        patternSkeleton: card.skeleton,
        patternInstances: card.instances,
      })
      proposed++
    }
    return proposed
  }

  /**
   * G4 人物原型卡（P-7）：人物论断跨书嵌入聚类 → 原型卡（proposed）。
   * 与设定卡的关键差异：实体名跨书不相同（张小凡≠韩立），按实体分组只能出
   * 单书角色卡——必须跨书按功能结构聚类，且簇内覆盖 ≥2 本书才成卡
   * （单书簇是角色分析不是原型，直接跳过）。
   */
  private async distillCharacterPatterns(kbId: string, embeddingConfig: string | null): Promise<number> {
    const repos = this.reposFn()
    if (!repos) return 0
    // 人物实体：excludeTypes 是仓储唯一过滤口，用「已知类型全集 - character」反向圈定
    const chars = await repos.entities.listActiveWithAliases(kbId, 40, {
      excludeTypes: ['location', 'organization', 'item', 'concept', 'plot-motif', 'setting-system'],
      orderByUpdated: true,
    })
    if (chars.length === 0) return 0
    const atoms = await repos.atoms.findByEntities(kbId, chars.map((c) => c.id), {
      lensNoteId: null,
      statuses: ['supported'],
    })
    const pool = atoms.filter((a) => ['fact', 'claim'].includes(a.type)).slice(0, 400)
    if (pool.length < CLUSTER_MIN) return 0
    const vectors = await this.embedFn(pool.map((a) => a.statement), { id: kbId, embeddingConfig })
    const clusters: KbAtomRecord[][] =
      vectors && vectors.length === pool.length ? clusterByEmbedding(pool, vectors) : clusterByType(pool)
    let proposed = 0
    for (const cluster of clusters) {
      if (cluster.length < CLUSTER_MIN) continue
      if (new Set(cluster.map((a) => a.sourceDocumentId)).size < 2) continue // 单书簇不出原型卡
      const card = await this.reflectCharacterPattern(cluster)
      if (!card) continue
      const similar = await repos.notes.findSimilarTitle(kbId, card.title)
      if (similar.some((s) => s.title === card.title && s.status !== 'archived')) continue
      await repos.notes.propose(kbId, {
        title: card.title,
        description: card.description,
        body: card.body,
        type: 'character-pattern',
        evidence: JSON.stringify(cluster.slice(0, 12).map((a) => ({ atomId: a.id, statement: a.statement }))),
        origin: 'ai-distill',
        patternSkeleton: card.skeleton,
        patternInstances: card.instances,
      })
      proposed++
    }
    return proposed
  }

  /** P-7 反思（校验失败重试 1 次；模型可主动 skip——簇内矛盾无法参数化时放弃出卡） */
  private async reflectCharacterPattern(
    cluster: KbAtomRecord[],
  ): Promise<{ title: string; description: string; body: string; skeleton: string; instances: string } | null> {
    let lastError = ''
    const items = cluster.map((a) => ({ statement: a.statement, source: a.sourceDocumentId.slice(0, 8) }))
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        attempt === 0
          ? buildCharacterPatternUser({ statements: items })
          : `${buildCharacterPatternUser({ statements: items })}\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。`
      try {
        const raw = await this.llm({ system: CHARACTER_PATTERN_SYSTEM, user, maxTokens: 3000 })
        const parsed = extractJsonFromResponse(raw) as Partial<{
          title: string
          description: string
          body: string
          skeleton: unknown
          instances: unknown
          skip: boolean
          reason: string
        }>
        if (parsed.skip) {
          logger.info(`[kb-distill] 人物原型簇主动跳过：${String(parsed.reason ?? '').slice(0, 80)}`)
          return null
        }
        const title = String(parsed.title ?? '').trim()
        if (!title || title.length < 8) throw new Error('title 缺失或过短')
        const description = String(parsed.description ?? '').trim()
        if (!description) throw new Error('description 缺失')
        return {
          title,
          description,
          body: String(parsed.body ?? '').trim(),
          skeleton: JSON.stringify(parsed.skeleton ?? []),
          instances: JSON.stringify(parsed.instances ?? []),
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    return null
  }

  /** P-5 反思（校验失败重试 1 次） */
  private async reflectSettingPattern(
    entityName: string,
    ruleAtoms: KbAtomRecord[],
  ): Promise<{ title: string; description: string; body: string; skeleton: string; instances: string } | null> {
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        attempt === 0
          ? buildSettingPatternUser({ entityName, statements: ruleAtoms.map((a) => ({ statement: a.statement, source: a.sourceDocumentId.slice(0, 8) })) })
          : `${buildSettingPatternUser({ entityName, statements: ruleAtoms.map((a) => ({ statement: a.statement, source: a.sourceDocumentId.slice(0, 8) })) })}\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。`
      try {
        const raw = await this.llm({ system: SETTING_PATTERN_SYSTEM, user, maxTokens: 3000 })
        const parsed = extractJsonFromResponse(raw) as Partial<{
          title: string
          description: string
          body: string
          skeleton: unknown
          instances: unknown
        }>
        const title = String(parsed.title ?? '').trim()
        if (!title || title.length < 8) throw new Error('title 缺失或过短')
        const description = String(parsed.description ?? '').trim()
        if (!description) throw new Error('description 缺失')
        return {
          title,
          description,
          body: String(parsed.body ?? '').trim(),
          skeleton: JSON.stringify(parsed.skeleton ?? []),
          instances: JSON.stringify(parsed.instances ?? []),
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    return null
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
