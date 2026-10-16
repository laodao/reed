/**
 * LLM 结构化产物容错解析
 * @module core/platform/services/longwriting/json-payload
 *
 * 首选链路是 provider 层 responseFormat（解码层强制合法 JSON，见 base-provider
 * ChatOptions.responseFormat）；本模块是它失效时的兜底——Anthropic 等不支持
 * response_format 的端点、或模型仍包裹代码围栏/前后缀废话时的抢救式解析。
 *
 * 依次尝试（首个成功即返回）：
 * 1. 代码围栏剥离（```json ... ```）后整体 parse；
 * 2. 整体 parse（provider 已强制 JSON 时的常态路径）；
 * 3. 括号配平截取：从首个 { 或 [ 起按字符串感知的括号计数截取完整 JSON 字面量
 *    （旧实现 /\[[\s\S]*\]/ 贪心匹配会被废话中的 '[' 带偏，这里修掉）。
 */

/** 从对象/数组中取数组字段：顶层就是数组 → 原样；对象含指定数组字段 → 取字段；否则 null */
export function extractArrayField(data: unknown, key = 'items'): unknown[] | null {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const v = (data as Record<string, unknown>)[key]
    if (Array.isArray(v)) return v
  }
  return null
}

/** 括号配平截取：s[start] 必须是 { 或 [；返回完整字面量子串，配平失败返回 null */
function balancedSlice(s: string, start: number): string | null {
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/**
 * 容错解析 LLM 返回的结构化产物。
 * @returns ok=true 时 data 为解析出的对象或数组；全部策略失败 ok=false。
 */
export function parseJsonPayload(raw: string): { ok: boolean; data: unknown; error?: string } {
  const text = String(raw ?? '').trim()
  if (!text) return { ok: false, data: undefined, error: '空响应' }

  // 1. 剥离 markdown 代码围栏（保留围栏内内容）
  let stripped = text
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) stripped = fence[1].trim()

  // 2. 整体 parse（围栏剥离后的常态路径）
  try {
    return { ok: true, data: JSON.parse(stripped) }
  } catch { /* 继续抢救 */ }

  // 3. 括号配平截取（废话中首个 {/[ 到配平位置）
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (ch !== '{' && ch !== '[') continue
    const candidate = balancedSlice(stripped, i)
    if (!candidate) break
    try {
      return { ok: true, data: JSON.parse(candidate) }
    } catch { /* 该字面量非法，继续找下一个起点 */ }
  }

  return { ok: false, data: undefined, error: '未找到合法 JSON 产物' }
}
