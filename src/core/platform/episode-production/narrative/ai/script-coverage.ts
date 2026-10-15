/**
 * narrative/ai/script-coverage
 * @module platform/episode-production/narrative/ai/script-coverage
 * @description 剧本原文覆盖度与台词一致性校验（2026-09-21 起，§4.1 于 2026-10-06 增强）。
 *
 * 背景：雪麓山庄实测发现生成剧本丢整段对白（"约法三章+叫帮手"）与伏笔（旧信）。
 * 这里对「原文带引号的对白句」与「生成结果的对白/旁白/正文」做归一化匹配。
 *
 * §4.1 台词单一来源立法带来的三项收紧：
 *   1. **haystack 剔除剧本正文**——正文命中不再算覆盖（正文是展示视图，
 *      `dialogues[].text` 才是数据；此前正文写了、dialogues 里是改写版也算"覆盖"）；
 *   2. 长句容错从"首尾各 8 字命中"收紧为"完整包含或编辑距离 ≤10%"；
 *   3. 新增正文↔dialogues 双向一致性比对（`checkDialogueConsistency`）。
 *
 * 校验本身不阻断生成（保持既有语义），但结果会落库并在 UI 显示（§4.5 可见性）。
 */

/** 归一化：去标点/空白/引号，只留文字字符，用于包含匹配 */
function normalize(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]/gu, '')
}

/** 从原文提取带引号的对白句（中文弯引号 "" / 直引号 ""，长度≥4 才判定为对白） */
export function extractOriginalDialogues(originalText: string): string[] {
  const out: string[] = []
  const re = /[“"]([^”"\n]{4,120})[”"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(originalText)) !== null) {
    const t = m[1].trim()
    if (t && normalize(t).length >= 4) out.push(t)
  }
  return out
}

/**
 * 编辑距离容差上限（§4.1）：长句允许 ≤10% 字符差异（AI 微调语气词），
 * 替换历史实现"首尾各 8 字命中即算覆盖"的宽松口径。
 *
 * 注意：§4.1 收紧的是**松散的首尾匹配**（首尾各命中 8 字即算过，中间可以
 * 完全不同），而不是禁止 AI 插入动作描写。插入型改写由
 * `isSubsequenceWithinBudget` 单独判定——原文台词的字序仍完整保留时才算覆盖。
 */
export const COVERAGE_EDIT_DISTANCE_RATIO = 0.1

/**
 * 插入型改写容差（§4.1）：原文台词作为**子序列**完整出现在生成文本中，
 * 且被插入的字符数不超过原文长度的该比例时，视为覆盖。
 *
 * 场景：原文「我爹当年多威风铁面追风…」→ 生成「我爹当年多威风铁面追风（她挺起胸膛）…」
 * ——字序未变、只插入了动作描写，属保真纪律允许的"可微调"。
 * 反之若原文整句被改写/删节，字序断裂，子序列判定必然失败。
 */
export const COVERAGE_INSERTION_BUDGET_RATIO = 0.5

/**
 * needle 是否为 haystack 的子序列，且插入字符数在预算内。
 *
 * 用于放行"原文台词 + 插入动作描写"的合理改写；纯改写/删节无法通过。
 */
export function isSubsequenceWithinBudget(
  haystack: string,
  needle: string,
  budgetRatio = COVERAGE_INSERTION_BUDGET_RATIO,
): boolean {
  if (!needle) return false
  let i = 0
  let inserted = 0
  for (const ch of haystack) {
    if (i < needle.length && ch === needle[i]) {
      i += 1
    } else if (i > 0) {
      // 已进入匹配区段后的多余字符 = 插入
      inserted += 1
    }
    if (inserted > needle.length * budgetRatio) return false
  }
  return i === needle.length
}

/** Levenshtein 距离（带早停：超过 max 立即返回 max+1，避免长句全矩阵开销） */
export function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  if (a === b) return true
  const m = a.length
  const n = b.length
  let prev = new Array<number>(n + 1)
  let cur = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    let rowMin = cur[0]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return false
    const tmp = prev
    prev = cur
    cur = tmp
  }
  return prev[n] <= max
}

export interface CoverageResult {
  /** 原文对白总数 */
  total: number
  /** 已在生成结果中找到的对白数 */
  covered: number
  /** 缺失的对白原文 */
  missing: string[]
  /** 覆盖率（0-1；无原文对白时为 1） */
  ratio: number
}

