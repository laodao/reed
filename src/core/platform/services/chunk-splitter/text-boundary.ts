/**
 * 文本边界工具
 * @module platform/services/chunk-splitter/text-boundary
 * @description 在文本窗口内查找「段落空行 → 句末 → 句内停顿」优先级的最后一个
 *              边界位置，用于把超长文本切成块时尽量不把句子拦腰截断。
 *              供 段落感知子切（markdown-splitter）与 语义切分 的兜底硬切共用。
 */

/** 边界正则（带 g：exec 循环需随 lastIndex 推进，否则死循环），优先级从高到低 */
const BOUNDARY_REGEXES: RegExp[] = [
  /\n\s*\n/g, // 段落空行（Markdown 段落边界；多字符边界按首个 \n 定位，切后 trim 即可）
  /[。！？]/g, // 中文句末
  /[.!?]/g, // 英文句末
  /[；;，,]/g,
]

/**
 * 在 text 的 [start, limit) 窗口内查找「最后一个」合适边界。
 * 优先取更高优先级边界；若该优先级最后的边界距 start 不足 minGap（说明窗口
 * 前段全是内容、后段无该级边界），自动降级到下一个优先级。
 *
 * @param text 完整文本
 * @param start 窗口起点（含）
 * @param limit 窗口终点（不含）
 * @param minGap 边界距 start 的最小字符数，防止切出过短的碎片
 * @returns 边界后一位的绝对下标，可安全 slice(start, 返回值)；无任何边界返回 -1（调用方硬切）
 */
export function findTextBoundary(
  text: string,
  start: number,
  limit: number,
  minGap = 100,
): number {
  const windowText = text.slice(start, limit)

  for (const re of BOUNDARY_REGEXES) {
    re.lastIndex = 0
    let last = -1
    let match: RegExpExecArray | null
    while ((match = re.exec(windowText)) !== null) {
      last = match.index
    }
    if (last === -1) continue

    const absolute = start + last + 1
    if (absolute - start >= minGap) {
      return absolute
    }
    // 窗口内该级边界都贴着头：降级尝试（窗口后段没有该级边界）
  }

  return -1
}

/**
 * 把超长文本按边界切成若干 ≤ maxLen 的段。
 * 切点优先段落空行/句末/停顿（findTextBoundary），全部缺失时在 maxLen 处硬切。
 *
 * @param text 超长文本
 * @param maxLen 单段最大长度
 * @returns 分段数组（均已 trim，非空）
 */
export function splitLongText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) {
    const trimmed = text.trim()
    return trimmed.length > 0 ? [trimmed] : []
  }

  const parts: string[] = []
  let start = 0
  // 最小保留长度：窗口太短时不追求边界（避免出现 <maxLen/2 的内容被硬切）
  const minGap = Math.min(120, Math.floor(maxLen / 2))

  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length)
    if (end < text.length) {
      const boundary = findTextBoundary(text, start, end, minGap)
      if (boundary !== -1) end = boundary
    }
    const part = text.slice(start, end).trim()
    if (part.length > 0) parts.push(part)
    // 防止边界返回后无进展导致死循环
    start = end > start ? end : start + 1
  }

  return parts
}