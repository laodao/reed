/**
 * Agent 运行时跨进程契约类型
 * @module shared/types/agent.types
 *
 * 权威定义：tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md（冲突处以该文档为准）。
 * 本文件只放「前端/IPC 需要的跨进程类型」；后端内部接口在 @core/platform/agent-runtime 各模块。
 *
 * 演化纪律（契约层 §0-3）：只加不改——新增可选字段/新事件 type 不破坏旧消费者；
 * 消费方必须忽略未知 type 与未知字段。
 */

// ==================== 会话与轮次 ====================

export type AgentLoopMode = 'react' | 'single-pass'

/** 一轮对话的返回 */
export interface AgentSendResult {
  conversationId: string // `${definitionId}:${scopeId}`
  reply: string
  actionSummaries: Array<{ type: string; params: unknown; ok: boolean; brief: string }>
  suggestions: string[]
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
  /** 终止原因：final=收敛 | max_steps | aborted | error */
  stopReason?: string
}

export interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  metadata?: { actions?: unknown[]; suggestions?: string[]; interrupted?: boolean }
}

export interface SendMessageOptions {
  providerConfigId?: string
  modelId?: string
  /**
   * 同 scope 忙碌时的策略（24 号借鉴 codex steer；缺省 'reject'）：
   * - 'reject'：抛 AgentBusyError（同旧语义）
   * - 'queue'：排队至当前轮边界，逐条依次整轮执行（FIFO，各自独立终态/结果；
   *   排队上限 8，超限 fail-fast）
   * - 'interrupt'：取消当前轮，随后按 queue 同序等待执行（不插队）
   * - 'steer'（43号 O8，借 codex 步间 pending input）：当前轮忙碌时把消息注入
   *   正在进行的轮（下一次步采样前进历史，不打断当前步），随当前轮返回结果；
   *   空闲时等同普通发送。上限 8，超限 fail-fast
   */
  mode?: 'reject' | 'queue' | 'interrupt' | 'steer'
}

// ==================== 事件协议（前端订阅） ====================
// 前端兼容约定：旧协议子集（stage/action:*/reply:*/error）与长文旧 AgentEvent 形态一致；
// 新增 type（approval:*/compaction:*）旧前端忽略。

export type AgentEvent =
  // —— 旧协议兼容子集 ——
  | { type: 'stage'; stage: 'deciding' | 'acting' | 'summarizing' | 'compacting' | 'restoring' }
  | { type: 'action:start'; actionType: string; label: string }
  | {
      type: 'action:done'
      actionType: string
      status: 'ok' | 'error' | 'denied'
      message: string
      changed?: string[]
    }
  | { type: 'reply:start'; summaryEventId: string }
  | { type: 'reply:content'; summaryEventId: string; delta: string }
  | { type: 'reply:done'; suggestions?: string[] }
  | { type: 'error'; error: string }
  // —— 新增（v2）——
  | {
      type: 'approval:request'
      approvalId: string
      toolName: string
      input: unknown
      card: { title: string; summary: string; editable?: string[] }
      /** 本卡可选决定集（前端零硬编码按钮） */
      availableDecisions?: string[]
      expiresAt: number
    }
  | { type: 'approval:resolved'; approvalId: string; action: string }
  | {
      type: 'compaction'
      phase: 'start' | 'summary' | 'done'
      tokensBefore?: number
      tokensAfter?: number
    }

// ==================== 审批（提案卡） ====================

export type ApprovalDecision =
  | { action: 'approve'; scope?: 'once' | 'session' } // scope=session（24 号 Amendment）：本次批准沉淀为会话级同类免批
  | { action: 'approve_with_edit'; input: Record<string, unknown> } // 编辑后经 inputSchema 重校验
  | { action: 'reject'; reason?: string }

