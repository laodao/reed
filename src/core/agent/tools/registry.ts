/**
 * 工具注册表
 * @module core/agent/tools/registry
 *
 * AgentToolDef → ai@6 `tool()` 的转换与约束：
 * - inputSchema（zod4，经 standard-schema 供 ai 使用）
 * - execute 包一层：注入 AgentToolContext（scopeId/rawInput/signal）、异常捕获为结构化错误
 *   （工具失败不终止对话，作为观察结果返回模型——与旧 agent-actions 的容错策略一致）
 * - requiresApproval=true 的工具在 registry 标记，session-factory 据此装配 approve 回调
 * - 工具结果超长截断（默认 8k 字符，head/tail 切片法）
 *
 * 命名规范：{动作}_{对象}，如 save_story_entity / update_story_entity / query_setting /
 * generate_outline / write_chapter——与旧 agent-actions 的动作语义一一对应，迁移期可映射。
 */

export function registerTools() {
  throw new Error('M0: 待实现')
}
