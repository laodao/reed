/**
 * llm-chat 节点 jsonMode 稳健解析测试（extractJson 兜底）
 * @module tests/unit/core/modules/workflow/llm-chat-jsonmode
 * @description 模型可能把 JSON 包进 ```json 代码块 / 前置说明文字 / 包裹不完整，
 *              需能从这些形态中稳健提取 parsed，避免 jsonMode 节点误判失败。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const callAIStreamMock = vi.fn()
vi.mock('@core/services/ai-call', () => ({
  callAIStream: (...a: any[]) => callAIStreamMock(...a),
  callVLM: vi.fn(),
  toImageDataUrl: vi.fn(),
}))
vi.mock('@core/interfaces/path.interface', () => ({ getPathProvider: () => ({ getDataPath: () => 'C:/t' }) }))
vi.mock('@core/modules/workflow/nodes/http-fetch', () => ({ executeHttpFetch: vi.fn() }))

import { TASK_NODE_HANDLERS } from '@core/modules/workflow/nodes/task-nodes'
import type { WorkflowNodeContext } from '@core/modules/workflow/engine/node-handler'

const handler = TASK_NODE_HANDLERS.find(h => h.type === 'llm-chat')!

const makeCtx = (config: Record<string, unknown>): WorkflowNodeContext =>
  ({
    runId: 'run_1', runKey: 'nodeX', nodeId: 'nodeX', nodeType: 'llm-chat' as any,
    iterationIndex: 0, config, startInputs: {}, triggerInfo: {},
    signal: new AbortController().signal,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    emitProgress: () => {}, resolveTemplate: (t: string) => t as never, getVariable: () => undefined,
  }) as never

beforeEach(() => { vi.clearAllMocks(); callAIStreamMock.mockResolvedValue({ content: '[]', usage: null }) })

describe('llm-chat jsonMode 解析', () => {
  it('纯 JSON → parsed', async () => {
    callAIStreamMock.mockResolvedValue({ content: '{"a":1}', usage: null })
    const r = await handler.execute(makeCtx({ prompt: 'p', jsonMode: true }) as never)
    expect(r.status).toBe('succeeded')
    expect(((r as any).output as any).parsed).toEqual({ a: 1 })
  })

  it('被 ```json 代码块包裹 → parsed', async () => {
    callAIStreamMock.mockResolvedValue({ content: '```json\n{"a":1}\n```', usage: null })
    const r = await handler.execute(makeCtx({ prompt: 'p', jsonMode: true }) as never)
    expect(r.status).toBe('succeeded')
    expect(((r as any).output as any).parsed).toEqual({ a: 1 })
  })

  it('带前导说明文字（"好的，以下是 JSON："）→ parsed', async () => {
    callAIStreamMock.mockResolvedValue({ content: '好的，以下是 JSON：\n{"timeline":[{"time":"x"}]}', usage: null })
    const r = await handler.execute(makeCtx({ prompt: 'p', jsonMode: true }) as never)
    expect(r.status).toBe('succeeded')
    expect(((r as any).output as any).parsed).toEqual({ timeline: [{ time: 'x' }] })
  })

  it('包裹不完整（只有开头 ```json 无闭合）→ parsed', async () => {
    callAIStreamMock.mockResolvedValue({ content: '```json\n[1,2,3]', usage: null })
    const r = await handler.execute(makeCtx({ prompt: 'p', jsonMode: true }) as never)
    expect(r.status).toBe('succeeded')
    expect(((r as any).output as any).parsed).toEqual([1, 2, 3])
  })

  it('首次输出非 JSON → 自动重试一次，第二次有效 JSON → parsed', async () => {
    callAIStreamMock
      .mockResolvedValueOnce({ content: '抱歉，以下是整理结果（非 JSON）：……', usage: null })
      .mockResolvedValueOnce({ content: '{"ok":true}', usage: null })
    const r = await handler.execute(makeCtx({ prompt: 'p', jsonMode: true }) as never)
    expect(r.status).toBe('succeeded')
    expect(((r as any).output as any).parsed).toEqual({ ok: true })
    expect(callAIStreamMock).toHaveBeenCalledTimes(2)
  })

  it('连续多次非 JSON → failed（最多重试 2 次，共 3 次调用）', async () => {
    callAIStreamMock.mockResolvedValue({ content: '仍不是 JSON', usage: null })
    const r = await handler.execute(makeCtx({ prompt: 'p', jsonMode: true }) as never)
    expect(r.status).toBe('failed')
    expect((r as any).error).toContain('jsonMode')
    expect(callAIStreamMock).toHaveBeenCalledTimes(3)
  })

  it('非 JSON → failed（明确报错，不静默）', async () => {
    callAIStreamMock.mockResolvedValue({ content: '这不是 JSON', usage: null })
    const r = await handler.execute(makeCtx({ prompt: 'p', jsonMode: true }) as never)
    expect(r.status).toBe('failed')
    expect((r as any).error).toContain('jsonMode')
  })
})
