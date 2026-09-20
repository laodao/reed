/**
 * 系统级 Agent 工具集（28 号 M5 批1）
 * @module core/platform/workflow/tools/system-agent-tools
 *
 * 聊天宿主（对话框 Agent 模式）的可调度面：能力目录 / 运行工作流 / 查询运行 /
 * 调用技能 / 创建任务树 + 直连只读白名单。注册点在 workflow-boot（组合根）——
 * boot 顺序事实：业务包 activate 早于 workflow 子系统初始化，注册不能放 chat 包。
 *
 * 依赖方向（22 号 §3，同 builtin 工具）：本文件在 workflow 模块内装配并注册进
 * agent-runtime 的 AgentToolRegistry——harness 不认识任何具体工具；chat 包只经
 * registry.buildToolDefs 装配白名单（SYSTEM_AGENT_WHITELIST）。
 *
 * 边界（28 号 §7 + 31 号增补）：白名单无审批工具——聊天宿主无审批卡；写副作用
 * 为 run_workflow（工作流内部审批闸门照常生效）、create_task_plan（强制人工批准）
 * 与 create_workflow_draft（产物仅草稿，发布/运行是人的决定；无每轮频控——
 * maxSteps 隐式限 ~11 次/轮，登记为后续频控项）。
 */

import { z } from 'zod'
import { createLogger } from '@core/utils/logger'
import {
  WORKFLOW_NODE_TYPES,
  WORKFLOW_RUN_TERMINAL_STATUSES,
  WORKFLOW_TRIGGER_TYPES,
} from '@shared/types/workflow.types'
import type { AgentToolDef, AgentToolContext } from '@core/platform/agent-runtime/types'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import type { ResolveModelOptions } from '@core/platform/agent-runtime/provider/provider-adapter'
import type { WorkflowRunService } from '../workflow-run.service'
import type { WorkflowDefinitionService } from '../workflow-definition.service'
import type { AgentTaskService } from '@core/platform/agent-runtime/tasks/task-service'
import type { SkillService } from '../skills/skill.service'
import type { WorkflowDefinitionRecord } from '@core/database/repositories/workflow-definition.repository'
import type { WorkflowRunRecord } from '@core/database/repositories/workflow-run.repository'
import type { WorkflowNodeRunRecord } from '@core/database/repositories/workflow-node-run.repository'
import type { WorkflowStartInput } from '@shared/types/workflow.types'
import { workflowRuntimeParams } from '@shared/utils/workflow-runtime-params'
import type { LanguageModel } from 'ai'
import { renderSkillTemplate, withSkillReferences } from '../skills/render'
import type { WorkflowDraftService } from '../draft/workflow-draft.service'
import { filterModuleCapabilityCards } from './module-capability-catalog'

const logger = createLogger('SystemAgentTools')

// —— 目录封顶（防上下文爆炸）——与 registry 管线的 TOOL_RESULT_ARRAY_KEEP=20 对齐：
// 超出部分由管线截断并注记 _truncated，agent 可用 keyword 收窄再查，此处不再放大。
//
// 注意（2026-09-13 参数设置）：下面这批导出常量现在是**内置默认值**，
// 真正的生效值在使用点从「参数设置 → 工作流 → 系统工具面」现读
// （`workflowRuntimeParams().systemTools`）。保留导出是因为既有单测拿它们当"默认口径"。
export const CATALOG_MAX_WORKFLOWS = 20
export const CATALOG_MAX_SKILLS = 20
export const CATALOG_MAX_TOOLS = 20
// —— run_workflow 终态轮询 ——
export const RUN_WORKFLOW_POLL_INTERVAL_MS = 2_000
export const RUN_WORKFLOW_WAIT_TIMEOUT_MS = 180_000
/** 节点摘要条数上限（超出的以 nodesTotal 注记） */
export const NODE_SUMMARY_MAX = 20
/** 节点 output 摘要字符上限（agent 汇报用的最小可信切片） */
export const NODE_OUTPUT_DIGEST_MAX = 400
/** 错误消息里的运行摘要上限（防失控错误串灌大模型上下文——对抗 review P2） */
export const RUN_ERROR_DIGEST_MAX = 2_000
/** getRunDetail 连续不可见次数上限（运行被删/异常数据——不再空等满超时） */
export const RUN_MISSING_STREAK_LIMIT = 3

/** 生效的「系统工具面」参数（使用点现读） */
const systemToolsParams = (): import('@shared/types/workflow-params.types').WorkflowSystemToolsParams =>
  workflowRuntimeParams().systemTools

