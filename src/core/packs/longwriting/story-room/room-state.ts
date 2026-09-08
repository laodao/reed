/**
 * 研讨室房间状态存取（v2.1 M2）
 * @module core/packs/longwriting/story-room/room-state
 *
 * 房间状态存 `lw_projects.wizard_state` 的 `room` 子键（零 schema 变更，与旧
 * 向导 `{skipped}` 隔离）。读-合并-写全程走项目仓库（租户 scoped）。
 * 并发约定：单机单用户，写路径由会话互斥保证不并发；账本/卡片等独立 IPC
 * 理论上可与运行轮并发——以最后一次写为准（可接受）。
 */

import { createLogger } from '@core/utils/logger'
import type { WizardStateFull } from '@shared/types/longwriting.types'
import type { RoomWorkspaceState } from '@shared/types/story-room.types'
import { defaultRoomState } from '@shared/types/story-room.types'

const logger = createLogger('StoryRoomState')

/** 从项目 DTO 的 wizardState 提取房间状态（缺省字段逐个补默认值，防御坏数据） */
export function extractRoomState(wizard: WizardStateFull | undefined): RoomWorkspaceState {
  const def = defaultRoomState()
  const room = wizard?.room as Partial<RoomWorkspaceState> | undefined
  if (!room || typeof room !== 'object') return def
  return {
    ledger: Array.isArray(room.ledger) ? room.ledger : def.ledger,
    summary: typeof room.summary === 'string' ? room.summary : def.summary,
    summarizedTurn: Number.isFinite(room.summarizedTurn) ? Number(room.summarizedTurn) : def.summarizedTurn,
    turnNo: Number.isFinite(room.turnNo) ? Number(room.turnNo) : def.turnNo,
    phase: room.phase ?? def.phase,
    contentTarget: room.contentTarget ?? def.contentTarget,
    pendingCards: Array.isArray(room.pendingCards) ? room.pendingCards : def.pendingCards,
    cardSeq: Number.isFinite(room.cardSeq) ? Number(room.cardSeq) : def.cardSeq,
  }
}

export async function getRoomState(db: any, projectId: string): Promise<RoomWorkspaceState> {
  const project = await db?.lwProjects?.getById(projectId)
  if (!project) throw new Error(`长文项目不存在：${projectId}`)
  return extractRoomState(project.wizardState)
}

/** 写整个 room 子键（先读项目，保留 wizardState 其余键） */
export async function saveRoomState(db: any, projectId: string, next: RoomWorkspaceState): Promise<void> {
  const project = await db?.lwProjects?.getById(projectId)
  if (!project) throw new Error(`长文项目不存在：${projectId}`)
  const merged: WizardStateFull = { ...(project.wizardState || {}), room: next }
  const updated = await db.lwProjects.update(projectId, { wizardState: merged })
  if (!updated) throw new Error(`房间状态保存失败（项目不存在）：${projectId}`)
}

export async function patchRoomState(
  db: any,
  projectId: string,
  patch: Partial<RoomWorkspaceState>,
): Promise<RoomWorkspaceState> {
  const current = await getRoomState(db, projectId)
  const next = { ...current, ...patch }
  await saveRoomState(db, projectId, next)
  return next
}

/** 读失败仅告警并返回 null（fail-soft，用于轮后静默任务） */
export async function tryGetRoomState(db: any, projectId: string): Promise<RoomWorkspaceState | null> {
  try {
    return await getRoomState(db, projectId)
  } catch (e) {
    logger.warn(`[story-room] 房间状态读取失败（fail-soft）project=${projectId}`, e)
    return null
  }
}
