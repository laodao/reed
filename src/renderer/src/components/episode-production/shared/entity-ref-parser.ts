/**
 * entity-ref-parser · @xxx 文本切分纯函数（FU5-A2）
 *
 * 把含 @xxx 引用的原文按 entity 字典切分为段（普通文本段 / 实体段）。
 * 配合 EntityRefRenderer.vue 渲染。
 */

export interface EntityRefMeta {
  name: string
  sourceType: 'linked_lw' | 'standalone'
  id?: string
}

export interface TextSegment {
  type: 'text'
  text: string
}
export interface EntitySegment {
  type: 'entity'
  name: string
  sourceType: 'linked_lw' | 'standalone'
  id?: string
}
export type Segment = TextSegment | EntitySegment

/**
 * 切分文本：用 String.matchAll 找 @xxx，在 entities 字典中查找；
 * 找到 → 实体段 / 找不到 → 保留原文（容错）。
 *
 * 正则：`@<name>`，name = 一个或多个非空白 / 非中英文常见标点字符。
 */
export function parseEntityRefs(
  text: string,
  entities: EntityRefMeta[],
): Segment[] {
  if (!text) return []

  const map = new Map<string, EntityRefMeta>()
  for (const e of entities ?? []) {
    map.set(e.name, e)
  }

  const result: Segment[] = []
  const re = /@([^\s,.。，、！？；：（）【】"'`!?;:()[\]"]+)/g
  let lastIndex = 0
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    const name = m[1]
    const meta = map.get(name)
    if (!meta) continue
    if (start > lastIndex) {
      result.push({ type: 'text', text: text.slice(lastIndex, start) })
    }
    result.push({
      type: 'entity',
      name: meta.name,
      sourceType: meta.sourceType,
      id: meta.id,
    })
    lastIndex = end
  }
  if (lastIndex < text.length) {
    result.push({ type: 'text', text: text.slice(lastIndex) })
  }
  return result
}
