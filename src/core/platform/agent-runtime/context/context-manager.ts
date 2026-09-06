/**
 * 上下文管理器：四层装配 + 压缩守恒编排（23 号 §5 / 12 号 R6 / 24 号第一梯队）
 * @module core/platform/agent-runtime/context/context-manager
 *
 * 四层装配（每次模型调用前，模型实际所见）：
 *   L1 system        人设+规则+当轮快照（durable——快照由工具落库后的数据重建，
 *                    不由 AI 复述，防漂移；本层在 loop 的 buildSystem，不经本模块）
 *   L2 压缩摘要      历史折叠产物（稳定前缀标记识别，见 classifyMessage）
 *   L3 折叠后全量    上次压缩以来的全部消息（含工具配对——绝不硬切窗口破坏配对）
 *   L4 当轮输入      用户原话（历史尾元素，天然在位）
 *
 * 压缩守恒（12 号 R6，借 codex）：
 * - 全部真实用户消息按独立预算（缺省 20K tokens）从新到旧原样保留、永不折叠；
 *   折叠/摘要只作用于工具结果与 assistant 消息；摘要置尾
 * - 两级水位：软限 = contextWindow×90%（自动压缩触发线）+ 硬顶 = 95%（压缩后
 *   有效窗口上界，为 system/工具 schema/输出预留）；外部配置触发值被夹到 ≤90%
 * - 压缩后本地估算（JSON UTF-8 字节/4）回填已见 token 计数，防"压完立即再触发"抖动
 *
 * 崩溃恢复：历史中的悬空工具调用（assistant 发起 tool-call 但无对应 tool 结果——
 * 步末落盘后崩溃的形态）在装配时补哨兵结果，恢复 API 合法性（设计借 qm，MIT）。
 *
 * 所有权分层（批 5 定案同款）：装配/压缩/估算归本模块；loop 只在步边界调用端口、
 * 持久化压缩结果；compaction 事件经 emit 回调由门面分发（bridge 只对 phase=done
 * 发总线——UI 实时流直推）。
 */

import { createLogger } from '@core/utils/logger'
import type { ModelMessage } from 'ai'
import type { AgentEvent } from '@shared/types/agent.types'
import {
  defaultEstimateTokens,
  pruneToolResults,
} from '../runtime/vendor/compaction'

const logger = createLogger('AgentContext')

// —— 缺省参数（全部可注入；命名导出供测试引用） ——

/** 软限水位（自动压缩触发线 = contextWindow × 0.9） */
export const SOFT_WATERMARK = 0.9
/** 硬顶水位（压缩后有效窗口上界 = contextWindow × 0.95） */
export const HARD_WATERMARK = 0.95
/** 用户消息保留预算 tokens（从新到旧原样保留、永不折叠——12 号 R6） */
export const USER_MESSAGE_BUDGET_TOKENS = 20_000
/** 纯剪枝路径最小节省门槛（不足则进摘要阶段；vendor 同形语义） */
export const MIN_PRUNE_SAVINGS_TOKENS = 4_000
/** 近端保护预算（保护边界内的工具结果不剪枝） */
export const PROTECTED_TAIL_TOKENS = 8_000
/** 悬空工具调用哨兵（崩溃恢复注入） */
export const INTERRUPTED_SENTINEL = '[interrupted — 结果未记录，先核实实际状态再重做]'

// ==================== 消息分类（content_kind，12 号 R6-2） ====================

/**
 * 稳定分类：注入内容靠稳定前缀标记识别（跨持久化存活；ModelMessage 无元数据字段，
 * 非标字段有 provider 序列化风险——按标记识别是持久化安全的 kind 机制）。
 */
export type MessageKind = 'user' | 'assistant' | 'tool' | 'system' | 'compaction.summary'

export function classifyMessage(m: ModelMessage): MessageKind {
  if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('[Previous conversation summary]')) {
    return 'compaction.summary'
  }
  return m.role
}

/** 会话滚动摘要的稳定前缀形态（压缩产物；摘要置尾的守恒结构） */
export function summaryMessage(summary: string): ModelMessage {
  return {
    role: 'user',
    content: `[Previous conversation summary]\n\n${summary}\n\n[The conversation continues from here]`,
  }
}

// ==================== 契约（23 号 §5 ContextAssembler） ====================

export interface ContextAssemblerInput {
  history: ModelMessage[]
  snapshot: string
  systemPrompt: string
}

// ==================== 配置与实现 ====================

