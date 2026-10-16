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
  /** 知识分层（setting/describe/craft/detail；可选，缺省 detail） */
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
          layer: { enum: ['setting', 'describe', 'craft', 'detail'] },
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
  /** v3 四值：书内事实/剧情复述——落库为 role='evidence'（只作证据不进知识供给） */
  readerNotes: number[]
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
    readerNotes: { type: 'array', items: { type: 'integer' } },
  },
  required: ['duplicates', 'contradictions', 'novel', 'readerNotes'],
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
      // null 也是模型常见输出，穿透到 ajv enum 会炸整章重试）。
      // 旧版 'outline' 收编：method/insight → craft（技法观察），其余剥离落 detail
      // subject/object 非字符串剥离（真机完美世界实证：模型对无主论断输出
      // subject:null → ajv required string 炸整章。mention 挂点是可选字段，剥离即可）
      if ('subject' in item && typeof item.subject !== 'string') delete item.subject
      if ('object' in item && typeof item.object !== 'string') delete item.object
      if (item.layer === 'outline') {
        if (item.type === 'method' || item.type === 'insight') item.layer = 'craft'
        else delete item.layer
      }
      if (item.layer !== undefined && !['setting', 'describe', 'craft', 'detail'].includes(item.layer as string)) {
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
  // events 坏条目剔除（真机凡人修仙传实证：模型输出漂移——events 缺
  // fromQuote/toQuote/evidence 必填键。events 是可选原料轨，坏条目剔除不毁整章，
  // 与 atoms/scenes 同一策略；全缺时输出空数组照常消化）
  if (Array.isArray(out.events)) {
    out.events = (out.events as Array<unknown>).filter((ev) => {
      if (typeof ev !== 'object' || ev === null) return false
      const e = ev as Record<string, unknown>
      return (
        typeof e.fromQuote === 'string' && (e.fromQuote as string).trim().length > 0 &&
        typeof e.toQuote === 'string' && (e.toQuote as string).trim().length > 0 &&
        typeof e.evidence === 'string' && (e.evidence as string).trim().length > 0
      )
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
  if (!Array.isArray(out.readerNotes)) {
    out.readerNotes = Array.isArray(out.reader_notes) ? out.reader_notes : []
  }
  // 条目级清洗（真机实证：novel 混入非整数、contradictions 出负数索引/坏条目）——
  // 坏条目剔除不毁整章，与 atoms 坏条目剔除同一策略；severity 非枚举保守归 'conflict'
  //（标 suspected 走人审，绝不误毁旧论断）
  out.novel = (out.novel as unknown[]).map(toIdx).filter((n) => Number.isInteger(n))
  out.readerNotes = (out.readerNotes as unknown[]).map(toIdx).filter((n) => Number.isInteger(n))
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
    readerNotes: out.readerNotes.filter((i) => inNew(i)),
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

/* ==================== 冶炼层输出（v2 P1：套路/原理/案例/品类认知） ==================== */

/** 宽松字符串清洗：非字符串/空白 → null */
function cleanStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** 字符串数组清洗：非字符串剔除、去空、去重 */
function cleanStrArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()))]
}

export interface InducePatternDraft {
  title: string
  whenToUse: string
  steps: string[]
  variants: string[]
  why: string
  boundary: string
  confidence: number
}

/** 套路归纳输出：skip → {skip:true}；否则缺关键字段抛错（回喂重试用） */
export function parseInducePatternOutput(data: unknown): { skip: true; reason?: string } | InducePatternDraft {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  if (d.skip) return { skip: true, reason: cleanStr(d.reason) ?? '' }
  const title = cleanStr(d.title)
  const why = cleanStr(d.why)
  if (!title || title.length < 6) throw new Error('套路卡 title 缺失或过短')
  if (!why) throw new Error('套路卡缺 why（为什么有效）')
  const steps = cleanStrArr(d.steps)
  if (steps.length < 2) throw new Error('套路卡骨架 steps 至少 2 阶段')
  const conf = typeof d.confidence === 'number' ? Math.min(1, Math.max(0, d.confidence)) : 0.7
  return {
    title,
    whenToUse: cleanStr(d.whenToUse) ?? '（模型未给使用场景）',
    steps,
    variants: cleanStrArr(d.variants),
    why,
    boundary: cleanStr(d.boundary) ?? '（模型未给边界）',
    confidence: conf,
  }
}