/** 挂起中的审批（前端重连恢复卡片用） */
export interface PendingApproval {
  approvalId: string
  sessionId: string
  toolName: string
  input: unknown
  cardTitle?: string
  cardSummary?: string
  /** 引擎声明的本卡可选决定集（前端零硬编码按钮；缺省全集） */
  availableDecisions?: string[]
  createdAt: number
  expiresAt: number
}

// ==================== 工具绑定与调用结果（工作流 agent-loop 节点 config / IPC 需要） ====================

/** 工具调用统一错误码（14 号 §5.4；模型可据此自我纠错） */
export type AgentToolErrorCode =
  | 'INVALID_ARGS' // 入参校验失败；hint 附逐字段问题
  | 'NOT_WHITELISTED' // 未注册/不在本次白名单；hint 列出可用工具名
  | 'GUARD_BLOCKED' // SSRF 等安全拦截
  | 'CREDENTIAL_ERROR' // 凭据缺失/解密失败
  | 'UPSTREAM_HTTP' // 上游 HTTP 错误（含状态码与响应摘要）
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'LIMIT_EXCEEDED' // 单 run 调用次数上限（maxCalls）
  | 'INTERNAL'

/** 统一工具调用结果（错误永不 throw，一律回填模型） */
export interface AgentToolResult {
  ok: boolean
  data?: unknown // 已截断/引用化
  error?: { code: AgentToolErrorCode; message: string; hint?: string; retryable: boolean }
  truncated?: boolean
  resultRef?: string // 完整结果引用（M2 落盘路径）
  durationMs: number
}

/** agent-loop 白名单条目（节点 config；静态侧对 LLM 不可见不可改） */
export interface AgentToolBinding {
  tool: string // AgentToolSpec.name
  /** 静态 config 片段：与 LLM args 深合并，静态键优先（LLM 不可覆盖宿主配置） */
  config?: Record<string, unknown>
  /** 凭据引用（仅 id，明文只在执行器局部变量） */
  credentialId?: string
  /** 批准策略：inherit=按 dangerLevel 默认 | always | never（never 为显式放宽，编辑器需二次确认） */
  approval?: 'inherit' | 'always' | 'never'
  /**
   * approval='never' 的显式确认位（review B3：编辑器选择放宽时写入 true；
   * 引擎侧 normalizeToolWhitelist 对未带确认位的 never 降级 inherit——
   * 持久化通道（导入 JSON/API）不能只凭一个 approval 字段关闭人工审批）
   */
  approvalNeverConfirmed?: boolean
  /** 单 run 内此工具调用上限 */
  maxCalls?: number
  /** 宿主定制的模型侧描述 */
  descriptionOverride?: string
}

// ==================== M3 任务树（26 号批2 / 01 号 §5） ====================

/** 任务状态机（TaskService 收口变迁） */
export const AGENT_TASK_STATUSES = [
  'pending_review', 'ready', 'running', 'verifying', 'succeeded', 'failed', 'cancelled', 'escalated', 'replanned',
] as const
export type AgentTaskStatus = (typeof AGENT_TASK_STATUSES)[number]

/** 任务执行器：agent_loop=LoopRunner 直驱 | sub_workflow:<definitionId>=引擎运行 | human=人工 */
export type AgentTaskExecutor = 'agent_loop' | `sub_workflow:${string}` | 'human'

/** 任务契约（规划期声明——验收标准在这里） */
export interface AgentTaskSpec {
  goal: string
  /** 验收标准（LLM 评判 rubric 与规则层依据） */
  acceptance?: string
  /** agent_loop 执行器的工具白名单（AgentToolRegistry 工具名） */
  toolWhitelist?: string[]
  /** 本任务执行的迭代上限（agent_loop） */
  maxSteps?: number
  /**
   * 模型档位（39 号 P2，场景⑦）：cheap=轻量档（机械/阅读类子任务），
   * strong=强力档（难推理）；inherit/缺省=默认模型。档位→实际模型的映射
   * 在宿主装配层（workflow-boot 读 AGENT_MODEL_CHEAP / AGENT_MODEL_STRONG env）。
   */
  model?: 'cheap' | 'strong' | 'inherit'
  /** 依赖：同树中须先终态的任务 id（缺省=按树序，父依赖子全部终态） */
  deps?: string[]
  /** 质量门配置（透传 Verifier 的 VerificationSpec 子集） */
  verification?: {
    requiredFields?: string[]
    minLength?: number
    llmJudge?: boolean
    rubricHints?: string[]
    humanRequired?: boolean
    grayZone?: { low: number; high: number }
  }
}

