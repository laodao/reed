/**
 * 品类级汇总（v2 P1 corpus-passes）：场面分布 + 套路清单 → 品类认知卡
 * @module platform/services/kb-brain/corpus-passes.service
 *
 * 不依赖跨书实体对齐的品类 rollup（变体矩阵在 P3 实体归并后产出）。
 * 幂等：同题（品类认知）卡存在时演进刷新（分布随库增长变化）。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbEventRepository } from '@core/database/repositories/kb-event.repository'
import type { KbNoteRepository, KbNoteRecord } from '@core/database/repositories/kb-note.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import type { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import type { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import type { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { GENRE_INSIGHT_SYSTEM, buildGenreInsightUser, SETTING_MATRIX_SYSTEM, buildSettingMatrixUser } from './prompts'
import { parseGenreInsightOutput, parseSettingMatrixOutput } from './schemas'
import { defaultBrainLlm, type BrainLlmFn } from './llm'
import { publishSmeltCard } from './smelt-common'

const logger = createLogger('KbCorpusPasses')

interface SmeltRepos {
  events: KbEventRepository
  notes: KbNoteRepository
  passes: KbDigestPassRepository
  docs: KbDocumentRepository
  /** v2 P3 变体矩阵取材（corpus-merge 标注后的品类级实体） */
  entities: KbEntityRepository
  atoms: KbAtomRepository
}

export interface CorpusPassesDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => SmeltRepos | null
}

export class KbCorpusPassesService {
  private readonly llm: BrainLlmFn
  private readonly reposFn: () => SmeltRepos | null
  private readonly running = new Set<string>()

