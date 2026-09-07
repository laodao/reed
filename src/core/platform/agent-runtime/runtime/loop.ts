/**
 * Agent 手动循环（LoopRunner）——harness 的心脏
 * @module core/platform/agent-runtime/runtime/loop
 *
 * 契约：tasks/2026-08-28-agent-loop-harness/23-interface-contracts.md §5（LoopRunner）；
 * 语义：12-agent-runtime §6（状态机/收敛/错误分类）。
 * 载体（22 号审计 v2）：ai@6 单步 streamText 手动循环——不传 stopWhen 时恰好执行一个
 * 决策步；步末 `await response.messages` 拼接，host.saveState 在工具 settle 之后、
 * iteration 自增之前（12 号 §6.3 唯一持久化点）。spike 已验证。
 *
 * ESM 红线：ai 动态 import；zod 不直接用（工具 schema 校验经 zod 的 parse，
 * 在 defs 上调用）。审批：requiresApproval 工具经 requestApproval 回调
 * （独立宿主=ApprovalCoordinator；工作流宿主=host.suspend 由适配器包装）。
 */

import { createLogger } from '@core/utils/logger'
import { stableStringify } from './approval'
import { withTimeout } from './async'
import type {
  streamText as aiStreamText,
  LanguageModel,
  ToolSet,
  ModelMessage,
} from 'ai'
import type {
  AgentHost,
  AgentLoopState,
  AgentResult,
  AgentTask,
  AgentToolDef,
  ParsedToolCall,
} from '../types'
import type { ApprovalDecision } from '@shared/types/agent.types'
import type { LoopContextPort } from '../context/context-manager'

const logger = createLogger('AgentLoop')

export interface LoopRunnerDeps {
  resolveModel: (opts?: { providerConfigId?: string; modelId?: string }) => Promise<LanguageModel>
  /** 审批回调：requiresApproval 工具执行前调用；缺省=拒绝（安全默认，22 号 §3-C2） */
  requestApproval?: (tool: AgentToolDef, input: unknown, call: { scopeId: string; rawInput: string; toolCallId: string; signal?: AbortSignal }) => Promise<ApprovalDecision>
  /** 单工具超时 ms（缺省 120s；12 号 §9） */
  toolTimeoutMs?: number
  /** 无进展检测阈值（12 号 §6.4-3；缺省 3 轮完全相同 signature） */
  stagnantLimit?: number
  /**
   * 上下文管理端口（23 号 §5；缺省 null——不装配不压缩）。
   * 所有权分层：装配（哨兵修复）/压缩（守恒水位）/估算归 ContextManager；
   * loop 只在步边界调用并持久化压缩结果。compaction 事件经 emit 回调直发门面。
   */
  context?: LoopContextPort
  clock?: () => number
}

interface AiModule {
  streamText: typeof aiStreamText
  tool: (def: Record<string, unknown>) => unknown
}

const STAGNANT_NUDGE = '检测到你连续多轮执行完全相同的工具调用。请更换策略，或直接给出最终答案。'

// —— 展示/轨迹截断上限（命名常量：观测面字段裁剪，非行为参数） ——
const TRAJECTORY_THOUGHT_MAX_CHARS = 500
const TRAJECTORY_ANSWER_MAX_CHARS = 2000
const TOOL_ERROR_DETAIL_MAX_CHARS = 300
export const ZOD_ISSUE_MAX = 8

export class LoopRunner {
  private readonly deps: LoopRunnerDeps
  private readonly clock: () => number
  private aiModule: AiModule | null = null
  private aiLoading: Promise<AiModule> | null = null

  constructor(deps: LoopRunnerDeps) {
    this.deps = deps
    this.clock = deps.clock ?? (() => Date.now())
  }

  private loadAi(): Promise<AiModule> {
    this.aiLoading ??= import('ai').then((m) => {
      this.aiModule = m as unknown as AiModule
      return this.aiModule
    })
    return this.aiLoading
  }

  /** 从既有 state 恢复（12 号 §6.2：挂起点续跑由 resume 承载） */
  async run(task: AgentTask, host: AgentHost): Promise<AgentResult> {
    const existing = await host.loadState()
    const state =
      existing ??
      initState(task, this.clock())
    if (existing) {
      host.emitStream({ kind: 'step', stepNumber: state.iteration })
    } else {
      // 首步前持久化初始状态：首步工具审批挂起（工作流宿主）与步 0 崩溃恢复
      // 都要求宿主手上有 state 可写 suspended/续跑，否则恢复路径必然缺状态
      await host.saveState(state)
    }
    return this.loop(state, task, host)
  }

