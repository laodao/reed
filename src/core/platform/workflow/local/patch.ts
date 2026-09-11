/**
 * apply_patch 补丁解析与应用（44 号；移植自 OpenAI codex apply-patch crate）
 * @module core/platform/workflow/local/patch
 *
 * upstream: https://github.com/openai/codex codex-rs/apply-patch（Apache-2.0）
 * 对应源：parser.rs / streaming_parser.rs（文法状态机）、file_update.rs（chunk 应用）、
 *         seek_sequence.rs（四级模糊匹配）。commit 008bbd5884。
 *
 * 纯函数纪律：本文件零 I/O——parsePatch(text)→ops；applyPatchOps(read, ops)→FS 效果
 * 列表；磁盘读写是 tools 层薄壳。错误文案逐字保留 codex 原文（模型行为契约——
 * 模型靠 "Failed to find expected lines" 等文案自纠错，改写会伤重试成功率）。
 *
 * 有意偏差（相对 codex，均登记 44 号文档）：
 * - 不支持 Environment ID（单机单环境）；`*** Environment ID:` 行按非法 hunk 头报错
 * - 路径围栏（workspace roots）在 tools 层做，本文件不感知文件系统
 * - line number 口径：解析错误的行号 = 原始 patch 文本中的 1-based 行号
 */

// ==================== 文法标记（parser.rs:37-45 逐字） ====================

export const BEGIN_PATCH_MARKER = '*** Begin Patch'
export const END_PATCH_MARKER = '*** End Patch'
export const ADD_FILE_MARKER = '*** Add File: '
export const DELETE_FILE_MARKER = '*** Delete File: '
export const UPDATE_FILE_MARKER = '*** Update File: '
/** 注意：codex 原文是小写 "to"（与 End of File 的大写不一致——易踩坑，勿"修正"） */
export const MOVE_TO_MARKER = '*** Move to: '
export const EOF_MARKER = '*** End of File'
export const CHANGE_CONTEXT_MARKER = '@@ '
export const EMPTY_CHANGE_CONTEXT_MARKER = '@@'

// ==================== 类型 ====================

/** Update File 的一个连续变更块 */
export interface PatchChunk {
  /** `@@ ctx` 行的 ctx（先于 oldLines 定位） */
  changeContext?: string
  /** 被替换的原文行（上下文行 + 删除行） */
  oldLines: string[]
  /** 替换后的行（上下文行 + 新增行） */
  newLines: string[]
  /** `*** End of File` 哨兵：匹配从文件尾对齐 */
  isEndOfFile: boolean
}

export type PatchOp =
  | { kind: 'add'; path: string; contents: string }
  | { kind: 'delete'; path: string }
  | { kind: 'update'; path: string; moveTo?: string; chunks: PatchChunk[] }

/** 应用产出的单条 FS 效果（tools 层据此落盘） */
export interface PatchEffect {
  action: 'write' | 'delete'
  /** 补丁里的原始路径拼写（输出文案用它，codex lib.rs:460-505） */
  displayPath: string
  absPath: string
  content?: string
}

export interface PatchApplyResult {
  effects: PatchEffect[]
  /** 成功输出文案（codex lib.rs:862-877）：A/M/D 分类 */
  successText: string
}

// ==================== 解析（streaming_parser.rs 等价节拍） ====================

/**
 * 解析补丁文本。lenient 语义与 codex 一致：整体先 trim；支持 heredoc 包装剥离；
 * 标记行按 trim 比对；CRLF 剥单个尾 \r；Update 首个 chunk 可省略 @@；裸空行 =
 * 空 context 行。解析失败 throw Error（message 逐字对齐 codex）。
 */
