/**
 * 章节查找与匹配（M3 检索上下文注入的纯函数内核）
 * @module platform/services/kb-chapter-lookup
 *
 * 从 knowledge-base.service 下沉的可测逻辑：把文档章节表构建成多路索引，
 * 并让命中块（chunk）定位到所属章节。
 *
 * 匹配优先级（review 修复同名章节歧义）：
 *  1) 章节全路径 key —— chunk.sectionPath 全路径归一化拼接；「第一节 设立」这类
 *     标题在多章下重复时靠父路径区分，避免摘要张冠李戴
 *  2) 标题精确（chunk.title / sectionPath 末项 / 首项，归一化）
 *  3) 标题包含兜底（标题带前缀/被截断时）
 */
import type { KbChapterRecord } from '@core/database/repositories/kb-chapter.repository'

/** 章节查找索引 */
export interface ChapterLookup {
  byTitle: Map<string, KbChapterRecord>
  byId: Map<string, KbChapterRecord>
  byPathKey: Map<string, KbChapterRecord>
}

/** 章节标题归一化（去空白/全角空格并小写，便于与 chunk.title 比对） */
export function normalizeChapterTitle(title: string | null | undefined): string {
  return (title ?? '').replace(/[\s\u3000]+/g, '').toLowerCase()
}

/** sectionPath 解析（存库为 JSON 字符串或数组） */
export function parseSectionPath(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string')
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

/** 章节路径（沿 parentId 上溯；带防环保护） */
export function chapterPathOf(
  chapter: KbChapterRecord,
  byId: Map<string, KbChapterRecord>,
): string[] {
  const path: string[] = []
  const guard = new Set<string>()
  let cur: KbChapterRecord | undefined = chapter
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id)
    path.unshift(cur.title)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return path
}

/** 构建多路索引：标题（同名保留首个）、id、全路径 key */
export function buildChapterLookup(records: KbChapterRecord[]): ChapterLookup {
  const byTitle = new Map<string, KbChapterRecord>()
  const byId = new Map<string, KbChapterRecord>()
  for (const rec of records) {
    byId.set(rec.id, rec)
    const titleKey = normalizeChapterTitle(rec.title)
    // 同名标题保留首个（后续由 byPathKey 消歧），避免后者覆盖前者造成张冠李戴
    if (!byTitle.has(titleKey)) byTitle.set(titleKey, rec)
  }
  const byPathKey = new Map<string, KbChapterRecord>()
  for (const rec of records) {
    const key = chapterPathOf(rec, byId).map(normalizeChapterTitle).join('>')
    if (key && !byPathKey.has(key)) byPathKey.set(key, rec)
  }
  return { byTitle, byId, byPathKey }
}

/**
 * 命中块 → 所属章节。
 * @param lookup 文档章节索引
 * @param chunkTitle chunk.title（结构块带标题；子块仅首块有）
 * @param rawSectionPath chunk.sectionPath（JSON 字符串或数组）
 * @returns 章节记录；无匹配返回 null
 */
export function matchChapter(
  lookup: ChapterLookup,
  chunkTitle: string | null | undefined,
  rawSectionPath: unknown,
): KbChapterRecord | null {
  if (lookup.byTitle.size === 0) return null
  const sectionPath = parseSectionPath(rawSectionPath)

  // 1) 路径优先（同名章节靠父路径区分）
  if (sectionPath.length > 0) {
    const pathKey = sectionPath.map(normalizeChapterTitle).join('>')
    const hit = lookup.byPathKey.get(pathKey)
    if (hit) return hit
    const suffix = `>${pathKey}`
    for (const [key, rec] of lookup.byPathKey) {
      if (key.endsWith(suffix)) return rec
    }
  }

  // 2) 标题精确
  const candidates: string[] = []
  if (chunkTitle) candidates.push(chunkTitle)
  if (sectionPath.length > 0) {
    candidates.push(sectionPath[sectionPath.length - 1], sectionPath[0])
  }
  for (const raw of candidates) {
    const hit = lookup.byTitle.get(normalizeChapterTitle(raw))
    if (hit) return hit
  }

  // 3) 标题包含兜底
  for (const raw of candidates) {
    const key = normalizeChapterTitle(raw)
    if (key.length < 4) continue
    for (const [titleKey, rec] of lookup.byTitle) {
      if (titleKey.includes(key) || key.includes(titleKey)) return rec
    }
  }
  return null
}