/**
 * Agent 运行时后端契约类型
 * @module core/platform/agent-runtime/types
 *
 * 权威定义：tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md。
 * 跨进程类型（AgentEvent/审批/结果）在 @shared/types/agent.types，本文件只做后端侧扩展。
 *
 * 依赖纪律（22 号 §3 分层）：本文件零运行时依赖（仅 import type）；
 * ESM-only 包（ai/zod）类型一律 import type，运行时经动态 import。
 */

import type { z } from 'zod'
import type { ModelMessage } from 'ai'
import type {
  AgentLoopMode,
  AgentSendResult,
  PendingApproval,
  SendMessageOptions,
} from '@shared/types/agent.types'

export type { AgentLoopMode, AgentSendResult, PendingApproval, SendMessageOptions }

// ==================== 记忆（15 号 §5；实体/仓储随记忆批次接入） ====================

/** 记忆种类：事实 / 决定 / 教训 / 待跟进开环 */
export type MemoryKind = 'fact' | 'decision' | 'lesson' | 'open_loop'

/** 记忆状态机：proposed → active（提案卡采纳）/ deleted（忽略）；active → superseded（版本链）/ conflicted（待裁决） */
export type MemoryStatus = 'proposed' | 'active' | 'deleted' | 'superseded' | 'conflicted'

/** 记忆来源：agent 运行时 / 用户手写 / 种子 / 迁移（前端"来源"徽标） */
export type MemorySource = 'agent_runtime' | 'user' | 'seed' | 'migration'

// ==================== 工具 ====================

/** 工具来源（14 号 R1：通用平台，四类消费者 × 多来源） */
export type ToolSourceKind = 'builtin' | 'pack' | 'node' | 'tool' | 'oas' | 'skill'

/** 注册表内的工具名片（23 号 §3；jsonSchema 由 zod 单一事实源派生缓存，14 号 R2） */
export interface AgentToolSpec {
  /** 命名规范：builtin 直名 / pack:<packId>:<name>；后续来源 node: tool: oas: skill: */
  name: string
  source: ToolSourceKind
  packId?: string
  /** 人看（轨迹视图/审批弹窗） */
  description: string
  /** 模型看（缺省回退 description） */
  llmDescription: string
  /** JSON Schema（draft-2020-12 子集，object 根；zod.toJSONSchema 派生） */
  jsonSchema: Record<string, unknown>
  dangerLevel: ToolDangerLevel
  /** 取严结果：requiresApproval ∨ dangerLevel∈{exec, external-post} */
  requiresApproval: boolean
}

