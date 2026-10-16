/**
 * 讲义「编写注记」剥离（纯函数）
 * @module shared/utils/lesson-authoring-notes
 *
 * 背景：初学者评估读到的讲义正文里混着给开发/审核看的注记——「⚠️ 待核验：本轮 Wikipedia
 * 超时」「概念 id: 03f1…」「状态: draft | version: 1」「本空间快照确证」等。这些放在
 * 学习者正文里既费解又损伤信任。
 *
 * 做法：渲染前把注记**行/引用块**从正文剥离，交给调用方折叠展示（"编写注记"），
 * 保证学习者看到的正文只有教学内容；生成侧同时由技能纪律要求把注记写进 attrs/折叠区。
 *
 * 2026-09-12 修复（用户实测「内容缺斤少两」）：
 * 此前口径是"一行里出现注记关键词就整行删除"，把**带着先验标注的正常教学内容**一起吃掉——
 * 例如张量讲义「为什么学它」的
 * `2. **估算资源**（先验待查证）：参数数量、激活占用、显存峰值都要从形状算出来；`
 * 整条 bullet 消失，读者看到"支撑三类具体工作"却只剩一条，且它跑到"编写注记"里去了。
 * 现在改为**注记主导才剥离**：
 * - 强标记（⚠️ / 编写注记 / needs_verification / 系统黑话）出现在行内任意位置即剥离；
 * - 弱标记（待核验 / 待查证 / 先验待查）只在**行首**（去掉列表符号、引用符、粗体后）出现才剥离；
 * - 引用块沿用"块内任一行判定"口径（引用块在讲义里要么是引文要么是注记，整块处理更不易漏）。
 */

/** 强标记：出现即视为注记（无歧义的系统/审核用语） */
const STRONG_NOTE_PATTERNS: RegExp[] = [
  /⚠️/,
  /编写注记/,
  /needs_verification/i,
  /本空间快照/,
  /快照确证/,
  /^\s*概念\s*id\s*[:：]/i,
  /^\s*卡片\s*id\s*[:：]/i,
  /^\s*状态\s*[:：]\s*(draft|published)/i,
  /^\s*version\s*[:：]/i,
  /^\s*更新时间\s*[:：]\s*\d/i,
]

/** 弱标记：只有位于行首（注记主导该行）时才视为注记 —— 必须锚定行首 */
const LEADING_NOTE_PATTERNS: RegExp[] = [/^待核验/, /^待查证/, /^先验待查/]

/** 去掉行首的列表符号、引用符、粗体/斜体/空白，用于判断"注记是否主导该行" */
function stripLinePrefix(line: string): string {
  return line
    .replace(/^\s*>\s?/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/^[\s*_`"'“”‘’（(【[]+/, '')
    .trim()
}

/** 强标记命中（任意位置） */
function hasStrongNote(text: string): boolean {
  return STRONG_NOTE_PATTERNS.some((re) => re.test(text))
}

/** 弱标记命中的是"行首注记"（如"待核验：…"/"先验待查证（本轮…）"） */
function hasLeadingNote(text: string): boolean {
  const stripped = stripLinePrefix(text)
  return LEADING_NOTE_PATTERNS.some((re) => re.test(stripped))
}

/** 该行是否属于编写注记（强标记任意位置，弱标记仅行首） */
function isNoteLine(line: string): boolean {
  const text = line.replace(/^\s*>\s?/, '')
  if (!text.trim()) return false
  return hasStrongNote(text) || hasLeadingNote(text)
}

export interface StrippedLessonText {
  /** 剥离注记后的正文（可能为空串） */
  body: string
  /** 被剥离的注记（按出现顺序，已去引用前缀） */
  notes: string[]
}

/**
 * 把 md 拆成「学习者正文」与「编写注记」。
 * - 引用块（>）整体判断：块内任一行命中注记 → 整块归注记（续行不残留正文）；
 * - 非引用的注记主导行（"待核验：…"、行内带 ⚠️ 等）同样归注记；
 * - 仅在句中提到"（先验待查证）"的教学内容**保留**在正文里；
 * - 连续注记行合并为一条；正文两端空行裁掉。
 */
export function stripAuthoringNotes(md: string): StrippedLessonText {
  const lines = String(md ?? '').split(/\r?\n/)
  const bodyLines: string[] = []
  const notes: string[] = []
  let buf: string[] = []

  const flush = (): void => {
    if (buf.length) {
      const text = buf.join(' ').replace(/\s+/g, ' ').trim()
      if (text) notes.push(text)
      buf = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*>/.test(line)) {
      const block: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        block.push(lines[i].replace(/^\s*>\s?/, '').trim())
        i++
      }
      const blockText = block.join(' ')
      if (block.some((b) => hasStrongNote(b) || hasLeadingNote(b))) {
        buf.push(blockText)
        continue
      }
      flush()
      bodyLines.push(...block.map((b) => (b ? `> ${b}` : '>')))
      continue
    }
    if (isNoteLine(line)) {
      buf.push(line.replace(/^\s*>\s?/, '').trim())
      i++
      continue
    }
    flush()
    bodyLines.push(line)
    i++
  }
  flush()

  while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift()
  while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop()

  return { body: bodyLines.join('\n'), notes }
}