/** 直连白名单（registry 既有工具，聊天宿主直接装配；写/审批工具一律不进） */
export const SYSTEM_AGENT_TOOL_NAMES = [
  'discover_capabilities',
  'run_workflow',
  'get_workflow_run',
  'invoke_skill',
  'create_task_plan',
  'create_workflow_draft',
] as const

export const SYSTEM_AGENT_PASSTHROUGH_TOOLS = [
  'web_search',
  'wf_web_extract',
  'http_get',
  'data_table_query',
  // 本地读类两件（44 号）：免审批（围栏限定+只读）；写/执行类等聊天审批卡立项
  'fs_read_file',
  'fs_list_dir',
] as const

export const SYSTEM_AGENT_WHITELIST: string[] = [...SYSTEM_AGENT_TOOL_NAMES, ...SYSTEM_AGENT_PASSTHROUGH_TOOLS]

/**
 * 每轮引用收集（前端卡片数据源，28 号 §2）：系统工具执行时把产生的运行/任务树/
 * 技能引用推入本轮 sink。sink 由聊天宿主经 AgentTask.runtimeContext.turnRefs
 * 注入（对象引用随 logContext 同步传播，无 ALS/timer 断链风险）。
 */
export interface SystemAgentTurnRef {
  kind: 'workflow_run' | 'task_tree' | 'skill' | 'workflow_draft'
  id: string
  label: string
}

export function collectSystemAgentRef(ctx: AgentToolContext, ref: SystemAgentTurnRef): void {
  const sink = (ctx.logContext as { turnRefs?: unknown } | undefined)?.turnRefs
  if (Array.isArray(sink)) sink.push(ref)
}

export interface SystemAgentToolsDeps {
  registry: AgentToolRegistry
  runService: Pick<WorkflowRunService, 'startRun' | 'getRunDetail'>
  definitions: Pick<WorkflowDefinitionService, 'list'>
  /** 任务树子系统未装配（M3 降级）时为 null——create_task_plan 结构化报错 */
  tasks: Pick<AgentTaskService, 'createPlan'> | null
  skills: Pick<SkillService, 'list' | 'resolveSkill'>
  resolveModel: (opts?: ResolveModelOptions) => Promise<LanguageModel>
  /** NL→工作流草稿生成（31 号 M7；未装配为 undefined——工具结构化报错） */
  drafts?: WorkflowDraftService
  clock?: () => number
}

// ==================== 入参 schema ====================

const DiscoverCapabilitiesInput = z.object({
  keyword: z.string().optional().describe('按名称/描述过滤模块能力卡、工作流与技能（可选；目录被截断时用它收窄）'),
})

const RunWorkflowInput = z.object({
  definitionId: z.string().describe('工作流定义 id（先 discover_capabilities 获取）'),
  inputs: z.record(z.string(), z.unknown()).optional().describe('开始节点参数（key → 值，见目录中该工作流的 inputs）'),
})

const GetWorkflowRunInput = z.object({
  runId: z.string().describe('运行 id（run_workflow 返回或用户提及）'),
})

const InvokeSkillInput = z.object({
  skillId: z.string().describe('技能 id（先 discover_capabilities 获取）'),
  params: z.record(z.string(), z.string()).optional().describe('技能参数（{{param.key}} 占位值）'),
})

const CreateTaskPlanInput = z.object({
  goal: z.string().min(1).max(4000).describe('完整、自含的目标描述（批准后将由任务树自主分解执行）'),
  title: z.string().max(100).optional().describe('短标题（缺省取目标前若干字）'),
})

const CreateWorkflowDraftInput = z.object({
  description: z.string().min(1).max(4000).describe('工作流的完整功能描述：做什么、输入是什么、产出什么'),
  name: z.string().max(100).optional().describe('工作流名称（缺省从描述提炼）'),
})

// ==================== 纯函数（可独立单测） ====================

/** 提取工作流 start 节点参数 schema（目录展示 + agent 填参依据） */
export function extractStartInputs(def: WorkflowDefinitionRecord): Array<{ key: string; label: string; type: string; required: boolean }> {
  const graph = def.publishedGraph ?? def.draftGraph
  if (!graph) return []
  const start = graph.nodes.find((n) => n.type === WORKFLOW_NODE_TYPES.start)
  const inputs = (start?.config as { inputs?: WorkflowStartInput[] } | undefined)?.inputs ?? []
  return inputs.map((i) => ({
    key: i.key,
    label: i.label,
    type: i.type,
    required: i.required === true,
  }))
}

