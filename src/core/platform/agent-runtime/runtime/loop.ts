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
import { sleepWithAbort, withTimeout } from './async'
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
import {
  turnContextMessage,
  hasCurrentTurnContextBlock,
  withPromptCacheBreakpoint,
  isPromptCacheEnabled,
} from '../context/turn-context'
import { classifyMessage, collapseSupersededToolResults } from '../context/context-manager'
import { buildWireNameMap, toWireName } from '../tools/wire-name'
import type { ToolArtifactPort } from '../tools/artifacts'

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
  /**
   * 工具产物归档端口（39 号 P1-1）：非 registry 包装工具的完整结果在截断前落档，
   * 上下文内占位可经 get_tool_result 回查。registry 包装工具的归档在 registry 管线。
   */
  artifacts?: ToolArtifactPort | null
  /** 提示词缓存断点（39 号 P0-1；缺省读 AGENT_PROMPT_CACHE env，非 '0' 即开） */
  promptCache?: boolean
  /**
   * 模型流失败重试次数（43号 O1，借 codex responses_retry）：可重试流错误
   * （429/5xx/网络中断/空闲超时）按指数退避整步重放。缺省读
   * AGENT_STREAM_MAX_RETRIES（夹到 [0,10]），env 缺省 2。
   */
  modelMaxRetries?: number
  /**
   * 步级流空闲超时 ms（43号 O2，借 codex SSE idle timeout 缺省 300s）：一步内
   * 超过此时长无任何流事件即中止本次尝试（按可重试失败处理）。缺省读
   * AGENT_STREAM_IDLE_TIMEOUT_MS；0 = 关闭。
   */
  streamIdleTimeoutMs?: number
  /**
   * 步间用户输入注入端口（43号 O8 steer，借 codex pending input drain）：每个
   * 步采样前 drain 一次，返回的消息追加进历史（user 形态由调用方保证）。缺省
   * 无 = 无步间注入（整轮级排队语义不变）。
   */
  pendingInput?: { drain(): ModelMessage[] }
  clock?: () => number
}

interface AiModule {
  streamText: typeof aiStreamText
  tool: (def: Record<string, unknown>) => unknown
}

const STAGNANT_NUDGE = '检测到你连续多轮执行完全相同的工具调用。请更换策略，或直接给出最终答案。'

/** 轮询豁免工具（M8）：等待长任务终态的合法只读轮询，不计无进展（maxSteps 仍兜底） */
const POLLING_EXEMPT_TOOLS: ReadonlySet<string> = new Set(['get_workflow_run'])

