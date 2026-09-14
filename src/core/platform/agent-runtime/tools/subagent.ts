/**
 * spawn_subagent：会话内动态子代理委派（39 号 P1-2，用户场景⑤⑦）
 * @module core/platform/agent-runtime/tools/subagent
 *
 * 主代理在对话中把分支任务（含大输出阅读类：日志/文件/网页）委派给隔离子代理：
 * 子代理拥有独立 scopeKey（轨迹可在工作台独立查看）、独立 ContextManager、
 * 独立会话状态；执行过程（中间步/工具结果）不进主上下文，只有最终报告回填。
 *
 * 隔离与安全：
 * - 深度恒为 1：子代理工具集从基集过滤构造，spawn_subagent 永不入列（结构性防递归）
 * - tool_names 白名单过滤：未注册名拒绝并列出可用集（宁失败不静默缩权）
 * - 审批路由父通道：子代理的 requiresApproval 工具走主代理同一审批回调
 * - 模型档位（场景⑦）：cheap/strong 由宿主配置映射；未配置回退主模型
 * - 子代理异常/护栏终止不炸主轮：报告携带 stopReason/error，主代理可改道重试
 *
 * 报告回填：data.report 经 loop 的 8K 截断入上下文；完整报告随工具产物归档
 * （artifacts 已装配时），主代理可 get_tool_result 回查全文。
 */

import { z } from 'zod'
import { LoopRunner } from '../runtime/loop'
import { ContextManager } from '../context/context-manager'
import { TrajectorySink } from '../trajectory/sink'
import type { TrajectoryAppendPort } from '../trajectory/sink'
import type { AgentToolDef, AgentStreamEvent, AgentTask, AgentHost, AgentLoopState } from '../types'
import type { ApprovalDecision } from '@shared/types/agent.types'
import type { ToolArtifactPort } from './artifacts'
import { buildWireNameMap } from './wire-name'
import { runtimeLimits } from '@shared/utils/runtime-limits'

const SpawnSubagentInput = z.object({
  goal: z
    .string()
    .min(1)
    .describe('子任务的完整自包含目标。子代理看不到主对话历史——必须带齐背景、输入来源与期望产出形态'),
  model: z
    .enum(['inherit', 'cheap', 'strong'])
    .default('inherit')
    .describe('模型档位：inherit=与主代理一致；cheap=轻量档（摘要/阅读类）；strong=强力档（难推理）。宿主未配置对应档位时回退主模型'),
  tool_names: z
    .array(z.string())
    .optional()
    .describe('限定子代理可用工具子集（缺省=继承全部授权工具；阅读类委派建议只给读工具）'),
  max_steps: z
    .number()
    .int()
    .min(1)
    .max(16)
    .optional()
    .describe('子代理最大步数（缺省 8）'),
})

export interface SubagentModelTiers {
  cheap?: { providerConfigId?: string; modelId?: string }
  strong?: { providerConfigId?: string; modelId?: string }
}

export interface SpawnSubagentDeps {
  resolveModel: (opts?: { providerConfigId?: string; modelId?: string }) => Promise<import('ai').LanguageModel>
  /** 子代理工具基集（kit 从宿主白名单构造；spawn_subagent 会被防御性剔除） */
  tools: Record<string, AgentToolDef>
  /** 子代理系统提示词（缺省=通用自主执行提示） */
  systemPrompt?: string
  /** 子代理步数缺省值（缺省读进程级限额 runtimeLimits().maxSubagentSteps） */
  maxSteps?: number
  /** 子代理步数顶（缺省读进程级限额 runtimeLimits().maxSubagentStepsCeiling；可由 settings 覆盖） */
  maxStepsCap?: number
  /** 模型档位映射（场景⑦） */
  models?: SubagentModelTiers
  /** 子代理轨迹落库端口（独立 scopeKey——工作台可独立查看子代理全程） */
  trajectoryPort: TrajectoryAppendPort | null
  /** 子代理上下文窗口（继承宿主配置——42号 review P2：曾各读各的 env） */
  contextWindowTokens?: number
  /** 父 scopeKey（子 scopeKey = `${父}:sub_<rand>`） */
  scopeKey: string
  /** 审批路由：子代理的需批准工具走主代理同一通道 */
  requestApproval?: (tool: AgentToolDef, input: unknown, call: { scopeId: string; rawInput: string; toolCallId: string; signal?: AbortSignal }) => Promise<ApprovalDecision>
  /** 产物归档（子代理工具结果同样落档；缺省不归档） */
  artifacts?: ToolArtifactPort | null
  /** 子代理流事件旁路（缺省不转发——子代理过程不进主界面） */
  onChildStream?: (event: AgentStreamEvent) => void
}

