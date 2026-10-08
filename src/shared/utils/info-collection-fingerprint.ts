/**
 * 信息搜集：正文指纹与转载簇判定（纯函数，双端可用）
 * @module shared/utils/info-collection-fingerprint
 *
 * 背景（主设计 §3 阶段 3）：识别"同一篇内容的多个转载"——同簇内按发布时间最早 +
 * 等级最高选主源。指纹必须满足：同一正文（排版/广告位/页眉页脚差异）产出相同或
 * 高度相似的指纹；不同正文产出可区分的指纹。
 *
 * 做法：字符 shingle（N=8）+ FNV-1a 32 位哈希 + 取模采样（winnowing 思想的简化版）。
 * 相似度 = 采样集合的 Jaccard。采样率 1/4：正文 ≥400 有效字符时簇判定稳定，
 * 短文本（<100 有效字符）直接给低置信——簇判定只影响主源选择，不删内容，宁漏勿杀。
 */

const SHINGLE_SIZE = 8
const SAMPLE_MOD = 4

/** FNV-1a 32 位哈希（确定性，双端一致） */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 归一化：NFC、去所有空白与标点（中英）、小写——只留"内容字符"参与指纹 */
function normalizeForFingerprint(text: string): string {
  return (text ?? '')
    .normalize('NFC')
    .replace(/[\s\u3000\u200b-\u200d\ufeff]+/g, '')
    .replace(/[.,;:!?'"()（）【】\[\]{}<>《》“”‘’、，。；：！？·\-—_~*#|\\/]+/g, '')
    .toLowerCase()
}

export interface IcFingerprint {
  version: 'fp1'
  /** 采样哈希（升序 base36），逗号连接 */
  sampled: string
  /** 有效字符数（归一化后；<100 时相似度不可靠） */
  chars: number
}

export function fingerprintText(rawText: string): IcFingerprint {
  const text = normalizeForFingerprint(rawText)
  if (text.length < SHINGLE_SIZE) return { version: 'fp1', sampled: '', chars: text.length }
  const picked: number[] = []
  for (let i = 0; i + SHINGLE_SIZE <= text.length; i++) {
    const h = fnv1a(text.slice(i, i + SHINGLE_SIZE))
    if (h % SAMPLE_MOD === 0) picked.push(h)
  }
  const sampled = [...new Set(picked)].sort((a, b) => a - b).map(h => h.toString(36)).join(',')
  return { version: 'fp1', sampled, chars: text.length }
}

/**
 * 两指纹的 Jaccard 相似度（0~1）。任一方 chars < 100 返回 0（样本太短，不判簇）。
 * 经验线（设计文档 §3 阶段 3）：≥0.8 判同文簇。
 */
export function fingerprintSimilarity(a: IcFingerprint, b: IcFingerprint): number {
  if (!a.sampled || !b.sampled || a.chars < 100 || b.chars < 100) return 0
  const setA = new Set(a.sampled.split(','))
  const setB = new Set(b.sampled.split(','))
  let inter = 0
  for (const x of setA) if (setB.has(x)) inter++
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}

/** 便捷判定：两段正文是否同文（≥0.8） */
export function isSameContent(textA: string, textB: string): boolean {
  return fingerprintSimilarity(fingerprintText(textA), fingerprintText(textB)) >= 0.8
}
