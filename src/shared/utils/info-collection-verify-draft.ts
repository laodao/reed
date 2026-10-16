/**
 * 信息搜集：整理稿反查校验（纯函数，双端可用）
 * @module shared/utils/info-collection-verify-draft
 *
 * 背景（主设计 §3 阶段 5）：整理稿不得出现无法回链到条目的新事实——LLM 生成
 * 禁 free-writing：每条陈述必须**结构化挂证据行 id**，陈述中的数值必须能回链到
 * 所挂条目（值/引句/行字段/期间），定位不到即剔（宁可空缺不可无据）。
 *
 * 数值是数据搜集的第一幻觉向量，所以校验以数值为主：陈述里的每个数字字面量
 * （含千位分隔/小数）都必须在证据条目的数字集合里找得到；专名校验依赖
 * evidenceRowIds 的存在性 + 引句回验（阶段 4 已做），此处不重复做 NER。
 */

export interface IcDraftEntry {
  rowId: string
  /** measure 约定列值（数值条目） */
  value: number | null
  period: string | null
  quote: string | null
  /** 全量行字段 */
  row: Record<string, unknown> | null
}

export interface IcDraftStatement {
  text: string
  /** 证据行 id（结构化回链；不是自由文本引用） */
  evidenceRowIds: string[]
}

export interface IcStatementVerdict {
  statement: IcDraftStatement
  ok: boolean
  /** 证据行不存在 */
  missingEvidence: boolean
  /** 无法回链的数值（规范化后） */
  missingNumbers: string[]
}

/** 提取文本中的数字字面量并规范化（去千位分隔；保留小数与负号） */
export function extractNumbers(text: string): string[] {
  if (!text) return []
  const matches = text.match(/-?\d+(?:[,，]\d{3})*(?:\.\d+)?/g) ?? []
  return matches.map(m => m.replace(/[,，]/g, ''))
}

/** 条目的数字集合：约定值 + 期间 + 引句 + 行字段全部并入 */
export function entryNumbers(e: IcDraftEntry): Set<string> {
  const set = new Set<string>()
  const feed = (s: string | number | null | undefined): void => {
    if (s === null || s === undefined) return
    for (const n of extractNumbers(String(s))) set.add(n)
  }
  if (e.value !== null && e.value !== undefined && Number.isFinite(e.value)) {
    set.add(String(e.value))
    // 浮点整数值的双形态（954 与 954.0）都收
    if (Number.isInteger(e.value)) set.add(e.value.toFixed(1))
  }
  feed(e.period)
  feed(e.quote)
  if (e.row) feed(JSON.stringify(e.row))
  return set
}

/**
 * 逐条校验陈述：
 * - 证据行 id 必须真实存在（结构化回链的前提）；
 * - 陈述中的每个数字必须落在其证据条目的数字集合内。
 * 通过的陈述原样保留；不通过的进 stripped（调用方删句并计数）。
 */
export function verifyStatements(
  statements: IcDraftStatement[],
  entries: IcDraftEntry[],
): { verdicts: IcStatementVerdict[]; stripped: IcStatementVerdict[]; passed: IcStatementVerdict[] } {
  const entryMap = new Map(entries.map(e => [e.rowId, e]))
  const numberCache = new Map<string, Set<string>>()
  const numbersOf = (rowId: string): Set<string> => {
    let s = numberCache.get(rowId)
    if (!s) {
      const e = entryMap.get(rowId)
      s = e ? entryNumbers(e) : new Set()
      numberCache.set(rowId, s)
    }
    return s
  }

  const verdicts: IcStatementVerdict[] = []
  for (const st of statements ?? []) {
    const evidence = (st.evidenceRowIds ?? []).filter(id => entryMap.has(id))
    const missingEvidence = evidence.length === 0
    const union = new Set<string>()
    for (const id of evidence) for (const n of numbersOf(id)) union.add(n)
    const missingNumbers = extractNumbers(st.text).filter(n => !union.has(n))
    verdicts.push({
      statement: st,
      ok: !missingEvidence && missingNumbers.length === 0,
      missingEvidence,
      missingNumbers,
    })
  }
  return {
    verdicts,
    stripped: verdicts.filter(v => !v.ok),
    passed: verdicts.filter(v => v.ok),
  }
}
