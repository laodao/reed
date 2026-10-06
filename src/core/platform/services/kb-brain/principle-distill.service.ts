/**
 * 原理归纳（v2 P1）：已发布套路卡簇 → 跨套路原理卡（为什么有效/何时失效）
 * @module platform/services/kb-brain/principle-distill.service
 *
 * 抽象层的价值链顶：原理卡必须链回 ≥2 张套路卡（evidence noteId 锚点），
 * 抽象不飘。触发门槛：库内已发布 plot-pattern 卡 ≥4 张。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbNoteRepository, KbNoteRecord } from '@core/database/repositories/kb-note.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { INDUCE_PRINCIPLE_SYSTEM, buildInducePrincipleUser } from './prompts'
import { parsePrincipleOutput } from './schemas'
import { defaultBrainLlm, type BrainLlmFn } from './llm'
import { clusterSimilar, defaultBrainEmbed, publishSmeltCard } from './smelt-common'

const logger = createLogger('KbPrincipleDistill')

/** 原理归纳的套路卡基数门槛（少于 4 张套路谈不上跨套路归纳） */
export const MIN_PATTERNS_FOR_PRINCIPLE = 4

interface SmeltRepos {
  notes: KbNoteRepository
  passes: KbDigestPassRepository
}

export interface PrincipleDistillDeps {
  llm?: BrainLlmFn
  embed?: (texts: string[], kb: { id: string; embeddingConfig: string | null }) => Promise<number[][] | null>
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => SmeltRepos | null
}

export class KbPrincipleDistillService {
  private readonly llm: BrainLlmFn
  private readonly embedFn: NonNullable<PrincipleDistillDeps['embed']>
  private readonly reposFn: () => SmeltRepos | null
  private readonly running = new Set<string>()

  constructor(deps: PrincipleDistillDeps = {}) {
    this.llm = deps.llm ?? defaultBrainLlm('kb-brain-adjudicate', deps.modelOverride)
    this.embedFn = deps.embed ?? defaultBrainEmbed
    this.reposFn =
      deps.repos ??
      ((): SmeltRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbNotes || !db.kbDigestPasses) return null
        return { notes: db.kbNotes, passes: db.kbDigestPasses }
      })
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  async run(kbId: string, embeddingConfig: string | null, opts?: { review?: boolean }): Promise<{ cards: number; llmCalls: number; createdNoteIds: string[] }> {
    if (this.running.has(kbId)) return { cards: 0, llmCalls: 0, createdNoteIds: [] }
    const repos = this.reposFn()
    if (!repos) return { cards: 0, llmCalls: 0, createdNoteIds: [] }
    this.running.add(kbId)
    let llmCalls = 0
    try {
      // 已发布套路卡（含 distill 设定轨的 plot-pattern 与冶炼产线）——tags 过滤冶炼轨：
      // 原理归纳面向场面/情节域（设定轨的原理走 distill 自己的体系）
      const { rows } = await repos.notes.listByStatus(kbId, 'published', 1, 200, 'plot-pattern')
      const patterns = rows.filter((r) => {
        try {
          return (JSON.parse(r.tags) as string[]).includes('smelt')
        } catch {
          return false
        }
      })
      if (patterns.length < MIN_PATTERNS_FOR_PRINCIPLE) return { cards: 0, llmCalls: 0, createdNoteIds: [] }

      const texts = patterns.map((p) => `${p.title}。${p.description}`)
      const vectors = await this.embedFn(texts, { id: kbId, embeddingConfig })
      const clusters =
        vectors && vectors.length === patterns.length ? clusterSimilar(patterns, vectors) : [patterns]

      let cards = 0
      const createdNoteIds: string[] = []
      for (const cluster of clusters) {
        if (cluster.length < 2) continue // 原理至少链 2 套路
        const draft = await this.reflect(kbId, cluster)
        llmCalls += 1
        if (!draft) continue
        const similar = await repos.notes.findSimilarTitle(kbId, draft.title)
        if (similar.some((s) => s.title === draft.title && s.status !== 'archived')) continue
        const anchors = draft.evidenceIdx
          .map((i) => cluster[i])
          .filter((p): p is KbNoteRecord => !!p)
          .map((p) => ({ noteId: p.id, title: p.title }))
        const body = [
          `> 支撑套路 ${anchors.length} 张（${anchors.map((a) => `《${a.title}》`).join('、')}）；模型置信 ${draft.confidence}`,
          '',
          '## 原理',
          draft.principle,
          '',
          '## 机制',
          draft.mechanism,
          '',
          '## 何时失效',
          draft.whenFails,
        ].join('\n')
        const created = await publishSmeltCard(repos.notes, kbId, {
          title: draft.title,
          description: `跨套路写作原理——适用${cluster
            .map((p) => (p.tags.includes('scene:') ? p.tags.split('"').find((s) => s.startsWith('scene:'))?.slice(6) : null))
            .filter(Boolean)
            .slice(0, 3)
            .join('、')} 等场面域；写法决策时作上层依据。`,
          body,
          type: 'principle',
          origin: 'ai-distill',
          evidence: JSON.stringify(anchors),
          tags: JSON.stringify(['smelt', 'principle']),
        }, { review: opts?.review })
        createdNoteIds.push(created.id)
        cards += 1
      }

      if (llmCalls > 0) {
        await repos.passes.recordCompletedPass({
          knowledgeBaseId: kbId,
          documentId: kbId,
          passType: 'smelt',
          passKey: `smelt:principle:${Date.now()}`,
          stats: { cards },
          cost: { calls: llmCalls, tokensIn: 0, tokensOut: 0 },
        })
      }
      logger.info(`[kb-smelt] kb=${kbId} 原理归纳: ${cards} 卡 / ${llmCalls} 调用`)
      return { cards, llmCalls, createdNoteIds }
    } finally {
      this.running.delete(kbId)
    }
  }

  private async reflect(kbId: string, cluster: KbNoteRecord[]) {
    let lastError = ''
    const patterns = cluster.map((p) => {
      let sceneType: string | undefined
      try {
        const t = JSON.parse(p.tags) as string[]
        sceneType = t.find((x) => x.startsWith('scene:'))?.slice(6)
      } catch {
        sceneType = undefined
      }
      return { title: p.title, description: p.description, sceneType }
    })
    for (let attempt = 0; attempt < 2; attempt++) {
      const user =
        attempt === 0
          ? buildInducePrincipleUser({ patterns })
          : `${buildInducePrincipleUser({ patterns })}\n\n【上次输出不合法】\n${lastError}\n请重新输出完整合法的 JSON。`
      try {
        const raw = await this.llm({ system: INDUCE_PRINCIPLE_SYSTEM, user, maxTokens: 2500 })
        const parsed = parsePrincipleOutput(extractJsonFromResponse(raw), { count: cluster.length })
        if ('skip' in parsed) {
          logger.info(`[kb-smelt] kb=${kbId} 原理簇主动跳过：${(parsed.reason ?? "").slice(0, 80)}`)
          return null
        }
        return parsed
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    logger.warn(`[kb-smelt] kb=${kbId} 原理归纳两试失败: ${lastError}`)
    return null
  }
}

let singleton: KbPrincipleDistillService | null = null

export function getKbPrincipleDistillService(): KbPrincipleDistillService {
  if (!singleton) singleton = new KbPrincipleDistillService()
  return singleton
}
