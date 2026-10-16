/**
 * R9 名册白名单（§3a 噪音治理，2026-09-20）
 * @module core/platform/services/longwriting/roster-whitelist
 *
 * 单元案死者（周员外）、路人（锦衣少年）等一次性人名，经用户「加入白名单」确认后，
 * R9 扫描（图谱「未登记人物」队列 + 文本姓氏扫描）不再上报。
 * 存储走 `lw_projects.wizard_state.rosterWhitelist`（零 schema 变更，与
 * conflictResolutions 同层），写路径经 per-project 串行队列防丢更新。
 */

import { mutateWizardState } from './wizard-state-rmw'

export interface RosterWhitelistEntry {
  name: string
  note?: string
  at: number
}

/** 读取白名单（project 不存在或读取失败返回空数组） */
export async function getRosterWhitelist(db: any, projectId: string): Promise<RosterWhitelistEntry[]> {
  try {
    const project = await db?.lwProjects?.getById(projectId)
    if (!project) return []
    const ws = (project.wizardState || {}) as Record<string, unknown>
    const list = Array.isArray(ws.rosterWhitelist) ? ws.rosterWhitelist : []
    return list
      .map((e: unknown) => (typeof e === 'string' ? { name: e, at: 0 } : (e as RosterWhitelistEntry)))
      .filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0)
  } catch {
    return []
  }
}

/** 加入白名单（已存在则更新备注；名字两侧空白裁剪） */
export async function addToRosterWhitelist(
  db: any,
  projectId: string,
  name: string,
  note?: string,
): Promise<RosterWhitelistEntry> {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('名字不能为空')
  return mutateWizardState<RosterWhitelistEntry>(db, projectId, (wizard) => {
    const ws = (wizard || {}) as Record<string, unknown>
    const list = Array.isArray(ws.rosterWhitelist) ? (ws.rosterWhitelist as RosterWhitelistEntry[]) : []
    const existing = list.find((e) => e?.name === trimmed)
    const entry: RosterWhitelistEntry = { name: trimmed, note: note?.trim() || existing?.note, at: Date.now() }
    const next = existing ? list.map((e) => (e?.name === trimmed ? entry : e)) : [...list, entry]
    return { next: { ...(ws as object), rosterWhitelist: next }, result: entry }
  })
}

/** 移出白名单（按名字精确匹配）。返回是否移除。 */
export async function removeFromRosterWhitelist(db: any, projectId: string, name: string): Promise<boolean> {
  const trimmed = String(name || '').trim()
  let removed = false
  await mutateWizardState<boolean>(db, projectId, (wizard) => {
    const ws = (wizard || {}) as Record<string, unknown>
    const list = Array.isArray(ws.rosterWhitelist) ? (ws.rosterWhitelist as RosterWhitelistEntry[]) : []
    const next = list.filter((e) => {
      const hit = e?.name === trimmed
      if (hit) removed = true
      return !hit
    })
    return { next: { ...(ws as object), rosterWhitelist: next }, result: removed }
  })
  return removed
}