export interface CaseStudyDraft {
  title: string
  whatWorks: string
  learn: string
  quoteFocus: string
  quality: number
}

export function parseCaseStudyOutput(data: unknown): { skip: true; reason?: string } | CaseStudyDraft {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  if (d.skip) return { skip: true, reason: cleanStr(d.reason) ?? '' }
  const title = cleanStr(d.title)
  const whatWorks = cleanStr(d.whatWorks)
  if (!title || title.length < 6) throw new Error('案例卡 title 缺失或过短')
  if (!whatWorks) throw new Error('案例卡缺 whatWorks')
  return {
    title,
    whatWorks,
    learn: cleanStr(d.learn) ?? '（模型未给 learn）',
    quoteFocus: cleanStr(d.quoteFocus) ?? '',
    quality: typeof d.quality === 'number' ? Math.min(1, Math.max(0, d.quality)) : 0.6,
  }
}

export interface PrincipleDraft {
  title: string
  principle: string
  mechanism: string
  whenFails: string
  evidenceIdx: number[]
  confidence: number
}

/** 原理输出：evidenceIdx 收编整数+越界过滤（bounds=套路数），<2 支撑的原理不成立 */
export function parsePrincipleOutput(data: unknown, bounds: { count: number }): { skip: true; reason?: string } | PrincipleDraft {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  if (d.skip) return { skip: true, reason: cleanStr(d.reason) ?? '' }
  const title = cleanStr(d.title)
  const principle = cleanStr(d.principle)
  if (!title || title.length < 6) throw new Error('原理卡 title 缺失或过短')
  if (!principle) throw new Error('原理卡缺 principle 陈述')
  const idx = Array.isArray(d.evidenceIdx)
    ? [...new Set(d.evidenceIdx.map(toIdx).filter((n) => Number.isInteger(n) && n >= 0 && n < bounds.count))]
    : []
  if (idx.length < 2) throw new Error('原理至少需链回 2 个套路（evidenceIdx 不足）')
  return {
    title,
    principle,
    mechanism: cleanStr(d.mechanism) ?? '（模型未给机制）',
    whenFails: cleanStr(d.whenFails) ?? '（模型未给失效边界）',
    evidenceIdx: idx,
    confidence: typeof d.confidence === 'number' ? Math.min(1, Math.max(0, d.confidence)) : 0.7,
  }
}

export interface GenreInsightDraft {
  title: string
  expectations: string[]
  payoffs: string[]
  pitfalls: string[]
  confidence: number
}

export function parseGenreInsightOutput(data: unknown): GenreInsightDraft {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const title = cleanStr(d.title) ?? '品类认知总览'
  const expectations = cleanStrArr(d.expectations)
  const payoffs = cleanStrArr(d.payoffs)
  const pitfalls = cleanStrArr(d.pitfalls)
  if (expectations.length === 0 && payoffs.length === 0 && pitfalls.length === 0) {
    throw new Error('品类认知三段全空')
  }
  return {
    title,
    expectations,
    payoffs,
    pitfalls,
    confidence: typeof d.confidence === 'number' ? Math.min(1, Math.max(0, d.confidence)) : 0.6,
  }
}

/** 实体归并组解析：groups 收编为整数二维数组，越界/单成员组剔除（v2 P3） */
export function parseEntityMergeGroups(data: unknown, bounds: { count: number }): number[][] {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const groups = Array.isArray(d.groups) ? d.groups : []
  const out: number[][] = []
  const used = new Set<number>()
  for (const g of groups) {
    if (!Array.isArray(g)) continue
    const idx = [...new Set(g.map(toIdx).filter((n) => Number.isInteger(n) && n >= 0 && n < bounds.count && !used.has(n)))]
    if (idx.length < 2) continue // 单成员组无合并意义
    idx.forEach((i) => used.add(i))
    out.push(idx)
  }
  return out
}