/** 运行摘要（run_workflow 终态返回 / get_workflow_run 共用） */
export function summarizeRun(detail: { run: WorkflowRunRecord; nodeRuns: WorkflowNodeRunRecord[] }): Record<string, unknown> {
  const { run, nodeRuns } = detail
  const nodes = nodeRuns.slice(0, systemToolsParams().nodeSummaryMax).map((n) => ({
    node: n.nodeName || n.nodeId,
    type: n.nodeType,
    status: n.status,
    error: n.error ?? undefined,
    output: n.output && Object.keys(n.output).length > 0 ? digest(n.output) : undefined,
  }))
  return {
    runId: run.id,
    definitionId: run.definitionId,
    status: run.status,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    error: run.error ?? undefined,
    stats: run.stats ?? undefined,
    nodes,
    nodesTotal: nodeRuns.length,
  }
}

function digest(value: unknown, max = systemToolsParams().nodeOutputDigestChars): string {
  let s: string
  try {
    s = JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
  return s.length <= max ? s : `${s.slice(0, max)}…[truncated]`
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    // listener 用完即拆（对抗 review P2：180s 轮询曾堆 ~90 个 abort 监听器）
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 等待运行到终态（waiting_review 视为"需人工"即时返回，不空等审批）。
 * 运行连续不可见（被删/异常数据）→ 返回 unavailable，由调用方转结构化失败。
 */
export async function waitForRunTerminal(
  deps: Pick<SystemAgentToolsDeps, 'runService' | 'clock'>,
  runId: string,
  signal?: AbortSignal,
): Promise<{ run: WorkflowRunRecord; nodeRuns: WorkflowNodeRunRecord[] } | { status: string; note: string; unavailable?: boolean }> {
  const clock = deps.clock ?? (() => Date.now())
  const params = systemToolsParams()
  const deadline = clock() + params.runWaitTimeoutMs
  let lastStatus = 'pending'
  let missingStreak = 0
  while (clock() < deadline) {
    const detail = await deps.runService.getRunDetail(runId)
    if (detail) {
      missingStreak = 0
      lastStatus = detail.run.status
      if (WORKFLOW_RUN_TERMINAL_STATUSES.has(lastStatus)) return detail
      if (lastStatus === 'waiting_review') {
        return { status: lastStatus, note: '运行等待人工审核（工作流内部审批闸门）——请在工作流运行详情页处理，稍后可用 get_workflow_run 查询结果。' }
      }
    } else if (++missingStreak >= params.runMissingStreakLimit) {
      return { status: 'unavailable', unavailable: true, note: `运行记录不可见（可能已删除）：${runId}` }
    }
    if (signal?.aborted) return { status: lastStatus, note: '等待已取消。' }
    await sleep(params.runPollIntervalMs, signal)
  }
  return { status: lastStatus, note: `等待超时（${Math.round(params.runWaitTimeoutMs / 1000)}s）——工作流仍在运行，稍后可用 get_workflow_run 查询结果。` }
}

// ==================== 工具定义 ====================

export function buildSystemAgentToolDefs(deps: SystemAgentToolsDeps): AgentToolDef<any>[] {
  // AgentToolDef 的 TInput 在 execute 参数位逆变，具体入参类型无法直接赋给
  // AgentToolDef<unknown>——本数组以 any 收口（运行时入参仍经 registry 管线
  // zod safeParse 校验，any 不泄漏到校验路径）
  const discoverTool: AgentToolDef<z.infer<typeof DiscoverCapabilitiesInput>> = {
    name: 'discover_capabilities',
    description:
      '列出本系统可调度的能力：功能模块能力卡（各模块能做什么、典型指令、调用路径）、工作流（含开始节点参数 schema）、技能（含参数）、直连工具、本宿主开放的模块域工具、任务树。执行任务前先查目录，匹配到既有工作流/技能就复用，不要重复造轮子。',
    inputSchema: DiscoverCapabilitiesInput,
    dangerLevel: 'read',
    execute: async (input, ctx) => {
      const keyword = input.keyword?.trim() || undefined
      const catalogMax = systemToolsParams().catalogMaxItems
      // 当前对话所配模型（runtimeContext.turnModel）：内置工作流的 model 类必填参数
      // 提交值格式为 {providerConfigId, modelId}——不透出它，agent 只能让用户去设置页
      // 查 Provider 名，统一入口就堵死在这类参数上
      const turnModel = (ctx.logContext as { turnModel?: { providerConfigId?: string; modelId?: string } } | undefined)?.turnModel
      // 模块能力卡（keyword 收窄；卡数远小于封顶，slice 只是防御）
      const modules = filterModuleCapabilityCards(keyword)
        .slice(0, catalogMax)
        .map((c) => ({
          moduleId: c.moduleId,
          name: c.name,
          tagline: c.tagline,
          intents: c.intents,
          capabilities: c.capabilities,
          invocation: c.invocation,
        }))
      const wfPage = await deps.definitions.list({ keyword, page: 1, pageSize: catalogMax })
      const workflows = wfPage.items.slice(0, catalogMax).map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description ?? '',
        hasPublished: !!d.publishedGraph,
        inputs: extractStartInputs(d),
      }))
      const kw = (keyword ?? '').toLowerCase()
      const allSkills = deps.skills.list().filter((s) => s.modelInvocable)
      // keyword 命中面扩大到 id / whenToUse（历史缺口：learning-* id 英文、展示名中文，
      // 只按名称/描述过滤会 0 命中而总数却报全量——M3-A）
      const kwHit = (s: (typeof allSkills)[number]): boolean =>
        !kw ||
        [s.id, s.name, s.description, s.whenToUse ?? ''].some((f) => f.toLowerCase().includes(kw))
      const matchedSkills = allSkills.filter(kwHit)
      const skills = matchedSkills
        .slice(0, catalogMax)
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          whenToUse: s.whenToUse ?? '',
          inputs: (s.inputs ?? []).map((i) => ({ key: i.key, label: i.label, type: i.type, required: i.required === true })),
        }))
      const tools = deps.registry
        .listSpecs()
        // 只兜售聊天宿主白名单内的工具（对抗 review P3：列白名单外工具=诱导模型
        // 调用必败的 NOT_WHITELISTED，白耗步数）
        .filter((s) => (SYSTEM_AGENT_WHITELIST as readonly string[]).includes(s.name))
        .filter((s) => !SYSTEM_AGENT_TOOL_NAMES.includes(s.name as (typeof SYSTEM_AGENT_TOOL_NAMES)[number]))
        .slice(0, catalogMax)
        .map((s) => ({ name: s.name, description: s.description, requiresApproval: s.requiresApproval }))
      // 模块域工具（pack 命名空间，M6.5 共享注册）：只列当前宿主经 runtimeContext
      // 声明开放的 pack（catalogPacks）——不声明的宿主（如聊天）一律为空，
      // 沿用"列白名单外工具=诱导必败调用"的 review P3 红线
      const catalogPacks = Array.isArray((ctx.logContext as { catalogPacks?: unknown } | undefined)?.catalogPacks)
        ? ((ctx.logContext as { catalogPacks?: unknown }).catalogPacks as string[]).filter((x) => typeof x === 'string')
        : []
      const moduleTools = catalogPacks
        .flatMap((pid) => deps.registry.listSpecs({ packId: pid }))
        .slice(0, catalogMax)
        .map((s) => ({ name: s.name, description: s.description, requiresApproval: s.requiresApproval }))
      return {
        modules,
        modulesNote: 'modules=系统功能模块能力卡：按典型指令匹配模块，按 invocation 里的路径调用能力（tool=直连工具 / workflow=工作流 / skill=invoke_skill / ui=引导用户到页面）。',
        turnModel,
        turnModelNote: turnModel
          ? `当前对话模型：${turnModel.modelId}（providerConfigId=${turnModel.providerConfigId}）。run_workflow 的 model 类必填参数直接用它，不要让用户去设置页查。`
          : '',
        workflows,
        workflowsTotal: wfPage.total,
        skills,
        skillsTotal: matchedSkills.length,
        tools,
        moduleTools,
        moduleToolsNote: moduleTools.length > 0 ? '以上模块域工具仅在本宿主可用；跨模块操作请用 create_task_plan。' : '',
        taskPlan:
          'create_task_plan 工具：把复杂的多步目标分解为任务树，逐任务执行并过质量门。创建后需用户在「Agent 任务树」页人工批准才会执行。',
      }
    },
  }

  const runWorkflowTool: AgentToolDef<z.infer<typeof RunWorkflowInput>> = {
    name: 'run_workflow',
    description:
      '运行一个既有工作流（手动触发，优先已发布版本），等待其到终态并返回结果摘要。运行前先 discover_capabilities 确认 id 与所需参数；参数不全时先向用户澄清。',
    inputSchema: RunWorkflowInput,
    dangerLevel: 'write',
    // 工具自身超时 = 等待上限 + 30s 余量（两者都跟着「参数设置」走）
    executeTimeoutMs: systemToolsParams().runWaitTimeoutMs + 30_000,
    execute: async (input, ctx) => {
      const run = await deps.runService.startRun({
        definitionId: input.definitionId,
        inputs: input.inputs,
        triggerType: WORKFLOW_TRIGGER_TYPES.manual,
        usePublishedGraph: true,
      })
      collectSystemAgentRef(ctx, { kind: 'workflow_run', id: run.id, label: `工作流运行 ${run.id}` })
      logger.info(`[system-agent] run_workflow 启动 def=${input.definitionId} run=${run.id} status=${run.status}`)
      if (run.status === 'skipped') {
        // 约定（同 builtin 工具）：失败 throw——registry 管线收口为 {ok:false} 结构化错误
        throw new Error(`运行被互斥跳过（同定义已有在途运行：${run.skipReason ?? '未知原因'}）——等待既有运行结束后再试，或告知用户手动处理。`)
      }
      const waited = await waitForRunTerminal(deps, run.id, ctx.signal)
      if ('run' in waited) {
        const summary = summarizeRun(waited)
        if (waited.run.status !== 'succeeded') {
          // 失败/取消/超时：摘要进错误消息（截断防灌上下文），模型可读节点错误
          throw new Error(`工作流运行结束于 ${waited.run.status}：${digest(summary, systemToolsParams().runErrorDigestChars)}`)
        }
        return summary
      }
      if (waited.unavailable) throw new Error(waited.note)
      // 超时/取消/等待人工：运行本身仍在推进——返回状态让 agent 如实转告
      return { runId: run.id, status: waited.status, note: waited.note }
    },
  }

  const getWorkflowRunTool: AgentToolDef<z.infer<typeof GetWorkflowRunInput>> = {
    name: 'get_workflow_run',
    description: '查询一次工作流运行的状态与节点摘要（用于告知用户运行进展或排查失败）。',
    inputSchema: GetWorkflowRunInput,
    dangerLevel: 'read',
    execute: async (input) => {
      const detail = await deps.runService.getRunDetail(input.runId)
      if (!detail) throw new Error(`运行不存在或无权访问：${input.runId}`)
      return summarizeRun(detail)
    },
  }

  const invokeSkillTool: AgentToolDef<z.infer<typeof InvokeSkillInput>> = {
    name: 'invoke_skill',
    description:
      '执行一个既有技能（参数化任务模板，如写短视频脚本），返回模型生成内容。执行前先 discover_capabilities 确认技能 id 与参数；参数不全时先向用户澄清。',
    inputSchema: InvokeSkillInput,
    dangerLevel: 'read',
    execute: async (input, ctx) => {
      const skill = deps.skills.resolveSkill(input.skillId)
      if (!skill) throw new Error(`技能 ${input.skillId} 不存在——用 discover_capabilities 查有效技能 id。`)
      if (!skill.modelInvocable) throw new Error(`技能 ${input.skillId} 已禁用模型调用。`)
      collectSystemAgentRef(ctx, { kind: 'skill', id: skill.id, label: skill.name })
      const params = input.params ?? {}
      // 参数契约（M3-A）：按 discover 目录暴露的 inputs 校验必填项，缺失 → 结构化报错
      // 让模型按可用 key 自纠重试（历史缺口：缺参静默空串渲染 → 空骨架 + 先验硬凑）
      const inputs = skill.inputs ?? []
      const required = inputs.filter((i) => i.required === true)
      const missing = required
        .filter((i) => params[i.key] === undefined || params[i.key] === '')
        .map((i) => i.key)
      if (missing.length > 0) {
        const usable = inputs.map((i) => `${i.key}${i.required === true ? '(必填)' : ''}`).join('、') || '（无参数）'
        throw new Error(`技能 ${skill.id} 缺少必填参数：${missing.join('、')}；可用参数：${usable}——请用 discover_capabilities 核对 inputs.key 后补全重试。`)
      }
      const warnMissing = (key: string): void => logger.warn(`[system-agent] invoke_skill ${skill.id} 可选参数 ${key} 缺失，已按空串处理`)
      const body = renderSkillTemplate(skill.body, params, warnMissing)
      const systemPrompt = renderSkillTemplate(skill.systemPrompt, params, warnMissing)
      const finalPrompt = withSkillReferences(body, skill.references)
      const { generateText } = await import('ai')
      // 模型跟随聊天轮所选（runtimeContext.turnModel，对抗 review P2：无参会落到
      // 全局默认 provider）；可中止 + 产出上限
      const turnModel = (ctx.logContext as { turnModel?: ResolveModelOptions } | undefined)?.turnModel
      const model = await deps.resolveModel(turnModel)
      const r = await generateText({ model, system: systemPrompt || undefined, prompt: finalPrompt, abortSignal: ctx.signal, maxOutputTokens: 4096 })
      return { skillId: skill.id, content: r.text }
    },
  }

  const createTaskPlanTool: AgentToolDef<z.infer<typeof CreateTaskPlanInput>> = {
    name: 'create_task_plan',
    description:
      '把复杂的多步目标（需要分解、自主执行、逐任务验收）创建为任务树。创建后处于待批准状态，需用户在「Agent 任务树」页人工批准后才会执行——不要替用户批准，也不要重复创建相似计划。',
    inputSchema: CreateTaskPlanInput,
    dangerLevel: 'write',
    execute: async (input, ctx) => {
      if (!deps.tasks) throw new Error('任务树子系统未装配（数据库不可用或装配失败）。')
      // KE 分层打标（37 号）：宿主在 runtimeContext.memoryScope 声明业务归属——
      // 蒸馏出的经验按 scope 落 L2/L3，否则全部退化为用户级 L1
      const memoryScope = (ctx.logContext as { memoryScope?: { bizModule?: string; projectId?: string } } | undefined)?.memoryScope
      const root = await deps.tasks.createPlan(input.goal, {
        title: input.title,
        ...(memoryScope ? { scope: memoryScope } : {}),
      })
      collectSystemAgentRef(ctx, { kind: 'task_tree', id: root.id, label: root.title })
      logger.info(`[system-agent] create_task_plan root=${root.id} goal=${input.goal.slice(0, 80)} scope=${memoryScope ? `${memoryScope.bizModule ?? ''}:${memoryScope.projectId ?? ''}` : 'user'}`)
      return {
        rootId: root.id,
        title: root.title,
        status: root.status,
        hint: '任务树已创建并等待人工批准：请告知用户到「Agent 任务树」页查看并批准，批准后自动开始执行。',
      }
    },
  }

  const createWorkflowDraftTool: AgentToolDef<z.infer<typeof CreateWorkflowDraftInput>> = {
    name: 'create_workflow_draft',
    description:
      '根据自然语言描述生成一个新工作流草稿（自动编排节点与连线）。生成后为草稿状态，需用户在编辑器中检查并发布后才能运行。适合可复用的自动化流程；一次性的多步任务请用 create_task_plan。',
    inputSchema: CreateWorkflowDraftInput,
    dangerLevel: 'write',
    executeTimeoutMs: 300_000,
    execute: async (input, ctx) => {
      if (!deps.drafts) {
        throw new Error('工作流草稿生成未装配')
      }
      const r = await deps.drafts.draftFromDescription({ description: input.description, name: input.name }, { signal: ctx.signal }).catch((e: unknown) => {
        // create 与 saveDraft 非原子（review P3-6）：保存失败时提示定义已存在
        throw new Error(`${e instanceof Error ? e.message : String(e)}`)
      })
      collectSystemAgentRef(ctx, { kind: 'workflow_draft', id: r.definitionId, label: r.name })
      logger.info(`[system-agent] create_workflow_draft id=${r.definitionId} nodes=${r.nodeCount} repair=${r.repairRounds}`)
      const risky = r.nodeTypes.filter((t) => t === 'code' || t === 'http-request')
      const extra = risky.length > 0 ? `（含 ${risky.join('/')} 节点，请提醒用户重点检查其内容）` : ''
      return {
        definitionId: r.definitionId,
        name: r.name,
        nodeCount: r.nodeCount,
        hint: `工作流草稿已生成：请告知用户到工作流编辑器中检查并发布后才能运行。${extra}`,
      }
    },
  }

  return [discoverTool, runWorkflowTool, getWorkflowRunTool, invokeSkillTool, createTaskPlanTool, createWorkflowDraftTool]
}

/** 注册进 registry（source='builtin'：平台系统工具；workflow-boot 组合根调用） */
export function registerSystemAgentTools(deps: SystemAgentToolsDeps): void {
  for (const def of buildSystemAgentToolDefs(deps)) {
    deps.registry.register(def, { source: 'builtin' })
  }
  logger.info(`[system-agent] 系统工具集已注册（${SYSTEM_AGENT_TOOL_NAMES.length} 个）`)
}
