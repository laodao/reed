/**
 * 章节生成·大脑工具位包装器单测
 * - 走 ai@6 真实 streamText 多步路径（MockLanguageModelV3，同 agent-runtime 套件）
 * - 回退纪律：首字前失败静默回退；出字后失败 error 事件 + 抛出
 * @see src/core/platform/services/longwriting/brain-generation.ts
 */
import { describe, it, expect } from 'vitest'
import * as aiModule from 'ai'
import { tool } from 'ai'
import { z } from 'zod'
import type { LanguageModel, ToolSet } from 'ai'
import {
  callAIStreamWithBrain,
  BRAIN_GENERATION_MAX_STEPS,
  type BrainGenerationDeps,
  type BrainStreamEvent,
} from '@core/platform/services/longwriting/brain-generation'
import { mkModel, txtChunks, toolCallChunks, streamErrorChunks } from '../../core/platform/agent-runtime/helpers'

/** 依赖装配：可变模型槽 + 事件/回退收集器 */
function mkDeps(overrides: Partial<BrainGenerationDeps> & { model?: LanguageModel }) {
  const events: BrainStreamEvent[] = []
  const fallbackCalls: Array<{ prompt: string; systemPrompt?: string }> = []
  const deps: BrainGenerationDeps = {
    resolveModel: async () => overrides.model!,
    fallback: async (_eventId, prompt, systemPrompt) => {
      fallbackCalls.push({ prompt, systemPrompt })
      return '回退产物'
    },
    hasBrain: async () => true,
    emit: (_eventId, ev) => events.push(ev),
    ai: aiModule,
    ...overrides,
  }
  return { deps, events, fallbackCalls }
}

