/**
 * 视频 prompt 台词加载器（2026-10-05 台词乱码修复）
 * @module platform/episode-production/render/video/shot-dialogue-loader
 *
 * 数据源口径（与字幕 subtitle.service 一致）：
 *   1. storyboard_dialogue_links（归一化权威表，镜头级精确分配）优先；
 *   2. 该镜头无 links 行时回退 storyboards.dialogue_ids JSON 列（老数据/单镜路径）。
 * 不做字幕那样的"池均分猜测"——台词进音视频模型必须精确归属，猜错比没有更糟。
 * links 表不存在（Web 老库）时静默回退 JSON 列；两路皆空 → 该镜头无台词。
 */

import type { DataSource } from 'typeorm'
import type { SegmentDialogue } from './segment-planner'

interface DialogueRow {
  id: string
  speaker: string
  text: string
}

function isPg(ds: DataSource): boolean {
  return ds.options.type === 'postgres'
}

/** 按 id 批量取对白（id → 说话人 + 原文） */
async function fetchDialogues(
  ds: DataSource,
  ids: string[],
): Promise<Map<string, DialogueRow>> {
  const result = new Map<string, DialogueRow>()
  if (ids.length === 0) return result
  const ph = ids.map((_, i) => (isPg(ds) ? `$${i + 1}` : '?')).join(',')
  const rows = (await ds.query(
    `SELECT id, character_name AS speaker, text FROM scene_dialogues WHERE id IN (${ph})`,
    ids,
  )) as DialogueRow[]
  for (const r of rows) {
    if (r && r.text) result.set(String(r.id), { id: String(r.id), speaker: r.speaker ?? '', text: r.text })
  }
  return result
}

/**
 * 批量加载一组分镜各自承接的台词。
 * 返回 Map<storyboardId, SegmentDialogue[]>（按 links.sort_order / JSON 数组顺序）。
 */
export async function loadShotDialogues(
  ds: DataSource,
  shots: Array<{ id: string; dialogueIds?: unknown }>,
): Promise<Map<string, SegmentDialogue[]>> {
  const result = new Map<string, SegmentDialogue[]>()
  if (shots.length === 0) return result

  // 第一路：links 表（表不存在时静默回退，不发生在新装库之外的场景）
  const linkedIds = new Set<string>()
  try {
    const ph = shots.map((_, i) => (isPg(ds) ? `$${i + 1}` : '?')).join(',')
    const rows = (await ds.query(
      `SELECT l.storyboard_id AS sid, d.character_name AS speaker, d.text AS text
         FROM storyboard_dialogue_links l
         JOIN scene_dialogues d ON d.id = l.dialogue_id
        WHERE l.storyboard_id IN (${ph})
        ORDER BY l.storyboard_id, l.sort_order`,
      shots.map((s) => s.id),
    )) as Array<{ sid: string; speaker: string; text: string }>
    for (const r of rows) {
      if (!r?.text) continue
      const list = result.get(r.sid) ?? []
      list.push({ speaker: r.speaker ?? '', text: r.text })
      result.set(r.sid, list)
      linkedIds.add(r.sid)
    }
  } catch {
    /* links 表缺失/查询失败 → 走 JSON 列兜底 */
  }

  // 第二路：无 links 的镜头回退 dialogue_ids JSON 列
  const fallbackIds: string[] = []
  for (const s of shots) {
    if (linkedIds.has(s.id)) continue
    const ids = Array.isArray(s.dialogueIds) ? s.dialogueIds.filter(Boolean).map(String) : []
    for (const id of ids) fallbackIds.push(id)
  }
  if (fallbackIds.length > 0) {
    const byId = await fetchDialogues(ds, [...new Set(fallbackIds)])
    for (const s of shots) {
      if (linkedIds.has(s.id)) continue
      const ids = Array.isArray(s.dialogueIds) ? s.dialogueIds.filter(Boolean).map(String) : []
      const list = ids
        .map((id) => byId.get(id))
        .filter((d): d is DialogueRow => !!d)
        .map((d) => ({ speaker: d.speaker, text: d.text }))
      if (list.length > 0) result.set(s.id, list)
    }
  }

  return result
}
