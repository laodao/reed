/**
 * 信息搜集：跨行恒等式校验引擎（纯函数，双端可用）
 * @module shared/utils/info-collection-checks
 *
 * 背景（存储专项 §5）：财报勾稽（资产=负债+所有者权益）、人口平衡方程等
 * **数据自洽**校验——比引句回验更深一层：每条数据都对原文，但组合起来账不平。
 * 做成通用机制：蓝图 schema 声明 checks，引擎对任何主题生效。
 *
 * v1 语法（同期同维）：`科目A = 科目B + 科目C - 科目D`
 * - 标识符 = metric 名（任意非空白且不含 = + - ≈ 的字符串，中文可用）；
 * - 求值按 (period, dims) 分组：同组同 metric 的多行**求和**（正常采集一行动态一个值）；
 * - 容差为相对容差：|L-R| ≤ tolerance × max(|L|,|R|)（默认 0.005，数值系统天然舍入）；
 * - 组内缺科目 → 跳过（不计失败也不计通过）——部分年度缺科目的数据集不该被恒等式误杀。
 *
 * 纪律（fail-soft）：解析失败返回 skipped，不 throw——坏规则不毁整批校验。
 */

import type { IcCheckFinding, IcCheckRule } from '@shared/types/info-collection.types'

/** 参与校验的行（从 ic_rows 约定列提取；dims 为空对象时归入同组） */
export interface IcCheckRowInput {
  metric: string | null
  period: string | null
  dims?: Record<string, unknown> | null
  value: number | null
}

/** 分组键：period 为空归入 ''（无期数据不参与同期校验，单独成组） */
export function dimsGroupKey(period: string | null, dims?: Record<string, unknown> | null): string {
  let dimsKey = ''
  if (dims && Object.keys(dims).length > 0) {
    const keys = Object.keys(dims).sort()
    dimsKey = keys.map(k => `${k}=${String(dims[k])}`).join('&')
  }
  return `${period ?? ''}|${dimsKey}`
}

interface ParsedRule {
  left: string
  /** 正负号交替的项序列 */
  right: Array<{ sign: 1 | -1; metric: string }>
}

/** 解析失败抛 Error（由 evaluateChecks 捕获转 skipped） */
function parseRule(expr: string): ParsedRule {
  const eq = expr.indexOf('=')
  if (eq < 0) throw new Error('缺少 =')
  const left = expr.slice(0, eq).trim()
  const rightRaw = expr.slice(eq + 1)
  if (!left || !rightRaw.trim()) throw new Error('等号两侧为空')
  if (left.includes('+') || left.includes('-')) throw new Error('v1 等式左侧只允许单个科目')

  const right: ParsedRule['right'] = []
  const tokens = rightRaw.match(/[^\s+=-]+|[+-]/g) ?? []
  let sign: 1 | -1 = 1
  let expectOperator = false
  for (const token of tokens) {
    if (token === '+') {
      if (!expectOperator) throw new Error(`意外的 +`)
      sign = 1
      expectOperator = false
    } else if (token === '-') {
      if (!expectOperator) throw new Error(`意外的 -`)
      sign = -1
      expectOperator = false
    } else {
      if (expectOperator) throw new Error(`科目 "${token}" 前缺少运算符`)
      right.push({ sign, metric: token })
      expectOperator = true
    }
  }
  if (!expectOperator) throw new Error('等式右侧无有效科目')
  return { left, right }
}

/**
 * 求值全部规则 × 全部分组。
 * 只有"左右科目齐全"的分组才产出 ok 判定；缺科目 / 解析失败 → skipped=true。
 */
export function evaluateChecks(rules: IcCheckRule[], rows: IcCheckRowInput[]): IcCheckFinding[] {
  // 分组 → metric → 值求和
  const groups = new Map<string, Map<string, number>>()
  for (const row of rows) {
    if (row.value === null || row.value === undefined || Number.isNaN(row.value)) continue
    if (!row.metric) continue
    const key = dimsGroupKey(row.period, row.dims)
    let metrics = groups.get(key)
    if (!metrics) {
      metrics = new Map()
      groups.set(key, metrics)
    }
    metrics.set(row.metric, (metrics.get(row.metric) ?? 0) + row.value)
  }

  const findings: IcCheckFinding[] = []
  for (const rule of rules ?? []) {
    const tolerance = rule.tolerance ?? 0.005
    let parsed: ParsedRule
    try {
      parsed = parseRule(rule.expr)
    } catch (e) {
      findings.push({
        ruleExpr: rule.expr,
        groupId: '*',
        left: null,
        right: null,
        diffRatio: null,
        ok: false,
        skipped: true,
        missingMetrics: [],
        detail: `表达式解析失败：${e instanceof Error ? e.message : String(e)}`,
      })
      continue
    }

    for (const [groupId, metrics] of groups) {
      const needed = [parsed.left, ...parsed.right.map(t => t.metric)]
      const missing = needed.filter(m => !metrics.has(m))
      if (missing.length > 0) {
        findings.push({
          ruleExpr: rule.expr,
          groupId,
          left: null,
          right: null,
          diffRatio: null,
          ok: false,
          skipped: true,
          missingMetrics: missing,
        })
        continue
      }
      const leftVal = metrics.get(parsed.left)!
      const rightVal = parsed.right.reduce((acc, t) => acc + t.sign * metrics.get(t.metric)!, 0)
      const scale = Math.max(Math.abs(leftVal), Math.abs(rightVal))
      const diffRatio = scale === 0 ? 0 : Math.abs(leftVal - rightVal) / scale
      findings.push({
        ruleExpr: rule.expr,
        groupId,
        left: leftVal,
        right: rightVal,
        diffRatio,
        ok: diffRatio <= tolerance,
        skipped: false,
        missingMetrics: [],
      })
    }
  }
  return findings
}