describe('callAIStreamWithBrain', () => {
  it('常量：工具步预算 ≤3 次工具调用 + 1 步成文', () => {
    expect(BRAIN_GENERATION_MAX_STEPS).toBe(4)
  })

  it('未启用大脑 → 直接走回退链路（不建模型、不发事件）', async () => {
    const model = mkModel([() => txtChunks('不应被调用')])
    const { deps, events, fallbackCalls } = mkDeps({ model, hasBrain: async () => false })
    const out = await callAIStreamWithBrain('e1', '写一章', '系统提示', 2500, 'p1', 'm1', deps)
    expect(out).toBe('回退产物')
    expect(fallbackCalls).toEqual([{ prompt: '写一章', systemPrompt: '系统提示' }])
    expect(events).toEqual([])
  })

  it('工具位成功路径：模型先查大脑再成文；工具结果回流下一步；事件 start/progress/content/done', async () => {
    const prompts: unknown[][] = []
    const toolInputs: Array<unknown> = []
    const brainTool = tool({
      description: 'brain',
      inputSchema: z.object({ query: z.string() }),
      execute: async (input) => {
        toolInputs.push(input)
        return '[1] 经验卡｜来源：诛仙｜钩子体系设计方法'
      },
    })
    const buildTool = (): ToolSet => ({ kb_brain_query: brainTool })
    const model = mkModel(
      [
        () => toolCallChunks('call-1', 'kb_brain_query', { query: '开篇钩子' }),
        () => txtChunks('第一章 正文……'),
      ],
      (p) => prompts.push(p as unknown[]),
    )
    const { deps, events, fallbackCalls } = mkDeps({ model, buildTool })
    const out = await callAIStreamWithBrain('e2', '【本章大纲】…', '你是小说家', 2500, undefined, undefined, deps)

    expect(out).toBe('第一章 正文……')
    expect(toolInputs).toEqual([{ query: '开篇钩子' }])
    expect(fallbackCalls).toEqual([])
    // 工具结果回流到第二步 prompt（ai@6 多步自动执行）
    expect(prompts.length).toBe(2)
    expect(JSON.stringify(prompts[1])).toContain('钩子体系设计方法')
    // system prompt 追加工具说明（仅工具位路径）
    expect(JSON.stringify(prompts[0])).toContain('可用工具 kb_brain_query')
    // 事件序列
    const types = events.map((e) => e.type)
    expect(types[0]).toBe('start')
    expect(types).toContain('progress')
    expect(types).toContain('content')
    expect(types[types.length - 1]).toBe('done')
    expect(events.find((e) => e.type === 'done')?.content).toBe('第一章 正文……')
  })

  it('systemPrompt 缺省 → 仅工具说明作为 system', async () => {
    const prompts: unknown[][] = []
    const model = mkModel([() => txtChunks('成文')], (p) => prompts.push(p as unknown[]))
    const { deps } = mkDeps({ model })
    await callAIStreamWithBrain('e3', '正文任务', undefined, undefined, undefined, undefined, deps)
    expect(JSON.stringify(prompts[0])).toContain('可用工具 kb_brain_query')
  })

  it('首字前失败（模型不支持工具）→ 静默回退原链路', async () => {
    const model = mkModel([() => [{ type: 'stream-start', warnings: [] }, { type: 'error', error: new Error('tools not supported') }]])
    const { deps, events, fallbackCalls } = mkDeps({ model })
    const out = await callAIStreamWithBrain('e4', '任务', '系统', 100, 'p', 'm', deps)
    expect(out).toBe('回退产物')
    expect(fallbackCalls.length).toBe(1)
    expect(fallbackCalls[0].systemPrompt).toBe('系统')
    expect(events.filter((e) => e.type === 'error')).toEqual([])
  })

  it('resolveModel 失败 → 静默回退', async () => {
    const { deps, fallbackCalls } = mkDeps({
      resolveModel: async () => {
        throw new Error('未配置 AI 提供商')
      },
    })
    const out = await callAIStreamWithBrain('e5', '任务', undefined, undefined, undefined, undefined, deps)
    expect(out).toBe('回退产物')
    expect(fallbackCalls.length).toBe(1)
  })

  it('出字后失败 → 不回退；error 事件 + 抛出（防渲染层重复拼接）', async () => {
    const model = mkModel([() => streamErrorChunks('部分正文', 'SSE 连接中断')])
    const { deps, events, fallbackCalls } = mkDeps({ model })
    await expect(callAIStreamWithBrain('e6', '任务', undefined, undefined, undefined, undefined, deps)).rejects.toThrow('SSE 连接中断')
    expect(fallbackCalls).toEqual([])
    const errEv = events.find((e) => e.type === 'error')
    expect(errEv?.error).toContain('SSE 连接中断')
    expect(events.some((e) => e.type === 'content' && e.content === '部分正文')).toBe(true)
  })

  it('工具步占满预算未产出正文 → 静默回退（防零文本静默成功）', async () => {
    const model = mkModel([
      () => toolCallChunks('c1', 'kb_brain_query', { query: 'a' }),
      () => toolCallChunks('c2', 'kb_brain_query', { query: 'b' }),
      () => toolCallChunks('c3', 'kb_brain_query', { query: 'c' }),
      () => toolCallChunks('c4', 'kb_brain_query', { query: 'd' }),
    ])
    const { deps, events, fallbackCalls } = mkDeps({ model })
    const out = await callAIStreamWithBrain('e8', '任务', undefined, undefined, undefined, undefined, deps)
    expect(out).toBe('回退产物')
    expect(fallbackCalls.length).toBe(1)
    expect(events.filter((e) => e.type === 'done')).toEqual([])
  })

  it('已取消 → 不回退，抛出', async () => {
    const controller = new AbortController()
    controller.abort()
    const model = mkModel([() => txtChunks('不应到达')])
    const { deps, fallbackCalls } = mkDeps({ model })
    await expect(
      callAIStreamWithBrain('e7', '任务', undefined, undefined, undefined, undefined, deps, controller.signal),
    ).rejects.toThrow()
    expect(fallbackCalls).toEqual([])
  })
})