export function parsePatch(input: string): PatchOp[] {
  const text = input.trim()
  if (!text) {
    // tools 层在更早处以 "empty patch" 拒绝；此处兜底
    throw new PatchParseError('The first line of the patch must be \'*** Begin Patch\'', 1)
  }
  const linesAll = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  // heredoc 剥壳（parser.rs:232-254，lenient 缺省开启）
  let lines = linesAll
  if (
    lines.length >= 4 &&
    /^<<(EOF|'EOF'|"EOF")$/.test(lines[0].trim()) &&
    lines[lines.length - 1].trimEnd().endsWith('EOF')
  ) {
    lines = lines.slice(1, -1)
  }

  const ops: PatchOp[] = []
  let lineNo = 0 // lines 下标（0-based；报错 +1 转 1-based）
  let rawLineNo = 0 // 原始文本行号（heredoc 剥壳后 +1 偏移——错误行号以剥壳后的行为准）

  const peek = (): string | null => (lineNo < lines.length ? lines[lineNo] : null)
  const next = (): string => {
    const l = lines[lineNo]
    lineNo++
    rawLineNo++
    return l
  }

  const first = peek()
  if (first === null || first.trim() !== BEGIN_PATCH_MARKER) {
    throw new PatchParseError('The first line of the patch must be \'*** Begin Patch\'', 1)
  }
  next()
  let ended = false

  for (;;) {
    const line = peek()
    if (line === null) break
    const t = line.trim()

    if (t === END_PATCH_MARKER) {
      next()
      ended = true
      break
    }
    if (t === '') {
      // Begin 与首个 hunk 之间的空行
      next()
      continue
    }
    if (t.startsWith(ADD_FILE_MARKER)) {
      const path = t.slice(ADD_FILE_MARKER.length).trim()
      if (path === '') throw new PatchParseError('invalid patch: Add File path is empty', rawLineNo + 1)
      next()
      ops.push(parseAddSection(path))
      continue
    }
    if (t.startsWith(DELETE_FILE_MARKER)) {
      const path = t.slice(DELETE_FILE_MARKER.length).trim()
      if (path === '') throw new PatchParseError('invalid patch: Delete File path is empty', rawLineNo + 1)
      next()
      ops.push(parseDeleteSection(path))
      continue
    }
    if (t.startsWith(UPDATE_FILE_MARKER)) {
      const path = t.slice(UPDATE_FILE_MARKER.length).trim()
      if (path === '') throw new PatchParseError('invalid patch: Update File path is empty', rawLineNo + 1)
      next()
      ops.push(parseUpdateSection(path))
      continue
    }
    throw new PatchParseError(
      `'${t}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`,
      rawLineNo + 1,
    )
  }

  if (!ended) {
    throw new PatchParseError("The last line of the patch must be '*** End Patch'", rawLineNo)
  }
  // End Patch 之后只允许空行（streaming_parser.rs:369-377）
  while (peek() !== null) {
    const rest = next()
    if (rest.trim() !== '') {
      throw new PatchParseError('Unexpected content after End Patch', rawLineNo)
    }
  }
  return ops

  // —— Add File 节：内容行必须 '+' 前缀；零内容行 = 空文件（合法） ——
  function parseAddSection(path: string): PatchOp {
    const contentLines: string[] = []
    for (;;) {
      const line = peek()
      if (line === null) break
      const t = line.trim()
      if (t === END_PATCH_MARKER || t.startsWith(ADD_FILE_MARKER.trimEnd()) || t.startsWith(DELETE_FILE_MARKER.trimEnd()) || t.startsWith(UPDATE_FILE_MARKER.trimEnd())) break
      next()
      if (!line.startsWith('+')) {
        throw new PatchParseError(`Add File content lines must start with '+': '${line.trim()}'`, rawLineNo)
      }
      contentLines.push(line.slice(1))
    }
    // codex：内容行去一个 '+' 后原文追加并补 \n（streaming_parser.rs:202-208）
    const contents = contentLines.length > 0 ? contentLines.map((l) => `${l}\n`).join('') : ''
    return { kind: 'add', path, contents }
  }

  // —— Delete File 节：不允许内容行 ——
  function parseDeleteSection(path: string): PatchOp {
    // 内容行不消费：交还主循环按「非法 hunk 头」报错（codex 同形）
    return { kind: 'delete', path }
  }

  // —— Update File 节：Move to（仅首 chunk 前）+ chunks ——
  function parseUpdateSection(path: string): PatchOp {
    let moveTo: string | undefined
    const chunks: PatchChunk[] = []
    let sawEndOfFile = false
    for (;;) {
      const line = peek()
      if (line === null) break
      // 判定用 trimEnd 后的原始行（codex streaming_parser:228）：带前导空白的
      // marker 行是 context 行而非新 hunk 头（上游 keeps_indented_update_markers 测试）
      const te = line.trimEnd()
      const t = line.trim()
      if (t === END_PATCH_MARKER) break
      if (te.startsWith(UPDATE_FILE_MARKER) || te.startsWith(ADD_FILE_MARKER) || te.startsWith(DELETE_FILE_MARKER)) break
      if (te.startsWith(MOVE_TO_MARKER)) {
        if (chunks.length > 0 || moveTo !== undefined) {
          throw new PatchParseError(`'*** Move to:' is only valid before the first chunk of an update hunk`, rawLineNo + 1)
        }
        next()
        moveTo = te.slice(MOVE_TO_MARKER.length).trim()
        if (moveTo === '') throw new PatchParseError('invalid patch: Move to path is empty', rawLineNo)
        continue
      }
      // '@@ ctx' 必须带空格：'@@x' 不是 chunk 头，落入内容行报错（codex strip_prefix("@@ ")）
      if (te.startsWith(CHANGE_CONTEXT_MARKER)) {
        if (chunks.length > 0 && !chunkHasLines(chunks[chunks.length - 1])) {
          throw new PatchParseError('Update hunk does not contain any lines', rawLineNo + 1)
        }
        next()
        chunks.push({
          changeContext: te.slice(CHANGE_CONTEXT_MARKER.length).trim(),
          oldLines: [],
          newLines: [],
          isEndOfFile: false,
        })
        continue
      }
      if (te === EMPTY_CHANGE_CONTEXT_MARKER) {
        if (chunks.length > 0 && !chunkHasLines(chunks[chunks.length - 1])) {
          throw new PatchParseError('Update hunk does not contain any lines', rawLineNo + 1)
        }
        next()
        chunks.push({ oldLines: [], newLines: [], isEndOfFile: false })
        continue
      }
      if (t === EOF_MARKER) {
        if (chunks.length === 0) chunks.push({ oldLines: [], newLines: [], isEndOfFile: false })
        next()
        chunks[chunks.length - 1].isEndOfFile = true
        sawEndOfFile = true
        continue
      }
      if (sawEndOfFile && t !== '') {
        // End of File 之后只允许 @@ 开新 chunk（streaming_parser.rs:241-250）
        throw new PatchParseError(
          `Expected update hunk to start with a @@ context marker, got: '${t}'`,
          rawLineNo + 1,
        )
      }
      if (line === '') {
        // 裸空行 = 空 context 行（streaming_parser.rs:307-316）
        if (chunks.length === 0) chunks.push({ oldLines: [], newLines: [], isEndOfFile: false })
        next()
        chunks[chunks.length - 1].oldLines.push('')
        chunks[chunks.length - 1].newLines.push('')
        continue
      }
      if (te.startsWith(' ') || te.startsWith('+') || te.startsWith('-')) {
        if (chunks.length === 0) chunks.push({ oldLines: [], newLines: [], isEndOfFile: false })
        next()
        const chunk = chunks[chunks.length - 1]
        const content = te.slice(1)
        if (te.startsWith(' ')) {
          chunk.oldLines.push(content)
          chunk.newLines.push(content)
        } else if (te.startsWith('+')) {
          chunk.newLines.push(content)
        } else {
          chunk.oldLines.push(content)
        }
        continue
      }
      throw new PatchParseError(
        `Unexpected line found in update hunk: '${t}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`,
        rawLineNo + 1,
      )
    }
    // 空 chunk（@@ 后无行）以 codex 文案拒绝
    if (chunks.length > 0 && !chunkHasLines(chunks[chunks.length - 1])) {
      throw new PatchParseError('Update hunk does not contain any lines', rawLineNo)
    }
    if (chunks.length === 0) {
      throw new PatchParseError(`Update file hunk for path '${path}' is empty`, rawLineNo)
    }
    return { kind: 'update', path, ...(moveTo !== undefined ? { moveTo } : {}), chunks }
  }

  function chunkHasLines(c: PatchChunk): boolean {
    return c.oldLines.length > 0 || c.newLines.length > 0
  }

}

