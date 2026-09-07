/**
 * Agent 循环节点（agent-loop）——工作流宿主适配器
 * @module core/platform/workflow/nodes/agent-loop-node
 *
 * 22 号 §8 四焊点之一（工作流 → harness）：agent 作为图中一个任务节点。
 * LoopRunner（ai@6 单步手动循环）驱动执行，宿主能力经 AgentHost 注入：
 * - saveState/loadState → ctx.saveState/loadState（E2，node_run.state_json）
 * - suspend（审批挂起）→ 落挂起点状态后返回 waiting_review（E3 引擎挂起机器）；
 *   恢复经 handler.resume → LoopRunner.resumeFromSuspend 从挂起轮续跑
 * - emitStream → ctx.emitProgress（引擎转发 wf:run-event，先例 llm-chat）
 *
 * 依赖方向红线（22 号 §3）：本文件是 workflow → agent-runtime 的焊接点，
 * agent-runtime 永不反向 import workflow。harness（registry + 模型解析）由
 * workflow-boot 装配注册；未注册时本节点执行 fail-fast（getter 抛错），
 * 与 getToolService 同一纪律。
 */

import { LoopRunner } from '@core/platform/agent-runtime/runtime/loop'
import { stableStringify } from '@core/platform/agent-runtime/runtime/approval'
import type { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import type { ResolveModelOptions } from '@core/platform/agent-runtime/provider/provider-adapter'
import type {
  AgentHost,
  AgentLoopState,
  AgentResult,
  AgentStreamEvent,
  AgentTask,
  AgentToolDef,
  HumanDecision,
  SuspendRequest,
  TrajectoryEntry,
} from '@core/platform/agent-runtime/types'
import type { ApprovalDecision, AgentToolBinding } from '@shared/types/agent.types'
import { TrajectorySink, type TrajectoryAppendPort } from '@core/platform/agent-runtime/trajectory/sink'
import { WORKFLOW_DEFAULTS, WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import type {
  WorkflowNodeContext,
  WorkflowNodeExecutionResult,
  WorkflowNodeHandler,
} from '../engine/node-handler'
import { stringifyValue } from '../engine/variable-resolver'

/** 状态持久化失败标记（mapAgentResult 据此判 retryable=false） */
const STATE_PERSIST_FAIL_PREFIX = '[agent-loop-state-persist]'

/** delta 流合批窗口（与 event-bridge 同款观测面节流） */
const DELTA_BATCH_MS = 30

/** 审批卡里任务上下文截断上限（观测面字段裁剪，非行为参数） */
const APPROVAL_TASK_CONTEXT_MAX_CHARS = 200

/** 'agent-loop' 节点 config——单一事实源取自 WorkflowNodeConfigMap（曾双声明漏 editableFields） */
export type AgentLoopNodeConfig = import('@shared/types/workflow.types').WorkflowNodeConfigMap['agent-loop']

// ==================== harness 注册（workflow-boot 装配；getter 纪律同 getToolService） ====================

/** agent-loop 节点运行所需的 harness 能力（22 号 §8 焊点的注入形态） */
export interface AgentLoopHarness {
  /** AgentToolRegistry 单例（白名单解析与工具执行管线） */
  registry: AgentToolRegistry
  /** Provider 配置 → AI SDK LanguageModel（ProviderAdapter.resolveModel 直传） */
  resolveModel(opts?: ResolveModelOptions): Promise<import('ai').LanguageModel>
  /** 轨迹落库端口（25 号 M2 批1；缺省=不落库仅摘要——降级不阻断执行） */
  trajectoryRepo?: TrajectoryAppendPort
}

let harness: AgentLoopHarness | null = null

export function registerAgentLoopHarness(h: AgentLoopHarness): void {
  harness = h
}

export function getAgentLoopHarness(): AgentLoopHarness {
  if (!harness) {
    throw new Error('agent-loop harness 未装配（workflow-boot 装配失败或未调用）——Agent 循环节点不可用')
  }
  return harness
}

/** 测试/关停用 */
export function resetAgentLoopHarness(): void {
  harness = null
}

// ==================== 纯函数（可独立单测） ====================

/** 轨迹摘要（agent_trajectories 落表 M1.5；当前节点输出内给观测面） */
export function summarizeTrajectories(entries: TrajectoryEntry[]): Record<string, unknown> {
  const byKind: Record<string, number> = {}
  const toolCalls: Record<string, number> = {}
  for (const e of entries) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1
    // 调用次数只计 tool_call（tool_result 是其回执，重复计会翻倍）
    if (e.kind === 'tool_call' && e.name) {
      toolCalls[e.name] = (toolCalls[e.name] ?? 0) + 1
    }
  }
  return { entries: entries.length, byKind, toolCalls }
}

/** approval 合法值与 never 放宽的确认位（review B3：持久化通道不能只凭
 *  approval:'never' 关闭人工审批——必须伴随编辑器写入的显式确认） */
const APPROVAL_VALUES = new Set(['inherit', 'always', 'never'])

/**
 * 工具白名单归一化（25 号 M2 批3；review B11 类型收口）：
 * - 存量 string 与新 AgentToolBinding 混合数组 → 纯 binding 数组
 * - maxCalls 收口为正整数（NaN/字符串/非正数丢弃——护栏静默失效比报错更危险）
 * - config 仅接受 plain object（字符串/数组按脏配置丢弃）
 * - approval 枚举校验；'never' 无 approvalNeverConfirmed 降级 'inherit'
 * - 无工具名/空名的项跳过；同名工具后者覆盖前者（buildToolDefs 按名建表语义）
 */
export function normalizeToolWhitelist(list: unknown): AgentToolBinding[] {
  if (!Array.isArray(list)) return []
  const out: AgentToolBinding[] = []
  for (const item of list) {
    if (typeof item === 'string') {
      if (item.trim()) out.push({ tool: item.trim() })
      continue
    }
    const b = item as Partial<AgentToolBinding> | null
    if (b && typeof b.tool === 'string' && b.tool.trim()) {
      const approval = typeof b.approval === 'string' && APPROVAL_VALUES.has(b.approval) ? b.approval : undefined
      const maxCalls =
        typeof b.maxCalls === 'number' && Number.isFinite(b.maxCalls) && b.maxCalls >= 1
          ? Math.floor(b.maxCalls)
          : undefined
      const config =
        b.config !== null && typeof b.config === 'object' && !Array.isArray(b.config)
          ? (b.config as Record<string, unknown>)
          : undefined
      const needsNeverConfirm = approval === 'never' && b.approvalNeverConfirmed === true
      out.push({
        tool: b.tool.trim(),
        ...(config !== undefined ? { config } : {}),
        ...(b.credentialId ? { credentialId: b.credentialId } : {}),
        ...(approval === 'always' || needsNeverConfirm ? { approval } : {}),
        ...(maxCalls !== undefined ? { maxCalls } : {}),
        ...(b.descriptionOverride ? { descriptionOverride: b.descriptionOverride } : {}),
      })
    }
  }
  return out
}

/**
 * 白名单 → AgentToolDef 映射 + 节点级调用预算包装（预算只包 execute，registry 管线所有权不动）。
 * initialUsed：挂起-恢复续段以 state.usage.toolCalls 为初值——护栏跨会话累计
 * （12 号 §6.4-2"累计 toolCalls ≥ maxToolCalls"，对抗 review P2-1）。
 * binding 富配置（approval/maxCalls/config/descriptionOverride）由
 * registry.buildToolDefs 生效；节点预算与 binding.maxCalls 独立计数（取并集约束）。
 */
export function assembleTools(
  registry: AgentToolRegistry,
  toolWhitelist: Array<string | AgentToolBinding> | undefined,
  maxToolCalls: number | undefined,
  initialUsed = 0,
): Record<string, AgentToolDef> {
  const defs = registry.buildToolDefs(normalizeToolWhitelist(toolWhitelist))
  const budget =
    maxToolCalls !== undefined && Number.isFinite(maxToolCalls) && maxToolCalls > 0
      ? { used: initialUsed, max: Math.floor(maxToolCalls) }
      : null
  if (!budget) return defs
  const out: Record<string, AgentToolDef> = {}
  for (const [name, def] of Object.entries(defs)) {
    out[name] = {
      ...def,
      execute: async (input, toolCtx) => {
        if (budget.used >= budget.max) {
          return {
            ok: false,
            error: 'LIMIT_EXCEEDED',
            hint: `节点级工具调用上限 ${budget.max} 次已用尽，请直接给出最终答案。`,
          }
        }
        budget.used++
        return def.execute(input, toolCtx)
      },
    }
  }
  return out
}

/** AgentResult → 节点执行结果（护栏/取消/失败分类；错误文案即"输出失败原因"验收项） */
export function mapAgentResult(
  r: AgentResult,
  opts: { maxSteps: number; timedOut: boolean; trajectories: TrajectoryEntry[] },
): WorkflowNodeExecutionResult {
  const usage = {
    promptTokens: r.usage.promptTokens,
    completionTokens: r.usage.completionTokens,
    toolCalls: r.usage.toolCalls,
  }
  if (r.stopReason === 'final') {
    return {
      status: 'succeeded',
      output: {
        answer: r.output,
        iterations: r.iterations,
        usage,
        stopReason: r.stopReason,
        trajectoriesSummary: summarizeTrajectories(opts.trajectories),
      },
    }
  }
  const fail = (error: string, retryable: boolean): WorkflowNodeExecutionResult => ({
    status: 'failed',
    // 附 token/轮次摘要（12 号 §6.4-2"护栏耗尽输出已收集信息"的最低限兑现——
    // 引擎 failed 变体无 output 位，观测面只能从 error 文案取）
    error: `${error}（已消耗 ${r.iterations} 轮 / ${usage.promptTokens}+${usage.completionTokens} tokens / ${usage.toolCalls} 次工具调用）`,
    retryable,
  })
  switch (r.stopReason) {
    case 'max_steps':
      return fail(`Agent 循环达到最大迭代上限（${opts.maxSteps} 轮）未收敛`, false)
    case 'stagnant':
      return fail('Agent 循环连续多轮重复相同工具调用（无进展），已终止', false)
    case 'aborted':
      return fail(
        opts.timedOut
          ? `Agent 循环超过节点时长护栏（maxDurationMs）已中止`
          : '已取消',
        false,
      )
    case 'human_rejected':
      return fail('人工驳回了挂起操作，Agent 终止', false)
    default:
      // 状态持久化超限（512KB）：确定性失败——重试必再撞上限，禁烧钱（对抗 review P2-3）
      if (r.error?.startsWith(STATE_PERSIST_FAIL_PREFIX)) {
        return fail(`${r.error.slice(STATE_PERSIST_FAIL_PREFIX.length).trim()}（迭代历史过大：请缩减任务规模/工具结果，或等待上下文压缩接线）`, false)
      }
      return fail(`Agent 循环失败: ${r.error ?? '未知错误'}`, true)
  }
}

// ==================== 挂起桥（审批 → waiting_review） ====================

/** 挂起信号：execute 应返回的 waiting_review 参数 */
interface SuspendSignal {
  payload: Record<string, unknown>
  timeoutMs: number | null
}

/** 恢复时的一次性授权（E3 批准后模型重发同一调用自动放行；编辑批准只核名，入参以编辑版为准） */
interface ApprovalGrant {
  tool: string
  input: unknown
  edited: boolean
}

/**
 * 单次执行会话：host 适配器 + 挂起桥 + 护栏信号。
 * execute 与 resume 共用（resume 多带 resumeFrom/grant）。
 */
async function driveLoop(
  ctx: WorkflowNodeContext,
  opts: {
    resumeFrom?: { state: AgentLoopState; decision: { action: string; comment?: string } }
    grant?: ApprovalGrant | null
  } = {},
): Promise<WorkflowNodeExecutionResult> {
  const cfg = ctx.config as AgentLoopNodeConfig
  const { resolveModel, registry, trajectoryRepo } = getAgentLoopHarness()
  const maxSteps = Math.max(1, Math.floor(cfg.maxIterations ?? WORKFLOW_DEFAULTS.agentLoopMaxIterations))

  // 护栏信号：引擎取消 ∨ 节点时长护栏，本地合成（不篡改引擎 ctx.signal）
  const localAbort = new AbortController()
  const onEngineAbort = () => localAbort.abort(ctx.signal.reason)
  ctx.signal.addEventListener('abort', onEngineAbort, { once: true })
  let timedOut = false
  let durationTimer: ReturnType<typeof setTimeout> | null = null
  if (cfg.maxDurationMs !== undefined && Number.isFinite(cfg.maxDurationMs) && cfg.maxDurationMs > 0) {
    // 净时长窗口（12 号 §6.2：扣除挂起等待）：恢复段从挂起时刻回算已耗净时长，
    // 只给剩余量；已超限直接判护栏失败（对抗 review P2-1——原实现每段全额窗口可无限续命）
    const guardMs = Math.min(cfg.maxDurationMs, WORKFLOW_LIMITS.maxDurationMs)
    const resumedState = opts.resumeFrom?.state
    if (resumedState?.suspended) {
      // 净时长口径（12 号 §6.2）：把本次人工等待窗累进累计字段——多轮挂起各自扣减
      //（总收口 review P2：曾把等待窗计入净时长，第二次恢复即误判"已耗尽"）
      const waited = Math.max(0, Date.now() - Date.parse(resumedState.suspended.suspendedAt))
      resumedState.accumulatedWaitMs = (resumedState.accumulatedWaitMs ?? 0) + waited
    }
    const suspendedAtMs = resumedState?.suspended ? Date.parse(resumedState.suspended.suspendedAt) : NaN
    const activeElapsedMs = Number.isFinite(suspendedAtMs)
      ? Math.max(0, suspendedAtMs - resumedState!.startedAtMs - (resumedState!.accumulatedWaitMs ?? 0))
      : 0
    const remainingMs = guardMs - activeElapsedMs
    if (remainingMs <= 0) {
      return {
        status: 'failed',
        error: `Agent 循环超过节点时长护栏（maxDurationMs=${guardMs}ms，净时长已耗尽）`,
        retryable: false,
      }
    }
    durationTimer = setTimeout(() => {
      timedOut = true
      localAbort.abort(new Error('agent-loop-duration-guard'))
    }, remainingMs)
  }
  durationTimer?.unref?.()

  const trajectories: TrajectoryEntry[] = []
  // 轨迹落库（25 号 M2 批1）：flush 点 = step-end saveState 搭车 / 挂起提交前 / 节点终态
  // ——崩溃至多丢最后一步；seq 从库内续接 + 幂等主键，重放不重不漏
  const trajectorySink = new TrajectorySink(trajectoryRepo ?? null, {
    scope: 'workflow',
    scopeKey: `${ctx.runId}:${ctx.nodeId}:${ctx.iterationIndex}`,
  })
  let deltaBuf = ''
  let deltaTimer: ReturnType<typeof setTimeout> | null = null
  const flushDelta = (): void => {
    if (deltaTimer !== null) {
      clearTimeout(deltaTimer)
      deltaTimer = null
    }
    if (deltaBuf) {
      ctx.emitProgress(-1, deltaBuf.slice(-50))
      deltaBuf = ''
    }
  }
  let lastState: AgentLoopState | null = null
  let suspendResolve: ((s: SuspendSignal) => void) | null = null
  const suspendPromise = new Promise<SuspendSignal>((resolve) => {
    suspendResolve = resolve
  })

  const host: AgentHost = {
    signal: localAbort.signal,
    loadState: () => Promise.resolve((ctx.loadState() as Promise<AgentLoopState | null>).then((s) => s ?? null)),
    saveState: async (state) => {
      lastState = state
      try {
        await ctx.saveState(state)
        // flush 搭车（TrajectorySink.flush 不 throw）：步末存续点顺带落轨迹
        await trajectorySink.flush()
      } catch (e) {
        // 持久化失败按契约继续抛（循环按崩溃处理），但带上可识别标记——
        // 节点级据此判 retryable=false（超限/DB 故障重试必再撞，对抗 review P2-3）
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`${STATE_PERSIST_FAIL_PREFIX} 节点状态持久化失败: ${msg}`)
      }
    },
    emitTrajectory: (entry) => {
      // fire-and-forget 契约：入节点输出摘要（内存）+ 轨迹落库缓冲（步末搭车 flush）
      trajectories.push(entry)
      trajectorySink.append(entry)
      ctx.logger.debug(`[agent-loop] 轨迹 ${entry.kind}${entry.name ? `:${entry.name}` : ''}`, {
        iteration: entry.iteration,
      })
    },
    emitStream: (event: AgentStreamEvent) => {
      if (ctx.signal.aborted) return // 真取消后禁副作用（挂起拆解的本地 abort 不拦——tool-end 属预期）
      if (event.kind === 'delta') {
        // 30ms 合批（总收口 review P3：曾每 delta 一条广播——500 delta=500 条事件；
        // 与 event-bridge 同款处置）
        deltaBuf += event.text
        if (deltaTimer === null) {
          deltaTimer = setTimeout(() => {
            deltaTimer = null
            const buf = deltaBuf
            deltaBuf = ''
            if (buf) ctx.emitProgress(-1, buf.slice(-50))
          }, DELTA_BATCH_MS)
          deltaTimer.unref?.()
        }
        return
      }
      flushDelta()
      if (event.kind === 'tool-start') {
        ctx.emitProgress(-1, `调用工具 ${event.toolName}`)
      } else if (event.kind === 'tool-end') {
        ctx.emitProgress(-1, `工具 ${event.toolName} ${event.ok ? '完成' : '失败'}`)
      } else if (event.kind === 'step') {
        ctx.emitProgress(Math.min(95, Math.round((event.stepNumber / maxSteps) * 100)), `第 ${event.stepNumber + 1} 轮`)
      }
    },
    suspend: (req: SuspendRequest) =>
      // 失败路径回流 ApprovalDecision.reject（reason 字段，loop 包装层消费）——
      // 对 HumanDecision 契约位做结构兼容转换（运行时按 action 判定，字段超集无害）
      bridgeSuspend(req, {
        ctx,
        lastStateRef: () => lastState,
        flushTrajectories: () => trajectorySink.flush(),
        commit: (s) => {
          suspendResolve?.(s)
          // 挂起已提交：本地 abort 止住在途模型流/工具 IO（挂起后禁止副作用扩散）
          localAbort.abort(new Error('agent-loop-suspended'))
        },
      }) as Promise<HumanDecision>,
  }

  // 审批桥：LoopRunner deps.requestApproval → host.suspend 语义
  let grant = opts.grant ?? null
  const requestApproval = async (
    tool: AgentToolDef,
    input: unknown,
    call: { toolCallId: string },
  ): Promise<ApprovalDecision> => {
    // 一次性授权：批准恢复后模型重发的同工具调用自动放行（P4 真模型实证——严格
    // 同参匹配不可行：模型重发自由文本入参必逐字漂移，批准后再挂起成死循环）。
    // 安全边界：一次性（用后即焚）、仅同名工具、参数漂移 warn+轨迹留痕可审计；
    // 不同工具仍正常发卡（E3 多轮）
    if (grant && grant.tool === tool.name) {
      const g = grant
      grant = null
      if (!g.edited && stableStringify(input) !== stableStringify(g.input)) {
        ctx.logger.warn('[agent-loop] 批准后重发参数与送审版不一致（一次性授权按工具放行）', {
          tool: tool.name,
        })
        host.emitTrajectory({
          iteration: lastState?.iteration ?? 0,
          kind: 'tool_call',
          name: tool.name,
          payload: { autoApprovedArgsDrift: true },
        })
      }
      return g.edited ? { action: 'approve_with_edit', input: g.input as Record<string, unknown> } : { action: 'approve' }
    }
    // 失败路径 bridge 以 HumanDecision（reject/comment）值回流；loop 包装层按
    // action 判定（'reject' 走拒绝短路），对 ApprovalDecision 结构兼容
    // 轨迹留痕（review A3：human_request 此前从不产生——"模型为什么想调这个
    // 工具、人工审了什么"是轨迹视图最需要复盘的环节）
    host.emitTrajectory({
      iteration: lastState?.iteration ?? 0,
      kind: 'human_request',
      name: tool.name,
      payload: { tool: tool.name, input },
    })
    return host.suspend({
      reason: `工具 ${tool.name} 需要人工批准`,
      payload: {
        kind: 'tool_approval',
        tool: tool.name,
        input,
        toolCallId: call.toolCallId,
        task: stringifyValue(cfg.task).slice(0, APPROVAL_TASK_CONTEXT_MAX_CHARS),
      },
      timeoutMs: null,
    }) as Promise<ApprovalDecision>
  }

  try {
    const task: AgentTask = {
      definitionId: 'workflow:agent-loop',
      scopeId: ctx.executionKey,
      input: stringifyValue(cfg.task),
      systemPrompt: stringifyValue(cfg.systemPrompt ?? ''),
      tools: assembleTools(registry, cfg.toolWhitelist, cfg.maxToolCalls, opts.resumeFrom?.state.usage.toolCalls ?? 0),
      maxSteps,
      modelPreference: { providerConfigId: cfg.providerConfigId || undefined, modelId: cfg.modelId || undefined },
      // 工具审计 logContext（review D3：审计行 run_id/node_id 据此落库）
      runtimeContext: { runId: ctx.runId, nodeId: ctx.nodeId, iterationIndex: ctx.iterationIndex },
    }

    // 审批决策轨迹（review A3：恢复段把人工决策补进时间线；挂起段已发 human_request）
    if (opts.resumeFrom) {
      const suspendedTool = (
        (opts.resumeFrom.state.suspended?.requestPayload as { tool?: string } | undefined)?.tool
      ) ?? undefined
      trajectorySink.append({
        iteration: opts.resumeFrom.state.iteration ?? 0,
        kind: 'human_decision',
        name: suspendedTool,
        payload: { action: opts.resumeFrom.decision.action, comment: opts.resumeFrom.decision.comment },
      })
    }

    const runner = new LoopRunner({ resolveModel, requestApproval })
    const loopPromise = opts.resumeFrom
      ? runner.resumeFromSuspend(opts.resumeFrom.state, opts.resumeFrom.decision, task, host)
      : runner.run(task, host)
    // 败者兜底不吞异常：挂起拆解的晚到异常/晚到结果留 warn（正常路径挂起后循环以 aborted resolve）
    loopPromise.catch((e) =>
      ctx.logger.warn('[agent-loop] 循环已结束后的晚到异常（挂起拆解路径，已放弃）', e),
    )

    const winner = await Promise.race([
      loopPromise.then((result) => ({ kind: 'result' as const, result })),
      suspendPromise.then((req) => ({ kind: 'suspend' as const, req })),
    ])

    if (winner.kind === 'suspend') {
      return { status: 'waiting_review', payload: winner.req.payload, timeoutMs: winner.req.timeoutMs }
    }
    await trajectorySink.flush() // 终态排空（挂起路径已在 bridgeSuspend 排空）
    return mapAgentResult(winner.result, { maxSteps, timedOut, trajectories })
  } finally {
    if (durationTimer) clearTimeout(durationTimer)
    if (deltaTimer !== null) clearTimeout(deltaTimer)
    ctx.signal.removeEventListener('abort', onEngineAbort)
  }
}

