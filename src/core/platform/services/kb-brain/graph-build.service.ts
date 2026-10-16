/**
 * 关系图谱构建（P2）
 * @module platform/services/kb-brain/graph-build.service
 *
 * 从滚动阅读的工作记忆（人物档案/关键要素/情节进展）抽取实体间关系
 * （归属/所在地/持有/持用/敌友/亲缘/师承），解析到 kb_entities 实体 ID，
 * 以 entity↔entity 边落入 kb_knowledge_edges——供图谱视图与全书综述取材。
 *
 * - 重建语义：构建前清空该库上一轮 entity↔entity 边（关系随理解演进而更新）
 * - 解析：实体名精确匹配（含别名）；未匹配的名字跳过并计数（宁缺勿造）
 * - 溯源：每条边 evidence 存 {说明, 章节}
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import { createLogger } from '@core/utils/logger'
import { createKbScopedLlm, BRAIN_LLM_MAX_TOKENS, type BrainLlmFn, type BrainModelRef, type KbScopedLlm } from './llm'
import { GRAPH_EXTRACT_SYSTEM, buildGraphExtractUser } from './prompts'

const logger = createLogger('KbGraphBuild')

export const GRAPH_RELATIONS = [
  'member-of',
  'located-in',
  'owns',
  'wields',
  'allied-with',
  'enemy-of',
  'kin-of',
  'mentor-of',
  'relates',
] as const

export const GRAPH_RELATION_LABELS: Record<string, string> = {
  'member-of': '隶属',
  'located-in': '位于',
  'sublevel-of': '低于（体系层级）',
  'requires': '突破前置',
  'enables': '解锁',
  owns: '持有',
  wields: '持用',
  'allied-with': '同盟',
  'enemy-of': '敌对',
  'kin-of': '亲缘',
  'mentor-of': '师承',
  relates: '关联',
}

export interface ExtractedRelation {
  source: string
  relation: string
  target: string
  evidence: string
  chapters: string
}

export interface GraphBuildResult {
  extracted: number
  resolved: number
  unmatched: number
  created: number
  deduped: number
}

export interface GraphBuildRepos {
  notes: KbNoteRepository
  entities: {
    listActiveWithAliases(
      kbId: string,
      limit: number,
      opts?: { excludeTypes?: string[]; orderByUpdated?: boolean }
    ): Promise<GraphEntityRef[]>
  }
  edges: KbKnowledgeEdgeRepository
}

export interface GraphBuildDeps {
  llm?: BrainLlmFn
  modelOverride?: () => BrainModelRef
  repos?: () => GraphBuildRepos | null
}

/** 从记忆正文解析实体关系（纯逻辑，测试友好）：按白名单过滤关系、去自环、去重 */
export function normalizeRelations(raw: unknown, limit = 200): ExtractedRelation[] {
  const list = Array.isArray((raw as { relations?: unknown })?.relations)
    ? ((raw as { relations: unknown[] }).relations as Array<Record<string, unknown>>)
    : []
  const out: ExtractedRelation[] = []
  const seen = new Set<string>()
  for (const r of list) {
    const source = typeof r?.source === 'string' ? r.source.trim() : ''
    const target = typeof r?.target === 'string' ? r.target.trim() : ''
    const relation = typeof r?.relation === 'string' ? r.relation.trim() : ''
    if (!source || !target || source === target) continue
    if (!(GRAPH_RELATIONS as readonly string[]).includes(relation)) continue
    const key = `${source}|${relation}|${target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      source,
      relation,
      target,
      evidence: typeof r?.evidence === 'string' ? r.evidence : '',
      chapters: typeof r?.chapters === 'string' ? r.chapters : '',
    })
    if (out.length >= limit) break
  }
  return out
}

export interface GraphEntityRef {
  id: string
  name: string
  aliases: string[]
  entityType: string
}

/** 实体名解析：精确名 + 别名匹配（纯函数） */
export function resolveEntityName(name: string, entities: GraphEntityRef[]): GraphEntityRef | null {
  const exact = entities.find(e => e.name === name)
  if (exact) return exact
  return entities.find(e => e.aliases.includes(name)) ?? null
}

export class KbGraphBuildService {
  private readonly scoped: KbScopedLlm
  private readonly reposFn: () => GraphBuildRepos | null
  private readonly running = new Set<string>()

  constructor(deps: GraphBuildDeps = {}) {
    this.scoped = createKbScopedLlm('kb-brain-adjudicate', {
      injected: deps.llm,
      fallback: deps.modelOverride
    })
    this.reposFn =
      deps.repos ??
      ((): GraphBuildRepos | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbNotes || !db.kbBrainEntities || !db.kbKnowledgeEdges) return null
        return { notes: db.kbNotes, entities: db.kbBrainEntities, edges: db.kbKnowledgeEdges }
      })
  }

  setModelOverride(kbId: string, fn: () => BrainModelRef): void {
    this.scoped.setOverride(kbId, fn)
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  async run(kbId: string, documentId: string): Promise<GraphBuildResult> {
    if (this.running.has(kbId)) throw new Error('图谱构建进行中，请稍候')
    const repos = this.reposFn()
    if (!repos) throw new Error('知识大脑未启用（旧库）')
    this.running.add(kbId)
    try {
      const note = await repos.notes.findReadingMemory(kbId, documentId)
      if (!note || !(note.body ?? '').trim()) throw new Error('没有工作记忆——请先运行「全书精读」')

      const llm = this.scoped.llmFor(kbId)
      const raw = await llm({
        system: GRAPH_EXTRACT_SYSTEM,
        user: buildGraphExtractUser(note.body ?? ''),
        maxTokens: BRAIN_LLM_MAX_TOKENS
      })
      const parsed = extractJsonFromResponse(raw)
      const relations = normalizeRelations(parsed)
      logger.info(`[kb-graph] kb=${kbId} 抽取关系 ${relations.length} 条`)

      // 实体解析：精确名/别名 → id；未匹配跳过（宁缺勿造）
      const allEntities = await repos.entities.listActiveWithAliases(kbId, 5000)
      const edgesToCreate: Array<{
        sourceKind: 'entity'
        sourceId: string
        relation: (typeof GRAPH_RELATIONS)[number]
        targetKind: 'entity'
        targetId: string
        evidence: string
        confidence: number
      }> = []
      let unmatched = 0
      for (const r of relations) {
        const src = resolveEntityName(r.source, allEntities)
        const dst = resolveEntityName(r.target, allEntities)
        if (!src || !dst) {
          unmatched++
          continue
        }
        edgesToCreate.push({
          sourceKind: 'entity',
          sourceId: src.id,
          relation: r.relation as (typeof GRAPH_RELATIONS)[number],
          targetKind: 'entity',
          targetId: dst.id,
          evidence: JSON.stringify({ 说明: r.evidence, 章节: r.chapters }),
          confidence: 0.9
        })
      }

      await repos.edges.deleteEntityEntityEdges(kbId)
      const { created, deduped } = await repos.edges.createBatch(kbId, edgesToCreate)
      logger.info(
        `[kb-graph] kb=${kbId} 落边 created=${created} deduped=${deduped} unmatched=${unmatched}`
      )
      return { extracted: relations.length, resolved: edgesToCreate.length, unmatched, created, deduped }
    } finally {
      this.running.delete(kbId)
    }
  }
}

let singleton: KbGraphBuildService | null = null

export function getKbGraphBuildService(): KbGraphBuildService {
  if (!singleton) singleton = new KbGraphBuildService()
  return singleton
}
