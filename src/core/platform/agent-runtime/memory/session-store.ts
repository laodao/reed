/**
 * 会话持久化：open-harness SessionStore 的多租户实现
 * @module core/agent/memory/session-store
 *
 * 契约（spike 验证）：
 *   interface SessionStore {
 *     load(sessionId): Promise<ModelMessage[] | undefined>
 *     save(sessionId, messages): Promise<void>   // 每轮 done 自动调用，全量替换
 *     delete?(sessionId): Promise<void>
 *   }
 * 恢复语义：新建 Session 后必须显式 `await session.load()`（返回 true 表示命中）。
 *
 * 存储：复用 lw_design_messages 模式新增通用表 agent_sessions（conversation_id, role, content,
 * metadata, user_id）——Repository 走 BaseRepository 的 ALS user_id 自动过滤（多租户红线）。
 * conversationId 约定：`{definitionId}:{scopeId}`（如 story-room:p-xxx），与旧 `agent:${projectId}` 共存，
 * 迁移期旧会话仍可读。
 */

import type { ModelMessage } from 'ai'

export interface AgentSessionStore {
  load(sessionId: string): Promise<ModelMessage[] | undefined>
  save(sessionId: string, messages: ModelMessage[]): Promise<void>
  delete?(sessionId: string): Promise<void>
}

export function createSessionStore(): AgentSessionStore {
  throw new Error('M0: 待实现')
}
