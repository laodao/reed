/**
 * get_tool_result 回查工具单测（39 号 P1-1）
 * 锚点：命中回查（窗口/翻页）/ 未命中 NOT_FOUND / 大结果 hasMore+nextOffset。
 */

import { describe, expect, it } from 'vitest'
import { createGetToolResultTool } from '@core/platform/agent-runtime/tools/artifact-lookup'
import type { ToolArtifactPort, ToolArtifactRecord } from '@core/platform/agent-runtime/tools/artifacts'

function portWith(records: Record<string, ToolArtifactRecord>): ToolArtifactPort {
  return {
    save: async () => {},
    load: async (id) => records[id],
    deleteByScope: async () => 0,
  }
}

describe('get_tool_result（39 号 P1-1）', () => {
  const big = 'L'.repeat(20_000)
  const port = portWith({
    tc_1: { scopeKey: 's', toolCallId: 'tc_1', toolName: 'log_read', args: {}, result: { text: big }, ok: true },
  })

  it('命中：返回窗口 + totalChars + hasMore/nextOffset', async () => {
    const tool = createGetToolResultTool(port)
    const r = await tool.execute({ toolCallId: 'tc_1' }, {} as never)
    expect(r.ok).toBe(true)
    const data = (r as { data: { toolName: string; totalChars: number; window: string; hasMore: boolean; nextOffset: number } }).data
    expect(data.toolName).toBe('log_read')
    expect(data.totalChars).toBeGreaterThan(20_000)
    expect(data.window.length).toBe(8_000)
    expect(data.hasMore).toBe(true)
    expect(data.nextOffset).toBe(8_000)
  })

  it('翻页：offset 取到后续窗口直至收尾', async () => {
    const tool = createGetToolResultTool(port)
    const r = await tool.execute({ toolCallId: 'tc_1', offset: 8_000, maxChars: 8_000 }, {} as never)
    const data = (r as { data: { window: string; hasMore: boolean; nextOffset: number } }).data
    expect(data.window.length).toBe(8_000)
    expect(data.hasMore).toBe(true)
    // 末窗
    const tail = await tool.execute({ toolCallId: 'tc_1', offset: 16_000, maxChars: 16_000 }, {} as never)
    const tailData = (tail as { data: { window: string; hasMore: boolean } }).data
    expect(tailData.hasMore).toBe(false)
    expect(tailData.nextOffset).toBeUndefined()
  })

  it('未命中：NOT_FOUND + hint', async () => {
    const tool = createGetToolResultTool(portWith({}))
    const r = await tool.execute({ toolCallId: 'missing' }, {} as never)
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toBe('NOT_FOUND')
  })
})
