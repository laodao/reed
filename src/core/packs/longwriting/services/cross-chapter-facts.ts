/**
 * 跨章事实表构建（写后一致性审查的数据面）
 * @module core/packs/longwriting/services/cross-chapter-facts
 *
 * 用户拍板（2026-09-19）：写后审查必须读图数据——LLM 章节审读不再只看"名册+账本+本章正文"，
 * 注入截至上一章结束时点的全要素事实（实体状态切片/章节状态摘要/近章事件时间线/上一章结尾），
 * 让"与前文事实冲突"成为可检查项。这正是《大宋女捕》复测跨章漂移（同案双时间线/父名漂移/
 * 已获证据被名录否定）全部漏过写后检查的结构性补洞。
 *
 * 时点口径：全部事实严格取 chapterNumber 之前（本章图谱提取已完成，切片表里已有本章行，
 * 不剔除会把"本章刚写的事实"当前文事实来打脸）。构建失败抛错由调用方兜底（审查退化为本章内检查）。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { buildOutlineDocOrder } from '@core/platform/services/longwriting/outline-order'
import type { EntityStateSnapshot } from '@shared/types/longwriting.types'

/** 单实体状态摘要截断长度 */
const STATE_SNIPPET_MAX = 140
/** 状态表最多实体行（超出按 人物→地点→物品 优先截断） */
export const FACT_SHEET_MAX_ENTITIES = 40
/** 上一章结尾注入长度 */
const PREV_TAIL_CHARS = 600
/** 近章事件时间线覆盖的章数 */
const RECENT_EVENT_CHAPTERS = 2

const TYPE_LABEL: Record<string, string> = {
  character: '人物',
  location: '地点',
  item: '物品',
  faction: '势力',
  skill: '技能',
}

/** 类型排序权重：人物优先（冲突最致命），其后地点/物品 */
const TYPE_ORDER: Record<string, number> = { character: 0, location: 1, item: 2, faction: 3, skill: 4 }

function clip(text: string, max: number): string {
  const s = (text || '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/**
 * 纯函数：实体切片 → 事实表行（导出供单测）。
 * 每实体取 uptoChapter 之前最新一条切片；人物在前；keyChanges 附在行尾。
 */
export function formatEntityFactLines(
  snapshots: EntityStateSnapshot[],
  uptoChapter: number,
  maxEntities = FACT_SHEET_MAX_ENTITIES,
): string[] {
  const byEntity = new Map<string, EntityStateSnapshot>()
  for (const s of snapshots) {
    if (!Number.isFinite(s.chapterNumber) || s.chapterNumber >= uptoChapter) continue
    if (!s.entityName || !s.stateSummary) continue
    const key = `${s.entityType}:${s.entityId}`
    const cur = byEntity.get(key)
    if (!cur || s.chapterNumber > cur.chapterNumber) byEntity.set(key, s)
  }
  const latest = [...byEntity.values()].sort((a, b) => {
    const t = (TYPE_ORDER[a.entityType] ?? 9) - (TYPE_ORDER[b.entityType] ?? 9)
    return t !== 0 ? t : b.chapterNumber - a.chapterNumber
  })
  return latest.slice(0, maxEntities).map((s) => {
    const label = TYPE_LABEL[s.entityType] || s.entityType
    const changes = (s.keyChanges || []).filter(Boolean)
    const changePart = changes.length > 0 ? `（第${s.chapterNumber}章变化：${clip(changes.join('；'), 100)}）` : ''
    return `- ${s.entityName}【${label}·第${s.chapterNumber}章时点】${clip(s.stateSummary, STATE_SNIPPET_MAX)}${changePart}`
  })
}

/**
 * 构建跨章事实表（注入写后 LLM 审读提示词的文本块，可直接为空串）。
 * 结构：上一章结束状态摘要 → 跨章要素状态表 → 近章事件时间线 → 上一章结尾。
 */
export async function buildCrossChapterFactSheet(projectId: string, chapterNumber: number): Promise<string> {
  const m = getCoreDatabaseManager()
  const parts: string[] = []

  // 1. 上一章结束状态摘要（时间/位置/角色状态/待处理伏笔）
  const prevSummary = await m.lwChapterStateSummaries?.getLatestBeforeChapter(projectId, chapterNumber)
  if (prevSummary && prevSummary.chapterNumber > 0) {
    const seg = [
      `故事时间：${clip(prevSummary.storyTime, 80) || '未记录'}`,
      `当前位置：${clip(prevSummary.currentLocation, 80) || '未记录'}`,
      prevSummary.characterStates ? `角色状态：${clip(prevSummary.characterStates, 400)}` : '',
      prevSummary.pendingEvents ? `待处理事件/伏笔：${clip(prevSummary.pendingEvents, 200)}` : '',
    ].filter(Boolean).join('\n')
    parts.push(`【上一章（第${prevSummary.chapterNumber}章）结束状态】\n${seg}`)
  }

  // 2. 跨章要素状态表（人物/地点/物品最新切片，严格早于本章）
  const snapshots = (await m.lwEntityStates?.getByProjectId(projectId)) || []
  const factLines = formatEntityFactLines(snapshots, chapterNumber)
  if (factLines.length > 0) {
    parts.push(`【跨章要素状态表（截至第 ${chapterNumber - 1} 章结束时点的既定事实，正文与此矛盾即为问题）】\n${factLines.join('\n')}`)
  }

  // 3. 近章事件时间线（带故事内时间，供时间线衔接核对）
  try {
    const allEvents = (await m.lwEvents?.getByProjectId(projectId)) || []
    const past = allEvents
      .filter((e) => e.chapterNumber > 0 && e.chapterNumber < chapterNumber)
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
    const chapterNos = [...new Set(past.map((e) => e.chapterNumber))].slice(-RECENT_EVENT_CHAPTERS)
    const recent = past.filter((e) => chapterNos.includes(e.chapterNumber))
    if (recent.length > 0) {
      const lines = recent.map((e) => {
        const time = clip(e.storyTime || '', 30)
        return `- 第${e.chapterNumber}章${time ? `（${time}）` : ''}：${clip(e.name, 40)}`
      })
      parts.push(`【近章事件时间线】\n${lines.join('\n')}`)
    }
  } catch {
    // 事件表读取失败不阻断事实表（其余段仍有价值）
  }

  // 4. 上一章结尾（衔接/口吻核对用）
  try {
    const outlines = (await m.lwOutlines?.getByProjectId(projectId)) || []
    const order = buildOutlineDocOrder(outlines)
    const prevOutline = outlines.find((o) => o.nodeType === 'chapter' && order.leafNumbers.get(o.id) === chapterNumber - 1)
    if (prevOutline) {
      const prevCh = await m.lwChapters?.getByOutlineId(prevOutline.id)
      if (prevCh?.content?.trim()) {
        parts.push(`【上一章结尾（原文末段）】\n…${clip(prevCh.content.slice(-PREV_TAIL_CHARS), PREV_TAIL_CHARS)}`)
      }
    }
  } catch {
    // 上章正文定位失败不阻断事实表
  }

  return parts.join('\n\n')
}
