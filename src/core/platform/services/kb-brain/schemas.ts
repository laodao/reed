/**
 * 知识大脑 LLM 输出契约（ajv schema + 校验，详细设计 §3.2/§4）
 * @module platform/services/kb-brain/schemas
 *
 * 响亮失败：解析或校验失败抛错并带全部原因（供回喂重试的纠错 prompt 使用）。
 */
import Ajv from 'ajv'

/* ---------- P-1 ATOMIZE 输出 ---------- */

export interface RawAtom {
  statement: string
  type: string
  /** 知识分层（outline/setting/describe/detail；可选，缺省 detail） */
  layer?: string
  certainty?: number
  quote: string
  validFrom?: string
  validUntil?: string
  subject?: string
  object?: string
}

export interface RawEvent {
  fromQuote: string
  toQuote: string
  evidence: string
}

export interface RawMention {
  name: string
  type: string
}

/** 场面事件（v2 P0 故事轨；sceneType 临时手定枚举——P1 schema induction 后修订） */
export interface RawScene {
  summary: string
  sceneType: string
  participants: string[]
  cause?: string
  outcome?: string
  quote: string
}

export interface AtomizeOutput {
  atoms: RawAtom[]
  events: RawEvent[]
  /** 故事轨场面事件（可选：仅小说变体的 prompt 要求产出） */
  scenes?: RawScene[]
  mentions?: RawMention[]
}

const ATOMIZE_SCHEMA = {
  type: 'object',
  properties: {
    atoms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          statement: { type: 'string', minLength: 1 },
          type: { enum: ['fact', 'claim', 'concept', 'method', 'insight', 'open-question'] },
          layer: { enum: ['outline', 'setting', 'describe', 'detail'] },
          certainty: { type: 'number', minimum: 0, maximum: 1 },
          quote: { type: 'string', minLength: 1 },
          validFrom: { type: 'string' },
          validUntil: { type: 'string' },
          subject: { type: 'string' },
          object: { type: 'string' },
        },
        required: ['statement', 'type', 'quote'],
        additionalProperties: false,
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fromQuote: { type: 'string', minLength: 1 },
          toQuote: { type: 'string', minLength: 1 },
          evidence: { type: 'string', minLength: 1 },
        },
        required: ['fromQuote', 'toQuote', 'evidence'],
        additionalProperties: false,
      },
    },
    mentions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
        },
        required: ['name', 'type'],
        additionalProperties: false,
      },
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          summary: { type: 'string', minLength: 1 },
          sceneType: { enum: ['conflict', 'battle', 'breakthrough', 'deal', 'probe', 'emotion', 'chase', 'scheme', 'reveal', 'daily', 'other'] },
          participants: { type: 'array', items: { type: 'string', minLength: 1 } },
          cause: { type: 'string' },
          outcome: { type: 'string' },
          quote: { type: 'string', minLength: 1 },
        },
        required: ['summary', 'sceneType', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['atoms'],
  additionalProperties: false,
} as const

/* ---------- P-3 ADJUDICATE 输出 ---------- */

export interface AdjudicateOutput {
  duplicates: Array<{ newIdx: number; oldIdx: number }>
  contradictions: Array<{ newIdx: number; oldIdx: number; severity: 'update' | 'conflict' }>
  novel: number[]
}

const ADJUDICATE_SCHEMA = {
  type: 'object',
  properties: {
    duplicates: {
      type: 'array',
      items: {
        type: 'object',
        properties: { newIdx: { type: 'integer' }, oldIdx: { type: 'integer' } },
        required: ['newIdx', 'oldIdx'],
        additionalProperties: false,
      },
    },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          newIdx: { type: 'integer' },
          oldIdx: { type: 'integer' },
          severity: { enum: ['update', 'conflict'] },
        },
        required: ['newIdx', 'oldIdx', 'severity'],
        additionalProperties: false,
      },
    },
    novel: { type: 'array', items: { type: 'integer' } },
  },
  required: ['duplicates', 'contradictions', 'novel'],
  additionalProperties: false,
} as const

// removeAdditional：剥离模型多吐的未知字段（如 confidence/注释键）再校验——
// 「多吐字段」从整章致命降为可容忍；必需键缺失/类型错仍响亮失败
const ajv = new Ajv({ allErrors: true, removeAdditional: true })
const validateAtomize = ajv.compile(ATOMIZE_SCHEMA)
const validateAdjudicate = ajv.compile(ADJUDICATE_SCHEMA)

