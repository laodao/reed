/**
 * 待审批项服务（写作期门禁：章法产物 → 用户审批 → 继续）
 * @module core/packs/longwriting/story-room/room-approvals
 *
 * 产品行为（用户要求 2026-09-20）：lw_write_chapter_full 成功后由确定性代码
 * 自动建 chapter_review 审批单（不依赖 agent 自觉）；聊天流由消息文本里的
 * `[待审批:<id>]` 标记渲染成按钮，独立入口为顶栏「待审批 N」；用户在审批
 * 界面查看（正文按 outlineId 现取 + 两段检查结论）后点「通过/驳回」，
 * 未决不得继续下一章。存储走 wizard_state.room.approvals（零 schema 变更，
 * 与账本/设计包同层）；同一章已有 pending 单时复用更新（覆盖重写不堆叠）。
 */

import { mutateRoomState } from './room-state'
import type { RoomApproval, RoomApprovalPayload } from '@shared/types/story-room.types'

/**
 * 为章法产物建（或复用）审批单。返回最新状态的 approvals（含建单/更新结果）。
 */
export async function createChapterReviewApproval(
  db: any,
  projectId: string,
  payload: RoomApprovalPayload,
  sourceTurn = 0,
): Promise<{ approval: RoomApproval | null; approvals: RoomApproval[] }> {
  let createdId = ''
  const next = await mutateRoomState(db, projectId, (current) => {
    const now = Date.now()
    const seq = Number(current.approvalSeq || 0) + 1
    const existing = current.approvals.find(
      (a) => a.type === 'chapter_review' && a.status === 'pending' && a.payload?.outlineId === payload.outlineId,
    )
    if (existing) {
      createdId = existing.id
      const updated: RoomApproval = { ...existing, payload, sourceTurn, createdAt: now }
      return {
        ...current,
        approvalSeq: seq,
        approvals: current.approvals.map((a) => (a.id === existing.id ? updated : a)),
      }
    }
    const approval: RoomApproval = {
      id: `apr_${now}_${seq}`,
      type: 'chapter_review',
      title: `《${payload.chapterTitle || '未命名章节'}》评审`,
      status: 'pending',
      payload,
      sourceTurn,
      createdAt: now,
    }
    createdId = approval.id
    return { ...current, approvalSeq: seq, approvals: [...current.approvals, approval] }
  })
  const approval = next.approvals.find((a) => a.id === createdId) ?? null
  return { approval, approvals: next.approvals }
}

/**
 * 审批决定（通过/驳回）。仅 pending 可决——已决单不可改（回看终态）。
 * 返回更新后的单；id 不存在或已决返回 null。
 */
export async function decideApproval(
  db: any,
  projectId: string,
  approvalId: string,
  action: 'approve' | 'reject',
  note?: string,
): Promise<RoomApproval | null> {
  let decided = false
  const next = await mutateRoomState(db, projectId, (current) => ({
    ...current,
    approvals: current.approvals.map((a) => {
      if (a.id !== approvalId || a.status !== 'pending') return a
      decided = true
      return {
        ...a,
        status: action === 'approve' ? ('approved' as const) : ('rejected' as const),
        decidedAt: Date.now(),
        note: note?.trim() ? note.trim() : undefined,
      }
    }),
  }))
  // 仅「本次真正决定」返回终态单；id 不存在或早已决定（防重复改判）返回 null
  if (!decided) return null
  return next.approvals.find((a) => a.id === approvalId) ?? null
}
