/**
 * 信息搜集：引句回验（纯函数，双端可用）
 * @module shared/utils/info-collection-quote
 *
 * 背景（主设计 §3 阶段 4，质量闸门）：每条抽取必须携带 quote（原文片段），
 * 系统**回验** quote 确实存在于正文——找不到原文的抽取就是幻觉，拒收。
 * 这是防编造的硬机制，先于任何 LLM 复核。
 *
 * 判定三级：
 * - exact：归一化后（NFC + 去所有空白 + 小写）quote 是 text 的子串；
 * - fuzzy：滑窗最佳相似度 ≥ 0.9（容排版差异：软换行/全半角标点/零宽字符）；
 * - miss：拒收。
 */

export interface IcQuoteVerifyResult {
  verdict: 'exact' | 'fuzzy' | 'miss'
  /** 相似度 0~1；exact=1，miss 为最佳尝试值（仅诊断用） */
  ratio: number
}

/** 归一化：NFC、去所有空白（含全角空格/零宽）、小写。中英文同法。 */
export function normalizeForQuoteMatch(s: string): string {
  return (s ?? '')
    .normalize('NFC')
    .replace(/[\s\u3000\u200b-\u200d\ufeff]+/g, '')
    .toLowerCase()
}

/** 字符级相似度（最长公共子序列比率；对局部排版差异鲁棒，量级小文本够用） */
function lcsRatio(a: string, b: string): number {
  if (!a.length || !b.length) return 0
  if (a === b) return 1
  // 互换保证 b 较短，行宽内存最小
  if (a.length < b.length) [a, b] = [b, a]
  const m = b.length
  let prev = new Uint16Array(m + 1)
  let curr = new Uint16Array(m + 1)
  for (let i = 1; i <= a.length; i++) {
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= m; j++) {
      curr[j] = ca === b.charCodeAt(j - 1) ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1])
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[m] / b.length
}

/**
 * 回验引句。策略分三级：
 * 1. exact：归一化包含；
 * 2. fuzzy 锚点法：正文里精确命中引句的某个分段（中段/首段/尾段）→ 在对齐位置
 *    附近开窗比对——容正文在引句中段插入了页眉页脚等额外字符导致的错位；
 * 3. 兜底滑窗：短正文（≤2000 归一化字符）步长 1 全扫，长正文粗步长（性能护栏）。
 */
export function verifyQuote(rawQuote: string, rawText: string, fuzzyThreshold = 0.9): IcQuoteVerifyResult {
  const quote = normalizeForQuoteMatch(rawQuote)
  const text = normalizeForQuoteMatch(rawText)
  if (!quote || !text) return { verdict: 'miss', ratio: 0 }
  if (text.includes(quote)) return { verdict: 'exact', ratio: 1 }
  // 引句比正文还长 → 必然 miss（防御：抽取把整段正文当引句）
  if (quote.length >= text.length) return { verdict: 'miss', ratio: lcsRatio(quote, text) }

  let best = 0
  const consider = (window: string): void => {
    const r = lcsRatio(quote, window)
    if (r > best) best = r
  }

  const pad = Math.max(2, Math.ceil(quote.length / 4))
  const chunkLen = Math.max(4, Math.ceil(quote.length / 3))
  const midOffset = Math.floor((quote.length - chunkLen) / 2)
  const chunks = [
    quote.slice(midOffset, midOffset + chunkLen),
    quote.slice(0, chunkLen),
    quote.slice(quote.length - chunkLen),
  ]
  for (const chunk of chunks) {
    if (chunk.length < 4) continue
    let from = 0
    for (;;) {
      const p = text.indexOf(chunk, from)
      if (p < 0) break
      const ws = Math.max(0, p - pad)
      consider(text.slice(ws, Math.min(text.length, ws + quote.length + pad * 2)))
      if (best >= 0.995) break
      from = p + 1
    }
    if (best >= fuzzyThreshold) break
  }

  if (best < fuzzyThreshold) {
    const step = text.length <= 2000 ? 1 : Math.max(1, Math.floor(quote.length / 4))
    for (let start = 0; start + quote.length <= text.length; start += step) {
      consider(text.slice(start, start + quote.length))
      if (best >= 0.995) break
    }
  }
  return best >= fuzzyThreshold ? { verdict: 'fuzzy', ratio: best } : { verdict: 'miss', ratio: best }
}
