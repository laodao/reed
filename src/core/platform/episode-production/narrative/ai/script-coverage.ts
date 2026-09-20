/**
 * narrative/ai/script-coverage
 * @module platform/episode-production/narrative/ai/script-coverage
 * @description 剧本原文覆盖度校验（2026-09-21，仿 shot-pacing 的 validateShotPacing 模式）：
 *              雪麓山庄实测发现生成剧本丢整段对白（"约法三章+叫帮手"）与伏笔（旧信）。
 *              这里对「原文带引号的对白句」与「生成结果的对白/旁白/正文」做归一化匹配，
 *              缺失的输出 warnings（console.warn，不阻断生成）。
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

export interface CoverageResult {
  /** 原文对白总数 */
  total: number
  /** 已在生成结果中找到的对白数 */
  covered: number
  /** 缺失的对白原文 */
  missing: string[]
}

/**
 * 校验原文对白在生成结果中的覆盖度。
 * @param originalText 原始章节/粘贴正文
 * @param generatedTexts 生成结果的可匹配文本集合（各场对白 text + 旁白 + 剧本正文）
 */
export function validateScriptCoverage(
  originalText: string,
  generatedTexts: string[],
): CoverageResult {
  const originals = extractOriginalDialogues(originalText)
  const haystack = normalize(generatedTexts.join('\n'))
  const missing: string[] = []
  for (const line of originals) {
    const needle = normalize(line)
    if (!needle) continue
    if (haystack.includes(needle)) continue
    // 容错：长句允许首尾各 8 字命中（AI 微调语气词/中间插动作描写）
    if (needle.length > 16) {
      const head = needle.slice(0, 8)
      const tail = needle.slice(-8)
      if (haystack.includes(head) && haystack.includes(tail)) continue
    }
    missing.push(line)
  }
  return { total: originals.length, covered: originals.length - missing.length, missing }
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