export const SUBAGENT_DEFAULT_MAX_STEPS = 8
export const SUBAGENT_MAX_STEPS_CAP = 16

/**
 * 子代理步数决策（纯函数，便于直测）：请求值 → 宿主缺省 → 进程级限额，最后夹到步数顶。
 * 2026-09-13 参数配置化：缺省与上限都可被 settings `agent:budget`.maxSteps.{subagent,subagentCeiling}
 * 覆盖（经 runtime-limits 持有者注入）。
 */
export function resolveSubagentMaxSteps(input: {
  requested?: number
  defaultSteps?: number
  cap?: number
}): number {
  const limits = runtimeLimits()
  const base = input.requested ?? input.defaultSteps ?? limits.maxSubagentSteps
  const ceiling = input.cap ?? limits.maxSubagentStepsCeiling
  return Math.min(base, ceiling)
}

const DEFAULT_SUBAGENT_SYSTEM = `你是一个子代理，接受主代理的委派独立完成一项分支任务。
你看不到主对话——只依据 goal 里给出的信息工作；信息不足时在报告中说明缺口，不要编造。
执行完毕后以一段自包含的报告收尾：结论/产出在前，关键依据与未决事项在后。报告会被直接转交主代理。`

export function createSpawnSubagentTool(deps: SpawnSubagentDeps): AgentToolDef<{
  goal: string
  model?: 'inherit' | 'cheap' | 'strong'
  tool_names?: string[]
  max_steps?: number
}> {
  // 防递归（结构性）：基集剔除 spawn_subagent；基集在构造期固定
  const baseTools: Record<string, AgentToolDef> = {}
  for (const [name, def] of Object.entries(deps.tools)) {
    if (name === 'spawn_subagent') continue
    baseTools[name] = def
  }
  const availableNames = Object.keys(baseTools)
  // tool_names 兼容线上名（41 号）：模型可见的是 provider 函数名（冒号名折叠形态）
  const wireLookup = buildWireNameMap(availableNames).wireToCanonical
  let childSeq = 0

  return {
    name: 'spawn_subagent',
    description:
      '把一个分支子任务委派给隔离子代理执行（如阅读大日志/文件并提炼要点、独立调研、并行分支工作）。子代理在独立上下文运行，只有最终报告进入主对话——不要用它做需要与用户交互或审批挂起的操作。',
    inputSchema: SpawnSubagentInput,
    dangerLevel: 'read',
    // 子代理完整运行（多步 LLM 调用）远超单工具缺省 120s——def 级超时旋钮
    executeTimeoutMs: 600_000,
    async execute(input, ctx) {
      // 工具白名单过滤：未知名 fail-fast 列举可用集（静默缩权会让子代理必然失败）
      let tools: Record<string, AgentToolDef>
      if (input.tool_names && input.tool_names.length > 0) {
        tools = {}
        const missing: string[] = []
        for (const requested of input.tool_names) {
          const name = baseTools[requested] ? requested : (wireLookup.get(requested) ?? requested)
          if (baseTools[name]) tools[name] = baseTools[name]
          else missing.push(requested)
        }
        if (missing.length > 0) {
          return {
            ok: false as const,
            error: 'UNKNOWN_TOOLS',
            detail: `未授权工具：${missing.join(', ')}`,
            hint: `可用工具：${availableNames.join(', ') || '（无）'}`,
          }
        }
      } else {
        tools = { ...baseTools }
      }
      if (Object.keys(tools).length === 0) {
        return { ok: false as const, error: 'NO_TOOLS', hint: '子代理无可用工具；请直接在主任务中完成或调整授权。' }
      }

      // 模型档位（场景⑦）：inherit/未配置档位 → 主模型
      const tier =
        input.model === 'cheap' ? deps.models?.cheap : input.model === 'strong' ? deps.models?.strong : undefined
      const model = await deps.resolveModel(tier)

      // 子代理隔离运行时：独立 scopeKey/轨迹/上下文窗口；会话状态不持久化（一次性）
      const childScopeKey = `${deps.scopeKey}:sub_${Date.now()}_${(++childSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const sink = new TrajectorySink(deps.trajectoryPort, { scope: 'session', scopeKey: childScopeKey })
      const childController = new AbortController()
      const onParentAbort = () => childController.abort(new Error('主任务已中止'))
      ctx.signal?.addEventListener('abort', onParentAbort, { once: true })
      if (ctx.signal?.aborted) onParentAbort()

      const childTask: AgentTask = {
        definitionId: 'subagent',
        scopeId: childScopeKey,
        input: input.goal,
        systemPrompt: deps.systemPrompt ?? DEFAULT_SUBAGENT_SYSTEM,
        tools,
        maxSteps: resolveSubagentMaxSteps({
          requested: input.max_steps,
          defaultSteps: deps.maxSteps,
          cap: deps.maxStepsCap,
        }),
        runtimeContext: { parentScopeKey: deps.scopeKey, modelTier: input.model ?? 'inherit' },
      }
      const childHost: AgentHost = {
        signal: childController.signal,
        loadState: async () => null, // 一次性任务：永远新起
        saveState: async (_st: AgentLoopState) => {
          await sink.flush() // 无会话存储；轨迹搭车落库
        },
        suspend: () => Promise.reject(new Error('子代理不支持挂起审批')),
        emitTrajectory: (entry) => sink.append(entry),
        emitStream: (event) => deps.onChildStream?.(event),
      }
      const childContext = new ContextManager({
        contextWindowTokens: deps.contextWindowTokens
          ?? (Number(process.env.AGENT_CONTEXT_WINDOW ?? 32_768) || 32_768),
      })

      try {
        const result = await new LoopRunner({
          resolveModel: async () => model,
          ...(deps.requestApproval ? { requestApproval: deps.requestApproval } : {}),
          context: childContext,
          ...(deps.artifacts ? { artifacts: deps.artifacts } : {}),
        }).run(childTask, childHost)
        await sink.flush()
        const report = result.output?.trim()
        return {
          ok: true as const,
          data: {
            report: report || '（子代理未产出文本报告）',
            stopReason: result.stopReason,
            iterations: result.iterations,
            usage: result.usage,
            trajectoryKey: childScopeKey,
            ...(result.stopReason !== 'final'
              ? { note: `子代理未正常收敛（${result.stopReason}${result.error ? `: ${result.error}` : ''}），报告可能不完整，可调整 goal 重试。` }
              : {}),
          },
        }
      } catch (e: unknown) {
        await sink.flush().catch(() => undefined)
        const msg = e instanceof Error ? e.message : String(e)
        // 子代理失败是信息不是故障：ok:true 带失败说明，主代理可改道
        return {
          ok: true as const,
          data: {
            report: '',
            stopReason: 'error',
            error: msg,
            trajectoryKey: childScopeKey,
            note: '子代理执行异常，未产出报告；可调整 goal/工具/步数后重试，或直接在主任务完成该分支。',
          },
        }
      } finally {
        ctx.signal?.removeEventListener('abort', onParentAbort)
      }
    },
  }
}
