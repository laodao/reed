/**
 * HostKit：业务宿主装配套件（36 号契约）
 * @module core/platform/agent-runtime/host/host-kit
 *
 * 五个宿主曾各写一遍装配配方（LoopRunner+Sink+Store+ContextManager+审批桥+
 * RunRegistry+记忆装配），四大能力纪律靠人工保证——EP 记忆 stub 与聊天漏接
 * ContextManager 是漏零件实例。本模块把「宿主间真正同构的脊柱」沉淀为工厂，
 * 四大能力默认内置、关闭须在 36 号文档登记；业务只声明差异面（工具/提示词/
 * 事件映射/记忆 scope）。
 *
 * 内置（宿主不再手写）：
 *   1. TrajectorySink + turn_start 统一轮次标记（含最终系统提示词快照——
 *      工作台「查看上下文」对所有宿主生效）
 *   2. 记忆装配：L0 systemLine → 结构化知识提供方（scope 匹配）→ 飞轮召回
 *      （scope 有=L1/L2/L3 分层，无=用户级 L1）；统一 memory_assembly 留痕
 *      与 `[相关经验（来自知识飞轮，供参考）]` 提示词段
 *   3. ContextManager 窗口化（缺省 32K，AGENT_CONTEXT_WINDOW env 可调）
 *   4. AgentHost 骨架：loadState 双形态（业务权威历史 / 会话存储续聊+sanitize）、
 *      saveState（存储+sink flush）、suspend 安全默认拒绝
 *   5. RunRegistry 登记/结算 + 内外层 abort 桥（外层已中止同步短路）
 *
 * 明确不收敛（36 号 §3）：消息生命周期、流事件通道映射、审批协调器构造——
 * 业务差异面；agent-loop 工作流节点（挂起/恢复语义自成一体）。
 */

import type { LanguageModel, ModelMessage } from 'ai'
import { createLogger } from '@core/utils/logger'
import { getCurrentUserId } from '@core/context/user-context'
import { LoopRunner, initState } from '../runtime/loop'
import { sanitizeSessionHistory } from '../runtime/session-sanitize'
import { TrajectorySink } from '../trajectory/sink'
import type { TrajectoryAppendPort } from '../trajectory/sink'
import { getAgentRunRegistry } from '../runtime/run-registry'
import { ContextManager } from '../context/context-manager'
import type { LoopContextPort } from '../context/context-manager'
import { listStructuredProviders } from '../memory/structured-provider'
import type { AgentToolDef, AgentHost, AgentResult, AgentStreamEvent, TrajectoryEntry } from '../types'
import type { ApprovalDecision } from '@shared/types/agent.types'

/** 飞轮召回消费子集（结构化类型——不耦合 MemoryFlywheelService 实现类） */
export interface HostKitFlywheelPort {
  assemble(text: string, topK?: number, scope?: { bizModule?: string; projectId?: string } | null): Promise<Array<{ content: unknown }>>
  assembleUserLevel(text: string, topK?: number): Promise<Array<{ content: unknown }>>
}

const logger = createLogger('HostKit')

/** 缺省上下文窗口（与各宿主既有值一致；env 统一从 AGENT_CONTEXT_WINDOW 读） */
const DEFAULT_CONTEXT_WINDOW = 32_768
/** turn_start 快照截断（与聊天宿主既有值一致） */
const SNAPSHOT_MAX = 8_000

/** 结构化知识缺省预算（LW 通道A 既有值） */
const DEFAULT_STRUCTURED_BUDGET = { maxSegments: 2, maxChars: 600 }

/** 业务轮次基座：kit 依赖的最小轮次形态 */
export interface HostKitTurnBase {
  /** 本轮用户输入（历史播种/记忆召回缺省语料/工作台标签缺省值） */
  input: string
}

export interface HostKitMemoryConfig<TTurn extends HostKitTurnBase = HostKitTurnBase> {
  /** 召回 scope：缺省 null = 用户级 L1；业务传入启用 L1/L2/L3 分层（projectId 每轮不同用函数形态） */
  scope?:
    | { bizModule?: string; projectId?: string }
    | ((turn: TTurn) => { bizModule?: string; projectId?: string } | null)
    | null
  /** 召回语料（缺省 turn.input；LW 形态=用户消息+状态摘要） */
  recallText?: (turn: TTurn) => string
  /** 结构化知识（通道A）的主题词提取语料——缺省复用 recallText。
   *  通道A 的 topics 只取前 60 字符，摘要类语料会污染主题（LW 用用户消息即可） */
  topicsText?: (turn: TTurn) => string
  topK?: number
  /** 结构化知识提供方预算；false = 关闭通道A；缺省 {2,600} */
  structured?: { maxSegments: number; maxChars: number } | false
  /** L0 系统能力提示行（聊天宿主形态） */
  systemLine?: string
}