export interface SettingMatrixDraft {
  title: string
  skeleton: string[]
  variants: Array<{ doc: string; variant: string }>
  designHint: string
  confidence: number
}

export function parseSettingMatrixOutput(data: unknown): SettingMatrixDraft {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const title = cleanStr(d.title)
  const skeleton = cleanStrArr(d.skeleton)
  if (!title || title.length < 6) throw new Error('变体矩阵 title 缺失或过短')
  if (skeleton.length < 2) throw new Error('通用骨架 skeleton 至少 2 条')
  const variants = (Array.isArray(d.variants) ? d.variants : []).flatMap((v) => {
    if (typeof v !== 'object' || v === null) return []
    const e = v as Record<string, unknown>
    const doc = cleanStr(e.doc)
    const variant = cleanStr(e.variant)
    return doc && variant ? [{ doc, variant }] : []
  })
  if (variants.length < 2) throw new Error('各书变体至少 2 条（跨书矩阵的前提）')
  return {
    title,
    skeleton,
    variants,
    designHint: cleanStr(d.designHint) ?? '',
    confidence: typeof d.confidence === 'number' ? Math.min(1, Math.max(0, d.confidence)) : 0.7,
  }
}

/** 质检评分解析（v2 P4）：score 收编 0-2，非法抛错 */
export function parseQaJudgeOutput(data: unknown): { score: 0 | 1 | 2; reason: string } {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const rawScore = toIdx(d.score)
  if (rawScore !== 0 && rawScore !== 1 && rawScore !== 2) throw new Error('质检 score 必须是 0/1/2')
  return { score: rawScore as 0 | 1 | 2, reason: cleanStr(d.reason) ?? '' }
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

/* ---------- V4 READING CARD 输出（章级结构化阅读卡，整书漏斗统一中间层） ---------- */

export const FORESHADOW_ACTIONS = ['plant', 'reinforce', 'misdirect', 'partial_reveal', 'reveal', 'payoff'] as const
export type ForeshadowAction = (typeof FORESHADOW_ACTIONS)[number]

/** 带章号的事实（卡内一切事实的最小单元；ch=章号，程序校验必须等于本章） */
export interface ReadingCardFact {
  t: string
  ch: number
  inferred?: boolean
}

export interface NovelReadingCard {
  v: 1
  profile: 'novel'
  summary: string
  events: string[]
  hook?: string
  characters: Array<{
    name: string
    aliases?: string[]
    facts: ReadingCardFact[]
    endState?: string
  }>
  world: Array<{ domain: string; name: string; facts: ReadingCardFact[] }>
  foreshadow: Array<{ label: string; action: ForeshadowAction; t: string; ch: number }>
  style: Array<{ t: string; why?: string }>
}

export interface KnowledgeReadingCard {
  v: 1
  profile: 'knowledge'
  summary: string
  claims: Array<{ t: string; ch: number; evidence?: string[]; kind?: string }>
  concepts: Array<{ term: string; definition: string; ch: number; refines?: string }>
  methods: Array<{ name: string; steps?: string[]; ch: number }>
  quotes: Array<{ t: string; why?: string; ch: number }>
}

export interface HistoryReadingCard {
  v: 1
  profile: 'history'
  summary: string
  events: Array<{ t: string; ch: number }>
  characters: Array<{
    name: string
    aliases?: string[]
    facts: ReadingCardFact[]
    endState?: string
  }>
  world: Array<{ domain: string; name: string; facts: ReadingCardFact[] }>
  quotes: Array<{ t: string; why?: string; ch: number }>
}

export type ReadingCard = NovelReadingCard | KnowledgeReadingCard | HistoryReadingCard

const cardFact = {
  type: 'object',
  properties: {
    t: { type: 'string', minLength: 1 },
    ch: { type: 'integer' },
    inferred: { type: 'boolean' },
  },
  required: ['t', 'ch'],
  additionalProperties: false,
} as const

const cardCharacters = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      aliases: { type: 'array', items: { type: 'string', minLength: 1 } },
      facts: { type: 'array', items: cardFact },
      endState: { type: 'string' },
    },
    required: ['name', 'facts'],
    additionalProperties: false,
  },
} as const