  constructor(deps: CorpusPassesDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride)
    this.reposFn =
      deps.repos ??
      ((): SmeltRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbEvents || !db.kbNotes || !db.kbDigestPasses || !db.kbDocuments || !db.kbBrainEntities || !db.kbAtoms) return null
        return { events: db.kbEvents, notes: db.kbNotes, passes: db.kbDigestPasses, docs: db.kbDocuments, entities: db.kbBrainEntities, atoms: db.kbAtoms }
      })
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  async runGenreInsight(kbId: string, opts?: { review?: boolean }): Promise<{ card: boolean; evolved: boolean; createdNoteIds: string[] }> {
    if (this.running.has(kbId)) return { card: false, evolved: false, createdNoteIds: [] }
    const repos = this.reposFn()
    if (!repos) return { card: false, evolved: false, createdNoteIds: [] }
    this.running.add(kbId)
    try {
      const events = await repos.events.findByKb(kbId, { limit: 5000 })
      if (events.length === 0) return { card: false, evolved: false, createdNoteIds: [] }
      const docs = await repos.docs.findByKnowledgeBaseId(kbId)

      // 场面分布（数量 + 覆盖书数）
      const distMap = new Map<string, { count: number; docs: Set<string> }>()
      for (const e of events) {
        const d = distMap.get(e.sceneType) ?? { count: 0, docs: new Set<string>() }
        d.count += 1
        d.docs.add(e.sourceDocumentId)
        distMap.set(e.sceneType, d)
      }
      const sceneDistribution = [...distMap.entries()].map(([sceneType, d]) => ({
        sceneType,
        count: d.count,
        docCount: d.docs.size,
      }))

      // 套路清单（已发布 plot-pattern，按实例数排序）
      const { rows } = await repos.notes.listByStatus(kbId, 'published', 1, 50, 'plot-pattern')
      const topPatterns = rows
        .map((p) => {
          let instances = 0
          let docCount = 0
          try {
            const arr = JSON.parse(p.patternInstances ?? '[]') as Array<{ documentId?: string }>
            instances = arr.length
            docCount = new Set(arr.map((i) => i.documentId).filter(Boolean)).size
          } catch {
            instances = 0
          }
          return { title: p.title, instances, docCount }
        })
        .sort((a, b) => b.instances - a.instances)
        .slice(0, 10)

      const draft = await this.reflect(kbId, sceneDistribution, topPatterns, docs.length)
      if (!draft) return { card: false, evolved: false, createdNoteIds: [] }

      const body = [
        `> 库内 ${docs.length} 本书；场面 ${events.length} 个；依据套路卡 ${topPatterns.length} 张；模型置信 ${draft.confidence}`,
        '',
        '## 读者期待（不满足会弃书的契约）',
        ...draft.expectations.map((x) => `- ${x}`),
        '',
        '## 爽点机制',
        ...draft.payoffs.map((x) => `- ${x}`),
        '',
        '## 常见雷点',
        ...draft.pitfalls.map((x) => `- ${x}`),
      ].join('\n')
      const description = `写这个品类的书之前的读者心理地图——期待契约、爽点机制、雷点清单。动笔搭骨架时先读。`

      // 幂等：同域卡演进刷新（分布随库增长变化）；已归档=用户不要，不复活
      const similar = await repos.notes.findSimilarTitle(kbId, draft.title)
      const existing = similar.find((s) => s.type === 'genre-insight' && s.status !== 'archived') as KbNoteRecord | undefined
      if (existing) {
        await repos.notes.evolveCard(existing.id, { body, description })
        await repos.passes.recordCompletedPass({
          knowledgeBaseId: kbId,
          documentId: kbId,
          passType: 'smelt',
          passKey: `smelt:genre:${Date.now()}`,
          stats: { evolved: 1 },
          cost: { calls: 1, tokensIn: 0, tokensOut: 0 },
        })
        return { card: false, evolved: true, createdNoteIds: [] }
      }
      const created = await publishSmeltCard(repos.notes, kbId, {
        title: draft.title,
        description,
        body,
        type: 'genre-insight',
        origin: 'ai-distill',
        evidence: JSON.stringify(topPatterns.slice(0, 5).map((p) => ({ noteTitle: p.title }))),
        tags: JSON.stringify(['smelt', 'genre']),
      }, { review: opts?.review })
      await repos.passes.recordCompletedPass({
        knowledgeBaseId: kbId,
        documentId: kbId,
        passType: 'smelt',
        passKey: `smelt:genre:${Date.now()}`,
        stats: { cards: 1 },
        cost: { calls: 1, tokensIn: 0, tokensOut: 0 },
      })
      logger.info(`[kb-smelt] kb=${kbId} 品类认知卡已产出`)
      return { card: true, evolved: false, createdNoteIds: [created.id] }
    } finally {
      this.running.delete(kbId)
    }
  }

  /**
   * 设定变体矩阵（v2 P3，自 P1 移入）：corpus-merge 标注出的品类级概念 →
   * 各书表述 → 「通用骨架 vs 各书变体」setting-pattern 卡（tags: corpus-matrix）。
   * 幂等：同题卡演进刷新。
   */
  async runSettingMatrix(kbId: string, opts?: { review?: boolean }): Promise<{ cards: number; evolved: number; llmCalls: number; createdNoteIds: string[] }> {
    if (this.running.has(kbId)) return { cards: 0, evolved: 0, llmCalls: 0, createdNoteIds: [] }
    const repos = this.reposFn()
    if (!repos) return { cards: 0, evolved: 0, llmCalls: 0, createdNoteIds: [] }
    this.running.add(kbId)
    let llmCalls = 0
    try {
      // 品类级概念（corpus-merge 已标注 scope）——设定体系类优先
      const corpusEntities = (await repos.entities.listActiveByTypes(kbId, ['setting-system', 'concept'], 100)).filter(
        (e) => e.scope === 'corpus',
      )
      let cards = 0
      let evolved = 0
      const createdNoteIds: string[] = []
      for (const ent of corpusEntities.slice(0, 8)) {
        // 各书表述：该实体挂点论断按书分组，每书取样 ≤3 条
        const atoms = await repos.atoms.findByEntities(kbId, [ent.id], { lensNoteId: null, statuses: ['supported'] })
        const byDoc = new Map<string, string[]>()
        for (const a of atoms) {
          if (!byDoc.has(a.sourceDocumentId)) byDoc.set(a.sourceDocumentId, [])
          if (byDoc.get(a.sourceDocumentId)!.length < 3) byDoc.get(a.sourceDocumentId)!.push(a.statement)
        }
        const perDoc = [...byDoc.entries()].map(([doc, statements]) => ({ doc: doc.slice(0, 8), statements }))
        if (perDoc.length < 2) continue // 单书概念没有「变体矩阵」可言
        const draft = await this.reflectMatrix(kbId, ent.name, perDoc)
        llmCalls += 1
        if (!draft) continue

        const body = [
          `> 品类级概念「${ent.name}」跨 ${perDoc.length} 本书；模型置信 ${draft.confidence}`,
          '',
          '## 通用骨架',
          ...draft.skeleton.map((s) => `- ${s}`),
          '',
          '## 各书变体',
          ...draft.variants.map((v) => `- ${v.doc}：${v.variant}`),
          ...(draft.designHint ? ['', '## 自建体系取舍', draft.designHint] : ''),
        ].join('\n')
        const similar = await repos.notes.findSimilarTitle(kbId, draft.title)
        const existing = similar.find((s) => s.type === 'setting-pattern' && s.status !== 'archived')
        if (existing) {
          await repos.notes.evolveCard(existing.id, { body, description: `品类级设定概念「${ent.name}」的通用骨架与各书变体——设计自己的体系时参考。` })
          evolved += 1
          continue
        }
        const created = await publishSmeltCard(repos.notes, kbId, {
          title: draft.title,
          description: `品类级设定概念「${ent.name}」的通用骨架与各书变体——设计自己的体系时参考。`,
          body,
          type: 'setting-pattern',
          origin: 'ai-distill',
          evidence: JSON.stringify(atoms.slice(0, 10).map((a) => ({ atomId: a.id, statement: a.statement }))),
          patternSkeleton: JSON.stringify(draft.skeleton),
          patternInstances: JSON.stringify(draft.variants.map((v) => ({ documentId: v.doc, variant: v.variant }))),
          tags: JSON.stringify(['smelt', 'corpus-matrix']),
        }, { review: opts?.review })
        createdNoteIds.push(created.id)
        cards += 1
      }
      if (llmCalls > 0) {
        await repos.passes.recordCompletedPass({
          knowledgeBaseId: kbId,
          documentId: kbId,
          passType: 'smelt',
          passKey: `smelt:matrix:${Date.now()}`,
          stats: { cards, evolved },
          cost: { calls: llmCalls, tokensIn: 0, tokensOut: 0 },
        })
      }
      logger.info(`[kb-smelt] kb=${kbId} 变体矩阵: 新卡=${cards} 演进=${evolved} 调用=${llmCalls}`)
      return { cards, evolved, llmCalls, createdNoteIds }
    } finally {
      this.running.delete(kbId)
    }
  }

  private async reflectMatrix(kbId: string, concept: string, perDoc: Array<{ doc: string; statements: string[] }>) {
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        attempt === 0
          ? buildSettingMatrixUser({ concept, perDoc })
          : `${buildSettingMatrixUser({ concept, perDoc })}\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。`
      try {
        const raw = await this.llm({ system: SETTING_MATRIX_SYSTEM, user, maxTokens: 2000 })
        return parseSettingMatrixOutput(extractJsonFromResponse(raw))
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    logger.warn(`[kb-smelt] kb=${kbId} 变体矩阵两试失败: ${lastError}`)
    return null
  }

  private async reflect(kbId: string, sceneDistribution: Array<{ sceneType: string; count: number; docCount: number }>, topPatterns: Array<{ title: string; instances: number; docCount: number }>, totalDocs: number) {
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        attempt === 0
          ? buildGenreInsightUser({ sceneDistribution, topPatterns, totalDocs })
          : `${buildGenreInsightUser({ sceneDistribution, topPatterns, totalDocs })}\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。`
      try {
        const raw = await this.llm({ system: GENRE_INSIGHT_SYSTEM, user, maxTokens: 2500 })
        return parseGenreInsightOutput(extractJsonFromResponse(raw))
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    logger.warn(`[kb-smelt] kb=${kbId} 品类认知两试失败: ${lastError}`)
    return null
  }
}

let singleton: KbCorpusPassesService | null = null

export function getKbCorpusPassesService(): KbCorpusPassesService {
  if (!singleton) singleton = new KbCorpusPassesService()
  return singleton
}