export interface ContextManagerDeps {
  /** 模型上下文窗口 tokens（必填——无窗口语义则不该启用压缩） */
  contextWindowTokens: number
  /** 软限触发水位（缺省 0.9；外部配置被夹到 ≤0.9——12 号 R6"配置夹到"） */
  softWatermark?: number
  /** 硬顶水位（缺省 0.95） */
  hardWatermark?: number
  /** 用户消息保留预算 tokens（缺省 20K） */
  userMessageBudgetTokens?: number
  /** token 估算器（缺省 JSON UTF-8 字节/4） */
  estimateTokens?: (messages: ModelMessage[]) => number
  /** 摘要回调（生产端由门面注入 generateText 实现——提示词闭包在内；测试注入 fake；
   *  缺省=只剪枝不摘要） */
  summarize?: (conversationText: string, signal?: AbortSignal) => Promise<string>
  /** compaction 事件出口（门面分发；缺省仅日志） */
  emit?: (e: AgentEvent) => void
  clock?: () => number
}

export interface LoopContextPort {
  /** 发送前装配：悬空工具调用哨兵修复（幂等；返回原数组引用则未变） */
  assemble(messages: ModelMessage[]): ModelMessage[]
  /**
   * 水位检查 + 压缩（步边界调用）。
   * 返回 null = 未触发；否则返回压缩后消息（调用方负责持久化）。
   * lastInputTokens 为模型侧最近实测值（与本地估算取 max 作水位依据）。
   */
  maybeCompact(input: {
    messages: ModelMessage[]
    lastInputTokens: number
    signal?: AbortSignal
  }): Promise<ModelMessage[] | null>
}

export class ContextManager implements LoopContextPort {
  private readonly windowTokens: number
  private readonly softTokens: number
  private readonly hardTokens: number
  private readonly userBudget: number
  private readonly estimate: (messages: ModelMessage[]) => number
  private readonly deps: Pick<ContextManagerDeps, 'summarize' | 'emit'>
  /** 压缩后估算回填值（防抖动——12 号 R6：本地估算覆盖过期的模型实测） */
  private backfilledInputTokens = 0

  constructor(deps: ContextManagerDeps) {
    if (deps.contextWindowTokens <= 0) {
      throw new Error(`contextWindowTokens 必须为正（收到 ${deps.contextWindowTokens}）`)
    }
    this.windowTokens = deps.contextWindowTokens
    // 软限夹到 ≤0.9（外部更激进的配置不允许——R6"配置被夹到"）；硬顶不高于软限
    const soft = Math.min(deps.softWatermark ?? SOFT_WATERMARK, SOFT_WATERMARK)
    const hard = Math.min(deps.hardWatermark ?? HARD_WATERMARK, 0.99)
    this.softTokens = Math.floor(this.windowTokens * soft)
    this.hardTokens = Math.floor(this.windowTokens * Math.max(hard, soft))
    this.userBudget = deps.userMessageBudgetTokens ?? USER_MESSAGE_BUDGET_TOKENS
    this.estimate = deps.estimateTokens ?? defaultEstimateTokens
    this.deps = {
      summarize: deps.summarize,
      emit: deps.emit,
    }
  }

  // —— 装配（L2+L3+L4；L1 在 loop 的 buildSystem） ——

  /**
   * 悬空工具调用修复：assistant 的 tool-call 无对应 tool 结果（步末落盘后崩溃的
   * 历史形态）补哨兵结果，恢复 tool-call/tool 配对（否则 provider 400）。
   * 幂等：无悬空时返回原引用（调用方可据此跳过落盘）。
   */
  assemble(messages: ModelMessage[]): ModelMessage[] {
    const dangling = collectDanglingToolCallIds(messages)
    if (dangling.size === 0) return messages
    const repaired = [...messages]
    for (const [index, ids] of dangling) {
      // 就近插在悬空 assistant 消息之后（保持配对相邻性）
      repaired.splice(index + 1, 0, sentinelToolMessage(ids))
    }
    logger.info(`[context] 崩溃恢复：修复 ${dangling.size} 条悬空工具调用（哨兵注入）`)
    return repaired
  }

  // —— 压缩守恒编排（12 号 R6） ——