/**
 * 校验原文对白在生成结果中的覆盖度。
 *
 * §4.1：`generatedTexts` **不应包含剧本正文**——调用方只传
 * `scenes[].dialogues[].text` 与 `narration`，正文命中不再算覆盖。
 *
 * @param originalText   原始章节/粘贴正文
 * @param generatedTexts 生成结果的可匹配文本集合（各场对白 text + 旁白；**不含正文**）
 */
export function validateScriptCoverage(
  originalText: string,
  generatedTexts: string[],
): CoverageResult {
  const originals = extractOriginalDialogues(originalText)
  const haystack = normalize(generatedTexts.join('\n'))
  const haystackSegments = generatedTexts.map(normalize).filter(Boolean)
  const missing: string[] = []

  for (const line of originals) {
    const needle = normalize(line)
    if (!needle) continue
    if (haystack.includes(needle)) continue

    // §4.1 收紧：长句允许编辑距离 ≤10%，不再"首尾各 8 字命中即过"
    const maxDist = Math.floor(needle.length * COVERAGE_EDIT_DISTANCE_RATIO)
    if (maxDist > 0 && haystackSegments.some((seg) => editDistanceWithin(seg, needle, maxDist))) {
      continue
    }
    // §4.1：插入型改写（原文台词字序完整保留 + 插入动作描写）放行
    if (haystackSegments.some((seg) => isSubsequenceWithinBudget(seg, needle))) continue
    // 短句（≤4 字容差为 0）仍然允许"被更长台词完整包含"的包含式命中
    if (haystackSegments.some((seg) => seg.includes(needle))) continue

    missing.push(line)
  }

  const covered = originals.length - missing.length
  return {
    total: originals.length,
    covered,
    missing,
    ratio: originals.length === 0 ? 1 : covered / originals.length,
  }
}

/** 把覆盖度结果渲染为 warning 行（调用方逐条 console.warn） */
export function coverageWarnings(result: CoverageResult): string[] {
  if (result.total === 0) return []
  if (result.missing.length === 0) return []
  const lines = [
    `原文对白覆盖度 ${result.covered}/${result.total}：${result.missing.length} 句原文对白未在生成结果中找到（建议核对是否丢节拍/伏笔）`,
  ]
  for (const m of result.missing.slice(0, 10)) {
    lines.push(`缺失对白：「${m.length > 40 ? m.slice(0, 40) + '…' : m}」`)
  }
  return lines
}

// ==================== §4.1 正文 ↔ dialogues 双向一致性 ====================

/** 单条不一致项 */
export interface DialogueConsistencyIssue {
  kind: 'in_script_not_in_dialogues' | 'text_mismatch'
  /** 剧本正文里的对白原文 */
  scriptLine: string
  /** 对应 dialogues 里的文本（mismatch 时给出） */
  dialogueText?: string
  message: string
}

export interface DialogueConsistencyResult {
  consistent: boolean
  issues: DialogueConsistencyIssue[]
}

/**
 * 从剧本正文里提取对白行（带引号，或"角色：台词"式）。
 *
 * 正文是展示视图，格式较自由——这里取两类常见形态：
 *   1. 引号包裹的句子；
 *   2. "角色名：台词"（中文冒号）。
 */
export function extractScriptBodyDialogues(scriptBody: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (s: string) => {
    const t = s.trim()
    const norm = normalize(t)
    if (norm.length < 2 || seen.has(norm)) return
    seen.add(norm)
    out.push(t)
  }

  // 引号式
  const quoted = /[“"]([^”"\n]{2,120})[”"]/g
  let m: RegExpExecArray | null
  while ((m = quoted.exec(scriptBody)) !== null) push(m[1])

  // "角色：台词" 式（排除场景标题等）
  for (const rawLine of scriptBody.split('\n')) {
    const mm = /^\s*(?:[\u4e00-\u9fff]{1,8})\s*[：:]\s*(.+?)\s*$/.exec(rawLine)
    if (mm) push(mm[1])
  }
  return out
}

/**
 * §4.1 双向一致性比对：剧本正文里的对白必须与 `dialogues[].text` 一致。
 *
 * 检查两项：
 *   1. **正文有、dialogues 无** → 对白只存在于展示视图，数据层缺失（配音/视频会丢这句）；
 *   2. **同一句在正文与 dialogues 里文本明显不一致**（编辑距离 >10%）→ 两处载体的台词分叉。
 *
 * @param scriptBody 剧本正文（展示视图）
 * @param dialogueTexts dialogues[].text 集合（唯一事实源）
 */
