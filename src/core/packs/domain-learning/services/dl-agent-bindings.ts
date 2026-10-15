/**
 * 领域学习 Agent 工具绑定组装（M2-B 采集扩展；纯函数便于 TDD）
 * @module packs/domain-learning/services/dl-agent-bindings
 *
 * 宿主每轮 sendMessage 的 bindings 由本模块按「模式 + 可用工具」组装：
 * - 动作工具 dl_*（两种模式都带）+ 系统透出 discover/invoke_skill（都带）；
 * - research 模式额外带「读工具」（采集，全部免人工审批的读侧）：
 *   wf_kb_retrieve（知识库检索）/ wf_web_extract（网页正文）/ http_get（API/原文，
 *   如 arXiv export.arxiv.org）常备；web_search 仅在配置了默认联网搜索源时 bind
 *   （无默认源绑了也会被模型当成可搜索，宁可显式不给）。
 * - tutor 模式不带读工具（答疑引证 = 快照注入的讲义/图，防工具滥用，M1 口径不变）；
 * - task 模式与 research 同级（任务执行：读工具采集 + dl 动作落库 + 系统透出）。
 * 读工具均在 workflow-boot 注册为裸名（source=builtin/node），宿主 registry 缺失的
 * 名字会在此被过滤（buildToolDefs 对未注册引用仅 warn 跳过——这里显式交集更可控）。
 */

import type { AgentToolBinding } from '@shared/types/agent.types'
import { AGENT_BUDGET_DEFAULTS } from '@shared/types/agent-budget.types'
import {
  DL_SAVE_BUDGET_MAX,
  DL_SYSTEM_PASSTHROUGH,
  DL_TASK_WORKFLOW_TOOLS,
  type DlAgentMode,
} from './dl-agent.types'
import { DL_TASK_PROGRESS_TOOL, dlAgentToolNames, dlToolMaxCalls } from './dl-agent-tools'

/** 研究模式常备读工具（采集闭环；名称与 node-tool-adapter / agent-builtin-tools 注册名一致） */
export const DL_READ_TOOL_NAMES = ['wf_kb_retrieve', 'wf_web_extract', 'http_get'] as const

/** 按默认搜索源可用性条件启用的读工具 */
export const DL_WEB_SEARCH_TOOL = 'web_search'

/**
 * 读工具频控默认值（bind 时写入 maxCalls）。
 * 2026-09-13 起默认值来自平台预算表，可由 `agent:budget`.maxCalls.read 覆盖。
 */
export const DL_READ_TOOL_MAX_CALLS: Record<string, number> = AGENT_BUDGET_DEFAULTS.maxCalls.read

export interface DlBindingOptions {
  mode: DlAgentMode
  /** registry 当前可用工具名（缺省=不过滤，信任注册完整） */
  availableToolNames?: Iterable<string>
  /** 默认联网搜索源是否可用（决定是否 bind web_search） */
  webSearchAvailable: boolean
  /**
   * 「规划落库轮」额度（起步研究 / 已确认方案的落库轮）：覆盖 dl_save_concept 与
   * dl_save_relation 的默认频控（见 `DL_PLANNING_SAVE_BUDGET` 的复盘说明）。
   * 缺省 = 用默认值；传入值会被夹到 `budgetMax`（缺省 `DL_SAVE_BUDGET_MAX`）。
   */
  saveBudget?: { concepts: number; relations: number }
  /** 落库额度硬上限（来自 `agent:budget`.domainLearning.maxSaveBudget；缺省用默认值） */
  budgetMax?: number
  /**
   * 平台级工具频控覆盖表（来自 `agent:budget`.maxCalls.byTool）：键为工具名，命中即覆盖默认。
   * 2026-09-13 用户需求——这类数值不再写死，允许在设置页调整。
   */
  toolMaxCalls?: Record<string, number>
  /** 采集读工具预算覆盖（来自 `agent:budget`.maxCalls.read） */
  readMaxCalls?: Record<string, number>
}

