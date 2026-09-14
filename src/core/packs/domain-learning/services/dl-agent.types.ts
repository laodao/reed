/**
 * 领域学习 Agent 常量与类型（M1，基于 agent-harness HostKit）
 * @module packs/domain-learning/services/dl-agent.types
 *
 * 宿主形态：一个 DlAgentHarnessService 承载两种模式（共用 createHostKit）：
 * - research：对概念/未解问题跑研究（skill 产出 + dl_save_* 草稿落库，经 UI 人审）；
 * - tutor：追问答疑（dl_question 队列承载一问一答，答上有据/答不上留 open）。
 * 事件面仿 EP：reply 流式走 dl:generate:<eventId>；动作事件走 dl:agent:<spaceId> 通道。
 *
 * 预算类数值（步数 / 每工具调用上限 / 落库额度）：**默认值统一来自平台预算表**
 * `@shared/types/agent-budget.types`，可由 settings 表 `agent:budget` 覆盖（2026-09-13 用户需求：
 * 这类参数不该写死在代码里）。本文件里的常量只是"默认值的本地别名"，不要在此新增魔法数字。
 */

import { AGENT_BUDGET_DEFAULTS } from '@shared/types/agent-budget.types'

/** 工具注册 packId（共享 registry 命名空间 pack:dl-agent:*） */
export const DL_AGENT_PACK_ID = 'dl-agent'

/** 宿主 definitionId（区分于 scopeKey 的对话标识） */
export const DL_AGENT_DEFINITION_ID = 'dl-agent-host'

/**
 * 单轮最大步骤（research 模式）。
 * 2026-09-13 起：数值来自平台级预算默认表（`AGENT_BUDGET_DEFAULTS.maxSteps.research`），
 * 用户可在 settings 表 `agent:budget` 覆盖（设置页「参数设置 → 领域共学」）。
 */
export const DL_AGENT_MAX_STEPS = AGENT_BUDGET_DEFAULTS.maxSteps.research

/**
 * task 模式每轮最大步骤（更大预算）。
 * 口径（2026-09-12 用户要求"先查资料再规划整体体系"）：补全知识地图这类任务要
 * 「先采集（KB/联网）→ 再规划 → 再落库（批量建点建边）→ 自检」四阶段，
 * 12 步容易在采集后没步数落库，故 task 单独放宽（仅影响 task 会话，成本有界）。
 */
export const DL_TASK_MAX_STEPS = AGENT_BUDGET_DEFAULTS.maxSteps.task

/** 历史注入截断（单条字符上限） */
export const DL_HISTORY_CONTENT_MAX = 800

/** 历史条数上限（seededHistory） */
export const DL_HISTORY_LIMIT = 20

/** dl 动作工具名（预算默认表按名前缀挑选 dl_* 用；工具清单本身以 dl-agent-tools 为准） */
const DL_TOOL_NAMES_FOR_BUDGET = [
  'discover_capabilities',
  'invoke_skill',
  'dl_save_concept',
  'dl_save_relation',
  'dl_save_space_prereqs',
  'dl_save_card',
  'dl_answer_question',
  'dl_propose_understanding',
  'dl_propose_syllabus',
  'dl_task_progress',
] as const

/**
 * 每轮工具频控（成本/防抖；bind 时写入 maxCalls）。
 * 2026-09-13 起数值来自平台预算默认表（用户可在 `agent:budget` 覆盖；宿主经 bindings 传入）。
 */
export const DL_TOOL_MAX_CALLS: Record<string, number> = Object.fromEntries(
  DL_TOOL_NAMES_FOR_BUDGET.map((name) => [name, AGENT_BUDGET_DEFAULTS.maxCalls.byTool[name] ?? 3]),
)

/**
 * 「规划落库轮」的落库额度（2026-09-13 用户实测「金融理财」起步研究复盘）。
 *
 * 背景：默认 12 次概念额度是按"3-6 个核心知识点"定的（2026-09-10 口径）。09-12 引入
 * **分支目录**后，目录与知识点共用同一份额度：一次起步研究要建 4-6 个分支 + 10-20 个知识点，
 * 实测「金融理财」轮在 4 分支 + 6 知识点后就用满 12 次，随后「保险与风险转移」
 * 「资产配置与分散化」「指数基金与定投」三个知识点被 LIMIT_EXCEEDED 拒掉——
 * 于是「投资与配置」分支下没有任何子知识点，且总结里只报成功数，缺口无声消失。
 *
 * 2026-09-13 起改由 `agent:budget` 的 `dl.saveBudget` 配置（此处为默认值派生）。
 */
