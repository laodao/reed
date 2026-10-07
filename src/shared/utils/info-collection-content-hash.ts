/**
 * 信息搜集：行内容哈希（纯函数，双端可用）
 * @module shared/utils/info-collection-content-hash
 *
 * 背景（主设计 §2.3）：ic_rows.content_hash = payload + quote 的规范化哈希——
 * 同 URL 重采、同文转载再抽出的同一数据点，hash 相同 → merged（旧行 use_count+1），
 * 不新增行。幂等与去重的根基，因此序列化必须**键序稳定**（JSON.stringify 不保证）。
 */

/** 稳定字符串化：对象键递归排序；数组保序；undefined 字段剔除 */
export function stableStringify(input: unknown): string {
  if (input === null || typeof input !== 'object') return JSON.stringify(input ?? null)
  if (Array.isArray(input)) return `[${input.map(stableStringify).join(',')}]`
  const obj = input as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter(k => obj[k] !== undefined)
    .sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/** FNV-1a 32 位 → 8 位 hex（碰撞率对几千行的量级足够；防冲突由 (schema_id, hash) 组合查询兜底） */
export function contentHash(payload: unknown, quote?: string | null): string {
  const normalized = `${stableStringify(payload)}\n\u0000${(quote ?? '').normalize('NFC').replace(/\s+/g, '')}`
  let h = 0x811c9dc5
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
