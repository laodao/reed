/**
 * 研讨室房间状态存取（v2.1 M2）
 * @module core/packs/longwriting/story-room/room-state
 *
 * 房间状态存 `lw_projects.wizard_state` 的 `room` 子键（零 schema 变更，与旧
 * 向导 `{skipped}` 隔离）。读-合并-写全程走项目仓库（租户 scoped）。
 * 并发：读-合并-写有丢更新窗口（发送轮收尾的 patch 与用户侧 ledger/卡片操作
 * 可并发）——写路径经 per-project promise 串行队列（评审 P1-1），同进程内
 * 严格串行；跨进程并发由单机单用户约定兜底。
 */

import { createLogger } from '@core/utils/logger'
import type { WizardStateFull } from '@shared/types/longwriting.types'
import type { RoomWorkspaceState } from '@shared/types/story-room.types'
import { defaultRoomState } from '@shared/types/story-room.types'
import { mutateWizardState } from '@core/platform/services/longwriting/wizard-state-rmw'

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
    designPackages: Array.isArray(room.designPackages) ? room.designPackages : def.designPackages,
    designSeq: Number.isFinite(room.designSeq) ? Number(room.designSeq) : def.designSeq,
  }
}

export async function getRoomState(db: any, projectId: string): Promise<RoomWorkspaceState> {
  const project = await db?.lwProjects?.getById(projectId)
  if (!project) throw new Error(`长文项目不存在：${projectId}`)
  return extractRoomState(project.wizardState)
}

// 复核修复：写串行队列下沉到 platform 层（wizard-state-rmw）——wizardState 现有
// 多个写方（room 键、conflictResolutions 键），队列必须跨层共享才能消除丢更新窗口。
// 本模块导出签名不变，消费方无感。

/** 写整个 room 子键（队列内读-改-写，保留 wizardState 其余键） */
export async function saveRoomState(db: any, projectId: string, next: RoomWorkspaceState): Promise<void> {
  await mutateWizardState<void>(db, projectId, (wizard) => ({
    next: { ...(wizard || {}), room: next },
    result: undefined,
  }))
}

/**
 * 队列内读-改-写（评审 P1-4）：mutator 拿到队列内最新状态做增量变换，
 * 消除「读在队列外、间隔 LLM 调用」的丢更新窗口（账本/卡片 RMW 专用）。
 */
export async function mutateRoomState(
  db: any,
  projectId: string,
  mutator: (current: RoomWorkspaceState) => RoomWorkspaceState | Promise<RoomWorkspaceState>,
): Promise<RoomWorkspaceState> {
  return mutateWizardState<RoomWorkspaceState>(db, projectId, async (wizard) => {
    const current = extractRoomState(wizard)
    const next = await mutator(current)
    return { next: { ...(wizard || {}), room: next }, result: next }
  })
}

export async function patchRoomState(
  db: any,
  projectId: string,
  patch: Partial<RoomWorkspaceState>,
): Promise<RoomWorkspaceState> {
  return mutateWizardState<RoomWorkspaceState>(db, projectId, (wizard) => {
    const current = extractRoomState(wizard)
    const next = { ...current, ...patch }
    return { next: { ...(wizard || {}), room: next }, result: next }
  })
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