const cardWorld = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      domain: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      facts: { type: 'array', items: cardFact },
    },
    required: ['domain', 'name', 'facts'],
    additionalProperties: false,
  },
} as const

const cardQuotes = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      t: { type: 'string', minLength: 1 },
      why: { type: 'string' },
      ch: { type: 'integer' },
    },
    required: ['t', 'ch'],
    additionalProperties: false,
  },
} as const

const NOVEL_CARD_SCHEMA = {
  type: 'object',
  properties: {
    v: { enum: [1] },
    profile: { enum: ['novel'] },
    summary: { type: 'string', minLength: 1 },
    events: { type: 'array', items: { type: 'string', minLength: 1 } },
    hook: { type: 'string' },
    characters: cardCharacters,
    world: cardWorld,
    foreshadow: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', minLength: 1 },
          action: { enum: [...FORESHADOW_ACTIONS] },
          t: { type: 'string', minLength: 1 },
          ch: { type: 'integer' },
        },
        required: ['label', 'action', 't', 'ch'],
        additionalProperties: false,
      },
    },
    style: {
      type: 'array',
      items: {
        type: 'object',
        properties: { t: { type: 'string', minLength: 1 }, why: { type: 'string' } },
        required: ['t'],
        additionalProperties: false,
      },
    },
  },
  required: ['v', 'profile', 'summary'],
  additionalProperties: false,
} as const

const KNOWLEDGE_CARD_SCHEMA = {
  type: 'object',
  properties: {
    v: { enum: [1] },
    profile: { enum: ['knowledge'] },
    summary: { type: 'string', minLength: 1 },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          t: { type: 'string', minLength: 1 },
          ch: { type: 'integer' },
          evidence: { type: 'array', items: { type: 'string', minLength: 1 } },
          kind: { type: 'string' },
        },
        required: ['t', 'ch'],
        additionalProperties: false,
      },
    },
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string', minLength: 1 },
          definition: { type: 'string', minLength: 1 },
          ch: { type: 'integer' },
          refines: { type: 'string' },
        },
        required: ['term', 'definition', 'ch'],
        additionalProperties: false,
      },
    },
    methods: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          steps: { type: 'array', items: { type: 'string', minLength: 1 } },
          ch: { type: 'integer' },
        },
        required: ['name', 'ch'],
        additionalProperties: false,
      },
    },
    quotes: cardQuotes,
  },
  required: ['v', 'profile', 'summary'],
  additionalProperties: false,
} as const

const HISTORY_CARD_SCHEMA = {
  type: 'object',
  properties: {
    v: { enum: [1] },
    profile: { enum: ['history'] },
    summary: { type: 'string', minLength: 1 },
    events: { type: 'array', items: cardFact },
    characters: cardCharacters,
    world: cardWorld,
    quotes: cardQuotes,
  },
  required: ['v', 'profile', 'summary'],
  additionalProperties: false,
} as const

const READING_CARD_SCHEMA = { oneOf: [NOVEL_CARD_SCHEMA, KNOWLEDGE_CARD_SCHEMA, HISTORY_CARD_SCHEMA] } as const

/** 卡域数量上限（护栏：防跑飞；空域合法——过场章/纯理论章不算失败） */
export const READING_CARD_LIMITS = {
  characters: 12,
  factsPerCharacter: 6,
  world: 10,
  events: 8,
  foreshadow: 6,
  style: 2,
  claims: 6,
  concepts: 10,
  methods: 4,
  quotes: 2,
  summaryChars: 500,
  cardChars: 8000,
} as const

const validateReadingCard = new Ajv({ allErrors: true }).compile(READING_CARD_SCHEMA)