/** 协议层序列化形态（给 LLM 的工具描述；不含 executor/dangerLevel 等宿主侧信息） */
export interface LLMToolDescriptor {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolDangerLevel = 'read' | 'write' | 'external-post' | 'exec'

/** 业务工具定义（zod 为 schema 单一事实源；与 14 号 AgentToolSpec 统一模型的业务侧形态） */
export interface AgentToolDef<TInput = unknown, TOutput = unknown> {
  /** /^[a-z][a-z0-9_]{2,48}$/；经注册命名空间后变 pack:<packId>:<name> */
  name: string
  description: string
  inputSchema: z.ZodType<TInput>
  execute(input: TInput, ctx: AgentToolContext): Promise<TOutput>
  requiresApproval?: boolean
  dangerLevel?: ToolDangerLevel
  approvalCard?: { title: string; summary?: (i: TInput) => string; editable?: string[] }
  /** 工作流无人值守白名单（缺省 false；写库类一律 false） */
  autoApprovableInWorkflow?: boolean
  /**
   * 单工具执行超时 ms（registry 管线旋钮；缺省走注册表级 executeTimeoutMs=120s）。
   * 长等待型工具（如系统 agent 的 run_workflow 轮询至终态）按需调高——
   * registryWrapped 工具的超时所有权在 registry，loop 层不再套第二层计时器。
   */
  executeTimeoutMs?: number
  /**
   * 内部标记（registry 桥接产物，业务定义不写）：校验/超时/截断的所有权已在
   * registry 管线——loop 包装层对它跳过自身 zod/withTimeout/truncateJson，
   * 只保留审批短路 + 流事件（深度 review P1 定案，防失败被报 ok:true/双计时器）
   */
  registryWrapped?: boolean
}

export interface AgentToolContext {
  scopeId: string
  rawInput: string
  signal?: AbortSignal
  logContext: Record<string, unknown>
  /** 本次调用 id（loop 层透传；审计面据此与轨迹 tool_call 配对——review B12） */
  toolCallId?: string
  /** 宿主绑定凭据引用（custom 工具执行层注入；LLM 永不可见——review B2） */
  credentialId?: string
}

// ==================== Agent 定义（业务包唯一要写的东西） ====================

export interface AgentDefinition {
  id: string
  /** 定义版本（提示词/工具变更时 +1，排障用） */
  version: number
  systemPrompt: string | ((scopeId: string) => Promise<string>)
  tools: Record<string, AgentToolDef>
  /** F9：状态快照由库里重建，不由 AI 复述（防漂移原则） */
  buildStateSnapshot(scopeId: string): Promise<string>
  loopMode: AgentLoopMode
  maxSteps?: number // react 缺省 6；single-pass 固定 2（决策+总结）
  contextWindowTokens?: number
  modelPreference?: { providerConfigId?: string; modelId?: string }
  /** 事件通道命名（保持业务前缀，pack IPC 守卫友好） */
  eventChannel(scopeId: string): string
  streamChannel?: (scopeId: string) => string
  buildSuggestions?(snapshot: string): string[]
  approvalTimeoutMs?: number
  summarizeTitle?(firstUserMessage: string): Promise<string>
  onTurnEnd?(ctx: {
    scopeId: string
    userMessage: string
    reply: string
    toolCalls: Array<{ name: string; input: unknown; ok: boolean }>
  }): Promise<void>
}

// ==================== 循环（12 号规格契约的运行时形态） ====================

/** 一轮任务（agent-loop 节点 config 或 definition 构造） */
export interface AgentTask {
  definitionId: string
  scopeId: string
  /** 任务目标/用户消息 */
  input: string
  systemPrompt: string
  /** 本轮工具集（已按命名空间注册） */
  tools: Record<string, AgentToolDef>
  maxSteps: number
  modelPreference?: { providerConfigId?: string; modelId?: string }
  /** 状态快照（L1 装配原料；每轮可刷新） */
  snapshot?: string
  /** 宿主运行上下文（并入工具审计 logContext：runId/nodeId/sessionKey 等——review D3） */
  runtimeContext?: Record<string, unknown>
}

export interface ParsedToolCall {
  toolCallId: string
  toolName: string
  input: unknown
}

/** 12 号 §4.2 AgentLoopState（步级持久化的唯一依据） */
export interface AgentLoopState {
  version: 1
  task: {
    definitionId: string
    scopeId: string
    input: string
    maxSteps: number
    toolNames: string[]
  }
  /** 完整对话（system 不入列，启动时重建） */
  messages: ModelMessage[]
  iteration: number
  usage: { promptTokens: number; completionTokens: number; toolCalls: number }
  startedAtMs: number
  converged: boolean
  finalAnswer?: string
  stagnantRounds: number
  suspended?: { requestPayload: Record<string, unknown>; suspendedAt: string; waitMs: number }
  /** 累计人工等待毫秒（多轮挂起求和；净时长护栏 = now - startedAtMs - 本值，12 号 §6.2）。
   * 旧状态无此字段按 0（schema 向后兼容） */
  accumulatedWaitMs?: number
  stopReason?: string
}

export interface AgentResult {
  output: string
  stopReason: 'final' | 'max_steps' | 'stagnant' | 'human_rejected' | 'aborted' | 'error'
  usage: { promptTokens: number; completionTokens: number; toolCalls: number }
  iterations: number
  error?: string
}

/** 轨迹条目（写 agent_trajectories；fire-and-forget） */
export interface TrajectoryEntry {
  iteration: number
  /** memory_assembly：记忆装配留痕（36 号 HostKit——语义化 kind，decision 形态会被工作台误计步数） */
  kind: 'decision' | 'tool_call' | 'tool_result' | 'human_request' | 'human_decision' | 'guardrail_stop' | 'final' | 'memory_assembly'
  name?: string
  payload: Record<string, unknown>
  promptTokens?: number
  completionTokens?: number
  durationMs?: number
}

export interface SuspendRequest {
  reason: string
  payload: Record<string, unknown>
  timeoutMs: number | null
}

export type HumanDecision =
  | { action: 'approve' | 'input'; values: Record<string, unknown>; comment?: string }
  | { action: 'reject'; comment?: string }

export type AgentStreamEvent =
  | { kind: 'delta'; text: string }
  /** args 为工具入参原值（宿主可做摘要展示；28 号 M5 聊天宿主消费） */
  | { kind: 'tool-start'; toolName: string; toolCallId: string; args?: unknown }
  | { kind: 'tool-end'; toolName: string; toolCallId: string; ok: boolean }
  | { kind: 'step'; stepNumber: number }

// ==================== 宿主契约（12 号 §5.2，一字不改） ====================

export interface AgentHost {
  loadState(): Promise<AgentLoopState | null>
  saveState(state: AgentLoopState): Promise<void>
  suspend(req: SuspendRequest): Promise<HumanDecision>
  emitTrajectory(entry: TrajectoryEntry): void
  emitStream(event: AgentStreamEvent): void
  readonly signal: AbortSignal
}
