/**
 * vendor：open-harness 上下文压缩件（两阶段：先剪枝后摘要）
 * @module core/platform/agent-runtime/runtime/vendor/compaction
 *
 * upstream: https://github.com/MaxGfeller/open-harness (MIT)
 * commit:   026e8d9cb8f184cdeac2054b489ec20972ba8681
 * 摘取范围: packages/core/src/session.ts 的 DefaultCompactionStrategy /
 *           pruneToolResults / DEFAULT_SUMMARY_PROMPT + utils.ts 的
 *           defaultEstimateTokens（22 号 B4 决策：不整包依赖，源码摘取）。
 *
 * 本地适配（不改变语义，仅工程约束）：
 * - ai 为 ESM-only：generateText 经动态 import（原文件静态 import）
 * - 估算器字节口径对齐本项目（UTF-8 字节 / 4——12 号 R6）
 *
 * 注意：本文件的 DefaultCompactionStrategy 是上游忠实形态（无用户消息保留语义）；
 * harness 的压缩守恒（用户消息 20K 预算原样保留/摘要置尾）在
 * context/context-manager.ts 编排实现——按 12 号 R6 / 24 号第一梯队。
 */

import { createLogger } from '@core/utils/logger'
import type { LanguageModel, ModelMessage } from 'ai'

const logger = createLogger('VendorCompaction')

// ==================== 契约（23 号 §5 CompactionStrategy） ====================

export interface CompactionContext {
  messages: ModelMessage[]
  /** 摘要模型（上游语义；harness 守恒路径用注入式 summarize 回调，不走此字段） */
  model?: LanguageModel
  systemPrompt?: string
  totalTokens: number
  targetTokens: number
  signal?: AbortSignal
  compactionPrompt?: string
}

export interface CompactionResult {
  messages: ModelMessage[]
  messagesRemoved: number
  tokensPruned: number
  summary?: string
}

export interface CompactionStrategy {
  compact(context: CompactionContext): Promise<CompactionResult>
}

// ==================== 工具（upstream 同形） ====================

/** token 本地估算（JSON UTF-8 字节 / 4） */
export function defaultEstimateTokens(messages: unknown[]): number {
  try {
    return Math.ceil(Buffer.byteLength(JSON.stringify(messages), 'utf8') / 4)
  } catch {
    return 0
  }
}

export const DEFAULT_SUMMARY_PROMPT = `Summarize this conversation for the next agent turn:
1. Goal: What the user is trying to accomplish
2. Instructions: Key directives and constraints mentioned
3. Discoveries: Important findings during the conversation
4. Accomplished: What's been completed, files changed, actions taken
5. Current State: Where things stand, pending work
6. Relevant Context: File paths, code snippets, specific details needed to continue`

// ==================== 两阶段策略（upstream 忠实移植） ====================

export class DefaultCompactionStrategy implements CompactionStrategy {
  private readonly protectedTokens: number
  private readonly minPruneSavings: number
  private readonly summaryModel?: LanguageModel
  private readonly summaryPrompt?: string
  private readonly estimateTokens: (messages: ModelMessage[]) => number

  constructor(options?: {
    /** 近端保护预算（从尾往前累计）。upstream 缺省 40_000 */
    protectedTokens?: number
    /** 纯剪枝路径的最小节省门槛。upstream 缺省 20_000 */
    minPruneSavings?: number
    summaryModel?: LanguageModel
    summaryPrompt?: string
    estimateTokens?: (messages: ModelMessage[]) => number
  }) {
    this.protectedTokens = options?.protectedTokens ?? 40_000
    this.minPruneSavings = options?.minPruneSavings ?? 20_000
    this.summaryModel = options?.summaryModel
    this.summaryPrompt = options?.summaryPrompt
    this.estimateTokens = options?.estimateTokens ?? defaultEstimateTokens
  }

  async compact(context: CompactionContext): Promise<CompactionResult> {
    // Phase 1: 剪枝（保护近端，替换保护边界外的工具结果为占位符）
    const pruned = pruneToolResults(
      context.messages,
      this.protectedTokens,
      this.minPruneSavings,
      this.estimateTokens,
    )

    if (pruned.tokensSaved >= this.minPruneSavings) {
      return {
        messages: pruned.messages,
        messagesRemoved: 0,
        tokensPruned: pruned.tokensSaved,
      }
    }

    // Phase 2: LLM 摘要（整段历史压缩为单条前缀消息）
    const model = this.summaryModel ?? context.model
    if (!model) {
      logger.warn('[vendor-compaction] 无摘要模型，退化为剪枝结果')
      return {
        messages: pruned.tokensSaved > 0 ? pruned.messages : context.messages,
        messagesRemoved: 0,
        tokensPruned: pruned.tokensSaved,
      }
    }
    const prompt = context.compactionPrompt ?? this.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT

    const conversationText = context.messages
      .map((m) => `${m.role}: ${JSON.stringify(m.content)}`)
      .join('\n')

    const { generateText } = await import('ai')
    const result = await generateText({
      model: model as never,
      system: prompt,
      messages: [{ role: 'user', content: conversationText }],
      abortSignal: context.signal,
    })
    const summary = result.text

    const summaryMessages: ModelMessage[] = [
      {
        role: 'user',
        content: `[Previous conversation summary]\n\n${summary}\n\n[The conversation continues from here]`,
      },
    ]

    return {
      messages: summaryMessages,
      summary,
      messagesRemoved: context.messages.length - 1,
      tokensPruned: this.estimateTokens(context.messages) - this.estimateTokens(summaryMessages),
    }
  }
}

// ── 剪枝（upstream 同形；导出供守恒编排复用） ────────────────────────────────

export interface PruneResult {
  messages: ModelMessage[]
  tokensSaved: number
  messagesModified: number
}

function estimateMessageTokens(
  msg: ModelMessage,
  estimator: (msgs: ModelMessage[]) => number,
): number {
  return estimator([msg])
}

export function pruneToolResults(
  messages: ModelMessage[],
  protectedTokens: number,
  minSavings: number,
  estimateTokens: (msgs: ModelMessage[]) => number,
): PruneResult {
  const result = structuredClone(messages)
  let accumulated = 0
  // 本地修正（偏离 upstream，测试实证）：upstream 边界初值 = length，当全史小于
  // 保护预算时（回溯累计从未达 protectedTokens）边界不更新 → 循环遍历到 length-1，
  // "保护近端"语义反转为全史可剪。修正：初值 0（全史受保护），仅当累计达线才划定边界
  let boundary = 0

  // 从尾往前找保护边界（boundary = 首个不受保护的下标）
  for (let i = result.length - 1; i >= 0; i--) {
    accumulated += estimateMessageTokens(result[i], estimateTokens)
    if (accumulated >= protectedTokens) {
      boundary = i
      break
    }
  }

  // 边界之前的工具结果替换为占位符
  let tokensSaved = 0
  let modified = 0
  for (let i = 0; i < boundary; i++) {
    if (result[i].role === 'tool') {
      const before = estimateMessageTokens(result[i], estimateTokens)
      const content = result[i].content
      if (Array.isArray(content)) {
        result[i].content = content.map((part) =>
          part.type === 'tool-result' ? { ...part, result: '[pruned]' } : part,
        ) as never
      }
      const after = estimateMessageTokens(result[i], estimateTokens)
      tokensSaved += before - after
      modified++
    }
  }

  if (tokensSaved < minSavings) {
    return { messages, tokensSaved: 0, messagesModified: 0 }
  }

  return { messages: result, tokensSaved, messagesModified: modified }
}