// —— 展示/轨迹截断上限（命名常量：观测面字段裁剪，非行为参数） ——
const TRAJECTORY_THOUGHT_MAX_CHARS = 4000
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
      // appended=初始消息（原始流水首行=本轮用户输入，39 号 P0-2）
      await host.saveState(state, { appended: [...state.messages] })
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
      // 冻结语义只属于挂起时刻（宿主 abort 止住 IO）；恢复后是正常收尾——
      // 先清 suspended 让 stop() 走常规路径（human_rejected 落 stopReason）
      state.suspended = undefined
      return this.stop(state, host, 'human_rejected')
    }
    // 批准：注入注记后进入下一轮（模型重发挂起调用，宿主的一次性授权放行）
    const note = `人工已确认该操作。`
    const noteMsg = { role: 'assistant', content: `[系统] ${note}` } as ModelMessage
    state.messages = [...state.messages, noteMsg]
    state.suspended = undefined
    await host.saveState(state, { appended: [noteMsg] })
    return this.loop(state, task, host)
  }

  // ==================== 主循环 ====================

  private async loop(state: AgentLoopState, task: AgentTask, host: AgentHost): Promise<AgentResult> {
    const ai = await this.loadAi()
    const model = await this.deps.resolveModel(task.modelPreference)
    const stagnantLimit = this.deps.stagnantLimit ?? 3
    const system = buildSystem(task)
    const cacheEnabled = this.deps.promptCache ?? isPromptCacheEnabled()
    // 线上名映射（41 号）：provider 函数名规范 ^[a-zA-Z0-9_-]{1,64}$——pack:<id>:<name>
    // 冒号名整单 400。装配用线上名、回呼还原规范名（每轮重建：工具集本轮固定）
    const { canonicalToWire, wireToCanonical } = buildWireNameMap(Object.keys(task.tools))
    let lastSignature = ''
    let nudged = false // 无进展提示只注入一次；再达限以 stagnant 终止
    // 最近一步模型实测 inputTokens（压缩水位依据——state.usage.promptTokens 是
    // 跨步累计和，用作水位会假触发+压缩空转，批 6 review P1-3）
    let lastStepInputTokens = 0
    // 原始流水增量（39 号 P0-2）：loop 产生的每条新消息在此累积，随最近的
    // saveState 上报后清空。宿主自产消息（本轮 user 输入/种子迁移）由宿主侧
    // 自行补报——两层各自诚实上报，合并即完整 append-only 流水。
    let pendingAppended: ModelMessage[] = []

    // 崩溃恢复装配：悬空工具调用哨兵修复（一次性持久化——幂等，返回原引用则跳过）
    if (this.deps.context) {
      const repaired = this.deps.context.assemble(state.messages)
      if (repaired !== state.messages) {
        const known = new Set(state.messages)
        state.messages = repaired
        pendingAppended = repaired.filter((m) => !known.has(m))
        await host.saveState(state, { appended: [...pendingAppended] })
        pendingAppended = []
      }
    }

    // 轮次上下文块注入（39 号 P0-1）：snapshot/dynamicContext/suspended 注记出
    // system、入消息尾——system 跨轮稳定是前缀缓存的前提；块每轮刷新、随历史
    // 持久化（历史即"当时的上下文"）。幂等：本轮已有块（挂起恢复重入）跳过。
    const turnContext = buildTurnContext(task, state)
    if (turnContext && !hasCurrentTurnContextBlock(state.messages)) {
      const block = turnContextMessage(turnContext)
      state.messages = [...state.messages, block]
      pendingAppended.push(block)
    }

    try {
      while (!state.converged) {
        // —— 护栏（12 号 §9：每步 LLM 调用前）——
        if (state.iteration >= state.task.maxSteps) {
          return this.stop(state, host, 'max_steps', undefined, [...pendingAppended])
        }
        if (host.signal.aborted) {
          return this.stop(state, host, 'aborted', undefined, [...pendingAppended])
        }

        // —— 步间用户输入注入（43号 O8 steer，借 codex pending input drain）：
        // 每步采样前 drain 一次，user 消息进历史+流水（不打断当前步，下一步可见）
        const pendingInput = this.deps.pendingInput?.drain() ?? []
        if (pendingInput.length > 0) {
          state.messages = [...state.messages, ...pendingInput]
          pendingAppended.push(...pendingInput)
          await host.saveState(state, { appended: [...pendingAppended] })
          pendingAppended = []
        }

        // —— 压缩守恒（12 号 R6：步边界水位检查；结果持久化）——
        if (this.deps.context) {
          const compacted = await this.deps.context.maybeCompact({
            messages: state.messages,
            lastInputTokens: lastStepInputTokens,
            signal: host.signal,
          })
          if (compacted) {
            // 工作集被重写；流水只补记新生的摘要消息——被保留的消息（身份不变）
            // 与被剪枝/折叠的原文都已在流水（39 号 P0-2 正是为此保底），剪枝克隆
            // 不重复入流水
            const summaries = compacted.filter((m) => classifyMessage(m) === 'compaction.summary')
            state.messages = compacted
            pendingAppended.push(...summaries)
            await host.saveState(state, { appended: [...pendingAppended] })
            pendingAppended = []
          }
        }

        // —— 单步决策（ai@6：不传 stopWhen = 恰好一步）——
        // 步级尝试循环（43号 O1/O2/O3，借 codex responses_retry + SSE idle timeout）：
        // 可重试流失败按指数退避整步重放；空闲超时中止本尝试（可重试）；
        // 疑似上下文超窗先紧急压缩再重试一次（不占流重试预算）。
        const stepStart = this.clock()
        const tools = this.buildToolSet(task, host, state, canonicalToWire)
        const attemptArgs = {
          ai,
          model,
          system,
          tools,
          cacheEnabled,
          host,
          idleTimeoutMs: this.idleTimeoutMs(),
          outbound: () => (this.deps.context ? this.deps.context.assemble(state.messages) : state.messages),
        }
        const maxRetries = this.maxStreamRetries()
        let attempt = 0
        let overflowRetried = false
        let outcome = await this.runStepAttempt(attemptArgs)
        while (outcome.kind === 'failed') {
          if (
            outcome.overflow &&
            !overflowRetried &&
            !host.signal.aborted &&
            typeof this.deps.context?.forceCompact === 'function'
          ) {
            overflowRetried = true
            const compacted = await this.deps.context
              .forceCompact({ messages: state.messages, signal: host.signal })
              .catch(() => null)
            if (compacted) {
              const summaries = compacted.filter((m) => classifyMessage(m) === 'compaction.summary')
              state.messages = compacted
              pendingAppended.push(...summaries)
              await host.saveState(state, { appended: [...pendingAppended] })
              pendingAppended = []
              logger.warn(`[agent-loop] 疑似上下文超窗：紧急压缩后重试当前步 def=${task.definitionId}`)
              outcome = await this.runStepAttempt(attemptArgs)
              continue
            }
          }
          if (host.signal.aborted) {
            outcome = { kind: 'aborted' }
            break
          }
          if (!outcome.retryable || attempt >= maxRetries) break
          attempt++
          // 已知限制（43号 review P1-3，登记不修）：失败尝试已发出的 delta/流事件
          // 无法撤回——重试成功后 UI 可见「半截文本+重放全文」拼接；修复需流协议
          // 增加 reply:reset 类事件，涉及全部宿主消费方，留待独立批次
          // 服务端 Retry-After 优先（P2-8），否则指数退避 200ms × 2^(n-1) × jitter
          const delay = outcome.retryAfterMs ?? streamRetryBackoffMs(attempt)
          logger.warn(
            `[agent-loop] 模型流失败（可重试，${attempt}/${maxRetries}，${Math.round(delay)}ms 后重放）def=${task.definitionId}: ${outcome.message}`,
          )
          await sleepWithAbort(delay, host.signal)
          outcome = await this.runStepAttempt(attemptArgs)
        }

        if (outcome.kind === 'aborted') {
          return this.stop(state, host, 'aborted', undefined, [...pendingAppended])
        }
        if (outcome.kind === 'failed') {
          // 流级失败短路（12 号 §6.5 错误分类）：部分内容留痕后以 error 终止，
          // 绝不把截断文本当最终答案
          logger.error(`[agent-loop] 模型流失败 def=${task.definitionId} scope=${task.scopeId}: ${outcome.message}`)
          state.messages = [...state.messages, ...outcome.stepMessages]
          return this.stop(state, host, 'error', outcome.message, [...pendingAppended, ...outcome.stepMessages])
        }

        const finishReason = outcome.finishReason
        const stepMessages = outcome.stepMessages
        const stepText = outcome.stepText

        // usage 累计（缺失记 0；12 号 §5.6 口径在 13 号，chars/4 兜底由护栏层做）
        state.usage.promptTokens += outcome.usage.inputTokens ?? 0
        state.usage.completionTokens += outcome.usage.outputTokens ?? 0
        state.usage.cachedInputTokens = (state.usage.cachedInputTokens ?? 0) + (outcome.usage.cacheReadTokens ?? 0)
        lastStepInputTokens = outcome.usage.inputTokens ?? 0

        if (finishReason === 'length') {
          // 截断完成：仍按 final 收敛，但打标可观测（答案可能不完整）
          logger.warn(`[agent-loop] 模型因长度上限截断（finishReason=length）def=${task.definitionId}`)
        }

        const decision = normalizeDecision(finishReason, stepMessages)
        // 线上名还原（41 号）：模型回呼的是 provider 函数名（线上名），下游
        // （轨迹/轮询豁免/无进展签名）全程只见规范名
        if (decision.type === 'tool_calls') {
          for (const c of decision.calls) {
            // 二次查表（42号 review P2）：模型照抄目录/提示里的规范冒号名时，按同规则
            // 折叠后可命中映射（pack:demo:read → pack_demo_read）
            c.toolName = wireToCanonical.get(c.toolName)
              ?? wireToCanonical.get(toWireName(c.toolName))
              ?? c.toolName
          }
        }
        const decisionToolNames = decision.type === 'tool_calls' ? decision.calls.map((c) => c.toolName) : []
        // thought 先按字符截 4000，再按 payload 字节预算二次收紧（总收口 A-P2-7：
        // 4 字节字符 4000 chars ≈ 16KB 可击穿 payload 字节预算退化为 _truncated 整行）
        let thought = stepText.slice(0, TRAJECTORY_THOUGHT_MAX_CHARS)
        const decisionPayload = { thought, finishReason, truncated: finishReason === 'length' || undefined, toolCalls: decisionToolNames }
        if (JSON.stringify(decisionPayload).length > 14_000) {
          thought = thought.slice(0, Math.floor(thought.length * 0.6))
        }
        host.emitTrajectory({
          iteration: state.iteration,
          kind: 'decision',
          payload: {
            thought,
            finishReason,
            truncated: finishReason === 'length' || undefined,
            toolCalls: decisionToolNames,
          },
          promptTokens: outcome.usage.inputTokens,
          completionTokens: outcome.usage.outputTokens,
          durationMs: this.clock() - stepStart,
        })

        if (decision.type === 'final') {
          state.converged = true
          state.finalAnswer = decision.answer
          state.messages = [...state.messages, ...stepMessages]
          pendingAppended.push(...stepMessages)
          await host.saveState(state, { appended: [...pendingAppended] })
          pendingAppended = []
          host.emitTrajectory({ iteration: state.iteration, kind: 'final', payload: { answer: decision.answer.slice(0, TRAJECTORY_ANSWER_MAX_CHARS) } })
          return resultOf(state, 'final')
        }

        // —— tool_calls：执行 → 回填 → 轨迹 → 步末 saveState ——
        const calls = decision.calls
        state.usage.toolCalls += calls.length

        // 无进展检测（12 号 §6.4-3：signature = 工具名+入参规范化；
        // stableStringify 与审批缓存键同一实现——键序稳定防同语义漏检）
        // 轮询豁免（M8）：等待长工作流终态的合法轮询（入参不变是轮询语义本身，
        // 进展体现在返回值里）不计无进展；护栏仍有 maxSteps 兜底
        const isPollingStep = calls.every((c) => POLLING_EXEMPT_TOOLS.has(c.toolName))
        const signature = calls.map((c) => `${c.toolName}:${stableStringify(c.input)}`).sort().join('|')
        if (signature && signature === lastSignature && !isPollingStep) {
          state.stagnantRounds++
          if (state.stagnantRounds >= stagnantLimit) {
            if (nudged) {
              // 提示注入后仍原地打转：以 stagnant 终止（12 号 §6.4；
              // 深度 review P3-4——原实现恒以 max_steps 兜底，stagnant 不可达）
              logger.warn(`[agent-loop] 无进展终止 def=${task.definitionId} scope=${task.scopeId}`)
              state.messages = [...state.messages, ...stepMessages]
              return this.stop(state, host, 'stagnant', undefined, [...pendingAppended, ...stepMessages])
            }
            const nudgeMsg = { role: 'assistant', content: STAGNANT_NUDGE } as ModelMessage
            state.messages = [...state.messages, ...stepMessages, nudgeMsg]
            state.stagnantRounds = 0
            nudged = true
            pendingAppended.push(...stepMessages, nudgeMsg)
            await host.saveState(state, { appended: [...pendingAppended] })
            pendingAppended = []
            state.iteration++
            continue
          }
        } else if (!isPollingStep) {
          state.stagnantRounds = 0
        }
        lastSignature = signature

        // ai@6 已在本步内执行工具（execute 内含审批/超时/容错包装），
        // stepMessages 已含 assistant(tool-call) + tool(result) —— 12 号 §6.3：工具全部 settle 后
        state.messages = [...state.messages, ...stepMessages]
        // 同签名大结果折叠（39 号 P1-1）：重试/返工场景旧的大结果占位化，只留
        // 最新全文——失败原因本身很小不受影响；折叠改写不进流水（原文已在）
        const collapsed = collapseSupersededToolResults(state.messages)
        if (collapsed !== state.messages) state.messages = collapsed
        pendingAppended.push(...stepMessages)
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
        await host.saveState(state, { appended: [...pendingAppended] }) // —— 唯一持久化点（崩溃恢复边界）——
        pendingAppended = []
        state.iteration++
      }
      return resultOf(state, 'final')
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      const aborted = host.signal.aborted || err?.name === 'AbortError'
      if (aborted) {
        return this.stop(state, host, 'aborted', undefined, [...pendingAppended])
      }
      logger.error('[agent-loop] 循环异常终止', e)
      state.stopReason = 'error'
      await host.saveState(state, { appended: [...pendingAppended] }).catch((saveErr) =>
        logger.warn('[agent-loop] 异常路径补偿落盘失败（历史可能停留上一 save 点）', saveErr),
      )
      pendingAppended = []
      return resultOf(state, 'error', err?.message ?? String(e))
    }
  }

  // ==================== 工具装配（审批/超时/容错包装层，22 号 §3-C2） ====================

  // ==================== 单步尝试（43号 O1/O2：重试的基本单元） ====================

  private maxStreamRetries(): number {
    return this.deps.modelMaxRetries ?? parseStreamMaxRetries(process.env.AGENT_STREAM_MAX_RETRIES)
  }

  private idleTimeoutMs(): number {
    return this.deps.streamIdleTimeoutMs ?? parseIdleTimeoutMs(process.env.AGENT_STREAM_IDLE_TIMEOUT_MS)
  }

  /**
   * 单次步尝试：空闲超时看门狗（43号 O2）+ 流消费 + 失败分类（43号 O1/O3 的
   * 判定依据）。中止语义双轨：host signal = 用户取消（aborted，不重试）；步级
   * 看门狗中止 = 可重试流失败。重试重放整个请求（借 codex：re-clone history），
   * 已执行的侧效工具可能重复——由工具幂等纪律（12 号 §9）覆盖。
   */
  private async runStepAttempt(args: {
    ai: AiModule
    model: LanguageModel
    system: string
    tools: ToolSet
    cacheEnabled: boolean
    host: AgentHost
    idleTimeoutMs: number
    outbound: () => ModelMessage[]
  }): Promise<StepAttempt> {
    const hostSignal = args.host.signal
    const stepController = new AbortController()
    const onHostAbort = (): void => stepController.abort()
    if (hostSignal.aborted) onHostAbort()
    else hostSignal.addEventListener('abort', onHostAbort, { once: true })

    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let idleFired = false
    const disarmIdle = (): void => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }
    const armIdle = (): void => {
      if (args.idleTimeoutMs <= 0 || idleFired || stepController.signal.aborted) return
      disarmIdle()
      idleTimer = setTimeout(() => {
        idleFired = true
        stepController.abort(new Error(STREAM_IDLE_ABORT_REASON))
      }, args.idleTimeoutMs)
      idleTimer.unref?.()
    }

    try {
      armIdle()
      const outbound = args.outbound()
      const stream = args.ai.streamText({
        model: args.model,
        system: args.system,
        // 缓存断点只作用于本次调用的出站拷贝（39 号 P0-1）——持久化历史保持原生形态
        messages: args.cacheEnabled ? withPromptCacheBreakpoint(outbound) : outbound,
        tools: Object.keys(args.tools).length > 0 ? args.tools : undefined,
        abortSignal: stepController.signal,
      })

      let stepText = ''
      let streamError: string | undefined
      let streamErrorObj: unknown
      // 空闲超时/宿主中止的看门狗竞速：provider 流不感知 abort signal 时（假死
      // 流）迭代器永不返回——race 保证本尝试有界结束（43号 O2 的兜底半边）
      let onStepAbort: (() => void) | null = null
      const aborted = new Promise<never>((_, reject) => {
        onStepAbort = () =>
          reject(stepController.signal.reason instanceof Error ? stepController.signal.reason : new Error('aborted'))
        if (stepController.signal.aborted) onStepAbort()
        else stepController.signal.addEventListener('abort', onStepAbort, { once: true })
      })
      // 提取类 promise（finishReason/response/totalUsage）同样竞速：底层流被取消
      // 后它们可能永不结算——本尝试必须有界结束
      const raceAbort = <T>(p: PromiseLike<T>): Promise<T> => Promise.race([p, aborted]) as Promise<T>
      try {
        const iterator = (stream.fullStream as AsyncIterable<unknown>)[Symbol.asyncIterator]()
        try {
          for (;;) {
            const next = (await raceAbort(iterator.next())) as { done?: boolean; value?: unknown }
            if (next.done) break
            const part = next.value as { type?: string; text?: string; error?: unknown }
            armIdle() // 任意流事件（含 reasoning/工具 part）都证明链路存活
            if (part.type === 'text-delta') {
              stepText += part.text ?? ''
              args.host.emitStream({ kind: 'delta', text: part.text ?? '' })
            } else if (part.type === 'error') {
              // provider 中途失败（SSE error chunk）以 error part 收尾而非 throw——
              // 不捕获则错误轮被当 final 收敛（批 1-4 深度 review P1 实证）
              const err = part.error
              streamErrorObj = err
              streamError = err instanceof Error ? err.message : String(err)
            }
          }
        } finally {
          // 中止路径：尽力关闭底层迭代器（挂起流不阻止本次尝试收尾）
          void (iterator as { return?: () => unknown }).return?.()
        }
      } catch (e) {
        // 消费途中 throw（abort/网络断开）：与 error part 同类处理
        if (streamErrorObj === undefined) {
          streamErrorObj = e
          streamError = e instanceof Error ? e.message : String(e)
        }
      }

      // 部分内容提取（无条件尝试）：失败留痕历史依赖它（宁可重放不丢史——⑪ 锚点）；
      // 提取失败（abort 形态）不掩盖已捕获的流错误
      let finishReason = 'error'
      let stepMessages: ModelMessage[] = []
      let usage: StepUsage = {}
      try {
        finishReason = await raceAbort(stream.finishReason)
        const response = await raceAbort(stream.response)
        stepMessages = response.messages as ModelMessage[]
        const u = (await raceAbort(stream.totalUsage)) ?? {}
        usage = {
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          cacheReadTokens:
            u.inputTokenDetails?.cacheReadTokens ?? (u as { cachedInputTokens?: number }).cachedInputTokens,
        }
      } catch (e) {
        if (streamErrorObj === undefined) {
          streamErrorObj = e
          streamError = e instanceof Error ? e.message : String(e)
        }
      }

      if (streamErrorObj !== undefined || finishReason === 'error') {
        if (hostSignal.aborted) return { kind: 'aborted' }
        const cls = classifyStepFailure(streamErrorObj, {
          hostAborted: hostSignal.aborted,
          stepIdleTimeout: idleFired,
        })
        return {
          kind: 'failed',
          message: streamError ?? '模型流以 error 终止（finishReason=error）',
          stepMessages,
          retryable: cls.retryable,
          overflow: cls.overflow,
          retryAfterMs: cls.retryAfterMs,
        }
      }
      return { kind: 'ok', finishReason, stepMessages, usage, stepText }
    } finally {
      disarmIdle()
      hostSignal.removeEventListener('abort', onHostAbort)
    }
  }

  private buildToolSet(
    task: AgentTask,
    host: AgentHost,
    state: AgentLoopState,
    canonicalToWire: Map<string, string>,
  ): ToolSet {
    const ai = this.aiModule
    if (!ai) return {}
    const timeoutMs = this.deps.toolTimeoutMs ?? 120_000
    const out: Record<string, unknown> = {}

    const requestApproval = this.deps.requestApproval
    for (const [name, def] of Object.entries(task.tools)) {
      // key 用线上名（41 号）：provider 函数名不允许冒号（pack:<id>:<name> 形态）；
      // 闭包内 name 仍是规范名——流事件/轨迹/审计全程规范名
      const wireName = canonicalToWire.get(name) ?? name
      // registry 桥接产物：校验/超时/截断的所有权在 registry 管线（深 review P1 定案——
      // 两层各做一遍会出现失败被报 ok:true、双计时器隐式取 min、双重截断打架）。
      // loop 只保留：审批短路 + 流事件/轨迹 + 错误形态归一
      const registryWrapped = (def as { registryWrapped?: boolean }).registryWrapped === true
      out[wireName] = ai.tool({
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
                def.executeTimeoutMs ?? timeoutMs,
                host.signal,
              )
            }
            const ok = registryWrapped ? (result as { ok?: boolean })?.ok !== false : true
            host.emitStream({ kind: 'tool-end', toolName: name, toolCallId: options.toolCallId, ok })
            // 完整结果归档（39 号 P1-1）：非 registry 工具在截断前落档（registry
            // 包装工具的归档在其管线内）——上下文内 8K 截断后仍可经 get_tool_result
            // 回查全文。只归档成功结果（失败回填本就只含错误摘要，无回查价值）。
            // fire-and-forget：归档失败只 warn，不影响工具调用。
            if (!registryWrapped && ok && this.deps.artifacts && options.toolCallId) {
              void this.deps.artifacts
                .save({
                  scopeKey: task.scopeId,
                  toolCallId: options.toolCallId,
                  toolName: name,
                  args: input,
                  result,
                  ok,
                })
                .catch((e: unknown) =>
                  logger.warn(`[agent-loop] 工具产物归档失败（不影响调用）tool=${name}`, e),
                )
            }
            // 失败必须把原因带进轨迹（33 号长程实测：ok:false 曾不带 error——
            // 草稿生成连败两轮，排障只能靠模型自己的转述）
            const fail = !ok && result && typeof result === 'object' ? (result as { error?: unknown; detail?: unknown; hint?: unknown }) : null
            host.emitTrajectory({
              iteration: state.iteration,
              kind: 'tool_result',
              name,
              payload: {
                toolCallId: options.toolCallId,
                ok,
                ...(fail?.error !== undefined ? { error: String(fail.error).slice(0, 200) } : {}),
                ...(typeof fail?.detail === 'string' && fail.detail ? { detail: fail.detail.slice(0, 300) } : {}),
                ...(typeof fail?.hint === 'string' && fail.hint ? { hint: fail.hint.slice(0, 200) } : {}),
              },
            })
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
              hint: err?.name === 'TimeoutError' ? `工具执行超过 ${Math.round((def.executeTimeoutMs ?? timeoutMs) / 1000)}s` : undefined,
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
    appended: ModelMessage[] = [],
  ): Promise<AgentResult> {
    // 挂起冻结（agent-loop 节点 E3 契约；44号 review 回归修复）：宿主 suspend 已把
    // suspended 落入本 state 并自行落盘，随后的本地 abort 只是止住在途 IO——不得
    // 覆盖 stopReason、不得再次 saveState（否则 last.stopReason='aborted' 破坏恢复
    // 语义「冻结而非 aborted 收场」）。43 号重试设施使 abort 路径响应式收尾后，
    // 此分支是冻结语义的显式承载体。
    if (state.suspended) {
      return resultOf(state, 'aborted')
    }
    state.stopReason = reason
    state.converged = reason === 'final'
    await host.saveState(state, { appended }).catch((e) =>
      logger.warn(`[agent-loop] 终止补偿落盘失败（reason=${reason}，历史停留上一 save 点）`, e),
    )
    host.emitTrajectory({ iteration: state.iteration, kind: 'guardrail_stop', payload: { reason } })
    return resultOf(state, reason, error)
  }
}

