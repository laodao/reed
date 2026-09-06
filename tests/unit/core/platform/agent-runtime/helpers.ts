/**
 * agent-runtime 测试公共件（mock LLM 真实 streamText 路径——MockLanguageModelV3 + 动态 ai 模块）
 * 架构统一（深度 review）：loop.spec 与 agent-service.spec 原各自复制一份，收口于此。
 */

import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'

export const mockUsage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, noCache: 5 },
  totalTokens: { total: 15, noCache: 15 },
}

/** 纯文本响应 chunks（一步 final） */
export function txtChunks(t: string): Array<Record<string, unknown>> {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: t },
    { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: mockUsage },
  ]
}

/** 工具调用响应 chunks（一步 tool_calls） */
export function toolCallChunks(id: string, name: string, input: unknown): Array<Record<string, unknown>> {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId: id, toolName: name, input: JSON.stringify(input) },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: mockUsage },
  ]
}

/** 流中途失败响应 chunks（provider 500 / 网络中断形态：error part 收尾，非 throw） */
export function streamErrorChunks(partialText: string, errorMessage: string): Array<Record<string, unknown>> {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: partialText },
    { type: 'text-end', id: 't' },
    { type: 'error', error: new Error(errorMessage) },
  ]
}

/** steps：每次 doStream 消费一个响应工厂；capture 记录每次调用的 prompt（断言历史重放） */
export function mkModel(
  steps: Array<() => Array<Record<string, unknown>>>,
  capture?: (prompt: unknown[]) => void,
): LanguageModel {
  let i = 0
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async (opts: { prompt?: unknown }) => {
      capture?.(structuredClone(opts.prompt ?? []))
      return {
        stream: simulateReadableStream({ chunks: steps[Math.min(i++, steps.length - 1)]() }),
      }
    },
  }) as unknown as LanguageModel
}
