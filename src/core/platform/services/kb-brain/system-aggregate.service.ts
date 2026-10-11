/**
 * 体系汇聚产线（v3 M2）：体系类设定的正确形态是「层级树 + 属性槽」——
 * 境界阶梯、功法体系、组织层级。文档列表表达不了阶序，平铺论断更不行。
 * @module platform/services/kb-brain/system-aggregate
 *
 * 单书汇聚（本版，力量阶梯先行）：setting 层 role=knowledge 论断 + setting-system
 * 实体摘要 → LLM 归纳体系树 JSON → 落库：
 *   节点 = kb_entities（entityType='setting-system'，attrs=属性槽 JSON，scope=book）
 *   边   = sublevel-of（下层→上层，evidence 带论断出处）
 *   卡   = structure-map（渲染树文本，人审）
 * 纪律：宁缺勿造——证据不足的节点丢弃、对齐不上不强拼；每节点带 ≥1 条证据。
 * 幂等：同名实体 upsert 复用（attrs 演进重写），同题卡演进。
 */
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { createLogger } from '@core/utils/logger'
import type { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import type { KbEntityRepository, KbEntityRecord } from '@core/database/repositories/kb-entity.repository'
import type { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import type { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import type { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { extractJsonFromResponse } from '@core/platform/services/ai-call'
import {
  createKbScopedLlm,
  BRAIN_LLM_MAX_TOKENS,
  type BrainLlmFn,
  type BrainModelRef,
  type KbScopedLlm
} from './llm'
import { SYSTEM_AGGREGATE_SYSTEM, buildSystemAggregateUser } from './prompts'
import { renderSystemTree } from './knowledge-render.service'

const logger = createLogger('KbSystemAggregate')

export interface SystemAggregators {
  atoms: KbAtomRepository
  entities: KbEntityRepository
  edges: KbKnowledgeEdgeRepository
  notes: KbNoteRepository
  passes: KbDigestPassRepository
}

export interface SystemAggregatorDeps {
  llm?: BrainLlmFn
  modelOverride?: () => { providerConfigId?: string; modelId?: string }
  repos?: () => SystemAggregators | null
}

export interface SystemAggreggateOutcome {
  systemsBuilt: number
  nodesCreated: number
  nodesReused: number
  edgesCreated: number
  notesCreated: number
  llmCalls: number
  skipped: boolean
  reason?: string
}

const EMPTY: SystemAggreggateOutcome = {
  systemsBuilt: 0,
  nodesCreated: 0,
  nodesReused: 0,
  edgesCreated: 0,
  notesCreated: 0,
  llmCalls: 0,
  skipped: true,
}

const AGGREGATE_PASS_KEY = 'system-aggregate#1'
/** 送 LLM 的论断样本上限（成本收口） */
const MATERIAL_CAP = 400

export class KbSystemAggregateService {
  private readonly scoped: KbScopedLlm
  private readonly reposFn: () => SystemAggregators | null
  private readonly running = new Set<string>()

  constructor(deps: SystemAggregatorDeps = {}) {
    this.scoped = createKbScopedLlm('kb-brain-adjudicate', {
      injected: deps.llm,
      fallback: deps.modelOverride
    })
    this.reposFn =
      deps.repos ??
      ((): SystemAggregators | null => {
        const db = getCoreDatabaseManager()
        if (!db.kbAtoms || !db.kbBrainEntities || !db.kbKnowledgeEdges || !db.kbNotes || !db.kbDigestPasses) {
          return null
        }
        return {
          atoms: db.kbAtoms,
          entities: db.kbBrainEntities,
          edges: db.kbKnowledgeEdges,
          notes: db.kbNotes,
          passes: db.kbDigestPasses
        }
      })
  }

  setModelOverride(kbId: string, fn: () => BrainModelRef): void {
    this.scoped.setOverride(kbId, fn)
  }

  isRunning(kbId: string): boolean {
    return this.running.has(kbId)
  }

  async run(kbId: string): Promise<SystemAggreggateOutcome> {
    if (this.running.has(kbId)) return { ...EMPTY, reason: 'running' }
    const repos = this.reposFn()
    if (!repos) return { ...EMPTY, reason: 'no-repos' }
    this.running.add(kbId)
    let llmCalls = 0
    let currentPassId: string | null = null
    try {
      // 取材：setting 层知识论断（体系原料）。已跑过（同素材量）则跳过（幂等）。
      const allSetting = await repos.atoms.findByKb(kbId, {
        status: ['supported'],
        layers: ['setting'],
        role: 'knowledge',
        limit: 5000
      })
      // 均衡抽样：findByKb 按创建时间倒序会偏向最新消化的书（真机实证：三书库只
      // 归纳出最新一本书的体系，旧书体系被挤出采样窗）；洗牌后截断保证跨书覆盖
      for (let i = allSetting.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[allSetting[i], allSetting[j]] = [allSetting[j]!, allSetting[i]!]
      }
      const atoms = allSetting.slice(0, MATERIAL_CAP)
      const decision = await repos.passes.ensurePass({
        knowledgeBaseId: kbId,
        documentId: kbId,
        chapterId: null,
        passType: 'smelt',
        passKey: AGGREGATE_PASS_KEY,
        chapterHash: `atoms:${atoms.length}`
      })
      if (decision.action === 'skip') return { ...EMPTY, reason: 'material-unchanged' }
      await repos.passes.setRunning(decision.pass.id)
      currentPassId = decision.pass.id
      if (atoms.length < 12) {
        await repos.passes.setDone(decision.pass.id, { systems: 0 }, { calls: 0, tokensIn: 0, tokensOut: 0 })
        return { ...EMPTY, reason: '材料不足（setting 层知识论断 <12）' }
      }

      const raw = await this.scoped.llmFor(kbId)({
        system: SYSTEM_AGGREGATE_SYSTEM,
        user: buildSystemAggregateUser({
          atoms: atoms.map(a => ({ statement: a.statement, quote: a.sourceQuote.slice(0, 80) }))
        }),
        maxTokens: BRAIN_LLM_MAX_TOKENS
      })
      llmCalls += 1
      const systems = parseSystemTrees(raw)
      const outcome: SystemAggreggateOutcome = { ...EMPTY, skipped: false, llmCalls }
      for (const sys of systems) {
        const built = await this.persistSystem(repos, kbId, sys, outcome)
        if (built) outcome.systemsBuilt += 1
      }
      await repos.passes.setDone(
        decision.pass.id,
        { systems: outcome.systemsBuilt, nodes: outcome.nodesCreated + outcome.nodesReused },
        { calls: llmCalls, tokensIn: 0, tokensOut: 0 }
      )
      logger.info(
        `[kb-system-agg] kb=${kbId} 体系树 ${outcome.systemsBuilt} 棵（节点 +${outcome.nodesCreated}/${outcome.nodesReused} 复用，边 ${outcome.edgesCreated}）`
      )
      return outcome
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (currentPassId) await repos.passes.setFailed(currentPassId, msg)
      logger.warn(`[kb-system-agg] kb=${kbId} 失败: ${msg}`)
      throw e
    } finally {
      this.running.delete(kbId)
    }
  }

  /** 单棵体系树落库：节点实体 upsert + sublevel-of 边 + structure-map 卡 */
  private async persistSystem(
    repos: SystemAggregators,
    kbId: string,
    sys: ParsedSystemTree,
    outcome: SystemAggreggateOutcome
  ): Promise<boolean> {
    if (sys.nodes.length < 3) return false // 两个节点谈不上体系
    // 质量门槛（v3 真机实证：deepseek-flash 会产出「第三层/第二层/第一层」这类
    // 无属性无证据的空壳树糊面板）——节点必须带属性槽或证据，且覆盖率过半
    const informative = sys.nodes.filter((n) => Object.keys(n.attrs).length > 0 || (n.evidenceQuote ?? '').trim().length > 0)
    if (informative.length < Math.ceil(sys.nodes.length / 2) || informative.length < 3) return false
    // 节点实体（同名 upsert 复用；attrs 演进重写）
    const idByName = new Map<string, string>()
    for (const node of sys.nodes) {
      const existing = await repos.entities.upsertMention(kbId, {
        name: node.name,
        type: 'setting-system'
      })
      idByName.set(node.name, existing.id)
      if (isEntityRecord(existing)) {
        await repos.entities.updateAttrs(existing.id, JSON.stringify({
          order: node.order,
          system: sys.systemName,
          ...node.attrs
        }))
      }
      outcome.nodesReused += 1
    }
    // 层级边：按 order 相邻连边（列表顺序即层级：i 是 i+1 的下层）
    const ordered = [...sys.nodes].sort((a, b) => a.order - b.order)
    const edgeRows: KbEdgeInputLite[] = []
    for (let i = 0; i < ordered.length - 1; i++) {
      const lower = idByName.get(ordered[i]!.name)
      const upper = idByName.get(ordered[i + 1]!.name)
      if (!lower || !upper) continue
      edgeRows.push({
        sourceKind: 'entity',
        sourceId: lower,
        relation: 'sublevel-of',
        targetKind: 'entity',
        targetId: upper,
        evidence: `${sys.systemName}：${ordered[i]!.name} 低于 ${ordered[i + 1]!.name}（${ordered[i]!.evidenceQuote ?? '体系归纳'}）`,
        confidence: sys.confidence,
        origin: 'ai'
      })
    }
    if (edgeRows.length > 0) {
      const r = await repos.edges.createBatch(kbId, edgeRows)
      outcome.edgesCreated += r.created
    }
    // structure-map 卡（人审）——渲染树文本，同题演进
    const body = renderSystemTree(sys)
    const title = `设定体系：${sys.systemName}—层级结构与各层属性`
    const similar = await repos.notes.findSimilarTitle(kbId, title)
    const existing = similar.find(s => s.title === title && s.status !== 'archived')
    const evidence = JSON.stringify(
      sys.nodes.slice(0, 8).map(n => ({ quote: n.evidenceQuote ?? '', entity: n.name }))
    )
    if (existing) {
      await repos.notes.evolveCard(existing.id, { body, evidence })
    } else {
      await repos.notes.propose(kbId, {
        title,
        description: `「${sys.systemName}」的层级结构与各层属性槽——设计自己的体系时作骨架参照（各层能做什么/前置是什么）。`,
        type: 'structure-map',
        body,
        evidence,
        tags: JSON.stringify(['system-aggregate'])
      })
      outcome.notesCreated += 1
    }
    return true
  }
}

/** 层级边入参（relation 固定 sublevel-of） */
interface KbEdgeInputLite {
  sourceKind: 'entity'
  sourceId: string
  relation: 'sublevel-of'
  targetKind: 'entity'
  targetId: string
  evidence: string
  confidence: number
  origin: 'ai'
}

/** upsertMention 返回 Record；此处守卫带 id 的形态（测试桩容错） */
function isEntityRecord(e: unknown): e is KbEntityRecord & { id: string } {
  return typeof e === 'object' && e !== null && typeof (e as { id?: unknown }).id === 'string'
}

/* ---------- 解析 ---------- */

export interface ParsedSystemNode {
  name: string
  order: number
  attrs: Record<string, string>
  evidenceQuote: string | null
}

export interface ParsedSystemTree {
  systemName: string
  nodes: ParsedSystemNode[]
  confidence: number
}

/** 解析体系树输出：{systems:[{systemName,nodes:[{name,order,attrs,evidenceQuote}],confidence}]}——坏节点剔除 */
export function parseSystemTrees(raw: string): ParsedSystemTree[] {
  const parsed = extractJsonFromResponse(raw) as Partial<{ systems: unknown }> | null
  const arr = Array.isArray(parsed?.systems) ? (parsed!.systems as unknown[]) : []
  const out: ParsedSystemTree[] = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const systemName = (item as { systemName?: unknown }).systemName
    const rawNodes = (item as { nodes?: unknown }).nodes
    if (typeof systemName !== 'string' || !systemName.trim() || !Array.isArray(rawNodes)) continue
    const nodes: ParsedSystemNode[] = []
    for (const n of rawNodes) {
      if (typeof n !== 'object' || n === null) continue
      const name = (n as { name?: unknown }).name
      if (typeof name !== 'string' || !name.trim() || name.length > 30) continue
      const order = Number((n as { order?: unknown }).order)
      const rawAttrs = (n as { attrs?: unknown }).attrs
      const attrs: Record<string, string> = {}
      if (typeof rawAttrs === 'object' && rawAttrs !== null) {
        for (const [k, v] of Object.entries(rawAttrs as Record<string, unknown>)) {
          if (typeof v === 'string' && v.trim()) attrs[k.trim().slice(0, 20)] = v.slice(0, 200)
        }
      }
      nodes.push({
        name: name.trim(),
        order: Number.isFinite(order) ? order : nodes.length,
        attrs,
        evidenceQuote: typeof (n as { evidenceQuote?: unknown }).evidenceQuote === 'string'
          ? (n as { evidenceQuote: string }).evidenceQuote.slice(0, 200)
          : null
      })
    }
    if (nodes.length >= 2) {
      out.push({
        systemName: systemName.trim().slice(0, 40),
        nodes,
        confidence: typeof (item as { confidence?: unknown }).confidence === 'number'
          ? (item as { confidence: number }).confidence
          : 0.6
      })
    }
  }
  return out
}

let singleton: KbSystemAggregateService | null = null

export function getKbSystemAggregateService(): KbSystemAggregateService {
  if (!singleton) singleton = new KbSystemAggregateService()
  return singleton
}