/** 带行号的解析错误（tools 层包装为 Invalid patch / Invalid hunk on line N） */
export class PatchParseError extends Error {
  constructor(message: string, readonly lineNumber: number) {
    super(message)
    this.name = 'PatchParseError'
  }
}

// ==================== 应用（file_update.rs + seek_sequence.rs 移植） ====================

/** 归一化 LF 模式：行数组表示（无末尾哨兵；join 后补尾 LF） */
function splitLines(content: string): string[] {
  const lines = content.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function joinLines(lines: string[]): string {
  // 更新过的文件保证以 LF 结尾（file_update.rs:48-77）
  return lines.join('\n') + '\n'
}

/** 四级模糊匹配的单行比较（seek_sequence.rs:40-112；顺序不可换） */
function lineMatches(patternLine: string, fileLine: string, level: 0 | 1 | 2 | 3): boolean {
  switch (level) {
    case 0:
      return patternLine === fileLine
    case 1:
      return patternLine.trimEnd() === fileLine.trimEnd()
    case 2:
      return patternLine.trim() === fileLine.trim()
    case 3:
      return unicodeNormalize(patternLine) === unicodeNormalize(fileLine)
  }
}

/** Unicode 标点归一化（seek_sequence.rs:81-99 子集；先 trim） */
function unicodeNormalize(s: string): string {
  return s
    .trim()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63]/g, '-')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
}

