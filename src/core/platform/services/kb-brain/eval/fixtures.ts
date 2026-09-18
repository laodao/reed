/**
 * M0 评测集结构（详细设计 §9.1）
 * @module platform/services/kb-brain/eval/fixtures
 *
 * 两个评测库（A=同类型小说节选 / B=混合文档），每库 40 问（事实 20/综合 20）。
 * expectedDocumentIds 待真机导入后回填（导库后由人工/半自动标注）；
 * runner 对比 include=['chunk']（存量）vs include=['chunk','atom','note']（brain）。
 */

export interface EvalCase {
  id: string
  query: string
  intent: 'lookup' | 'synthesize'
  /** 期望命中的文档（真机导库后回填；null=未标注，评分时跳过） */
  expectedDocumentIds: string[] | null
  /** 答案要点关键词（MRR 的弱判据：命中结果含任一关键词即算相关） */
  expectedKeywords: string[]
}

export interface EvalSet {
  kbName: string
  /** 真机上的 knowledge_bases.id（跑基线时填） */
  kbId: string | null
  cases: EvalCase[]
}

export interface CaseResult {
  caseId: string
  query: string
  intent: string
  hit: boolean
  rank: number | null
  recallAt5: number
}

export interface EvalReport {
  setName: string
  mode: 'chunk' | 'brain'
  total: number
  evaluated: number
  recallAt5: number
  mrr: number
  byIntent: Record<string, { recallAt5: number; mrr: number; n: number }>
}

/** 评分：recall@5（前5结果是否含期望文档/关键词命中）+ MRR */
export function evaluateCase(results: Array<{ documentId: string; content: string }>, c: EvalCase): CaseResult {
  const top5 = results.slice(0, 5)
  let rank: number | null = null
  if (c.expectedDocumentIds && c.expectedDocumentIds.length > 0) {
    const idx = top5.findIndex((r) => c.expectedDocumentIds!.includes(r.documentId))
    rank = idx === -1 ? null : idx + 1
  } else {
    const idx = top5.findIndex((r) => c.expectedKeywords.some((k) => r.content.includes(k)))
    rank = idx === -1 ? null : idx + 1
  }
  return {
    caseId: c.id,
    query: c.query,
    intent: c.intent,
    hit: rank !== null,
    rank,
    recallAt5: rank !== null ? 1 : 0,
  }
}

export function summarize(setName: string, mode: 'chunk' | 'brain', cases: EvalCase[], results: CaseResult[]): EvalReport {
  const paired = cases
    .map((c) => ({ c, r: results.find((x) => x.caseId === c.id) }))
    .filter((p): p is { c: EvalCase; r: CaseResult } => !!p.r && (p.c.expectedDocumentIds !== null))
  const byIntent: EvalReport['byIntent'] = {}
  for (const { c, r } of paired) {
    const bucket = (byIntent[c.intent] ??= { recallAt5: 0, mrr: 0, n: 0 })
    bucket.n++
    bucket.recallAt5 += r.recallAt5
    bucket.mrr += r.rank ? 1 / r.rank : 0
  }
  for (const b of Object.values(byIntent)) {
    b.recallAt5 = b.n ? b.recallAt5 / b.n : 0
    b.mrr = b.n ? b.mrr / b.n : 0
  }
  const n = paired.length
  return {
    setName,
    mode,
    total: cases.length,
    evaluated: n,
    recallAt5: n ? paired.reduce((s, p) => s + p.r.recallAt5, 0) / n : 0,
    mrr: n ? paired.reduce((s, p) => s + (p.r.rank ? 1 / p.r.rank : 0), 0) / n : 0,
    byIntent,
  }
}