export const DL_PLANNING_SAVE_BUDGET: { concepts: number; relations: number } =
  AGENT_BUDGET_DEFAULTS.domainLearning.saveBudget

/** 落库额度硬上限（配置值一律夹到这里；默认值派生自预算默认表） */
export const DL_SAVE_BUDGET_MAX = AGENT_BUDGET_DEFAULTS.domainLearning.maxSaveBudget

/** 工具名常量 */
export const DL_TOOL_DISCOVER = 'discover_capabilities'
export const DL_TOOL_INVOKE_SKILL = 'invoke_skill'

/** 系统透出工具（规划/技能；裸名，宿主白名单直接引用） */
export const DL_SYSTEM_PASSTHROUGH = [DL_TOOL_DISCOVER, DL_TOOL_INVOKE_SKILL] as const
/** task 会话额外透出的平台工作流工具（仅 task bind；registry 由 system-agent 注册，存在才 bind） */
export const DL_TASK_WORKFLOW_TOOLS = ['run_workflow', 'get_workflow_run'] as const
export const DL_TOOL_SAVE_CONCEPT = 'dl_save_concept'
export const DL_TOOL_SAVE_RELATION = 'dl_save_relation'
export const DL_TOOL_SAVE_SPACE_PREREQS = 'dl_save_space_prereqs'
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

/** 事件通道（动作级事件；reply 流式另走 dl:generate:<eventId>）
 *  2026-09-09 复盘：实现收敛到 shared/utils/domain-learning-event（三端唯一） */
export { dlAgentEventChannel, dlStreamChannel } from '@shared/utils/domain-learning-event'

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
  /** 2026-09-09 复盘：本会话模式（工具 emit 事件时带上，前端按 mode 过滤防跨模式混流） */
  mode?: DlAgentMode
  /** 未解问题研究：本轮聚焦的 dl_question id（dl_answer_question 缺省回填） */
  questionId?: string | null
  /**
   * 本轮是不是「规划落库轮」（起步研究 / 补全知识地图；2026-09-13）。
   * 只在这类轮次上校验「知识体系是否已经用户确认」——单概念的普通研究轮不受影响。
   * 由宿主经 runtimeContext 注入（见 dl-agent-harness + dl-agent-bindings.isPlanningSaveRound）。
   */
  planningRound?: boolean
  providerConfigId?: string
  modelId?: string
  db: import('@core/database/database-manager.interface').ICoreDatabaseManager
  emit: (event: DlAgentEvent) => void
}

/** dl 宿主事件（前端通道契约；2026-09-09 复盘：事件带 mode，前端按发起模式过滤，
 *  防止同 space+concept 跨模式并发时(如 research∥tutor)事件互相污染） */
export interface DlAgentEvent {
  type: 'stage' | 'reply:start' | 'reply:done' | 'error' | 'action:done' | 'question:open' | 'progress'
  /** 产生本事件的会话模式（前端据此过滤；verify 内部会话已不上通道） */
  mode?: DlAgentMode
  stage?: 'deciding' | 'acting'
  summaryEventId?: string
  error?: string
  tool?: string
  summary?: DlAgentActionSummary
  questionId?: string
  suggestions?: string[]
  /**
   * 活动行（type='progress'；2026-09-13 用户需求「长任务要滚动显示系统正在做什么」）。
   *
   * 通道约定：**一律发在空间级通道** `dl:agent:<spaceId>`（不带 conceptId），
   * 这样空间页只需一条订阅就能显示任意概念轮的活动；事件里带 `conceptId` 供前端区分。
   * `kind='warn'` 表示失败/被额度拦截（必须可见，不许无声消失）。
   */
  activity?: {
    line: string
    kind?: 'info' | 'warn'
    conceptId?: string | null
    step?: number
    tool?: string
  }
}
