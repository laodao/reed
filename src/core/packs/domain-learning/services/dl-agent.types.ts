/**
 * 领域学习 Agent 常量与类型（M1，基于 agent-harness HostKit）
 * @module packs/domain-learning/services/dl-agent.types
 *
 * 宿主形态：一个 DlAgentHarnessService 承载两种模式（共用 createHostKit）：
 * - research：对概念/未解问题跑研究（skill 产出 + dl_save_* 草稿落库，经 UI 人审）；
 * - tutor：追问答疑（dl_question 队列承载一问一答，答上有据/答不上留 open）。
 * 事件面仿 EP：reply 流式走 dl:generate:<eventId>；动作事件走 dl:agent:<spaceId> 通道。
 */

/** 工具注册 packId（共享 registry 命名空间 pack:dl-agent:*） */
export const DL_AGENT_PACK_ID = 'dl-agent'

/** 宿主 definitionId（区分于 scopeKey 的对话标识） */
export const DL_AGENT_DEFINITION_ID = 'dl-agent-host'

/** 每轮最大步骤（react 循环护栏） */
export const DL_AGENT_MAX_STEPS = 12

/** 历史注入截断（单条字符上限） */
export const DL_HISTORY_CONTENT_MAX = 800

/** 历史条数上限（seededHistory） */
export const DL_HISTORY_LIMIT = 20

/** 每轮工具频控（成本/防抖；bind 时写入 maxCalls） */
export const DL_TOOL_MAX_CALLS: Record<string, number> = {
  discover_capabilities: 2, // M3-A：允许目录纠错重查（id 直接调用命中）
  invoke_skill: 6,
  dl_save_concept: 8,
  dl_save_relation: 10,
  dl_save_card: 4,
  dl_answer_question: 1,
}

/** 工具名常量 */
export const DL_TOOL_DISCOVER = 'discover_capabilities'
export const DL_TOOL_INVOKE_SKILL = 'invoke_skill'

/** 系统透出工具（规划/技能；裸名，宿主白名单直接引用） */
export const DL_SYSTEM_PASSTHROUGH = [DL_TOOL_DISCOVER, DL_TOOL_INVOKE_SKILL] as const
/** task 会话额外透出的平台工作流工具（仅 task bind；registry 由 system-agent 注册，存在才 bind） */
export const DL_TASK_WORKFLOW_TOOLS = ['run_workflow', 'get_workflow_run'] as const
export const DL_TOOL_SAVE_CONCEPT = 'dl_save_concept'
export const DL_TOOL_SAVE_RELATION = 'dl_save_relation'
export const DL_TOOL_SAVE_CARD = 'dl_save_card'
export const DL_TOOL_ANSWER_QUESTION = 'dl_answer_question'

/** 宿主模式（verify：内部自动核验只读会话，不面向 IPC/UI） */
export type DlAgentMode = 'research' | 'tutor' | 'task' | 'verify'

/** 会话作用域：research=目标概念/问题研究；tutor=空间+概念（可空=空间级泛问）；
 *  task=按用户指令执行任务（空间级/概念级，可拆子任务，不落 dl_question） */
export interface DlScopeRef {
  spaceId: string
  /** research/tutor 模式：研究对象/当前讲义概念；task 模式：任务作用域（可空=空间级） */
  conceptId?: string | null
}

/** scopeKey 生成（busy/协调器 map 的键） */
export function dlScopeKey(mode: DlAgentMode, scope: DlScopeRef): string {
  const c = scope.conceptId ?? '_'
  return `dl-agent:${mode}:${scope.spaceId}:${c}`
}

/** 事件通道（动作级事件；reply 流式另走 dl:generate:<eventId>） */
export function dlAgentEventChannel(spaceId: string, conceptId?: string | null): string {
  return conceptId ? `dl:agent:${spaceId}:${conceptId}` : `dl:agent:${spaceId}`
}

/** sendMessage 结果（与前端对话外观最小契约） */
export interface DlAgentSendResult {
  /** 本轮产生的动作摘要（工具落库摘要） */
  actionSummaries: DlAgentActionSummary[]
  content: string
  /** tutor 模式：本条追问的 dl_question id（无概念泛问可空） */
  questionId?: string | null
  suggestions: string[]
}

/** 工具动作完成摘要（emit 事件回流给宿主汇总） */
export interface DlAgentActionSummary {
  tool: string
  status: 'ok' | 'skipped' | 'error'
  message: string
  data?: unknown
}

/** 领域学习业务动作执行上下文（工具内还原） */
export interface DlAgentExecutionContext {
  spaceId: string
  conceptId?: string | null
  /** 未解问题研究：本轮聚焦的 dl_question id（dl_answer_question 缺省回填） */
  questionId?: string | null
  providerConfigId?: string
  modelId?: string
  db: import('@core/database/database-manager.interface').ICoreDatabaseManager
  emit: (event: DlAgentEvent) => void
}

/** dl 宿主事件（前端通道契约） */
export interface DlAgentEvent {
  type: 'stage' | 'reply:start' | 'reply:done' | 'error' | 'action:done' | 'question:open'
  stage?: 'deciding' | 'acting'
  summaryEventId?: string
  error?: string
  tool?: string
  summary?: DlAgentActionSummary
  questionId?: string
  suggestions?: string[]
}