  async maybeCompact(input: {
    messages: ModelMessage[]
    lastInputTokens: number
    signal?: AbortSignal
  }): Promise<ModelMessage[] | null> {
    const tokensBefore = Math.max(this.estimate(input.messages), this.backfilledInputTokens, input.lastInputTokens)
    if (tokensBefore < this.softTokens || input.messages.length === 0) return null

    const emit = this.deps.emit
    emit?.({ type: 'compaction', phase: 'start', tokensBefore })

    // Phase 1：剪枝（近端保护 + 纯剪枝门槛——vendor 同形语义）
    const pruned = pruneToolResults(input.messages, PROTECTED_TAIL_TOKENS, MIN_PRUNE_SAVINGS_TOKENS, this.estimate)
    let working = pruned.tokensSaved > 0 ? pruned.messages : input.messages

    // Phase 2：守恒摘要（用户消息按预算从新到旧原样保留，其余折叠；摘要置尾）
    let summary: string | undefined
    if (this.deps.summarize && this.estimate(working) >= this.softTokens) {
      const conversationText = working
        .filter((m) => classifyMessage(m) !== 'compaction.summary')
        .map((m) => `${m.role}: ${JSON.stringify(m.content)}`)
        .join('\n')
      try {
        summary = await this.deps.summarize(conversationText, input.signal)
      } catch (e) {
        // 摘要失败降级为剪枝结果（压缩是优化不是正确性依赖）；留痕带因
        logger.warn(`[context] 摘要失败，降级为纯剪枝：${e instanceof Error ? e.message : String(e)}`)
      }
      if (summary !== undefined) {
        const preserved = preserveUserMessages(working, this.userBudget, this.estimate)
        working = [...preserved, summaryMessage(summary)]
        emit?.({ type: 'compaction', phase: 'summary' })
      }
    }

    const tokensAfter = this.estimate(working)
    // 回填：以本地估算覆盖（压完立即复查不再触发——R6 防抖动）
    this.backfilledInputTokens = tokensAfter
    emit?.({ type: 'compaction', phase: 'done', tokensBefore, tokensAfter })

    logger.info(
      `[context] 压缩完成 ${tokensBefore}→${tokensAfter} tok（窗口 ${this.windowTokens}，` +
        `软限 ${this.softTokens}/硬顶 ${this.hardTokens}，摘要=${summary !== undefined ? 'yes' : 'prune-only'}）`,
    )
    return working
  }

  /** 测试/运维观测位 */
  get thresholds(): { soft: number; hard: number; window: number } {
    return { soft: this.softTokens, hard: this.hardTokens, window: this.windowTokens }
  }
}

// ==================== 内部工具 ====================

/** 悬空 tool-call 收集：Map<悬空 assistant 消息下标, 未应答 toolCallId 列表> */
function collectDanglingToolCallIds(messages: ModelMessage[]): Map<number, string[]> {
  const answered = new Set<string>()
  for (const m of messages) {
    if (m.role !== 'tool' || !Array.isArray(m.content)) continue
    for (const part of m.content as Array<{ type?: string; toolCallId?: string }>) {
      if (part.type === 'tool-result' && part.toolCallId) answered.add(part.toolCallId)
    }
  }
  const dangling = new Map<number, string[]>()
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue
    const ids = (m.content as Array<{ type?: string; toolCallId?: string }>)
      .filter((p) => p.type === 'tool-call' && p.toolCallId && !answered.has(p.toolCallId))
      .map((p) => p.toolCallId!)
    if (ids.length > 0) dangling.set(i, ids)
  }
  return dangling
}

/** 哨兵 tool 消息（补齐悬空配对；模型据此先核实再重做） */
function sentinelToolMessage(toolCallIds: string[]): ModelMessage {
  return {
    role: 'tool',
    content: toolCallIds.map((toolCallId) => ({
      type: 'tool-result',
      toolCallId,
      result: INTERRUPTED_SENTINEL,
    })),
  } as unknown as ModelMessage
}

/**
 * 用户消息守恒：从新到旧保留直至预算耗尽（真实用户原话永不折叠——12 号 R6）。
 * 保留者维持原相对顺序；预算外的老用户消息随 assistant/工具消息一起被折叠。
 */
function preserveUserMessages(
  messages: ModelMessage[],
  budgetTokens: number,
  estimate: (messages: ModelMessage[]) => number,
): ModelMessage[] {
  const kept: Array<{ m: ModelMessage; tokens: number }> = []
  let used = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (classifyMessage(m) !== 'user') continue
    const t = estimate([m])
    if (used + t > budgetTokens) break
    used += t
    kept.push({ m, tokens: t })
  }
  // kept 为新→旧收集，反转恢复时间序
  return kept.reverse().map((k) => k.m)
}

/** 工厂：无摘要回调时仍是合法压缩器（纯剪枝模式） */
export function createContextManager(deps: ContextManagerDeps): ContextManager {
  return new ContextManager(deps)
}
