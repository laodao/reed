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
import { DL_SYSTEM_PASSTHROUGH, type DlAgentMode } from './dl-agent.types'
import { DL_TASK_PROGRESS_TOOL, dlAgentToolNames, dlToolMaxCalls } from './dl-agent-tools'

/** 研究模式常备读工具（采集闭环；名称与 node-tool-adapter / agent-builtin-tools 注册名一致） */
export const DL_READ_TOOL_NAMES = ['wf_kb_retrieve', 'wf_web_extract', 'http_get'] as const

/** 按默认搜索源可用性条件启用的读工具 */
export const DL_WEB_SEARCH_TOOL = 'web_search'

/** 读工具频控（bind 时写入 maxCalls；成本/防抖护栏） */
export const DL_READ_TOOL_MAX_CALLS: Record<string, number> = {
  wf_kb_retrieve: 4,
  wf_web_extract: 3,
  http_get: 4,
  web_search: 3,
}

export interface DlBindingOptions {
  mode: DlAgentMode
  /** registry 当前可用工具名（缺省=不过滤，信任注册完整） */
  availableToolNames?: Iterable<string>
  /** 默认联网搜索源是否可用（决定是否 bind web_search） */
  webSearchAvailable: boolean
}

/** 按模式 + 可用工具组装 bindings（顺序：动作 → 读工具 → 系统透出） */
export function buildDlBindings(o: DlBindingOptions): AgentToolBinding[] {
  const actionBase = dlAgentToolNames().map((tool) => ({ tool, maxCalls: dlToolMaxCalls(tool) }))
  // task 模式额外附「进度上报」（子任务结构化展示；只上报不落库）
  const actionBindings: AgentToolBinding[] =
    o.mode === 'task'
      ? [...actionBase, { tool: DL_TASK_PROGRESS_TOOL, maxCalls: 12 }]
      : actionBase
  const systemBindings = DL_SYSTEM_PASSTHROUGH.map((tool) => ({ tool }))

  const available = o.availableToolNames ? new Set(o.availableToolNames) : null
  const keep = (name: string): boolean => !available || available.has(name)
  const readWanted = [
    ...DL_READ_TOOL_NAMES,
    ...(o.webSearchAvailable ? [DL_WEB_SEARCH_TOOL] : []),
  ]
  const readBindings = readWanted
    .filter(keep)
    .map((tool) => ({ tool, maxCalls: DL_READ_TOOL_MAX_CALLS[tool] ?? 3 }))

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
