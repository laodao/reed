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
import { renderSystemByKind } from './knowledge-render.service'

const logger = createLogger('KbSystemAggregate')

export interface SystemAggregators {
  atoms: KbAtomRepository
  entities: KbEntityRepository
  edges: KbKnowledgeEdgeRepository & { deleteAggregateElementEdges(kbId: string): Promise<void> }
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
      const systems = parseSystemInventories(raw)
      const outcome: SystemAggreggateOutcome = { ...EMPTY, skipped: false, llmCalls }
      // 清上一轮体系边（两端都是体系节点=aggregate 自产；graph-build 的人物边不动）
      await repos.edges.deleteAggregateElementEdges(kbId)
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

  /** 单体系落库：元素实体 upsert + kind 对应边 + structure-map 卡（按形态渲染） */
  private async persistSystem(
    repos: SystemAggregators,
    kbId: string,
    sys: ParsedSystemInventory,
    outcome: SystemAggreggateOutcome
  ): Promise<boolean> {
    if (sys.elements.length < 2) return false
    // 元素实体（同名 upsert 复用；attrs 演进重写，含 kind 标记）
    const idByName = new Map<string, string>()
    for (const el of sys.elements) {
      const existing = await repos.entities.upsertMention(kbId, { name: el.name, type: 'setting-system' })
      idByName.set(el.name, existing.id)
      if (isEntityRecord(existing)) {
        await repos.entities.updateAttrs(existing.id, JSON.stringify({
          system: sys.systemName,
          kind: sys.kind,
          order: el.order,
          ...el.attrs
        }))
      }
      outcome.nodesReused += 1
    }
    const resolve = (name: string): string | null => idByName.get(name) ?? null

    // 按 kind 落边：ladder=相邻顺序；tree=parent 隶属；catalog=无边；network=relates
    const edgeRows: KbEdgeInputLite[] = []
    if (sys.kind === 'ladder') {
      const ordered = [...sys.elements].sort((a, b) => a.order - b.order)
      for (let i = 0; i < ordered.length - 1; i++) {
        const lower = resolve(ordered[i]!.name)
        const upper = resolve(ordered[i + 1]!.name)
        if (!lower || !upper) continue
        edgeRows.push({
          sourceKind: 'entity', sourceId: lower, relation: 'sublevel-of', targetKind: 'entity', targetId: upper,
          evidence: `${sys.systemName}：${ordered[i]!.name} 低于 ${ordered[i + 1]!.name}（${ordered[i]!.evidenceQuote ?? '体系归纳'}）`,
          confidence: sys.confidence, origin: 'ai'
        })
      }
    } else if (sys.kind === 'tree') {
      for (const el of sys.elements) {
        if (!el.parent) continue
        const child = resolve(el.name)
        const parent = resolve(el.parent)
        if (!child || !parent) continue
        edgeRows.push({
          sourceKind: 'entity', sourceId: child, relation: 'sublevel-of', targetKind: 'entity', targetId: parent,
          evidence: `${sys.systemName}：${el.name} 隶属 ${el.parent}（${el.evidenceQuote ?? '体系归纳'}）`,
          confidence: sys.confidence, origin: 'ai'
        })
      }
    } else if (sys.kind === 'network') {
      for (const rel of sys.relations) {
        const from = resolve(rel.from)
        const to = resolve(rel.to)
        if (!from || !to) continue
        edgeRows.push({
          sourceKind: 'entity', sourceId: from, relation: 'relates', targetKind: 'entity', targetId: to,
          evidence: `${sys.systemName}：${rel.from} —${rel.type}— ${rel.to}（${rel.evidence}）`,
          confidence: sys.confidence, origin: 'ai'
        })
      }
    }
    if (edgeRows.length > 0) {
      const r = await repos.edges.createBatch(kbId, edgeRows)
      outcome.edgesCreated += r.created
    }
    // structure-map 卡（人审）——按形态渲染
    const body = renderSystemByKind(sys)
    const title = `设定体系：${sys.systemName}—${KIND_LABEL[sys.kind]}与各元素`
    const similar = await repos.notes.findSimilarTitle(kbId, title)
    const existing = similar.find(s => s.title === title && s.status !== 'archived')
    const evidence = JSON.stringify(
      sys.elements.slice(0, 8).map(el => ({ quote: el.evidenceQuote ?? '', entity: el.name }))
    )
    if (existing) {
      await repos.notes.evolveCard(existing.id, { body, evidence })
    } else {
      await repos.notes.propose(kbId, {
        title,
        description: `「${sys.systemName}」的${KIND_LABEL[sys.kind]}——设计自己的世界时作结构参照（成员穷举+各自属性）。`,
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

/** 体系边入参（relation 按形态：sublevel-of/relates） */
interface KbEdgeInputLite {
  sourceKind: 'entity'
  sourceId: string
  relation: 'sublevel-of' | 'relates'
  targetKind: 'entity'
  targetId: string
  evidence: string
  confidence: number
  origin: 'ai'
}

export const KIND_LABEL: Record<SystemKind, string> = {
  ladder: '等级阶梯',
  tree: '层级结构',
  catalog: '成员清单',
  network: '关系网络'
}

/** upsertMention 返回 Record；此处守卫带 id 的形态（测试桩容错） */
function isEntityRecord(e: unknown): e is KbEntityRecord & { id: string } {
  return typeof e === 'object' && e !== null && typeof (e as { id?: unknown }).id === 'string'
}

/* ---------- 解析 ---------- */

export type SystemKind = 'catalog' | 'ladder' | 'tree' | 'network'

export interface ParsedSystemElement {
  name: string
  order: number
  attrs: Record<string, string>
  evidenceQuote: string | null
  /** tree 形态：直接上级的名称 */
  parent?: string
}

export interface ParsedRelation {
  from: string
  to: string
  type: string
  evidence: string
}

export interface ParsedSystemInventory {
  systemName: string
  kind: SystemKind
  summary: string
  confidence: number
  elements: ParsedSystemElement[]
  relations: ParsedRelation[]
}

/** 解析盘点输出：{systems:[{systemName,kind,summary,elements,relations}]}——坏节点剔除、强门槛 */
export function parseSystemInventories(
  raw: string
): Array<{ systemName: string; kind: SystemKind; summary: string; confidence: number; elements: ParsedSystemElement[]; relations: ParsedRelation[] }> {
  const parsed = extractJsonFromResponse(raw) as Partial<{ systems: unknown }> | null
  const arr = Array.isArray(parsed?.systems) ? (parsed!.systems as unknown[]) : []
  const out: Array<{ systemName: string; kind: SystemKind; summary: string; confidence: number; elements: ParsedSystemElement[]; relations: ParsedRelation[] }> = []
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue
    const systemName = (item as { systemName?: unknown }).systemName
    const kindRaw = (item as { kind?: unknown }).kind
    if (typeof systemName !== 'string' || !systemName.trim()) continue
    const kind: SystemKind = kindRaw === 'catalog' || kindRaw === 'ladder' || kindRaw === 'tree' || kindRaw === 'network' ? kindRaw : 'catalog'
    const summary = typeof (item as { summary?: unknown }).summary === 'string' ? (item as { summary: string }).summary.slice(0, 200) : ''
    const confidence = typeof (item as { confidence?: unknown }).confidence === 'number' ? (item as { confidence: number }).confidence : 0.6

    // 元素：名字必须是专名；必须有 attrs 或证据；catalog/ladder 元素名 ≤20 字
    const elements: ParsedSystemElement[] = []
    const rawElements = (item as { elements?: unknown }).elements
    if (Array.isArray(rawElements)) {
      for (const el of rawElements) {
        if (typeof el !== 'object' || el === null) continue
        const name = (el as { name?: unknown }).name
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 30) continue
        const rawAttrs = (el as { attrs?: unknown }).attrs
        const attrs: Record<string, string> = {}
        if (typeof rawAttrs === 'object' && rawAttrs !== null) {
          for (const [k, v] of Object.entries(rawAttrs as Record<string, unknown>)) {
            if (typeof v === 'string' && v.trim()) attrs[k.trim().slice(0, 20)] = v.slice(0, 200)
          }
        }
        const evidenceQuote = typeof (el as { evidenceQuote?: unknown }).evidenceQuote === 'string'
          ? (el as { evidenceQuote: string }).evidenceQuote.slice(0, 200)
          : null
        // 质量门槛：空属性且无证据的元素丢弃（防「第一层/第二层」式空壳）
        if (Object.keys(attrs).length === 0 && !evidenceQuote) continue
        const order = Number((el as { order?: unknown }).order)
        const parent = (el as { parent?: unknown }).parent
        elements.push({
          name: name.trim(),
          order: Number.isFinite(order) ? order : elements.length,
          attrs,
          evidenceQuote,
          parent: typeof parent === 'string' && parent.trim() ? parent.trim() : undefined
        })
      }
    }
    // relations（network）：from/to/evidence 校验
    const relations: ParsedRelation[] = []
    const rawRels = (item as { relations?: unknown }).relations
    if (Array.isArray(rawRels)) {
      for (const rel of rawRels) {
        if (typeof rel !== 'object' || rel === null) continue
        const from = (rel as { from?: unknown }).from
        const to = (rel as { to?: unknown }).to
        const type = (rel as { type?: unknown }).type
        const evidence = (rel as { evidence?: unknown }).evidence
        if (typeof from !== 'string' || typeof to !== 'string') continue
        relations.push({
          from: from.trim(),
          to: to.trim(),
          type: typeof type === 'string' ? type.slice(0, 20) : '相关',
          evidence: typeof evidence === 'string' ? evidence.slice(0, 200) : ''
        })
      }
    }
    if (elements.length < 2) continue // 单元素不成体系
    out.push({ systemName: systemName.trim().slice(0, 40), kind, summary, confidence, elements, relations })
  }
  return out
}

let singleton: KbSystemAggregateService | null = null

export function getKbSystemAggregateService(): KbSystemAggregateService {
  if (!singleton) singleton = new KbSystemAggregateService()
  return singleton
}
