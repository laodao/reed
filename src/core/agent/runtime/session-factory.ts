/**
 * Session 组装工厂：AgentDefinition + 运行时组件 → open-harness Session
 * @module core/agent/runtime/session-factory
 *
 * 组装清单（全部为 spike 验证过的契约）：
 *   new Agent({ name, model, tools, maxSteps, approve })
 *   new Session({ agent, sessionId, sessionStore, contextWindow, compactionStrategy, hooks })
 *
 * - model            ← provider/provider-adapter.resolveModel
 * - tools            ← tools/registry（AgentToolDef → ai tool()，requiresApproval 交给 approve）
 * - approve          ← runtime/approval 协调器（仅当存在挂起审批的工具）
 * - sessionStore     ← memory/session-store（ALS 多租户）
 * - contextWindow    ← 环境配置（按所选模型上下文长度）
 * - hooks.onBeforeSend ← context/context-manager（注入 system + 设定集快照）
 * - maxSteps         ← AgentDefinition 可覆盖，缺省 6（react 模式）；旧单步 agent 传 1
 */

export function createSession() {
  throw new Error('M0: 待实现')
}
