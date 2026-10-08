/**
 * 信息搜集：LLM 输出 JSON 提取（纯函数，双端可用）
 * @module shared/utils/info-collection-json
 *
 * 背景：蓝图起草与抽取都要求模型"只输出 JSON"，但小模型常裹 ```json 围栏、
 * 前后缀说明文字、或被 maxTokens 截断。这里做尽力而为归一（照搬 kb-brain
 * "响亮失败 + 尽力而为"纪律）：能提取就提取，提取不到返回 null 由调用方
 * 报中文错误——不静默造一个空蓝图。
 */

/** 从 LLM 输出中提取第一个平衡的 JSON 对象文本；失败返回 null。 */
export function extractJsonBlock(text: string): string | null {
  const raw = (text ?? '').trim()
  if (!raw) return null

  // 1) ```json ... ``` 围栏优先
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates: string[] = []
  if (fence) candidates.push(fence[1].trim())
  candidates.push(raw)

  for (const candidate of candidates) {
    const start = candidate.indexOf('{')
    if (start < 0) continue
    // 从第一个 { 起做括号配对（忽略字符串字面量内的括号）
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i]
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        if (inString) escaped = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const block = candidate.slice(start, i + 1)
          try {
            JSON.parse(block)
            return block
          } catch {
            break // 此块损坏，尝试下一候选
          }
        }
      }
    }
  }
  return null
}

/** 提取并解析；失败返回 null（不 throw——调用方决定报错文案）。 */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const block = extractJsonBlock(text)
  if (!block) return null
  try {
    const parsed = JSON.parse(block)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