  /** 契约别名（23 号 §5 LoopRunner.resume）——与 resumeFromSuspend 同一入口 */
  async resume(
    state: AgentLoopState,
    decision: { action: string; values?: Record<string, unknown>; comment?: string },
    task: AgentTask,
    host: AgentHost,
  ): Promise<AgentResult> {
    return this.resumeFromSuspend(state, decision, task, host)
  }

  /**
   * 挂起恢复入口：人工决策作为 tool 结果回填后继续（12 号 §6.2）。
   * task 由宿主完整重建传入（state.task 是持久化摘要态，无 tools/systemPrompt，
   * 不能驱动循环——批 1-4 深度 review P2-9 实证原签名必然 TypeError）。
   */
  async resumeFromSuspend(
    state: AgentLoopState,
    _decision: { action: string; values?: Record<string, unknown>; comment?: string },
    task: AgentTask,
    host: AgentHost,
  ): Promise<AgentResult> {
    // 驳回 = 干净终止（12 号 §7-8：不进入下一轮，直接 stopped(human_rejected)，
    // 宿主节点 failed retryable=false——防固执模型与审核人 ping-pong）
    if (_decision.action === 'reject') {
      return this.stop(state, host, 'human_rejected')
    }
    // 批准：注入注记后进入下一轮（模型重发挂起调用，宿主的一次性授权放行）
    const note = `人工已确认该操作。`
    state.messages = [...state.messages, { role: 'assistant', content: `[系统] ${note}` } as ModelMessage]
    state.suspended = undefined
    await host.saveState(state)
    return this.loop(state, task, host)
  }

  // ==================== 主循环 ====================

