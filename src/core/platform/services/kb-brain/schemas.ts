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

export interface AtomizeOutput {
  atoms: RawAtom[]
  events: RawEvent[]
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

const ajv = new Ajv({ allErrors: true })
const validateAtomize = ajv.compile(ATOMIZE_SCHEMA)
const validateAdjudicate = ajv.compile(ADJUDICATE_SCHEMA)

/** 校验并收窄；失败抛错（错误清单供回喂重试） */
export function validateAtomizeOutput(data: unknown): AtomizeOutput {
  if (!validateAtomize(data)) {
    throw new Error(`atomize 输出校验失败: ${ajv.errorsText(validateAtomize.errors)}`)
  }
  return data as AtomizeOutput
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