/**
 * 从 start 起（含）向后找 pattern 首个匹配位（seek_sequence.rs:12-115）。
 * 四级模糊：exact → rstrip → trim → Unicode 归一化，逐级全扫、先到先得。
 * isEndOfFile（codex NormalizeToLf 分支）：只在尾部对齐位（len-pattern）匹配，
 * 不做全域扫描——EOF 标记的本意是「只许动尾部」，中段命中是错误位置。
 */
function seekSequence(
  lines: string[],
  pattern: string[],
  start: number,
  isEndOfFile: boolean,
): number {
  if (pattern.length === 0) return -1
  const lastStart = Math.max(0, lines.length - pattern.length)
  if (isEndOfFile) {
    for (let level = 0 as 0 | 1 | 2 | 3; level <= 3; level = (level + 1) as 0 | 1 | 2 | 3) {
      if (matchAt(lines, pattern, lastStart, level)) return lastStart
    }
    return -1
  }
  for (let level = 0 as 0 | 1 | 2 | 3; level <= 3; level = (level + 1) as 0 | 1 | 2 | 3) {
    for (let i = start; i <= lines.length - pattern.length; i++) {
      if (matchAt(lines, pattern, i, level)) return i
    }
  }
  return -1
}

function matchAt(lines: string[], pattern: string[], at: number, level: 0 | 1 | 2 | 3 = 0): boolean {
  if (at < 0 || at + pattern.length > lines.length) return false
  for (let j = 0; j < pattern.length; j++) {
    if (!lineMatches(pattern[j], lines[at + j], level)) return false
  }
  return true
}

/**
 * 纯函数应用：io.read(path) 取当前内容（null=不存在）、io.resolve(path) 得落盘绝对
 * 路径。ops 的 path 保持补丁原始拼写——错误/成功文案全部用原始拼写（codex 契约：
 * lib.rs:460-505 相对路径保持相对，模型看到的就是它写的）。
 * 同一补丁内 ops 顺序应用（前序效果对后续可见——move 后 update 同路径语义正确）。
 */