/** 任务树渲染/查询 DTO（与 AgentTaskRow 同构） */
export interface AgentTaskView {
  id: string
  parentId: string | null
  rootId: string
  depth: number
  title: string
  spec: AgentTaskSpec
  status: AgentTaskStatus
  executor: string
  runId: string | null
  qualityScore: number | null
  result: Record<string, unknown> | null
  retryCount: number
  error: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** 规划器生成的任务树节点（LLM JSON 契约） */
export interface PlannedTaskNode {
  title: string
  spec: AgentTaskSpec
  executor?: AgentTaskExecutor
  children?: PlannedTaskNode[]
}

// ==================== Agent 工作台（29 号 M5.5） ====================

/** 工作台会话列表项（agent_sessions distinct + 运行状态合成） */
export interface AgentConsoleSession {
  /** 轨迹 scopeKey（dialog:<id> / task:<taskId> / 其他宿主原生键） */
  scopeKey: string
  /** 会话族：聊天宿主 / 任务树执行器 / 其他宿主（story-room 等） */
  kind: 'chat' | 'task' | 'other'
  /** 展示名（聊天=对话标题，任务=任务标题，其他=conversationId） */
  label: string
  /** 跳转引用：chat→dialogId，task→taskId（叶子），other→null */
  refId: string | null
  /** 任务树的根 id（task 会话专有；跳任务树详情用——叶子 id 不能直接当 root） */
  rootId: string | null
  /** 最近的对话消息时间（agent_sessions 最新行） */
  updatedAt: string | null
  /** 会话消息行数 */
  messageCount: number
  /** 是否有在途运行（run registry） */
  running: boolean
}

/** 轨迹条目（ac:trajectory 广播 / get-trajectory 返回行的 payload 形态）。
 *  seq：回放行有值；实时广播条目在落库前为 null（按到达序展示） */
export interface AgentConsoleTrajectoryEntry {
  seq: number | null
  iteration: number
  kind: string
  name?: string | null
  payload?: Record<string, unknown> | null
  promptTokens?: number | null
  completionTokens?: number | null
  durationMs?: number | null
  /** 落库行时间（回放排序用；实时广播条目可能缺省） */
  createdAt?: string | null
}

/** 运行状态广播（ac:run-update） */
export interface AgentRunUpdateEvent {
  scopeKey: string
  status: 'running' | 'done' | 'error' | 'aborted'
  label?: string
  error?: string
}

// ==================== 会话上下文查看（ac:get-context） ====================

/** 模型侧历史单条消息的展示投影（长文本截断，仅摘要不回传全文） */
export interface AgentConsoleContextMessage {
  /** 在会话历史中的序号（=agent_sessions.seq） */
  seq: number
  role: string
  /** 文本部分拼接（超长截断） */
  text: string
  /** 消息内 tool-call 部件 */
  toolCalls: Array<{ name: string; argsDigest: string }>
  /** 消息内 tool-result 部件 */
  toolResults: Array<{ name: string; digest: string }>
  /** 无法归类的内容部件类型名（未来新部件类型兜底可见） */
  otherParts: string[]
  /** text 是否被截断 */
  truncated: boolean
  /** 原始序列化字节数（体量感） */
  bytes: number
}

/** 会话上下文（模型实际看到的消息历史，读自 agent_sessions 会话存储） */
export interface AgentConsoleContext {
  /** 会话存储键（chat=system-chat-agent:dialog:<id>，task=task:<id>） */
  conversationId: string
  messages: AgentConsoleContextMessage[]
}
