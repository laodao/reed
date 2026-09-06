/**
 * Agent 公共运行时（harness 层）
 * @module core/platform/agent-runtime
 *
 * 基于 Vercel AI SDK v6（`ai`）的薄自研 harness（22 号审计定稿：不依赖
 * @openharness/core 整包，仅 vendor 压缩策略/retry 形状/todos 三模块），
 * 供长文写作 / EP / 故事研讨室 / 工作流 agent-loop 节点复用。
 * 契约唯一权威：tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md。
 *
 * ## 模块清单（✅ 已实现 / ⬜ 待做批次）
 *
 * | 模块 | 职责 | 状态 | 来源 |
 * |---|---|---|---|
 * | types | 共享类型与事件协议 | ✅ | 自研 |
 * | provider/provider-adapter | getProviderConfig → createOpenAICompatible → LanguageModel | ✅ | 包装 ai-call.ts |
 * | runtime/loop | LoopRunner 手动循环（ai@6 单步；护栏/审批短路/错误分类） | ✅ | 自研（22 号 B1） |
 * | runtime/approval | 审批协调：提案卡挂起/决定/超时 + Amendment 免批 | ✅ | 自研 |
 * | runtime/event-bridge | AgentEvent → 直推+平台总线双路径 | ✅ | 自研（共用 event-producer 底座） |
 * | runtime/agent-service | 对外门面：互斥/LRU 驻留/abort/审批路由/health + 单例 | ✅ | 自研（23 号 §1） |
 * | memory/session-store | AgentSessionStore 双实现（内存/DB，ALS 隔离） | ✅ | 自研（23 号 §6） |
 * | core/database/migrations/create-agent-tables | agent_sessions / agent_memories 建表 | ✅ | 自研 |
 * | context/context-manager | 四层上下文装配 + 两级压缩水位 | ⬜ ContextManager 批 | 自研 |
 * | context/state-snapshot | 业务状态快照接口（业务方注入 buildSnapshot） | ⬜ 随 ContextManager | 自研接口 |
 * | memory/memory-service | 项目级长期记忆状态机（agent_memories 表已建） | ⬜ 记忆批 | 设计借 happyclaw（MIT） |
 * | tools/registry | 工具注册表 + buildToolDefs 桥接（14 号） | ⬜ 工具批 | 自研 |
 *
 * ## 依赖方向（强约束）
 *
 * - 本目录**禁止 import 业务模块与 packs**（longwriting/episode-production/story-room/...）；
 *   业务以 `AgentDefinition`（见 types.ts）声明式接入。
 * - 业务定义文件位置（packs 架构，业务代码归 src/core/packs/&lt;业务&gt;）：
 *   - 长文写作：`src/core/packs/longwriting/agent/definition.ts`（迁移批创建）
 *   - EP：`src/core/packs/episode-production/agent/definition.ts`
 *   - 故事研讨室：`src/core/packs/longwriting/story-room/`
 *
 * ## 依赖红线（21 号 §1.3）
 *
 * - 必须钉 `ai@^6.x`（package.json overrides 锁定）；ESM-only 包一律 `import type` + 动态 `import()`
 */

// —— 已实现（M1-P1）——
export { LoopRunner, initState, normalizeDecision, buildSystem, truncateJson } from './runtime/loop'
export { ApprovalCoordinator, InMemoryApprovalStore, amendmentKey, stableStringify, AVAILABLE_DECISIONS } from './runtime/approval'
export type { ApprovalCoordinatorDeps, ApprovalStore } from './runtime/approval'
export { EventBridge } from './runtime/event-bridge'
export type { EventBridgeDeps, PlatformBusPort } from './runtime/event-bridge'
export { ProviderAdapter, AgentProviderNotConfiguredError } from './provider/provider-adapter'
export type { LoopRunnerDeps } from './runtime/loop'
export type { ProviderAdapterDeps, ResolveModelOptions, ProviderConfigLookup } from './provider/provider-adapter'
export {
  createSessionStore,
  InMemorySessionStore,
  DbAgentSessionStore,
  AgentSessionCorruptionError,
  AgentMessageTooLargeError,
  MAX_MESSAGE_BYTES,
} from './memory/session-store'
export type { AgentSessionStore, DbAgentSessionStoreDeps } from './memory/session-store'
// —— 批 4：门面（23 号 §1）——
export {
  AgentRuntimeImpl,
  initAgentRuntime,
  getAgentRuntime,
  disposeAgentRuntime,
  MAX_STEER_QUEUE,
  AgentBusyError,
  AgentDefinitionConflictError,
  AgentDefinitionNotFoundError,
  AgentRuntimeNotInitializedError,
  AgentRuntimeDisposedError,
  AgentSessionResetError,
  AgentScopeOwnerMismatchError,
} from './runtime/agent-service'
export type { AgentRuntime, AgentRuntimeDeps } from './runtime/agent-service'
// —— 批 5：工具注册表（23 号 §3 / 14 号 R1-R2）——
export {
  AgentToolRegistry,
  AgentToolConflictError,
  mergeStaticConfig,
  serializeToolResult,
  TOOL_RESULT_MAX_BYTES,
  TOOL_RESULT_ARRAY_KEEP,
  TOOL_RESULT_FIELD_MAX_CHARS,
  TOOL_EXECUTE_TIMEOUT_MS,
  TOOL_NAME_RE,
} from './tools/registry'
export type { AgentToolRegistryDeps, AgentToolCallAudit } from './tools/registry'
export type { AgentToolSpec, LLMToolDescriptor, ToolSourceKind } from './types'

// —— 契约类型（23 号接口契约层）——
export type {
  AgentDefinition, AgentToolDef, AgentToolContext, AgentTask, AgentHost, AgentLoopState,
  AgentResult, AgentStreamEvent, HumanDecision, ParsedToolCall, SuspendRequest,
  ToolDangerLevel, TrajectoryEntry,
} from './types'
