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
   */
  mode?: 'reject' | 'queue' | 'interrupt'
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
