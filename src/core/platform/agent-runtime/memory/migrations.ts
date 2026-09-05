/**
 * agent 模块建表迁移
 * @module core/agent/memory/migrations
 *
 * 表一：agent_sessions —— 会话消息（SessionStore 存储）
 *   id, conversation_id (idx), role, content(jsonb/text), metadata(jsonb), seq,
 *   user_id (ALS 过滤), created_at
 *   唯一索引：(conversation_id, seq)
 *
 * 表二：agent_memories —— 项目级长期记忆
 *   id, scope_id (idx), kind, status, canonical_key, title, content,
 *   source, superseded_by, idempotency_key (uq, 可空),
 *   user_id (ALS 过滤), created_at, updated_at
 *   部分唯一索引：(scope_id, canonical_key) WHERE status='active'——同名事实只允许一条 active
 *   （对齐 create-workflow-tables 的 uq_wf_run_mutex 部分唯一索引先例）
 *
 * 注册进现有迁移体系（core/database/migrations）。
 */

export function createAgentTables() {
  throw new Error('M1: 待实现')
}