  private async loop(state: AgentLoopState, task: AgentTask, host: AgentHost): Promise<AgentResult> {
    const ai = await this.loadAi()
    const model = await this.deps.resolveModel(task.modelPreference)
    const stagnantLimit = this.deps.stagnantLimit ?? 3
    const system = buildSystem(task, state)
    let lastSignature = ''
    let nudged = false // 无进展提示只注入一次；再达限以 stagnant 终止
    // 最近一步模型实测 inputTokens（压缩水位依据——state.usage.promptTokens 是
    // 跨步累计和，用作水位会假触发+压缩空转，批 6 review P1-3）
    let lastStepInputTokens = 0

    // 崩溃恢复装配：悬空工具调用哨兵修复（一次性持久化——幂等，返回原引用则跳过）
    if (this.deps.context) {
      const repaired = this.deps.context.assemble(state.messages)
      if (repaired !== state.messages) {
        state.messages = repaired
        await host.saveState(state)
      }
    }

    try {
      while (!state.converged) {
        // —— 护栏（12 号 §9：每步 LLM 调用前）——
        if (state.iteration >= state.task.maxSteps) {
          return this.stop(state, host, 'max_steps')
        }
        if (host.signal.aborted) {
          return this.stop(state, host, 'aborted')
        }

        // —— 压缩守恒（12 号 R6：步边界水位检查；结果持久化）——
        if (this.deps.context) {
          const compacted = await this.deps.context.maybeCompact({
            messages: state.messages,
            lastInputTokens: lastStepInputTokens,
            signal: host.signal,
          })
          if (compacted) {
            state.messages = compacted
            await host.saveState(state)
          }
        }

        // —— 单步决策（ai@6：不传 stopWhen = 恰好一步）——
        const stepStart = this.clock()
        const tools = this.buildToolSet(task, host, state)
        const stream = ai.streamText({
          model,
          system,
          messages: this.deps.context ? this.deps.context.assemble(state.messages) : state.messages,
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          abortSignal: host.signal,
        })

        let stepText = ''
        let streamError: string | undefined
        for await (const part of stream.fullStream) {
          if (part.type === 'text-delta') {
            stepText += part.text
            host.emitStream({ kind: 'delta', text: part.text })
          } else if (part.type === 'error') {
            // provider 中途失败（SSE error chunk）以 error part 收尾而非 throw——
            // 不捕获则错误轮被当 final 收敛（批 1-4 深度 review P1 实证）
            const err = (part as { error?: unknown }).error
            streamError = err instanceof Error ? err.message : String(err)
          }
        }
        const finishReason = await stream.finishReason
        const stepMessages = (await stream.response).messages
        const usage = (await stream.totalUsage) ?? {}

        // usage 累计（缺失记 0；12 号 §5.6 口径在 13 号，chars/4 兜底由护栏层做）
        state.usage.promptTokens += usage.inputTokens ?? 0
        state.usage.completionTokens += usage.outputTokens ?? 0
        lastStepInputTokens = usage.inputTokens ?? 0

        // 流级失败短路（12 号 §6.5 错误分类）：部分内容留痕后以 error 终止，
        // 绝不把截断文本当最终答案
        if (streamError !== undefined || finishReason === 'error') {
          const message = streamError ?? `模型流以 error 终止（finishReason=error）`
          logger.error(`[agent-loop] 模型流失败 def=${task.definitionId} scope=${task.scopeId}: ${message}`)
          state.messages = [...state.messages, ...stepMessages]
          return this.stop(state, host, 'error', message)
        }
        if (finishReason === 'length') {
          // 截断完成：仍按 final 收敛，但打标可观测（答案可能不完整）
          logger.warn(`[agent-loop] 模型因长度上限截断（finishReason=length）def=${task.definitionId}`)
        }

        const decision = normalizeDecision(finishReason, stepMessages)
        const decisionToolNames = decision.type === 'tool_calls' ? decision.calls.map((c) => c.toolName) : []
        host.emitTrajectory({
          iteration: state.iteration,
          kind: 'decision',
          payload: {
            thought: stepText.slice(0, TRAJECTORY_THOUGHT_MAX_CHARS),
            finishReason,
            truncated: finishReason === 'length' || undefined,
            toolCalls: decisionToolNames,
          },
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          durationMs: this.clock() - stepStart,
        })

        if (decision.type === 'final') {
          state.converged = true
          state.finalAnswer = decision.answer
          state.messages = [...state.messages, ...stepMessages]
          await host.saveState(state)
          host.emitTrajectory({ iteration: state.iteration, kind: 'final', payload: { answer: decision.answer.slice(0, TRAJECTORY_ANSWER_MAX_CHARS) } })
          return resultOf(state, 'final')
        }

        // —— tool_calls：执行 → 回填 → 轨迹 → 步末 saveState ——
        const calls = decision.calls
        state.usage.toolCalls += calls.length

        // 无进展检测（12 号 §6.4-3：signature = 工具名+入参规范化；
        // stableStringify 与审批缓存键同一实现——键序稳定防同语义漏检）
        const signature = calls.map((c) => `${c.toolName}:${stableStringify(c.input)}`).sort().join('|')
        if (signature && signature === lastSignature) {
          state.stagnantRounds++
          if (state.stagnantRounds >= stagnantLimit) {
            if (nudged) {
              // 提示注入后仍原地打转：以 stagnant 终止（12 号 §6.4；
              // 深度 review P3-4——原实现恒以 max_steps 兜底，stagnant 不可达）
              logger.warn(`[agent-loop] 无进展终止 def=${task.definitionId} scope=${task.scopeId}`)
              state.messages = [...state.messages, ...stepMessages]
              return this.stop(state, host, 'stagnant')
            }
            state.messages = [...state.messages, ...stepMessages, { role: 'assistant', content: STAGNANT_NUDGE } as ModelMessage]
            state.stagnantRounds = 0
            nudged = true
            await host.saveState(state)
            state.iteration++
            continue
          }
        } else {
          state.stagnantRounds = 0
        }
        lastSignature = signature

        // ai@6 已在本步内执行工具（execute 内含审批/超时/容错包装），
        // stepMessages 已含 assistant(tool-call) + tool(result) —— 12 号 §6.3：工具全部 settle 后
        state.messages = [...state.messages, ...stepMessages]
        for (const c of calls) {
          // toolCallId 进轨迹：宿主按 id 配对 call/result（并行工具完成序 ≠ 决策序，
          // 按下标配对会张冠李戴——深度 review P2-6 实证）
          host.emitTrajectory({
            iteration: state.iteration,
            kind: 'tool_call',
            name: c.toolName,
            payload: { toolCallId: c.toolCallId, args: c.input },
          })
        }
        await host.saveState(state) // —— 唯一持久化点（崩溃恢复边界）——
        state.iteration++
      }
      return resultOf(state, 'final')
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      const aborted = host.signal.aborted || err?.name === 'AbortError'
      if (aborted) {
        return this.stop(state, host, 'aborted')
      }
      logger.error('[agent-loop] 循环异常终止', e)
      state.stopReason = 'error'
      await host.saveState(state).catch((saveErr) =>
        logger.warn('[agent-loop] 异常路径补偿落盘失败（历史可能停留上一 save 点）', saveErr),
      )
      return resultOf(state, 'error', err?.message ?? String(e))
    }
  }

