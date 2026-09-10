/**
 * 讲义「编写注记」剥离（纯函数；2026-09-09 复盘「初学者评估」落地）
 * @module shared/utils/lesson-authoring-notes
 *
 * 背景：初学者评估读到的讲义正文里混着给开发/审核看的注记——「⚠️ 待核验：本轮 Wikipedia
 * 超时」「概念 id: 03f1…」「状态: draft | version: 1」「本空间快照确证」等。这些放在
 * 学习者正文里既费解又损伤信任。
 *
 * 做法：渲染前把注记行/引用块从正文剥离，交给调用方折叠展示（"编写注记"），
 * 保证学习者看到的正文只有教学内容；生成侧同时由技能纪律要求把注记写进 attrs/折叠区。
 */

/** 注记识别（命中其一即视为编写注记） */
const NOTE_PATTERNS: RegExp[] = [
  /⚠️/,
  /待核验/,
  /needs_verification/i,
  /待查证/,
  /先验待查/,
  /编写注记/,
  /本空间快照/,
  /快照确证/,
  /^\s*概念\s*id\s*[:：]/i,
  /^\s*卡片\s*id\s*[:：]/i,
  /^\s*状态\s*[:：]\s*(draft|published)/i,
  /^\s*version\s*[:：]/i,
  /^\s*更新时间\s*[:：]\s*\d/i,
]

export interface StrippedLessonText {
  /** 剥离注记后的正文（可能为空串） */
  body: string
  /** 被剥离的注记（按出现顺序，已去引用前缀） */
  notes: string[]
}

function isNoteLine(line: string): boolean {
  const stripped = line.replace(/^\s*>\s?/, '')
  if (!stripped.trim()) return false
  return NOTE_PATTERNS.some((re) => re.test(stripped))
}

/**
 * 把 md 拆成「学习者正文」与「编写注记」。
 * - 引用块（>）整体判断：块内任一行命中注记 → 整块归注记（续行不残留正文）；
 * - 非引用的注记行（如"概念 id: …"）同样归注记；
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
      if (NOTE_PATTERNS.some((re) => re.test(blockText))) {
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
