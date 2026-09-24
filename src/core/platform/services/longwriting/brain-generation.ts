/**
 * 章节生成·大脑工具位（拉取式消费，ai@6 多步 streamText）
 * @module platform/services/longwriting/brain-generation
 *
 * 把 kb_brain_query 以工具形态交给章法创作的 LLM 调用（设计卡/正文）：模型自主
 * 决定是否检索大脑，系统不做任何自动注入（用户决策 2026-09-22）。
 * 主线纪律「不影响主链路」：首字未出前的任何失败（模型不支持工具/连接失败/
 * 大脑不可用/工具步占满预算未产出正文）静默回退原 callAIStream 链路；出字后
 * 失败与原链路语义一致（error 事件 + 抛出）——出字后回退会造成渲染层文本
 * 重复拼接。回退时 callAIStream 会在 abortControllers 以同 eventId 覆盖登记
 * （故意为之：取消按钮此后打的是回退流），且渲染层会收到第二次 start
 * （渲染层对 start 无动作，无副作用）。abort 期间不回退、error+抛出。
 * 模型解析走 ProviderAdapter（与工作流 agent 同源，支持 openai 兼容/anthropic/
 * google；模型缺省链与旧 callAIStream 的 models[0] 口径略有差异——同 agent 运行时），
 * 多步由 ai@6 stopWhen 控制（≤3 轮工具调用 + 1 步成文）。
 */
import type { LanguageModel, ToolSet } from 'ai'
import { createLogger } from '@core/utils/logger'
import { hasEnabledBrainKb, buildWritingBrainTool, WRITING_BRAIN_TOOL_NAME, BRAIN_TOOL_SYSTEM_NOTE } from '@core/platform/services/kb-brain/writing-brain-tool'

const logger = createLogger('LwBrainGeneration')

/** 工具步预算：≤3 轮工具调用 + 1 步成文（ai@6 stopWhen stepCountIs；单步可能并行多工具调用，
 *  「3 轮」是软提示非硬约束——真正的硬保护是步数上限与零文本回退） */
export const BRAIN_GENERATION_MAX_STEPS = 4

/** 流事件（与 LongWritingAIService.GenerationStreamEvent 结构对齐；避免反向依赖） */
export interface BrainStreamEvent {
  type: 'start' | 'content' | 'done' | 'error' | 'progress'
  content?: string
  error?: string
}

export interface BrainGenerationDeps {
  resolveModel: (opts: { providerConfigId?: string; modelId?: string }) => Promise<LanguageModel>
  /** 回退通道：与 LongWritingAIService.callAIStream 同签名（自含 start/done/error 事件与取消语义） */
  fallback: (eventId: string, prompt: string, systemPrompt?: string, maxTokens?: number, providerConfigId?: string, modelId?: string) => Promise<string>
  hasBrain?: () => Promise<boolean>
  buildTool?: () => ToolSet
  emit?: (eventId: string, ev: BrainStreamEvent) => void
  /** ai 模块（测试注入）；缺省动态 import（延迟绑定，同 agent-runtime 先例） */
  ai?: typeof import('ai')
}

/**
 * 带大脑工具位的流式生成。事件序列与 callAIStream 兼容（start/content/done），
 * 工具调用以 progress 事件通报（渲染层未知类型自然忽略）。
 */
export async function callAIStreamWithBrain(
  eventId: string,
  prompt: string,
  systemPrompt: string | undefined,
  maxTokens: number | undefined,
  providerConfigId: string | undefined,
  modelId: string | undefined,
  deps: BrainGenerationDeps,
  signal?: AbortSignal,
): Promise<string> {
  const emit = deps.emit ?? (() => {})
  const brainOn = await (deps.hasBrain ?? hasEnabledBrainKb)()
  if (!brainOn) return deps.fallback(eventId, prompt, systemPrompt, maxTokens, providerConfigId, modelId)

  emit(eventId, { type: 'start' })
  let fullContent = ''
  let emittedDelta = false
  try {
    const model = await deps.resolveModel({ providerConfigId, modelId })
    const ai = deps.ai ?? (await import('ai'))
    const tools = deps.buildTool?.() ?? ({ [WRITING_BRAIN_TOOL_NAME]: buildWritingBrainTool() } as ToolSet)
    const stream = ai.streamText({
      model,
      system: systemPrompt ? systemPrompt + BRAIN_TOOL_SYSTEM_NOTE : BRAIN_TOOL_SYSTEM_NOTE.trim(),
      prompt,
      tools,
      stopWhen: ai.stepCountIs(BRAIN_GENERATION_MAX_STEPS),
      maxOutputTokens: maxTokens || 8192,
      abortSignal: signal,
    })
    for await (const part of stream.fullStream as AsyncIterable<{ type?: string; text?: string; delta?: string; toolName?: string; error?: unknown }>) {
      if (part.type === 'text-delta') {
        // ai@6 部件载荷字段为 text（loop.ts 同款消费）；delta 兜底旧版形态
        const delta = part.text ?? part.delta ?? ''
        if (delta) {
          fullContent += delta
          emittedDelta = true
          emit(eventId, { type: 'content', content: delta })
        }
      } else if (part.type === 'tool-call') {
        const args = JSON.stringify((part as { input?: unknown }).input ?? {})
        logger.info(`[${eventId}] 模型调用大脑检索 ${part.toolName ?? WRITING_BRAIN_TOOL_NAME} ${args.slice(0, 120)}`)
        emit(eventId, { type: 'progress', content: `正在查阅知识大脑（${part.toolName ?? WRITING_BRAIN_TOOL_NAME}）…` })
      } else if (part.type === 'error') {
        const err = part.error as { message?: string } | undefined
        throw new Error(err?.message || 'AI 生成失败')
      }
    }
    if (signal?.aborted) throw new Error('已取消')
    // 步数预算被工具调用耗尽时 ai@6 正常收流不抛错——零文本返回会造成
    // 「静默成功」（设计卡报格式错误/空稿进扩写），视为失败走回退
    if (!fullContent.trim() && !emittedDelta) {
      throw new Error('工具步占满预算，未产出正文')
    }
    emit(eventId, { type: 'done', content: fullContent })
    return fullContent
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 出字前失败：静默回退原链路（渲染层尚未收到 content，无重复拼接风险）
    if (!emittedDelta && !signal?.aborted) {
      logger.warn(`[${eventId}] 大脑工具位生成失败（${msg}），回退原链路`)
      return deps.fallback(eventId, prompt, systemPrompt, maxTokens, providerConfigId, modelId)
    }
    // 出字后失败/取消：与 callAIStream 错误语义一致——error 事件 + 抛出
    emit(eventId, { type: 'error', error: msg || 'AI 生成失败' })
    throw e instanceof Error ? e : new Error(msg)
  }
}