export interface HostKitConfig<TTurn extends HostKitTurnBase> {
  definitionId: string
  /** 每轮 scopeKey（轨迹/RunRegistry 共用；租户内唯一由业务保证——23 号 §11-7） */
  scopeKey: (turn: TTurn) => string
  /** 会话存储键（缺省=scopeKey；聊天宿主=system-chat-agent:dialog:<id> 旧键兼容） */
  sessionKey?: (turn: TTurn) => string
  /** 本轮工具集（白名单是业务决定——规划类工具按 28 号语义由 agent 自主调用） */
  tools: (turn: TTurn) => Record<string, AgentToolDef>
  resolveModel: (opts?: { providerConfigId?: string; modelId?: string }) => Promise<LanguageModel>
  /** 基础系统提示词；记忆段由 kit 追加，不要自行拼 [相关经验] */
  systemPrompt: (turn: TTurn) => string
  /** 当轮状态快照（buildSystem 拼接的 durable 事实） */
  snapshot?: (turn: TTurn) => string
  /** 业务权威历史（LW/EP 形态：业务表是 UI 权威源；在保存用户消息**之前**取好）。
   *  缺省 = 会话存储续聊（聊天形态：sanitize + 本轮 user 消息） */
  seededHistory?: (turn: TTurn) => ModelMessage[]
  maxSteps: number
  /** 上下文窗口 tokens（缺省 32K / AGENT_CONTEXT_WINDOW） */
  contextWindowTokens?: number
  /** 记忆装配配置；显式 null = 关闭（36 号 §5 须登记理由）；缺省 = 用户级 L1 top3 */
  memory?: HostKitMemoryConfig<TTurn> | null
  /** 审批桥（EP choice 形态）；缺省 = requiresApproval 工具执行时拒绝 */
  requestApproval?: (tool: AgentToolDef, input: unknown, call: { scopeId: string; rawInput: string; toolCallId: string; signal?: AbortSignal }) => Promise<ApprovalDecision>
  /** 工作台运行标签（缺省 = 输入前 40 字） */
  runLabel?: (turn: TTurn) => string
  /** 工作台附加元数据（如任务树 rootId） */
  runMetadata?: (turn: TTurn) => Record<string, unknown>
  /** 流事件业务映射（delta/tool-start/tool-end/step——原始事件，业务自行转译通道） */
  onStream?: (turn: TTurn, event: AgentStreamEvent) => void
  /** 轨迹挂钩（业务观测；sink.append 之外不落库的旁路） */
  onTrajectoryEntry?: (turn: TTurn, entry: TrajectoryEntry) => void
  /** 工具 runtimeContext 注入（projectId/episodeId/turnModel 等） */
  runtimeContext?: (turn: TTurn) => Record<string, unknown>
  modelPreference?: (turn: TTurn) => { providerConfigId?: string; modelId?: string } | undefined
  /** 会话存储语义：observation=保存失败仅告警（业务表权威，缺省）；authority=上抛（聊天形态） */
  sessionStoreCritical?: boolean
}

export interface HostKitDeps {
  trajectoryPort: TrajectoryAppendPort | null
  sessionStore?: {
    load(sessionId: string): Promise<ModelMessage[] | undefined>
    save(sessionId: string, messages: ModelMessage[]): Promise<void>
  } | null
  /** 飞轮由业务注入（getMemoryFlywheel 在 workflow-boot——platform 禁 import packs） */
  flywheel?: HostKitFlywheelPort | null
  /** 轨迹广播（聊天/工作台实时时间线）；缺省不广播（LW/EP 既有形态=回放） */
  onEntry?: (scopeKey: string, entry: TrajectoryEntry) => void
  /** 单测注入口（绕过真实 ContextManager） */
  contextOverride?: LoopContextPort
}

export interface HostKitTurnOptions {
  /** 业务侧取消信号（服务级 busy controller）——桥接进 kit 内层 controller */
  signal?: AbortSignal
}

export interface HostKitTurnResult extends AgentResult {
  /** 本轮实际注入的记忆行（可观测/单测锚点） */
  memoryLines: string[]
  /** 最终系统提示词（基础+记忆段——留痕快照同源） */
  systemPrompt: string
}

/** 召回语料 → 结构化主题词（LW 通道A 既有算法，抽为共用） */
export function extractRecallTopics(text: string, max = 5): string[] {
  return text
    .slice(0, 60)
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .filter((w) => w.length >= 2)
    .slice(0, max)
}

