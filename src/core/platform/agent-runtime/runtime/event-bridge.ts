/**
 * 事件桥：open-harness Session 事件 → 统一 AgentEvent → 各业务事件通道
 * @module core/agent/runtime/event-bridge
 *
 * Session 事件词汇表（spike 实测）：
 *   turn.start / step.start / tool.start / tool.done / tool.error / step.done
 *   text.delta / text.done / done / turn.done / error / compaction.*
 *
 * 映射目标（保持旧前端零改动）：
 *   tool.start        → { type: 'action:start', action, params }
 *   tool.done         → { type: 'action:done', action, summary }
 *   tool.error        → { type: 'action:denied' }（审批拒绝时由 approval 协调器补充原因）
 *   text.delta        → { type: 'reply:content', delta }（流式正文走既有 generate 通道）
 *   compaction.*      → { type: 'stage', stage: 'compacting' }（前端进度条展示）
 *   done / turn.done  → { type: 'reply:done', suggestions }
 */

/** M0 实现：createEventBridge(emit, sessionId) → 挂到 Session 事件流 */
export function createEventBridge() {
  throw new Error('M0: 待实现')
}