export function applyPatchOps(
  ops: PatchOp[],
  io: { read: (path: string) => string | null; resolve: (path: string) => string },
): PatchApplyResult {
  const working = new Map<string, string | null>()
  const effects: PatchEffect[] = []
  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []

  const readCurrent = (path: string): string | null => {
    if (working.has(path)) return working.get(path) ?? null
    return io.read(path)
  }
  const writeCurrent = (path: string, content: string): void => {
    working.set(path, content)
    effects.push({ action: 'write', displayPath: path, absPath: io.resolve(path), content })
  }

  for (const op of ops) {
    if (op.kind === 'add') {
      writeCurrent(op.path, op.contents)
      added.push(op.path)
      continue
    }
    if (op.kind === 'delete') {
      working.set(op.path, null)
      effects.push({ action: 'delete', displayPath: op.path, absPath: io.resolve(op.path) })
      deleted.push(op.path)
      continue
    }
    // update
    const original = readCurrent(op.path)
    if (original === null) {
      throw new Error(`Failed to read file to update ${op.path}`)
    }
    const newContent = applyChunksToContent(original, op)
    writeCurrent(op.moveTo ?? op.path, newContent)
    if (op.moveTo !== undefined) {
      if (op.moveTo === op.path) {
        throw new Error(`'*** Move to:' target must differ from the source path: ${op.path}`)
      }
      // 清源键：防止同补丁内后续 op 用旧内容复活源路径
      working.set(op.path, null)
      effects.push({ action: 'delete', displayPath: op.path, absPath: io.resolve(op.path) })
      modified.push(op.moveTo)
    } else {
      modified.push(op.path)
    }
  }

  const successText =
    added.length + modified.length + deleted.length === 0
      ? 'No files were modified.'
      : `Success. Updated the following files:\n` +
        [...added.map((p) => `A ${p}`), ...modified.map((p) => `M ${p}`), ...deleted.map((p) => `D ${p}`)].join('\n')
  return { effects, successText }
}

/** 对单文件内容应用全部 chunks（compute_replacements 等价） */
function applyChunksToContent(original: string, op: Extract<PatchOp, { kind: 'update' }>): string {
  const lines = splitLines(original)
  let lineIndex = 0

  for (const chunk of op.chunks) {
    // ① @@ ctx 先行定位并推进指针（file_update.rs:92-103）
    if (chunk.changeContext !== undefined) {
      const idx = seekSequence(lines, [chunk.changeContext], lineIndex, false)
      if (idx < 0) {
        throw new Error(`Failed to find context '${chunk.changeContext}' in ${op.path}`)
      }
      lineIndex = idx + 1
    }

    let oldLines = chunk.oldLines
    let newLines = chunk.newLines
    if (oldLines.length === 0) {
      // ② 纯插入 chunk：codex 语义恒追加到文件末尾（file_update.rs：insertion_idx
      //    恒为 len；@@ ctx 只推进指针供后续 chunk 使用）
      lines.splice(lines.length, 0, ...newLines)
      lineIndex = lines.length
      continue
    }

    // ③ 定位 oldLines
    let start = seekSequence(lines, oldLines, lineIndex, chunk.isEndOfFile)
    if (
      start < 0 &&
      oldLines.length > 0 &&
      oldLines[oldLines.length - 1] === '' &&
      newLines.length > 0 &&
      newLines[newLines.length - 1] === ''
    ) {
      // ④ 尾空串哨兵重试（file_update.rs:155-170）：old/new 尾空串必须同步砍，
      //    否则会静默丢掉 new 尾部的真实改动还报成功
      oldLines = oldLines.slice(0, -1)
      newLines = newLines.slice(0, -1)
      start = seekSequence(lines, oldLines, lineIndex, chunk.isEndOfFile)
    }
    if (start < 0) {
      throw new Error(`Failed to find expected lines in ${op.path}:\n${chunk.oldLines.join('\n')}`)
    }
    lines.splice(start, oldLines.length, ...newLines)
    lineIndex = start + newLines.length
  }

  return joinLines(lines)
}