function capFacts<T extends { t: string; ch: number }>(list: T[] | undefined, cap: number): T[] {
  return (list ?? []).filter((f) => typeof f?.t === 'string' && f.t.trim()).slice(0, cap)
}

/** 域内裁剪与清洗：空条目剔除、数组封顶、字符串修剪——模型多吐从致命降为可容忍 */
export function normalizeReadingCard(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const d = data as Record<string, unknown>
  const L = READING_CARD_LIMITS
  const out: Record<string, unknown> = { v: 1, profile: d.profile, summary: typeof d.summary === 'string' ? d.summary.trim().slice(0, L.summaryChars * 2) : d.summary }
  if (d.profile === 'novel') {
    out.events = (Array.isArray(d.events) ? d.events : []).filter((e) => typeof e === 'string' && e.trim()).slice(0, L.events)
    out.hook = typeof d.hook === 'string' && d.hook.trim() ? d.hook.trim() : undefined
    out.characters = (Array.isArray(d.characters) ? d.characters : [])
      .filter((c) => typeof (c as Record<string, unknown>)?.name === 'string' && ((c as Record<string, unknown>).name as string).trim() !== '')
      .slice(0, L.characters)
      .map((c) => {
        const x = c as Record<string, unknown>
        return {
          name: x.name,
          aliases: Array.isArray(x.aliases) ? x.aliases.filter((a) => typeof a === 'string' && a.trim()).slice(0, 8) : undefined,
          facts: capFacts(x.facts as never, L.factsPerCharacter),
          endState: typeof x.endState === 'string' && x.endState.trim() ? x.endState.trim() : undefined,
        }
      })
    out.world = (Array.isArray(d.world) ? d.world : [])
      .filter((w) => typeof (w as Record<string, unknown>)?.domain === 'string' && typeof (w as Record<string, unknown>)?.name === 'string')
      .slice(0, L.world)
      .map((w) => {
        const x = w as Record<string, unknown>
        return { domain: x.domain, name: x.name, facts: capFacts(x.facts as never, L.factsPerCharacter) }
      })
    out.foreshadow = (Array.isArray(d.foreshadow) ? d.foreshadow : [])
      .filter((f) => {
        const x = f as Record<string, unknown>
        return typeof x?.label === 'string' && x.label.trim() && typeof x?.action === 'string' && typeof x?.t === 'string' && x.t.trim() && Number.isInteger(x?.ch)
      })
      .slice(0, L.foreshadow)
    out.style = (Array.isArray(d.style) ? d.style : [])
      .filter((f) => typeof (f as Record<string, unknown>)?.t === 'string' && ((f as Record<string, unknown>).t as string).trim() !== '')
      .slice(0, L.style)
  } else if (d.profile === 'knowledge') {
    out.claims = (Array.isArray(d.claims) ? d.claims : [])
      .filter((c) => typeof (c as Record<string, unknown>)?.t === 'string' && Number.isInteger((c as Record<string, unknown>)?.ch))
      .slice(0, L.claims)
      .map((c) => {
        const x = c as Record<string, unknown>
        return {
          t: x.t,
          ch: x.ch,
          evidence: Array.isArray(x.evidence) ? x.evidence.filter((e) => typeof e === 'string' && e.trim()).slice(0, 3) : undefined,
          kind: typeof x.kind === 'string' ? x.kind : undefined,
        }
      })
    out.concepts = (Array.isArray(d.concepts) ? d.concepts : [])
      .filter((c) => typeof (c as Record<string, unknown>)?.term === 'string' && typeof (c as Record<string, unknown>)?.definition === 'string' && Number.isInteger((c as Record<string, unknown>)?.ch))
      .slice(0, L.concepts)
    out.methods = (Array.isArray(d.methods) ? d.methods : [])
      .filter((m) => typeof (m as Record<string, unknown>)?.name === 'string' && Number.isInteger((m as Record<string, unknown>)?.ch))
      .slice(0, L.methods)
    out.quotes = (Array.isArray(d.quotes) ? d.quotes : [])
      .filter((q) => typeof (q as Record<string, unknown>)?.t === 'string' && Number.isInteger((q as Record<string, unknown>)?.ch))
      .slice(0, L.quotes)
  } else if (d.profile === 'history') {
    out.events = capFacts(d.events as never, L.events)
    out.characters = (Array.isArray(d.characters) ? d.characters : [])
      .filter((c) => typeof (c as Record<string, unknown>)?.name === 'string' && ((c as Record<string, unknown>).name as string).trim() !== '')
      .slice(0, L.characters)
      .map((c) => {
        const x = c as Record<string, unknown>
        return { name: x.name, aliases: x.aliases, facts: capFacts(x.facts as never, L.factsPerCharacter), endState: x.endState }
      })
    out.world = (Array.isArray(d.world) ? d.world : [])
      .filter((w) => typeof (w as Record<string, unknown>)?.domain === 'string' && typeof (w as Record<string, unknown>)?.name === 'string')
      .slice(0, L.world)
      .map((w) => {
        const x = w as Record<string, unknown>
        return { domain: x.domain, name: x.name, facts: capFacts(x.facts as never, L.factsPerCharacter) }
      })
    out.quotes = (Array.isArray(d.quotes) ? d.quotes : [])
      .filter((q) => typeof (q as Record<string, unknown>)?.t === 'string' && Number.isInteger((q as Record<string, unknown>)?.ch))
      .slice(0, L.quotes)
  }
  return out
}