// ==================== 纯函数（可独立单测） ====================

// —— 步尝试与重试（43号 O1/O2/O3；借 codex responses_retry / SSE idle timeout） ——

/** 步尝试的 usage（ai@6 totalUsage 的必要子集 + 缓存命中输入） */
export interface StepUsage {
  inputTokens?: number
  outputTokens?: number
  /** 缓存命中输入 token（provider 上报才有；O4 记账来源） */
  cacheReadTokens?: number
}

/** 单次步尝试结果：ok=正常收尾；aborted=宿主取消；failed=流失败（带重试判定） */
export type StepAttempt =
  | { kind: 'ok'; finishReason: string; stepMessages: ModelMessage[]; usage: StepUsage; stepText: string }
  | { kind: 'aborted' }
  | {
      kind: 'failed'
      message: string
      stepMessages: ModelMessage[]
      retryable: boolean
      overflow: boolean
      /** 服务端 Retry-After 建议（有则优先于退避公式——43号 review P2-8） */
      retryAfterMs?: number
    }

/** 空闲超时中止标记（分类依据是 idleFired 位；此串仅 abort reason/日志用） */
const STREAM_IDLE_ABORT_REASON = 'stream idle timeout'

/** 上下文超窗错误识别（各家文案不一，按关键短语宽匹配；43号 O3 触发条件） */
const CONTEXT_OVERFLOW_RE =
  /context (length|window|limit)|maximum context|too many (input )?tokens|input is too long|prompt is too long|exceed.{0,24}(context|token)/i