/** 护栏终态尾注（聊天/LW/EP 同款文案，收敛为单一出处） */
export function formatStopNote(stopReason: string, error?: string): string {
  if (stopReason === 'max_steps' || stopReason === 'stagnant') {
    return `\n\n[系统] 本轮达到步数/进展护栏（${stopReason}）而停止，可继续对话让助理接着做。`
  }
  if (stopReason === 'error') return `抱歉，我在组织回复时遇到问题：${error ?? '未知错误'}`
  if (stopReason === 'aborted') return '（本轮已中断）'
  return ''
}

/** 记忆装配（kit 内置的四大能力②）：行集合 = L0 + 通道A[设定事实] + 通道B 飞轮召回。
 *  纪律（对抗 review P2-2）：装配任何环节失败只降级不炸轮——「不影响主链路」 */
async function assembleMemoryLines<TTurn extends HostKitTurnBase>(
  mem: HostKitMemoryConfig<TTurn> | null | undefined,
  flywheel: HostKitFlywheelPort | null | undefined,
  turn: TTurn,
): Promise<string[]> {
  if (mem === null) return []
  const lines: string[] = []
  try {
    if (mem?.systemLine) lines.push(mem.systemLine)

    const scope = typeof mem?.scope === 'function' ? mem.scope(turn) : (mem?.scope ?? null)
    const text = mem?.recallText ? mem.recallText(turn) : turn.input
    const topK = mem?.topK ?? 3

    // 通道A：结构化知识提供方（平台注册表；图谱等——scope 不匹配的自动跳过）。
    // topics 语料与飞轮召回语料分离（评审 P1-1：LW 通道A 只用用户消息，摘要会污染 60 字窗口）
    if (scope) {
      const budget = mem?.structured === false ? null : (mem?.structured ?? DEFAULT_STRUCTURED_BUDGET)
      if (budget) {
        const topicsText = mem?.topicsText ? mem.topicsText(turn) : text
        const topics = extractRecallTopics(topicsText)
        for (const provider of listStructuredProviders()) {
          if (!provider.supports(scope)) continue
          try {
            const segments = await provider.query({ scope, topics, budget })
            for (const seg of segments) lines.push(`[设定事实] ${seg.text}`)
          } catch (e) {
            logger.warn(`[HostKit] 结构化知识装配失败（provider=${provider.id}，跳过）`, e)
          }
        }
      }
    }

    // 通道B：飞轮召回（scope 有=分层 assemble，无=用户级）
    if (flywheel) {
      try {
        const entries = scope
          ? await flywheel.assemble(text, topK, scope)
          : await flywheel.assembleUserLevel(text, topK)
        for (const e of entries) {
          const c = e.content as { title?: string; content?: string }
          lines.push(`- ${c.title ?? ''}：${c.content ?? ''}`)
        }
      } catch (e) {
        logger.warn('[HostKit] 飞轮记忆装配失败（不影响主链路）', e)
      }
    }
  } catch (e) {
    logger.warn('[HostKit] 记忆装配配置解析失败（记忆降级为空，不影响主链路）', e)
    return lines.length > 0 ? lines : []
  }
  return lines
}

