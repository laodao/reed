/**
 * 讲义数值自检（纯函数；2026-09-09 复盘「初学者评估」落地）
 * @module shared/utils/lesson-numeric-check
 *
 * 背景：初学者评估发现同一张讲义里数字自相矛盾（同一算例既写 ≈1.67% 又写约 17%），
 * 新手一验算就失去信任。
 *
 * 做法：把正文里形如「a×b=c」「a/b=c」「a+b=c」「a-b=c」「a×b≈c」的算式抽出来回算，
 * 与文中声称的结果比对（= 要求精确到千分之一以内；≈ 允许 1% 相对误差），
 * 不一致则产出一条给人看的 issue。它能覆盖"写出来的算式"，不做语义级验算（如需
 * 判断"该不该用这个公式"仍靠 verify 会话）。
 */

export interface NumericIssue {
  /** 原算式文本 */
  statement: string
  /** 回算得到的数 */
  expected: number
  /** 文中声称的数 */
  actual: number
  /** 给人看的说明 */
  message: string
}

interface OpSpec {
  re: RegExp
  op: string
  calc: (a: number, b: number) => number
  approxTolerance: number
}

const OPS: OpSpec[] = [
  { re: /(-?\d+(?:\.\d+)?)\s*(?:×|\*|·)\s*(-?\d+(?:\.\d+)?)\s*(=|≈)\s*(-?\d+(?:\.\d+)?)/g, op: '×', calc: (a, b) => a * b, approxTolerance: 0.01 },
  { re: /(-?\d+(?:\.\d+)?)\s*÷\s*(-?\d+(?:\.\d+)?)\s*(=|≈)\s*(-?\d+(?:\.\d+)?)/g, op: '÷', calc: (a, b) => a / b, approxTolerance: 0.01 },
  { re: /(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(=|≈)\s*(-?\d+(?:\.\d+)?)/g, op: '/', calc: (a, b) => a / b, approxTolerance: 0.01 },
  { re: /(-?\d+(?:\.\d+)?)\s*\+\s*(-?\d+(?:\.\d+)?)\s*(=|≈)\s*(-?\d+(?:\.\d+)?)/g, op: '+', calc: (a, b) => a + b, approxTolerance: 0.01 },
  { re: /(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*(=|≈)\s*(-?\d+(?:\.\d+)?)/g, op: '-', calc: (a, b) => a - b, approxTolerance: 0.01 },
]

function closeEnough(expected: number, actual: number, exact: boolean): boolean {
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return true
  const diff = Math.abs(expected - actual)
  if (exact) {
    // 允许末尾四舍五入（如 0.0099 写成 0.01）
    const scale = Math.max(1, Math.abs(expected))
    return diff / scale <= 1e-3
  }
  const denom = Math.max(1e-12, Math.abs(expected))
  return diff / denom <= 0.01
}

/** 逐个回算正文中的算式，返回疑似不一致项 */
export function checkNumericStatements(text: string): NumericIssue[] {
  const src = String(text ?? '')
  const issues: NumericIssue[] = []
  for (const spec of OPS) {
    spec.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = spec.re.exec(src))) {
      const a = Number(m[1])
      const b = Number(m[2])
      const rel = m[3]
      const claimed = Number(m[4])
      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(claimed)) continue
      if (spec.op === '/' || spec.op === '÷') {
        if (b === 0) continue
      }
      const expected = spec.calc(a, b)
      const exact = rel === '='
      if (closeEnough(expected, claimed, exact)) continue
      const round = (x: number): string => (Math.abs(x) < 0.01 ? x.toPrecision(3) : x.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''))
      issues.push({
        statement: m[0].replace(/\s+/g, ''),
        expected,
        actual: claimed,
        message: `算式「${m[0].replace(/\s+/g, '')}」回算结果约为 ${round(expected)}，与文中写的 ${round(claimed)} 不一致，请核对（并补齐中间量）`,
      })
    }
  }
  return issues
}