/**
 * 流失败分类（纯函数，单测锚点）：可重试性 + 是否疑似超窗 + 服务端重试建议。
 * 优先级：宿主取消 > 空闲超时（可重试）> 结构化状态码（408/409/429/5xx 可重试；
 * 其余 4xx 的正文若含超窗短语仍走紧急压缩——400 型超窗在此命中）> 超窗短语 >
 * 无结构信息的中断（宽似 codex Stream 类错误，可重试——次数有限，误判代价 =
 * 多两次尝试）。状态码先于超窗短语（对抗 review P1：限流文案含 "too many
 * tokens" 不得误判为超窗）。
 */
export function classifyStepFailure(
  error: unknown,
  opts: { hostAborted: boolean; stepIdleTimeout: boolean },
): { retryable: boolean; overflow: boolean; retryAfterMs?: number } {
  if (opts.hostAborted) return { retryable: false, overflow: false }
  if (opts.stepIdleTimeout) return { retryable: true, overflow: false }
  const errObj = error as { statusCode?: unknown; responseHeaders?: Record<string, string> } | null | undefined
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '')
  const status = errObj?.statusCode
  if (typeof status === 'number') {
    if (status === 408 || status === 409 || status === 429 || status >= 500) {
      return { retryable: true, overflow: false, retryAfterMs: parseRetryAfterMs(errObj?.responseHeaders) }
    }
    // 其余 4xx（请求级错误重试无意义）：正文含超窗短语仍走紧急压缩路径
    return { retryable: false, overflow: CONTEXT_OVERFLOW_RE.test(message) }
  }
  if (CONTEXT_OVERFLOW_RE.test(message)) return { retryable: false, overflow: true }
  return { retryable: true, overflow: false }
}