/** 额度夹取（≥1 且不超过硬上限） */
function clampBudget(n: number, max: number): number {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return 1
  return Math.max(1, Math.min(Math.max(1, Math.floor(max)), v))
}

/**
 * 本轮是不是「规划落库轮」——要在一轮里批量建"分支目录 + 知识点 + 前置边"。
 * 入口（2026-09-13 起）：
 * 1. **起步研究**：空空间的 research 轮（首次生成首批知识）；
 * 2. **补全知识地图**：task 轮带补图标记/同义意图（用户点按钮或直接说"补全知识体系"）；
 * 3. **固定流程确认轮**（2026-10-05 补）：research/task 轮消息带【已确认诉求理解】/
 *   【已确认知识体系】标记。第 3 步轮次此前靠"确认时空间还是空的"误打误撞命中
 *   isEmptySpace——现在骨架在确认时已由系统确定性落库，快照不再为空，必须显式认标记，
 *   否则阶段指令不注入、落库门禁对不上。
 */
export function isPlanningSaveRound(input: {
  mode: DlAgentMode
  isEmptySpace: boolean
  /** task 模式的消息原文（research 轮不看它） */
  message?: string | null
  /** 是否命中"补全知识地图"意图（由调用方注入判定，避免本模块依赖消息文案实现） */
  wantsMapCompletion?: boolean
}): boolean {
  if (input.mode === 'research') return input.isEmptySpace || !!input.wantsMapCompletion
  if (input.mode === 'task') return !!input.wantsMapCompletion
  return false
}

/** 按模式 + 可用工具组装 bindings（顺序：动作 → 读工具 → 系统透出） */
export function buildDlBindings(o: DlBindingOptions): AgentToolBinding[] {
  const budgetMax = o.budgetMax ?? DL_SAVE_BUDGET_MAX
  const actionBase = dlAgentToolNames().map((tool) => {
    let maxCalls = dlToolMaxCalls(tool, o.toolMaxCalls)
    if (o.saveBudget) {
      if (tool === 'dl_save_concept') maxCalls = clampBudget(o.saveBudget.concepts, budgetMax)
      if (tool === 'dl_save_relation') maxCalls = clampBudget(o.saveBudget.relations, budgetMax)
    }
    return { tool, maxCalls }
  })
  // task 模式额外附「进度上报」（子任务结构化展示；只上报不落库）
  const actionBindings: AgentToolBinding[] =
    o.mode === 'task'
      ? [...actionBase, { tool: DL_TASK_PROGRESS_TOOL, maxCalls: dlToolMaxCalls(DL_TASK_PROGRESS_TOOL, o.toolMaxCalls) }]
      : actionBase
  // task 会话额外透出平台工作流工具（run_workflow/get_workflow_run；registry 有才生效，其余模式不暴露）
  const sysTools =
    o.mode === 'task'
      ? [...DL_SYSTEM_PASSTHROUGH, ...DL_TASK_WORKFLOW_TOOLS]
      : [...DL_SYSTEM_PASSTHROUGH]
  const systemBindings = sysTools.map((tool) => ({ tool }))

  const available = o.availableToolNames ? new Set(o.availableToolNames) : null
  const keep = (name: string): boolean => !available || available.has(name)
  const readWanted = [
    ...DL_READ_TOOL_NAMES,
    ...(o.webSearchAvailable ? [DL_WEB_SEARCH_TOOL] : []),
  ]
  const readBindings = readWanted
    .filter(keep)
    .map((tool) => ({ tool, maxCalls: o.readMaxCalls?.[tool] ?? DL_READ_TOOL_MAX_CALLS[tool] ?? 3 }))

  if (o.mode === 'verify') {
    // 内部核验：只读(读工具+系统透出),不带任何 dl 写动作
    return [...readBindings, ...systemBindings]
  }
  // task 模式与 research 同级：动作 + 读工具 + 系统透出（按指令执行可读资料/落库）
  if (o.mode !== 'research' && o.mode !== 'task') {
    return [...actionBindings, ...systemBindings]
  }

  return [...actionBindings, ...readBindings, ...systemBindings]
}