export function checkDialogueConsistency(
  scriptBody: string,
  dialogueTexts: string[],
): DialogueConsistencyResult {
  const issues: DialogueConsistencyIssue[] = []
  if (!scriptBody?.trim() || dialogueTexts.length === 0) {
    // 无正文或无对白时无从比对（空 dialogues 且正文有对白的情形由下方逐条命中）
    if (!scriptBody?.trim()) return { consistent: true, issues: [] }
  }

  const normDialogues = dialogueTexts.map((t) => ({ text: t, norm: normalize(t) })).filter((d) => d.norm)
  const bodyLines = extractScriptBodyDialogues(scriptBody)

  for (const line of bodyLines) {
    const needle = normalize(line)
    if (!needle) continue

    // ① 完整包含（正文台词被 dialogues 收录，可能附带前后缀）
    if (normDialogues.some((d) => d.norm.includes(needle) || needle.includes(d.norm))) continue

    // ② 编辑距离容差内的近似（语气微调），或插入型改写（正文台词 + 插入动作描写）
    const maxDist = Math.max(1, Math.floor(needle.length * COVERAGE_EDIT_DISTANCE_RATIO))
    const near = normDialogues.find(
      (d) =>
        editDistanceWithin(d.norm, needle, maxDist) ||
        isSubsequenceWithinBudget(d.norm, needle) ||
        isSubsequenceWithinBudget(needle, d.norm),
    )
    if (near) {
      issues.push({
        kind: 'text_mismatch',
        scriptLine: line,
        dialogueText: near.text,
        message: `正文对白与 dialogues 文本不一致：正文「${truncate(line)}」vs dialogues「${truncate(near.text)}」`,
      })
      continue
    }

    issues.push({
      kind: 'in_script_not_in_dialogues',
      scriptLine: line,
      message: `正文有对白但 dialogues 里没有对应条目（数据层缺失，配音/视频会丢这句）：「${truncate(line)}」`,
    })
  }

  return { consistent: issues.length === 0, issues }
}

/** 一致性结果 → warning 行 */
export function dialogueConsistencyWarnings(result: DialogueConsistencyResult): string[] {
  if (result.consistent) return []
  const lines = [
    `台词单一来源校验：正文与 dialogues 存在 ${result.issues.length} 处不一致（dialogues 是唯一事实源）`,
  ]
  for (const i of result.issues.slice(0, 10)) lines.push(i.message)
  return lines
}

function truncate(s: string, n = 40): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

// ==================== §4.5 覆盖度报告（落库 + UI 可见） ====================

/** 覆盖度报告（落 `script.metadata.coverageReport`，§4.5） */
export interface CoverageReport {
  /** 原文对白总数 */
  total: number
  /** 命中数 */
  covered: number
  /** 覆盖率（0-1） */
  ratio: number
  /** 缺失对白（截断保存，避免 metadata 膨胀） */
  missing: string[]
  /** 正文↔dialogues 不一致条数 */
  inconsistencyCount: number
  /** 生成时间戳 */
  checkedAt: number
}

/** 生成可落库的覆盖度报告（§4.5） */
export function buildCoverageReport(
  coverage: CoverageResult,
  consistency?: DialogueConsistencyResult,
): CoverageReport {
  return {
    total: coverage.total,
    covered: coverage.covered,
    ratio: Number(coverage.ratio.toFixed(4)),
    missing: coverage.missing.slice(0, 50).map((m) => truncate(m, 120)),
    inconsistencyCount: consistency?.issues.length ?? 0,
    checkedAt: Date.now(),
  }
}

/** agent 动作用的一句话摘要（§4.5：让"丢对白"从事故变为可见指标） */
export function coverageSummaryLine(report: CoverageReport): string {
  if (report.total === 0) return '原文对白覆盖度：无带引号对白可比对'
  const pct = Math.round(report.ratio * 100)
  const parts = [`原文对白覆盖度 ${report.covered}/${report.total}（${pct}%）`]
  if (report.missing.length > 0) parts.push(`缺失 ${report.missing.length} 句`)
  if (report.inconsistencyCount > 0) parts.push(`正文与 dialogues 不一致 ${report.inconsistencyCount} 处`)
  return parts.join('，')
}