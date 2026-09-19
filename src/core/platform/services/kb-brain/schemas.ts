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

export interface AtomizeOutput {
  atoms: RawAtom[]
  events: RawEvent[]
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
        properties: { newIdx: { type: 'integer', minimum: 0 }, oldIdx: { type: 'integer', minimum: 0 } },
        required: ['newIdx', 'oldIdx'],
        additionalProperties: false,
      },
    },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          newIdx: { type: 'integer', minimum: 0 },
          oldIdx: { type: 'integer', minimum: 0 },
          severity: { enum: ['update', 'conflict'] },
        },
        required: ['newIdx', 'oldIdx', 'severity'],
        additionalProperties: false,
      },
    },
    novel: { type: 'array', items: { type: 'integer', minimum: 0 } },
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
    out.atoms = (out.atoms as Array<Record<string, unknown>>).map((a) => {
      if (typeof a !== 'object' || a === null) return a
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
      return item
    })
  }
  // mentions 字符串数组 → 对象数组（模型常把类型省略成纯名字列表）
  if (Array.isArray(out.mentions)) {
    out.mentions = (out.mentions as Array<unknown>).map((m) =>
      typeof m === 'string' ? { name: m, type: 'concept' } : m,
    )
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

/** 校验并做索引合法性过滤（越界索引丢弃——模型幻觉编号不致污染落库） */
export function validateAdjudicateOutput(
  data: unknown,
  bounds: { newCount: number; oldCount: number },
): AdjudicateOutput {
  if (!validateAdjudicate(data)) {
    throw new Error(`adjudicate 输出校验失败: ${ajv.errorsText(validateAdjudicate.errors)}`)
  }
  const out = data as AdjudicateOutput
  const inNew = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < bounds.newCount
  const inOld = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < bounds.oldCount
  return {
    duplicates: out.duplicates.filter((d) => inNew(d.newIdx) && inOld(d.oldIdx)),
    contradictions: out.contradictions.filter((c) => inNew(c.newIdx) && inOld(c.oldIdx)),
    novel: out.novel.filter((i) => inNew(i)),
  }
}