/**
 * 校验 + 章号硬校验（F1 同款纪律）：卡内一切事实的 ch 必须等于本章章号——
 * 防模型跨章编造；错误全部列出（供回喂重试的纠错 prompt 使用）。
 */
export function validateReadingCardOutput(data: unknown, bounds: { ch: number }): ReadingCard {
  const normalized = normalizeReadingCard(data)
  if (!validateReadingCard(normalized)) {
    throw new Error(`reading-card 输出校验失败: ${ajv.errorsText(validateReadingCard.errors)}`)
  }
  const card = normalized as ReadingCard
  const stray: string[] = []
  const check = (ch: unknown, path: string): void => {
    if (ch !== bounds.ch) stray.push(`${path}(ch=${String(ch)}≠${bounds.ch})`)
  }
  if (card.profile === 'novel') {
    card.characters.forEach((c, i) => c.facts.forEach((f, j) => check(f.ch, `characters[${i}].facts[${j}]`)))
    card.world.forEach((w, i) => w.facts.forEach((f, j) => check(f.ch, `world[${i}].facts[${j}]`)))
    card.foreshadow.forEach((f, i) => check(f.ch, `foreshadow[${i}]`))
  } else if (card.profile === 'knowledge') {
    card.claims.forEach((c, i) => check(c.ch, `claims[${i}]`))
    card.concepts.forEach((c, i) => check(c.ch, `concepts[${i}]`))
    card.methods.forEach((m, i) => check(m.ch, `methods[${i}]`))
    card.quotes.forEach((q, i) => check(q.ch, `quotes[${i}]`))
  } else {
    card.events.forEach((e, i) => check(e.ch, `events[${i}]`))
    card.characters.forEach((c, i) => c.facts.forEach((f, j) => check(f.ch, `characters[${i}].facts[${j}]`)))
    card.world.forEach((w, i) => w.facts.forEach((f, j) => check(f.ch, `world[${i}].facts[${j}]`)))
    card.quotes.forEach((q, i) => check(q.ch, `quotes[${i}]`))
  }
  if (stray.length > 0) {
    throw new Error(`reading-card 章号越界（本章=${bounds.ch}）: ${stray.slice(0, 6).join('；')}`)
  }
  if (JSON.stringify(card).length > READING_CARD_LIMITS.cardChars) {
    throw new Error(`reading-card 超过 ${READING_CARD_LIMITS.cardChars} 字上限，请压缩各域条目`)
  }
  return card
}

/* ---------- V4 ROSTER 输出（名册分片裁决与跨片合并） ---------- */