  // ==================== 工具装配（审批/超时/容错包装层，22 号 §3-C2） ====================

  private buildToolSet(task: AgentTask, host: AgentHost, state: AgentLoopState): ToolSet {
    const ai = this.aiModule
    if (!ai) return {}
    const timeoutMs = this.deps.toolTimeoutMs ?? 120_000
    const out: Record<string, unknown> = {}

    const requestApproval = this.deps.requestApproval
    for (const [name, def] of Object.entries(task.tools)) {
      // registry 桥接产物：校验/超时/截断的所有权在 registry 管线（深 review P1 定案——
      // 两层各做一遍会出现失败被报 ok:true、双计时器隐式取 min、双重截断打架）。
      // loop 只保留：审批短路 + 流事件/轨迹 + 错误形态归一
      const registryWrapped = (def as { registryWrapped?: boolean }).registryWrapped === true
      out[name] = ai.tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (input: unknown, options: { toolCallId: string }) => {
          host.emitStream({ kind: 'tool-start', toolName: name, toolCallId: options.toolCallId, args: input })

          // ① 审批短路（requiresApproval；缺省回调=拒绝——安全默认）。
          // try 包裹（总收口 review P2）：requestApproval throw（并行双卡单卡断言/
          // 审批通道异常）曾裸穿 execute——该动作的 tool-end 流事件与 tool_result
          // 轨迹永不发出（前端动作卡无终态、审计配对缺行）
          if (def.requiresApproval) {
            let decision: ApprovalDecision
            try {
              decision = requestApproval
                ? await requestApproval(def, input, {
                    scopeId: task.scopeId,
                    rawInput: task.input,
                    toolCallId: options.toolCallId,
                    signal: host.signal,
                  })
                : ({ action: 'reject', reason: 'no_approval_coordinator' } as ApprovalDecision)
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok: false })
              host.emitTrajectory({ iteration: state.iteration, kind: 'tool_result', name, payload: { toolCallId: options.toolCallId, denied: true, reason: msg } })
              return { ok: false, error: 'denied', detail: msg, hint: '该操作暂时无法获得审批，请调整方案。' }
            }
            const denyReason = (decision as { reason?: string }).reason
            if (decision.action !== 'approve' && decision.action !== 'approve_with_edit') {
              host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok: false })
              host.emitTrajectory({ iteration: state.iteration, kind: 'tool_result', name, payload: { toolCallId: options.toolCallId, denied: true, reason: denyReason } })
              return { ok: false, error: 'denied', detail: denyReason, hint: denyReason ? `操作未获批准：${denyReason}` : '用户拒绝了该操作，请调整方案。' }
            }
            if (decision.action === 'approve_with_edit') {
              input = decision.input
            }
          }

          // ② 原生工具：zod 校验（失败=结构化错误回填，模型自纠——14 号 §5.4 纪律）。
          // registry 包装工具：registry 管线在静态合并后校验（更准确），此处跳过
          if (!registryWrapped) {
            const parsed = def.inputSchema.safeParse(input)
            if (!parsed.success) {
              host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok: false })
              return { ok: false, error: 'INVALID_ARGS', detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, ZOD_ISSUE_MAX) }
            }
            input = parsed.data
          }

          // ③ 执行（超时 + signal + 异常捕获——错误永不 throw 出包装层）。
          // registry 包装工具：超时/截断在 registry 管线（executeTimeoutMs 旋钮），
          // loop 层不再套第二层计时器；返回值已是 loop 回填形（{ok,data}|{ok,error,...}）
          try {
            let result: unknown
            if (registryWrapped) {
              result = await def.execute(input as never, {
                scopeId: task.scopeId,
                rawInput: task.input,
                signal: host.signal,
                logContext: { definitionId: task.definitionId, tool: name, ...(task.runtimeContext ?? {}) },
                toolCallId: options.toolCallId,
              })
            } else {
              result = await withTimeout(
                def.execute(input as never, {
                  scopeId: task.scopeId,
                  rawInput: task.input,
                  signal: host.signal,
                  logContext: { definitionId: task.definitionId, tool: name, ...(task.runtimeContext ?? {}) },
                  toolCallId: options.toolCallId,
                }),
                timeoutMs,
                host.signal,
              )
            }
            const ok = registryWrapped ? (result as { ok?: boolean })?.ok !== false : true
            host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok })
            host.emitTrajectory({ iteration: state.iteration, kind: 'tool_result', name, payload: { toolCallId: options.toolCallId, ok } })
            return registryWrapped ? result : { ok: true, data: truncateJson(result) }
          } catch (e: unknown) {
            const err = e as { message?: string; name?: string }
            const cancelled = err?.name === 'TimeoutError' ? false : host.signal.aborted
            host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok: false })
            host.emitTrajectory({ iteration: state.iteration, kind: 'tool_result', name, payload: { toolCallId: options.toolCallId, ok: false, error: err?.message } })
            return {
              ok: false,
              error: cancelled ? 'CANCELLED' : err?.name === 'TimeoutError' ? 'TIMEOUT' : 'INTERNAL',
              detail: err?.message?.slice(0, TOOL_ERROR_DETAIL_MAX_CHARS),
              hint: err?.name === 'TimeoutError' ? `工具执行超过 ${Math.round(timeoutMs / 1000)}s` : undefined,
            }
          }
        },
      })
    }
    return out as ToolSet
  }

  private async stop(
    state: AgentLoopState,
    host: AgentHost,
    reason: AgentResult['stopReason'],
    error?: string,
  ): Promise<AgentResult> {
    state.stopReason = reason
    state.converged = reason === 'final'
    await host.saveState(state).catch((e) =>
      logger.warn(`[agent-loop] 终止补偿落盘失败（reason=${reason}，历史停留上一 save 点）`, e),
    )
    host.emitTrajectory({ iteration: state.iteration, kind: 'guardrail_stop', payload: { reason } })
    return resultOf(state, reason, error)
  }
}