/**
 * host.suspend 实现：落挂起点状态 → 提交 waiting_review → 本地 abort 止住一切在途 IO。
 * 落库失败=审批通道故障 → 结构化拒绝（registry 审批通道异常同款收口）——
 * ⚠️ 绝不能 reject：探针实证 ai@6 把工具 execute 的 rejection 吊死（流不收尾，
 * 节点卡 running），错误必须以 decision 值回流让模型改路。
 */
async function bridgeSuspend(
  req: SuspendRequest,
  deps: {
    ctx: WorkflowNodeContext
    lastStateRef: () => AgentLoopState | null
    /** 挂起提交前排空轨迹缓冲（挂起段不再有 flush 点） */
    flushTrajectories: () => Promise<void>
    commit: (s: SuspendSignal) => void
  },
): Promise<ApprovalDecision | never> {
  const { ctx, lastStateRef, commit } = deps
  const payload = {
    title: req.reason,
    ...(req.payload as Record<string, unknown>),
  }
  // 先落挂起点（state.suspended 供恢复路径取回审批上下文）
  const state = lastStateRef()
  if (state) {
    state.suspended = {
      requestPayload: req.payload as Record<string, unknown>,
      suspendedAt: new Date().toISOString(),
      waitMs: 0,
    }
    try {
      await ctx.saveState(state)
    } catch (e) {
      // 回滚挂起标记（否则步末 saveState 撞同一失败 → 循环被 error 击穿）
      state.suspended = undefined
      ctx.logger.error('[agent-loop] 挂起状态落库失败（转拒绝，模型需改路）', e)
      // reason（非 comment）：ApprovalDecision.reject 变体字段——loop 包装层据此
      // 透传进 hint/detail，模型收到真实原因而非泛化"用户拒绝"
      return { action: 'reject', reason: `挂起状态落库失败: ${e instanceof Error ? e.message : String(e)}` }
    }
  } else {
    // 无已存状态（首步 saveState 后不可达；防御分支）——照常挂起但留 warn
    ctx.logger.warn('[agent-loop] 挂起时无已存状态（恢复将不可用）')
  }
  try {
    await deps.flushTrajectories()
  } catch (e) {
    ctx.logger.warn('[agent-loop] 挂起前排空轨迹失败（不影响挂起）', e)
  }
  commit({ payload, timeoutMs: req.timeoutMs })
  // commit 内已本地 abort：模型流/在途工具 IO 停摆（挂起后禁止副作用扩散）。
  // 返回永不 settle 的 promise：ai@6 会吊住这条流（探针实证循环 promise 不再
  // settle），driveLoop 返回 waiting_review 后整条悬挂链无引用、可整体 GC——
  // 状态冻结在挂起点（恢复语义干净），也不存在后台空转烧 token
  return new Promise<never>(() => {})
}