/**
 * 模型输出字段归一（ajv 校验前执行）。真机实证：模型会用近义命名
 * （顶层 claims 代替 atoms、条目 text 代替 statement）——内容质量没问题，
 * 纯字段名漂移。别名映射在解析层归一，让「多吐字段」与「近义命名」都不致命。
 */
export function normalizeAtomizeRaw(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const out = { ...(data as Record<string, unknown>) }
  if (!Array.isArray(out.atoms) && Array.isArray(out.claims)) out.atoms = out.claims
  if (!Array.isArray(out.atoms) && Array.isArray(out.statements)) out.atoms = out.statements
  if (Array.isArray(out.atoms)) {
    // 坏条目剔除（真机实证：atoms 数组混入裸字符串——一条坏条目不值得毁整章，
    // 与裁决越界索引丢弃同一策略；全部为坏条目时按空论断章处理）
    out.atoms = (out.atoms as Array<unknown>).filter(
      (a) => typeof a === 'object' && a !== null && !Array.isArray(a),
    ) as Array<Record<string, unknown>>
    out.atoms = (out.atoms as Array<Record<string, unknown>>).map((a) => {
      const item = { ...a }
      if (item.statement === undefined) {
        // 别名优先：text/claim/content/desc
        for (const alias of ['text', 'claim', 'content', 'desc']) {
          if (typeof item[alias] === 'string') {
            item.statement = item[alias]
            break
          }
        }
      }
      // 三元组形态（subject/predicate/object）→ 拼接为论断句
      if (item.statement === undefined && typeof item.subject === 'string') {
        const pred = typeof item.predicate === 'string' ? item.predicate : ''
        const obj = typeof item.object === 'string' ? item.object : ''
        if (obj) item.statement = `${item.subject}${pred}${obj}`
      }
      if (item.certainty === undefined && typeof item.confidence !== 'undefined') item.certainty = item.confidence
      // layer 非法值/null 剥离（分层是辅助维度——坏值不毁论断，落库缺省 detail；
      // null 也是模型常见输出，穿透到 ajv enum 会炸整章重试）
      if (item.layer !== undefined && !['outline', 'setting', 'describe', 'detail'].includes(item.layer as string)) {
        delete item.layer
      }
      // type 非法值归 'fact'（真机实证：本地模型产出枚举外类型炸整章重试耗尽——
      // 落库端本就按 isValidType 兜底 'fact'，归一层先行对齐，坏类型不毁整章）
      if (typeof item.type !== 'string' || !['fact', 'claim', 'concept', 'method', 'insight', 'open-question'].includes(item.type)) {
        item.type = 'fact'
      }
      return item
    })
  }
  // mentions 字符串数组 → 对象数组（模型常把类型省略成纯名字列表）
  if (Array.isArray(out.mentions)) {
    out.mentions = (out.mentions as Array<unknown>)
      .map((m) => (typeof m === 'string' ? { name: m, type: 'concept' } : m))
      .filter((m) => typeof m === 'object' && m !== null)
  } else if (out.mentions !== undefined && out.mentions !== null) {
    // mentions 对象映射形态 {名:类型} → 对象数组（真机实证）；其余非数组类型剥离
    //（schema 中 mentions 可选，丢挂点不丢论断）
    if (typeof out.mentions === 'object') {
      out.mentions = Object.entries(out.mentions as Record<string, unknown>)
        .filter(([k, v]) => typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim())
        .map(([name, type]) => ({ name: name.trim(), type: (type as string).trim() }))
    } else {
      delete out.mentions
    }
  }
  // events 非数组 → 剥离（可选段：丢事件边不丢整章论断）
  if (out.events !== undefined && out.events !== null && !Array.isArray(out.events)) {
    delete out.events
  }
  // scenes 非数组 → 剥离；条目级清洗（participants 非字符串剔除、sceneType 非法归 other、
  // 缺 summary/quote 剔除——与 atoms 坏条目剔除同一「不毁整章」策略）
  if (out.scenes !== undefined && out.scenes !== null && !Array.isArray(out.scenes)) {
    delete out.scenes
  } else if (Array.isArray(out.scenes)) {
    out.scenes = (out.scenes as Array<unknown>).flatMap((s) => {
      if (typeof s !== 'object' || s === null) return []
      const e = s as Record<string, unknown>
      const summary = typeof e.summary === 'string' ? e.summary.trim() : ''
      const quote = typeof e.quote === 'string' ? e.quote.trim() : ''
      if (!summary || !quote) return []
      const sceneType =
        typeof e.sceneType === 'string' &&
        ['conflict', 'battle', 'breakthrough', 'deal', 'probe', 'emotion', 'chase', 'scheme', 'reveal', 'daily'].includes(e.sceneType)
          ? e.sceneType
          : 'other'
      const participants = Array.isArray(e.participants)
        ? (e.participants as unknown[]).filter((p): p is string => typeof p === 'string' && p.trim().length >= 2)
        : []
      const clean: Record<string, unknown> = { summary, sceneType, participants, quote }
      if (typeof e.cause === 'string' && e.cause.trim()) clean.cause = e.cause.trim()
      if (typeof e.outcome === 'string' && e.outcome.trim()) clean.outcome = e.outcome.trim()
      return [clean]
    })
  }
  return out
}

