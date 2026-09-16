/**
 * 进程级运行时限额（启动时由 settings `agent:budget` 注入；2026-09-13 参数配置化）
 * @module shared/utils/runtime-limits
 *
 * 与"每轮可读的预算"（步数/频控/落库额度，宿主每轮读 settings）不同，这里放的是
 * **进程级、启动时装配一次**的限额：
 * - 体积类护栏：工具产物 / 会话流水单条消息 / 轨迹记录 payload；
 * - 结构性缺省：工作流 agent-loop 节点缺省迭代轮数、子代理缺省步数与步数顶。
 *
 * 为什么用持有者而不是逐层传参：这些值的使用点在 agent-runtime 深处（artifacts store /
 * transcript 截断 / 轨迹仓储 / 节点缺省 / 子代理工厂），逐个穿参要改 4 个宿主 + 多处签名；
 * 而它们本就是**进程级**语义（不是按会话/按轮变化）。启动时由 workflow-boot 从预算注入，
 * **改动需重启客户端生效**（设置页已如实提示）。
 *
 * 放在 shared 的原因：数据库层（轨迹仓储）与平台层都要读它，shared 是共同的、无环的那一层。
 */

import {
  AGENT_BUDGET_DEFAULTS,
  type AgentBudgetGuards,
} from '../types/agent-budget.types'

export interface RuntimeLimits {
  /** 单条工具产物 JSON 字节上限 */
  maxArtifactBytes: number
  /** 单条会话流水消息字节上限（超限存占位） */
  maxTranscriptMessageBytes: number
  /** 单条轨迹 payload 字节上限（超限降级为摘要） */
  maxTrajectoryPayloadBytes: number
  /** 工作流 agent-loop 节点缺省迭代轮数（节点未显式配 maxIterations 时用） */
  maxWorkflowAgentLoopSteps: number
  /** 子代理缺省步数 */
  maxSubagentSteps: number
  /** 子代理步数顶（单次调用不可超过） */
  maxSubagentStepsCeiling: number
  /** 单条领域事件 payload 字节上限（超限拒绝发布） */
  maxEventPayloadBytes: number
  /** 事件 payload 嵌套扫描深度（找敏感键名） */
  maxEventScanDepth: number
}

/** 缺省值 = 改造前写死在各自模块里的常量 */
export const RUNTIME_LIMITS_DEFAULTS: RuntimeLimits = {
  maxArtifactBytes: AGENT_BUDGET_DEFAULTS.guards.maxArtifactBytes,
  maxTranscriptMessageBytes: AGENT_BUDGET_DEFAULTS.guards.maxTranscriptMessageBytes,
  maxTrajectoryPayloadBytes: AGENT_BUDGET_DEFAULTS.guards.maxTrajectoryPayloadBytes,
  maxWorkflowAgentLoopSteps: AGENT_BUDGET_DEFAULTS.maxSteps.workflowAgentLoop,
  maxSubagentSteps: AGENT_BUDGET_DEFAULTS.maxSteps.subagent,
  maxSubagentStepsCeiling: AGENT_BUDGET_DEFAULTS.maxSteps.subagentCeiling,
  // 改造前分别是 payload-guard.ts 的 MAX_PAYLOAD_BYTES(64KB) 与 DEEP_SCAN_MAX_DEPTH(8)
  maxEventPayloadBytes: AGENT_BUDGET_DEFAULTS.guards.maxEventPayloadBytes,
  maxEventScanDepth: AGENT_BUDGET_DEFAULTS.guards.maxDeepScanDepth,
}

let current: RuntimeLimits = { ...RUNTIME_LIMITS_DEFAULTS }

/** 读当前限额（各使用点直接调用；未注入时即内置默认） */
export function runtimeLimits(): RuntimeLimits {
  return current
}

/**
 * 注入限额（启动时由 workflow-boot 从 `agent:budget` 调用一次）。
 * 非法值（非有限正数）忽略并保留原值——护栏宁可保守也不要被脏配置打穿。
 */
export function setRuntimeLimits(patch: Partial<RuntimeLimits>): RuntimeLimits {
  const next = { ...current }
  for (const key of Object.keys(RUNTIME_LIMITS_DEFAULTS) as Array<keyof RuntimeLimits>) {
    const v = patch[key]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) next[key] = Math.floor(v)
  }
  // 步数顶不得低于缺省步数（否则子代理一启动就被夹死）
  if (next.maxSubagentStepsCeiling < next.maxSubagentSteps) {
    next.maxSubagentStepsCeiling = next.maxSubagentSteps
  }
  current = next
  return current
}

/** 测试用：恢复内置默认 */
export function resetRuntimeLimits(): void {
  current = { ...RUNTIME_LIMITS_DEFAULTS }
}

/** 便捷：从解析后的预算映射出限额（workflow-boot 用；也便于单测） */
export function runtimeLimitsFromBudget(budget: {
  guards: AgentBudgetGuards
  maxSteps: { workflowAgentLoop: number; subagent: number; subagentCeiling: number }
}): RuntimeLimits {
  return {
    maxArtifactBytes: budget.guards.maxArtifactBytes,
    maxTranscriptMessageBytes: budget.guards.maxTranscriptMessageBytes,
    maxTrajectoryPayloadBytes: budget.guards.maxTrajectoryPayloadBytes,
    maxWorkflowAgentLoopSteps: budget.maxSteps.workflowAgentLoop,
    maxSubagentSteps: budget.maxSteps.subagent,
    maxSubagentStepsCeiling: budget.maxSteps.subagentCeiling,
    maxEventPayloadBytes: budget.guards.maxEventPayloadBytes,
    maxEventScanDepth: budget.guards.maxDeepScanDepth,
  }
}
