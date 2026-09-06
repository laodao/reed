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

const logger = createLogger('AgentLoop')

export interface LoopRunnerDeps {
  resolveModel: (opts?: { providerConfigId?: string; modelId?: string }) => Promise<LanguageModel>
  /** 审批回调：requiresApproval 工具执行前调用；缺省=拒绝（安全默认，22 号 §3-C2） */
  requestApproval?: (tool: AgentToolDef, input: unknown, call: { scopeId: string; rawInput: string; toolCallId: string; signal?: AbortSignal }) => Promise<ApprovalDecision>
  /** 单工具超时 ms（缺省 120s；12 号 §9） */
  toolTimeoutMs?: number
  /** 无进展检测阈值（12 号 §6.4-3；缺省 3 轮完全相同 signature） */
  stagnantLimit?: number
  clock?: () => number
}

interface AiModule {
  streamText: typeof aiStreamText
  tool: (def: Record<string, unknown>) => unknown
}

const STAGNANT_NUDGE = '检测到你连续多轮执行完全相同的工具调用。请更换策略，或直接给出最终答案。'

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
    }
    return this.loop(state, task, host)
  }

  /** 契约别名（23 号 §5 LoopRunner.resume）——与 resumeFromSuspend 同一入口 */
  async resume(
    state: AgentLoopState,
    decision: { action: string; values?: Record<string, unknown>; comment?: string },
    host: AgentHost,
  ): Promise<AgentResult> {
    return this.resumeFromSuspend(state, decision, host)
  }

  /** 挂起恢复入口：人工决策作为 tool 结果回填后继续（12 号 §6.2） */
  async resumeFromSuspend(
    state: AgentLoopState,
    _decision: { action: string; values?: Record<string, unknown>; comment?: string },
    host: AgentHost,
  ): Promise<AgentResult> {
    // 决策回填：批准=工具继续执行（挂起点在审批回调内部，恢复时回调已 resolve）；
    // 驳回=注入 system 注记后进入下一轮（模型自行改路）
    const note =
      _decision.action === 'reject'
        ? `人工驳回了该操作${_decision.comment ? `：${_decision.comment}` : ''}。请调整方案或直接给出最终答案。`
        : `人工已确认该操作。`
    state.messages = [...state.messages, { role: 'assistant', content: `[系统] ${note}` } as ModelMessage]
    state.suspended = undefined
    await host.saveState(state)
    return this.loop(state, state.task as never, host)
  }

  // ==================== 主循环 ====================

  private async loop(state: AgentLoopState, task: AgentTask, host: AgentHost): Promise<AgentResult> {
    const ai = await this.loadAi()
    const model = await this.deps.resolveModel(task.modelPreference)
    const stagnantLimit = this.deps.stagnantLimit ?? 3
    const system = buildSystem(task, state)
    let lastSignature = ''

    try {
      while (!state.converged) {
        // —— 护栏（12 号 §9：每步 LLM 调用前）——
        if (state.iteration >= state.task.maxSteps) {
          return this.stop(state, host, 'max_steps')
        }
        if (host.signal.aborted) {
          return this.stop(state, host, 'aborted')
        }

        // —— 单步决策（ai@6：不传 stopWhen = 恰好一步）——
        const stepStart = this.clock()
        const tools = this.buildToolSet(task, host)
        const stream = ai.streamText({
          model,
          system,
          messages: state.messages,
          tools: Object.keys(tools).length > 0 ? tools : undefined,
          abortSignal: host.signal,
        })

        let stepText = ''
        for await (const part of stream.fullStream) {
          if (part.type === 'text-delta') {
            stepText += part.text
            host.emitStream({ kind: 'delta', text: part.text })
          }
        }
        const finishReason = await stream.finishReason
        const stepMessages = (await stream.response).messages
        const usage = (await stream.totalUsage) ?? {}

        // usage 累计（缺失记 0；12 号 §5.6 口径在 13 号，chars/4 兜底由护栏层做）
        state.usage.promptTokens += usage.inputTokens ?? 0
        state.usage.completionTokens += usage.outputTokens ?? 0

        const decision = normalizeDecision(finishReason, stepMessages)
        const decisionToolNames = decision.type === 'tool_calls' ? decision.calls.map((c) => c.toolName) : []
        host.emitTrajectory({
          iteration: state.iteration,
          kind: 'decision',
          payload: { thought: stepText.slice(0, 500), finishReason, toolCalls: decisionToolNames },
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          durationMs: this.clock() - stepStart,
        })

        if (decision.type === 'final') {
          state.converged = true
          state.finalAnswer = decision.answer
          state.messages = [...state.messages, ...stepMessages]
          await host.saveState(state)
          host.emitTrajectory({ iteration: state.iteration, kind: 'final', payload: { answer: decision.answer.slice(0, 2000) } })
          return resultOf(state, 'final')
        }

        // —— tool_calls：执行 → 回填 → 轨迹 → 步末 saveState ——
        const calls = decision.calls ?? []
        state.usage.toolCalls += calls.length

        // 无进展检测（12 号 §6.4-3：signature = 工具名+入参规范化）
        const signature = calls.map((c) => `${c.toolName}:${JSON.stringify(c.input)}`).sort().join('|')
        if (signature && signature === lastSignature) {
          state.stagnantRounds++
          if (state.stagnantRounds >= stagnantLimit) {
            state.messages = [...state.messages, ...stepMessages, { role: 'assistant', content: STAGNANT_NUDGE } as ModelMessage]
            state.stagnantRounds = -2 // 注入提示后再给 2 轮（12 号 §6.4）
            await host.saveState(state)
            continue
          }
          if (state.stagnantRounds === 0) {
            state.stagnantRounds = 1
          }
        } else {
          state.stagnantRounds = 0
        }
        if (state.stagnantRounds < 0) state.stagnantRounds++
        lastSignature = signature

        // ai@6 已在本步内执行工具（execute 内含审批/超时/容错包装），
        // stepMessages 已含 assistant(tool-call) + tool(result) —— 12 号 §6.3：工具全部 settle 后
        state.messages = [...state.messages, ...stepMessages]
        for (const c of calls) {
          host.emitTrajectory({ iteration: state.iteration, kind: 'tool_call', name: c.toolName, payload: { args: c.input } })
        }
        await host.saveState(state) // —— 唯一持久化点（崩溃恢复边界）——
        state.iteration++
      }
      return resultOf(state, 'final')
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string; name_?: string }
      const aborted = host.signal.aborted || err?.name === 'AbortError'
      if (aborted) {
        return this.stop(state, host, 'aborted')
      }
      logger.error('[agent-loop] 循环异常终止', e)
      state.stopReason = 'error'
      await host.saveState(state).catch(() => undefined)
      return resultOf(state, 'error', err?.message ?? String(e))
    }
  }

  // ==================== 工具装配（审批/超时/容错包装层，22 号 §3-C2） ====================

  private buildToolSet(task: AgentTask, host: AgentHost): ToolSet {
    const ai = this.aiModule
    if (!ai) return {}
    const timeoutMs = this.deps.toolTimeoutMs ?? 120_000
    const out: Record<string, unknown> = {}

    const requestApproval = this.deps.requestApproval
    for (const [name, def] of Object.entries(task.tools)) {
      out[name] = ai.tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (input: unknown, options: { toolCallId: string }) => {
          host.emitStream({ kind: 'tool-start', toolName: name, toolCallId: options.toolCallId })

          // ① 审批短路（requiresApproval；缺省回调=拒绝——安全默认）
          if (def.requiresApproval) {
            const decision = requestApproval
              ? await requestApproval(def, input, {
                  scopeId: task.scopeId,
                  rawInput: task.input,
                  toolCallId: options.toolCallId,
                  signal: host.signal,
                })
              : ({ action: 'reject', reason: 'no_approval_coordinator' } as ApprovalDecision)
            if (decision.action !== 'approve' && decision.action !== 'approve_with_edit') {
              host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok: false })
              host.emitTrajectory({ iteration: 0, kind: 'tool_result', name, payload: { denied: true, reason: (decision as { reason?: string }).reason } })
              return { ok: false, error: 'denied', hint: '用户拒绝了该操作，请调整方案。' }
            }
            if (decision.action === 'approve_with_edit') {
              input = decision.input
            }
          }

          // ② zod 校验（失败=结构化错误回填，模型自纠——14 号 §5.4 纪律）
          const parsed = def.inputSchema.safeParse(input)
          if (!parsed.success) {
            host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok: false })
            return { ok: false, error: 'INVALID_ARGS', detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 8) }
          }

          // ③ 执行（超时 + signal + 异常捕获——错误永不 throw 出包装层）
          try {
            const result = await withTimeout(
              def.execute(parsed.data as never, {
                scopeId: task.scopeId,
                rawInput: task.input,
                signal: host.signal,
                logContext: { definitionId: task.definitionId, tool: name },
              }),
              timeoutMs,
              host.signal,
            )
            host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok: true })
            host.emitTrajectory({ iteration: 0, kind: 'tool_result', name, payload: { ok: true } })
            return { ok: true, data: truncateJson(result) }
          } catch (e: unknown) {
            const err = e as { message?: string; name?: string }
            const cancelled = err?.name === 'TimeoutError' ? false : host.signal.aborted
            host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok: false })
            host.emitTrajectory({ iteration: 0, kind: 'tool_result', name, payload: { ok: false, error: err?.message } })
            return {
              ok: false,
              error: cancelled ? 'CANCELLED' : err?.name === 'TimeoutError' ? 'TIMEOUT' : 'INTERNAL',
              detail: err?.message?.slice(0, 300),
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
  ): Promise<AgentResult> {
    state.stopReason = reason
    state.converged = reason === 'final'
    await host.saveState(state).catch(() => undefined)
    host.emitTrajectory({ iteration: state.iteration, kind: 'guardrail_stop', payload: { reason } })
    return resultOf(state, reason)
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

function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error('tool timeout'), { name: 'TimeoutError' })), ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    p.then(
      (v) => {
        clearTimeout(t)
        signal?.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        signal?.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}