export const ROSTER_TIERS = ['protagonist', 'major', 'minor', 'passerby', 'core', 'supporting', 'reference'] as const
export type RosterTier = (typeof ROSTER_TIERS)[number]

export interface RosterPartOutput {
  groups: number[][]
  tiers: Array<{ ref: number; tier: RosterTier; reason?: string }>
  categories: Array<{ ref: number; category: string }>
}

const ROSTER_PART_SCHEMA = {
  type: 'object',
  properties: {
    groups: { type: 'array', items: { type: 'array', items: { type: 'integer' }, minItems: 2 } },
    tiers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'integer' },
          tier: { enum: [...ROSTER_TIERS] },
          reason: { type: 'string' },
        },
        required: ['ref', 'tier'],
        additionalProperties: false,
      },
    },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ref: { type: 'integer' }, category: { type: 'string', minLength: 1 } },
        required: ['ref', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['groups', 'tiers', 'categories'],
  additionalProperties: false,
} as const

const validateRosterPart = new Ajv({ allErrors: true, removeAdditional: true }).compile(ROSTER_PART_SCHEMA)

export function parseRosterPartOutput(data: unknown, bounds: { count: number }): RosterPartOutput {
  // 注意：不经过 consolidate 归一（形态不同会洗坏载荷）；坏字段由 ajv removeAdditional 剥除
  if (!validateRosterPart(data)) {
    throw new Error(`roster-part 输出校验失败: ${ajv.errorsText(validateRosterPart.errors)}`)
  }
  const out = data as RosterPartOutput
  const inBounds = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < bounds.count
  return {
    groups: out.groups.map((g) => [...new Set(g.filter(inBounds))]).filter((g) => g.length >= 2),
    tiers: out.tiers.filter((t) => inBounds(t.ref)),
    categories: out.categories.filter((c) => inBounds(c.ref) && typeof c.category === 'string'),
  }
}

export interface RosterMergeOutput {
  groups: number[][]
}

const ROSTER_MERGE_SCHEMA = {
  type: 'object',
  properties: {
    groups: { type: 'array', items: { type: 'array', items: { type: 'integer' }, minItems: 2 } },
  },
  required: ['groups'],
  additionalProperties: false,
} as const

const validateRosterMerge = new Ajv({ allErrors: true, removeAdditional: true }).compile(ROSTER_MERGE_SCHEMA)

export function parseRosterMergeOutput(data: unknown, bounds: { count: number }): RosterMergeOutput {
  if (!validateRosterMerge(data)) {
    throw new Error(`roster-merge 输出校验失败: ${ajv.errorsText(validateRosterMerge.errors)}`)
  }
  const out = data as RosterMergeOutput
  const inBounds = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < bounds.count
  return { groups: out.groups.map((g) => [...new Set(g.filter(inBounds))]).filter((g) => g.length >= 2) }
}

/* ---------- V4 BOOK REVIEW 输出（书级审校修复回路） ---------- */

export interface ReviewIssue {
  unitKey: string
  description: string
  chapterOrders: number[]
  suggestion?: string
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unitKey: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          chapterOrders: { type: 'array', items: { type: 'integer' } },
          suggestion: { type: 'string' },
        },
        required: ['unitKey', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['issues'],
  additionalProperties: false,
} as const

const validateReview = new Ajv({ allErrors: true, removeAdditional: true }).compile(REVIEW_SCHEMA)

export function parseReviewIssues(data: unknown, bounds: { max: number }): ReviewIssue[] {
  if (!validateReview(data)) {
    throw new Error(`book-review 输出校验失败: ${ajv.errorsText(validateReview.errors)}`)
  }
  const issues = (data as { issues: ReviewIssue[] }).issues
  return issues
    .map((i) => ({
      unitKey: i.unitKey.slice(0, 120),
      description: i.description.slice(0, 300),
      chapterOrders: (i.chapterOrders ?? []).filter((n) => Number.isInteger(n) && n >= 0).slice(0, 20),
      suggestion: typeof i.suggestion === 'string' ? i.suggestion.slice(0, 200) : undefined,
    }))
    .slice(0, bounds.max)
}
