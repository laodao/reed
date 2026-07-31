/**
 * 长文写作实体 → 文本 序列化器（步骤0 新增）
 * @module core/services/longwriting/lw-vector-serializer
 *
 * 把设定/记忆/大纲等实体序列化为纯文本，供 embedding 生成向量。
 * 不入 kb_documents/kb_chunks，内存构建文本即弃（R6 轻量路径）。
 *
 * 原则：
 * 1. 用真实字段名（character.rolePosition 非 role；location.entityImportance）
 * 2. 关联 id[] 解析成名字（plot/outline 涉及的角色，需 ctx 传 names map）
 * 3. 空字段省略（避免 "外貌：undefined"）
 * 4. preview = text 前 200 字
 */

import type { LwVectorEntityType } from '@shared/types/longwriting.types'

/** 序列化时的上下文：id → 名字映射（解析 plot/outline 的 involved* 数组） */
export interface SerializeContext {
  characterNames?: Record<string, string>
  locationNames?: Record<string, string>
  itemNames?: Record<string, string>
}

export interface SerializeResult {
  /** 完整文本（用于 embedding） */
  text: string
  /** 前 200 字预览（存 lw_vector_indices.preview） */
  preview: string
}

const ROLE_LABELS: Record<string, string> = {
  main: '主角',
  secondary: '配角',
  temporary: '临时角色',
}

const PREVIEW_LIMIT = 200

/** 拼接非空字段（值为 null/undefined/空字符串时跳过） */
function joinFields(parts: Array<[string, string | null | undefined]>): string {
  return parts
    .filter(([, v]) => v != null && v !== '')
    .map(([label, v]) => `${label}：${v}`)
    .join('。')
}

/** 截取前 N 字符做 preview */
function makePreview(text: string): string {
  return text.length > PREVIEW_LIMIT ? text.slice(0, PREVIEW_LIMIT) : text
}

/**
 * 把实体序列化为 embedding 文本
 * @param entityType 实体类型
 * @param entity 实体对象（原始字段）
 * @param ctx id→名字映射（plot/outline 需要）
 */
export function serializeEntity(
  entityType: LwVectorEntityType,
  entity: any,
  ctx?: SerializeContext,
): SerializeResult {
  let text: string

  switch (entityType) {
    case 'character':
      text = serializeCharacter(entity)
      break
    case 'location':
      text = serializeLocation(entity)
      break
    case 'item':
      text = serializeItem(entity)
      break
    case 'plot':
      text = serializePlot(entity, ctx)
      break
    case 'outline':
      text = serializeOutline(entity, ctx)
      break
    case 'memory':
      text = serializeMemory(entity)
      break
    case 'chapter':
      // chapter 由 splitter 切片后直接用切片原文，不走 serializer
      text = entity.content ?? entity.summary ?? entity.name ?? ''
      break
    default:
      throw new Error(`[lw-vector-serializer] 不支持的 entityType: ${entityType}`)
  }

  return { text, preview: makePreview(text) }
}

function serializeCharacter(c: any): string {
  const roleLabel = ROLE_LABELS[c.rolePosition] ?? c.rolePosition ?? ''
  const header = roleLabel ? `${c.name}（${roleLabel}` : c.name
  const genderAge = [c.gender, c.age != null ? `${c.age}岁` : null]
    .filter(Boolean).join('，')
  const fullHeader = genderAge ? `${header}，${genderAge}）` : (roleLabel ? `${header})` : header)
  const body = joinFields([
    ['外貌', c.appearance],
    ['性格', c.personality],
    ['背景', c.background],
    ['能力', c.abilities],
    ['职业', c.occupation],
    ['主要事件', c.majorEvents],
  ])
  return body ? `${fullHeader}。${body}` : fullHeader
}

function serializeLocation(l: any): string {
  const header = l.name
  const body = joinFields([
    ['类型', l.type],
    ['描述', l.description],
    ['重要程度', l.importance ?? l.entityImportance],
  ])
  return body ? `${header}。${body}` : header
}

function serializeItem(i: any): string {
  const header = i.name
  const body = joinFields([
    ['类型', i.type],
    ['等级', i.level],
    ['描述', i.description],
    ['重要程度', i.importance],
  ])
  return body ? `${header}。${body}` : header
}

function serializePlot(p: any, ctx?: SerializeContext): string {
  const charNames = resolveIds(p.involvedCharacters, ctx?.characterNames)
  const locNames = resolveIds(p.involvedLocations, ctx?.locationNames)
  const parts: Array<[string, string | null | undefined]> = [
    ['情节', p.title],
    ['', p.summary],
  ]
  if (charNames.length > 0) parts.push(['涉及角色', charNames.join('、')])
  if (locNames.length > 0) parts.push(['涉及地点', locNames.join('、')])
  if (p.notes) parts.push(['备注', p.notes])
  return joinFields(parts)
}

function serializeOutline(o: any, ctx?: SerializeContext): string {
  const nodeTypeLabel = o.nodeType ? `[${o.nodeType}] ` : ''
  const header = `${nodeTypeLabel}${o.name}`
  const charNames = resolveIds(o.involvedCharacters, ctx?.characterNames)
  const locNames = resolveIds(o.involvedLocations, ctx?.locationNames)
  const parts: Array<[string, string | null | undefined]> = [['', o.summary]]
  if (charNames.length > 0) parts.push(['涉及角色', charNames.join('、')])
  if (locNames.length > 0) parts.push(['涉及地点', locNames.join('、')])
  const body = joinFields(parts)
  return body ? `${header}。${body}` : header
}

function serializeMemory(m: any): string {
  const typeLabel = m.memoryType ? `[${m.memoryType}] ` : ''
  const header = `${typeLabel}${m.title ?? ''}`
  const entityNames = (m.involvedEntities ?? [])
    .map((e: any) => e?.name)
    .filter(Boolean)
  const parts: Array<[string, string | null | undefined]> = [['', m.description]]
  if (entityNames.length > 0) parts.push(['涉及', entityNames.join('、')])
  if (m.chapterNumber != null) parts.push(['章节', `第${m.chapterNumber}章`])
  const body = joinFields(parts)
  return body ? `${header}：${body}` : header
}

/** 把 id 数组解析为名字数组（无 ctx 时过滤掉，避免无意义 uuid 入文本） */
function resolveIds(ids: string[] | undefined, names?: Record<string, string>): string[] {
  if (!Array.isArray(ids) || ids.length === 0) return []
  if (!names) return []
  return ids.map((id) => names[id]).filter(Boolean)
}