/** 校验并收窄；失败抛错（错误清单供回喂重试） */
export function validateAtomizeOutput(data: unknown): AtomizeOutput {
  const normalized = normalizeAtomizeRaw(data)
  if (!validateAtomize(normalized)) {
    throw new Error(`atomize 输出校验失败: ${ajv.errorsText(validateAtomize.errors)}`)
  }
  return normalized as AtomizeOutput
}

/**
 * 裁决输出归一（真机实证：本地小模型常省略空结果段——
 * {"duplicates":[],"novel":[...]} 缺 contradictions 键导致整章失败）。
 * 缺失数组键补空（「没判出冲突」是合法语义，不是格式错误）；
 * 近义命名（conflicts/same/new）归一。内容级错误仍交 ajv 响亮失败。
 */
/** 索引清洗：数字/数字字符串 → 整数；其余丢弃（返回 NaN 触发调用方过滤） */
function toIdx(v: unknown): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isInteger(n) ? n : Number.NaN
}

export function normalizeAdjudicateRaw(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const out = { ...(data as Record<string, unknown>) }
  // 只补「缺失」：省略空结果段是合法语义；类型错了保留原值交 ajv 响亮失败
  if (!Array.isArray(out.duplicates)) {
    out.duplicates = Array.isArray(out.same) ? out.same : []
  }
  if (!Array.isArray(out.contradictions)) {
    out.contradictions = Array.isArray(out.conflicts) ? out.conflicts : []
  }
  if (!Array.isArray(out.novel)) {
    out.novel = Array.isArray(out.new) ? out.new : []
  }
  // 条目级清洗（真机实证：novel 混入非整数、contradictions 出负数索引/坏条目）——
  // 坏条目剔除不毁整章，与 atoms 坏条目剔除同一策略；severity 非枚举保守归 'conflict'
  //（标 suspected 走人审，绝不误毁旧论断）
  out.novel = (out.novel as unknown[]).map(toIdx).filter((n) => Number.isInteger(n))
  const cleanEntry = (e: Record<string, unknown>): Record<string, unknown> | null => {
    const newIdx = toIdx(e.newIdx)
    const oldIdx = toIdx(e.oldIdx)
    // 回写收编后的整数索引（数字字符串 '2' → 2）；坏条目剔除
    if (!Number.isInteger(newIdx) || !Number.isInteger(oldIdx)) return null
    return { ...e, newIdx, oldIdx }
  }
  out.duplicates = (out.duplicates as unknown[]).flatMap((d) => {
    if (typeof d !== 'object' || d === null) return []
    const e = cleanEntry(d as Record<string, unknown>)
    return e ? [e] : []
  })
  out.contradictions = (out.contradictions as unknown[]).flatMap((c) => {
    if (typeof c !== 'object' || c === null) return []
    const e = cleanEntry(c as Record<string, unknown>)
    if (!e) return []
    if (e.severity !== 'update' && e.severity !== 'conflict') e.severity = 'conflict'
    return [e]
  })
  return out
}

/** 校验并做索引合法性过滤（越界索引丢弃——模型幻觉编号不致污染落库） */
export function validateAdjudicateOutput(
  data: unknown,
  bounds: { newCount: number; oldCount: number },
): AdjudicateOutput {
  const normalized = normalizeAdjudicateRaw(data)
  if (!validateAdjudicate(normalized)) {
    throw new Error(`adjudicate 输出校验失败: ${ajv.errorsText(validateAdjudicate.errors)}`)
  }
  const out = normalized as AdjudicateOutput
  const inNew = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < bounds.newCount
  const inOld = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < bounds.oldCount
  return {
    duplicates: out.duplicates.filter((d) => inNew(d.newIdx) && inOld(d.oldIdx)),
    contradictions: out.contradictions.filter((c) => inNew(c.newIdx) && inOld(c.oldIdx)),
    novel: out.novel.filter((i) => inNew(i)),
  }
}