export function createHostKit<TTurn extends HostKitTurnBase>(
  config: HostKitConfig<TTurn>,
  deps: HostKitDeps,
) {
  return {
    /**
     * 跑一轮。kit 持有内层 AbortController（RunRegistry 停止按钮目标）；
     * opts.signal 为业务侧信号（服务 busy controller）——双向都可停本轮。
     */
    async runTurn(turn: TTurn, opts: HostKitTurnOptions = {}): Promise<HostKitTurnResult> {
      const scopeKey = config.scopeKey(turn)
      const sink = new TrajectorySink(deps.trajectoryPort, { scope: 'session', scopeKey, onEntry: deps.onEntry })

      // 内外层 abort 桥（workflow-boot 既有形态）：外层已中止立即短路，不再进循环
      const inner = new AbortController()
      const onOuterAbort = () => inner.abort(new Error('已被外部取消'))
      if (opts.signal) {
        opts.signal.addEventListener('abort', onOuterAbort, { once: true })
        if (opts.signal.aborted) onOuterAbort()
      }

      // RunRegistry 登记（工作台徽标/停止——LW/EP 此前缺位，kit 统一补齐）
      const registry = getAgentRunRegistry()
      const runId = `ar_${config.definitionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const runMeta = config.runMetadata?.(turn)
      registry.register({
        id: runId,
        definitionId: config.definitionId,
        scopeKey,
        label: config.runLabel?.(turn) ?? turn.input.slice(0, 40),
        userId: getCurrentUserId(),
        abort: () => inner.abort(new Error('已从工作台停止')),
        ...(runMeta ? { metadata: runMeta } : {}),
      })

      let result: AgentResult | null = null
      let failure: string | null = null
      // kit 内部直append 的条目同样过业务挂钩（观测面完整：轮次边界可见）
      const append = (entry: TrajectoryEntry): void => {
        sink.append(entry)
        config.onTrajectoryEntry?.(turn, entry)
      }
      try {
        // —— 四大能力②：记忆装配（留痕与提示词同源）——
        const memoryLines = await assembleMemoryLines(config.memory, deps.flywheel, turn)
        const basePrompt = config.systemPrompt(turn)
        const finalPrompt = memoryLines.length
          ? `${basePrompt}\n\n[相关经验（来自知识飞轮，供参考）]\n${memoryLines.join('\n')}`
          : basePrompt

        // 统一轮次标记（工作台时间线切段依据；快照供「查看上下文」）
        append({
          iteration: 0,
          kind: 'decision',
          name: 'turn_start',
          payload: { systemPrompt: finalPrompt.slice(0, SNAPSHOT_MAX) },
        })
        if (memoryLines.length > 0) {
          // kind 用语义化的 memory_assembly（对抗 review P1-2：decision 会被工作台
          // 误计为步数；视图按 name 双兼容旧任务轨迹行）
          append({ iteration: 0, kind: 'memory_assembly', name: 'memory_assembly', payload: { memoryRefs: memoryLines } })
        }

        // —— AgentHost 骨架 ——
        const sessionId = config.sessionKey?.(turn) ?? scopeKey
        const tools = config.tools(turn)
        const taskBase = {
          definitionId: config.definitionId,
          scopeId: scopeKey,
          input: turn.input,
          systemPrompt: finalPrompt,
          tools,
          maxSteps: config.maxSteps,
          ...(config.snapshot?.(turn) ? { snapshot: config.snapshot(turn)! } : {}),
          ...(config.modelPreference?.(turn) ? { modelPreference: config.modelPreference(turn)! } : {}),
          ...(config.runtimeContext?.(turn) ? { runtimeContext: config.runtimeContext(turn)! } : {}),
        }
        const seeded = config.seededHistory?.(turn)
        const host: AgentHost = {
          signal: inner.signal,
          loadState: async () => {
            if (seeded) {
              // 业务权威历史形态（LW/EP）：种子历史 + 本轮 user 消息
              const st = initState(taskBase, Date.now())
              st.messages = [...seeded, { role: 'user', content: turn.input } as ModelMessage]
              return st
            }
            // 会话存储续聊形态（聊天）：清洗悬空 tool-call 后追加本轮
            const history = deps.sessionStore ? await deps.sessionStore.load(sessionId) : undefined
            if (!history || history.length === 0) return null // 首轮：LoopRunner initState 播种
            const st = initState(taskBase, Date.now())
            st.messages = [...sanitizeSessionHistory(history), { role: 'user', content: turn.input } as ModelMessage]
            return st
          },
          saveState: async (st) => {
            if (deps.sessionStore) {
              try {
                await deps.sessionStore.save(sessionId, st.messages)
              } catch (e) {
                if (config.sessionStoreCritical) throw e
                logger.warn(`[HostKit] 会话持久化失败（observation 形态，仅告警）scope=${scopeKey}`, e)
              }
            }
            await sink.flush()
          },
          suspend: () => Promise.reject(new Error(`${config.definitionId} 白名单不含需挂起审批工具`)),
          emitTrajectory: (entry) => {
            sink.append(entry)
            config.onTrajectoryEntry?.(turn, entry)
          },
          emitStream: (event) => config.onStream?.(turn, event),
        }

        // —— 四大能力①：上下文窗口化（每轮独立 ContextManager）——
        const context = deps.contextOverride
          ?? new ContextManager({
            contextWindowTokens:
              config.contextWindowTokens ?? (Number(process.env.AGENT_CONTEXT_WINDOW ?? DEFAULT_CONTEXT_WINDOW) || DEFAULT_CONTEXT_WINDOW),
          })

        result = await new LoopRunner({
          resolveModel: config.resolveModel,
          ...(config.requestApproval ? { requestApproval: config.requestApproval } : {}),
          context,
        }).run(taskBase, host)
        return { ...result, memoryLines, systemPrompt: finalPrompt }
      } catch (e) {
        // 循环外异常（装配/钩子抛错）：result 为 null——保留原因给工作台结算
        failure = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        opts.signal?.removeEventListener('abort', onOuterAbort)
        // 先尽力落库轨迹再结算广播（对抗 review P2-1：finish 事件可携带异常原因，
        // 且消费方看到 finished 时轨迹已就位）
        await sink.flush().catch(() => undefined)
        registry.finish(runId, {
          id: runId,
          scopeKey,
          status: result
            ? (result.stopReason === 'error' ? 'error' : result.stopReason === 'aborted' ? 'aborted' : 'done')
            : 'error',
          ...(result?.error ? { error: result.error } : failure ? { error: failure } : {}),
        })
      }
    },
  }
}