/** resume 决策 → LoopRunner 恢复决策 + 一次性授权 */
function mapReviewDecision(
  review: {
    decision: 'approve' | 'approve_with_changes' | 'reject' | 'timeout_approve' | 'timeout_reject'
    comment?: string
    editedValues?: Record<string, unknown>
  },
  state: AgentLoopState,
): { decision: { action: string; comment?: string }; grant: ApprovalGrant | null } {
  const approved =
    review.decision === 'approve' || review.decision === 'approve_with_changes' || review.decision === 'timeout_approve'
  if (!approved) {
    return { decision: { action: 'reject', comment: review.comment }, grant: null }
  }
  const payload = state.suspended?.requestPayload as { kind?: string; tool?: string; input?: unknown } | undefined
  const isToolApproval = payload?.kind === 'tool_approval' && typeof payload.tool === 'string'
  const editedInput = review.editedValues && 'input' in review.editedValues ? review.editedValues.input : undefined
  const grant: ApprovalGrant | null = isToolApproval
    ? { tool: payload!.tool as string, input: editedInput ?? payload!.input, edited: editedInput !== undefined }
    : null
  return { decision: { action: 'approve' }, grant }
}

// ==================== 节点 handler（四件套之四） ====================

export const AGENT_LOOP_NODE_HANDLER: WorkflowNodeHandler = {
  type: 'agent-loop',
  controlKind: 'task',
  cancellable: true,
  outputSchema: [
    { key: 'answer', type: 'string', desc: '最终答案' },
    { key: 'iterations', type: 'number', desc: '实际迭代轮数' },
    { key: 'usage', type: 'json', desc: 'token 用量 { promptTokens, completionTokens, toolCalls }' },
    { key: 'stopReason', type: 'string', desc: 'final / max_steps / stagnant / aborted / human_rejected / error' },
    { key: 'trajectoriesSummary', type: 'json', desc: '轨迹摘要 { entries, byKind, toolCalls }' },
  ],
  validateConfig(config) {
    const cfg = config as Partial<AgentLoopNodeConfig>
    const errors: string[] = []
    if (stringifyValue(cfg.task).trim() === '') errors.push('任务目标不能为空')
    if (
      cfg.maxIterations !== undefined &&
      (!Number.isFinite(cfg.maxIterations) || cfg.maxIterations < 1 || cfg.maxIterations > WORKFLOW_DEFAULTS.agentLoopMaxIterationsCeiling)
    ) {
      errors.push(`maxIterations 须为 1-${WORKFLOW_DEFAULTS.agentLoopMaxIterationsCeiling} 的数字`)
    }
    if (cfg.maxToolCalls !== undefined && (!Number.isFinite(cfg.maxToolCalls) || cfg.maxToolCalls < 1)) {
      errors.push('maxToolCalls 必须是正数')
    }
    if (
      cfg.maxDurationMs !== undefined &&
      (!Number.isFinite(cfg.maxDurationMs) || cfg.maxDurationMs < 1 || cfg.maxDurationMs > WORKFLOW_LIMITS.maxDurationMs)
    ) {
      errors.push(`maxDurationMs 必须是正数（毫秒），上界 ${WORKFLOW_LIMITS.maxDurationMs}`)
    }
    if (cfg.toolWhitelist !== undefined) {
      if (!Array.isArray(cfg.toolWhitelist)) {
        errors.push('toolWhitelist 必须是数组（工具名或绑定对象）')
      } else {
        // 按 binding 形态校验（review C11：String() 口径下对象变 '[object Object]'，
        // 空 tool 名/重复项全部漏检）；脏配置项由运行时 normalizeToolWhitelist 容错
        const names: string[] = []
        for (const item of cfg.toolWhitelist) {
          if (typeof item === 'string') {
            names.push(item)
            continue
          }
          const b = item as Partial<AgentToolBinding> | null
          if (!b || typeof b.tool !== 'string' || !b.tool.trim()) {
            errors.push('toolWhitelist 绑定项缺少有效工具名')
            continue
          }
          if (b.approval !== undefined && !APPROVAL_VALUES.has(b.approval)) {
            errors.push(`toolWhitelist[${b.tool}] approval 必须是 inherit/always/never`)
          }
          if (b.maxCalls !== undefined && (!Number.isFinite(b.maxCalls) || b.maxCalls < 1)) {
            errors.push(`toolWhitelist[${b.tool}] maxCalls 必须是正数`)
          }
          names.push(b.tool)
        }
        if (names.some((n) => !n.trim())) errors.push('toolWhitelist 含空工具名')
        if (new Set(names).size !== names.length) errors.push('toolWhitelist 存在重复工具名')
      }
    }
    return errors
  },
  async execute(ctx) {
    return driveLoop(ctx)
  },
  async resume(ctx, review, state) {
    if (!state || typeof state !== 'object' || (state as AgentLoopState).version !== 1) {
      return {
        status: 'failed',
        error: 'agent-loop 恢复失败：挂起前无有效持久化状态（旧数据或首步未落盘）',
        retryable: false,
      }
    }
    const agentState = state as AgentLoopState
    if (!agentState.task || !Array.isArray(agentState.messages)) {
      return { status: 'failed', error: 'agent-loop 恢复失败：持久化状态损坏', retryable: false }
    }
    const { decision, grant } = mapReviewDecision(review, agentState)
    return driveLoop(ctx, { resumeFrom: { state: agentState, decision }, grant })
  },
}

export const AGENT_LOOP_NODE_HANDLERS: WorkflowNodeHandler[] = [AGENT_LOOP_NODE_HANDLER]