/* ==================== 场面事件补采（v2 P0 存量回填） ==================== */

export interface SceneBackfillOutput {
  scenes: RawScene[]
  mentions: RawMention[]
}

const SCENE_BACKFILL_SCHEMA = {
  type: 'object',
  properties: {
    scenes: ATOMIZE_SCHEMA.properties.scenes,
    mentions: ATOMIZE_SCHEMA.properties.mentions,
  },
  required: ['scenes'],
  additionalProperties: false,
} as const

const validateSceneBackfill = ajv.compile(SCENE_BACKFILL_SCHEMA)

/** 补采输出归一：复用 atomize 的 scenes/mentions 清洗；缺 scenes 键补空（纯过场章合法） */
export function normalizeSceneBackfillRaw(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const atomized = normalizeAtomizeRaw({
    atoms: [],
    scenes: (data as Record<string, unknown>).scenes,
    mentions: (data as Record<string, unknown>).mentions,
  }) as { scenes?: unknown[]; mentions?: unknown[] }
  return { scenes: atomized.scenes ?? [], mentions: atomized.mentions ?? [] }
}

export function validateSceneBackfillOutput(data: unknown): SceneBackfillOutput {
  const normalized = normalizeSceneBackfillRaw(data)
  if (!validateSceneBackfill(normalized)) {
    throw new Error(`scene-backfill 输出校验失败: ${ajv.errorsText(validateSceneBackfill.errors)}`)
  }
  return normalized as SceneBackfillOutput
}

/* ==================== 论断归纳（consolidate） ==================== */

const CONSOLIDATE_SCHEMA = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          idx: { type: 'array', items: { type: 'integer' } },
          statement: { type: 'string' },
          type: { enum: ['fact', 'concept', 'method', 'insight'] },
        },
        required: ['idx', 'statement', 'type'],
        additionalProperties: false,
      },
    },
  },
  required: ['groups'],
  additionalProperties: false,
} as const

const validateConsolidate = ajv.compile(CONSOLIDATE_SCHEMA)

export interface ConsolidateGroup {
  idx: number[]
  statement: string
  type: 'fact' | 'concept' | 'method' | 'insight'
}

/** 归纳输出归一：groups/idx 缺失补空、条目级清洗（坏组剔除），与裁决同一「尽力而为」策略 */
export function normalizeConsolidateRaw(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const out = { ...(data as Record<string, unknown>) }
  if (!Array.isArray(out.groups)) {
    // 近义命名容错：merges/clusters → groups
    out.groups = Array.isArray(out.merges) ? out.merges : Array.isArray(out.clusters) ? out.clusters : []
  }
  out.groups = (out.groups as unknown[]).flatMap((g) => {
    if (typeof g !== 'object' || g === null) return []
    const e = g as Record<string, unknown>
    if (!Array.isArray(e.idx)) return []
    const idx = [...new Set(e.idx.map(toIdx).filter((n: number) => Number.isInteger(n)))]
    const statement = typeof e.statement === 'string' ? e.statement.trim() : ''
    const type = e.type === 'concept' || e.type === 'method' || e.type === 'insight' ? e.type : 'fact'
    // 无有效成员编号或缺合并句：剔除
    if (idx.length === 0 || !statement) return []
    return [{ idx, statement, type }]
  })
  return out
}

/** 校验 + 边界过滤（越界编号/单成员组丢弃）+ 跨组去重（同一编号只归先到组，防重复归档与重叠产物） */
export function validateConsolidateOutput(data: unknown, bounds: { count: number }): ConsolidateGroup[] {
  const normalized = normalizeConsolidateRaw(data)
  if (!validateConsolidate(normalized)) {
    throw new Error(`consolidate 输出校验失败: ${ajv.errorsText(validateConsolidate.errors)}`)
  }
  const groups = (normalized as { groups: ConsolidateGroup[] }).groups
  const inBounds = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < bounds.count
  const used = new Set<number>()
  const out: ConsolidateGroup[] = []
  for (const g of groups) {
    const idx = [...new Set(g.idx.filter(inBounds))].filter((i) => !used.has(i))
    if (idx.length < 2) continue // 剔重后不足两成员的组没有合并意义
    idx.forEach((i) => used.add(i))
    out.push({ ...g, idx })
  }
  return out
}