// ==================== 纯函数（可独立单测） ====================

export function initState(task: AgentTask, now: number): AgentLoopState {
  return {
    version: 1,
    task: {
      definitionId: task.definitionId,
      scopeId: task.scopeId,
      input: task.input,
      maxSteps: task.maxSteps,
      toolNames: Object.keys(task.tools),
    },
    messages: [{ role: 'user', content: task.input }],
    iteration: 0,
    usage: { promptTokens: 0, completionTokens: 0, toolCalls: 0 },
    startedAtMs: now,
    converged: false,
    stagnantRounds: 0,
  }
}

/** finishReason + 步消息 → Decision 三态（12 号 §5.4） */
export function normalizeDecision(
  finishReason: string,
  stepMessages: ModelMessage[],
): { type: 'final'; answer: string } | { type: 'tool_calls'; calls: ParsedToolCall[] } {
  const calls: ParsedToolCall[] = []
  let answer = ''
  for (const m of stepMessages) {
    if (m.role !== 'assistant') continue
    const content = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content ?? '') }]
    for (const part of content as Array<{ type: string; text?: string; toolName?: string; toolCallId?: string; input?: unknown }>) {
      if (part.type === 'tool-call' && part.toolName) {
        calls.push({ toolCallId: part.toolCallId ?? '', toolName: part.toolName, input: part.input })
      } else if (part.type === 'text' && part.text) {
        answer += part.text
      }
    }
  }
  if (calls.length > 0 || finishReason === 'tool-calls') {
    return { type: 'tool_calls', calls }
  }
  return { type: 'final', answer }
}

export function buildSystem(task: AgentTask, state: AgentLoopState): string {
  const parts = [task.systemPrompt]
  if (task.snapshot) parts.push(`\n[当前项目状态快照（来自数据库，确证事实）]\n${task.snapshot}`)
  if (state.suspended) parts.push('\n[系统注记] 上一次操作曾挂起等待人工，现已恢复。等待期间外部状态可能已变化，涉及副作用请先核实。')
  return parts.join('\n')
}

export function resultOf(state: AgentLoopState, stopReason: AgentResult['stopReason'], error?: string): AgentResult {
  return {
    output: state.finalAnswer ?? '',
    stopReason,
    usage: { ...state.usage },
    iterations: state.iteration,
    error,
  }
}

/** 工具结果 JSON 截断（8k 字符；head/tail 切片——14 号 §5.5 简化版） */
export function truncateJson(value: unknown, max = 8192): string {
  let s: string
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
  if (s.length <= max) return s
  const head = Math.floor(max * 0.6)
  const tail = Math.floor(max * 0.25)
  return `${s.slice(0, head)}\n…[truncated ${s.length} chars]…\n${s.slice(-tail)}`
}
