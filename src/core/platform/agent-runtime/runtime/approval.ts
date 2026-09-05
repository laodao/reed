/**
 * 审批协调器（提案卡的后端半边）
 * @module core/agent/runtime/approval
 *
 * open-harness 的 Agent 构造参数 `approve: (toolCall) => boolean | Promise<boolean>`
 * 是"提案卡"的天然挂载点（spike 已验证：返回 false → 工具不执行、发 tool.error、对话继续）。
 *
 * 职责：
 *   当工具 requiresApproval=true 时：
 *   1. 通过事件通道向前端推"提案卡"（工具名 + 入参 + 卡片摘要）
 *   2. 挂起 Promise，等待前端用户决定（采纳/编辑后采纳/换一版/忽略）
 *   3. 决定到达 → resolve；超时（默认 5 分钟）或会话取消 → reject（视为拒绝）
 *
 * 并发约束：同一会话同时最多一张挂起卡（前端交互也如此）；
 * 「换一版」实现为：拒绝当前 → 工具层重试生成新提案 → 再发一张卡（由 tools/registry 支持重入）。
 */


/** 前端对一张提案卡的决定 */
export type ApprovalDecision =
  | { action: 'approve' }
  | { action: 'approve_with_edit'; input: unknown }
  | { action: 'reject'; reason?: string }

/** 挂起中的审批（前端提案卡状态） */
export interface PendingApproval {
  approvalId: string
  sessionId: string
  toolName: string
  input: unknown
  cardTitle?: string
  cardSummary?: string
  createdAt: number
}

/** M0 实现 */
export function createApprovalCoordinator() {
  throw new Error('M0: 待实现')
}