/** Retry-After 头解析（秒；非法/缺失返回 undefined——codex 同款最小支持） */
function parseRetryAfterMs(headers?: Record<string, string>): number | undefined {
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After']
  if (!raw) return undefined
  const sec = Number.parseFloat(raw)
  if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000, 60_000)
  return undefined
}

/** 重试退避（借 codex util.rs backoff）：200ms × 2^(n-1) × jitter(0.9–1.1)，封顶 8s */
export function streamRetryBackoffMs(attempt: number, rand: () => number = Math.random): number {
  const base = 200 * 2 ** Math.max(0, attempt - 1)
  const jitter = 0.9 + rand() * 0.2
  return Math.min(base * jitter, 8_000)
}

/** 重试次数 env 解析：非数字回缺省 2；夹到 [0,10] */
export function parseStreamMaxRetries(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return 2
  return Math.min(Math.max(n, 0), 10)
}

/** 空闲超时 env 解析（ms）：非法/负数回缺省 300_000（codex 同款）；0 = 关闭 */
export function parseIdleTimeoutMs(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n) || n < 0) return 300_000
  return n
}

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
    usage: { promptTokens: 0, completionTokens: 0, toolCalls: 0, cachedInputTokens: 0 },
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

/**
 * 稳定系统提示词（39 号 P0-1）：只承载跨轮不变段（人设/规则）。快照/记忆等
 * 当轮内容经 buildTurnContext 注入消息尾——system 每轮变化会击穿前缀缓存。
 */
export function buildSystem(task: AgentTask): string {
  return task.systemPrompt
}

/** 当轮动态上下文段（快照/挂起注记/dynamicContext）；空串 = 无需注入 */
export function buildTurnContext(task: AgentTask, state: AgentLoopState): string {
  const parts: string[] = []
  if (task.snapshot) parts.push(`[当前项目状态快照（来自数据库，确证事实）]\n${task.snapshot}`)
  if (state.suspended) parts.push('\n[系统注记] 上一次操作曾挂起等待人工，现已恢复。等待期间外部状态可能已变化，涉及副作用请先核实。')
  if (task.dynamicContext) parts.push(task.dynamicContext)
  return parts.join('\n').trim()
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
