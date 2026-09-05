/**
 * Agent 运行时门面（对外唯一入口）
 * @module core/agent/runtime/agent-service
 *
 * 形态对齐现有 AgentWorkflowService（迁移期业务方可平替）：
 *   sendMessage(scopeId, message, opts)  一轮对话（互斥串行，同旧 busyProjects 约束）
 *   cancel(scopeId)                      中断当前轮（AbortController 池，真取消）
 *   getHistory(scopeId, limit)           会话历史
 *   approve(approvalId, decision)        提案卡决定（runtime/approval）
 *
 * 生命周期：AgentDefinition 通过 registerAgent(def) 注册（IPC/路由层按 definitionId 分发）。
 * 单例管理沿用 getInstance/resetInstance 模式（便于测试注入 fake）。
 */

export function createAgentService() {
  throw new Error('M0: 待实现')
}
