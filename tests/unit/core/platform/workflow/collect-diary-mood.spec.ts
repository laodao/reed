/**
 * collect-diary 心情聚合 + extractMood 测试（spec 2026-09-24 P3-4）
 * @module tests/unit/core/platform/workflow/collect-diary-mood
 * @description 验证：frontmatter mood 解析（合法/非法/缺失）、带 mood 的聚合
 *              section 头（心情：N/5）、mood 与标签并存的 meta 拼接。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockDiary = {
  getEntriesByDateRange: vi.fn(),
}

vi.mock('@core/platform/services/diary.service', () => ({
  DiaryService: class {
    constructor() {
      return mockDiary as never
    }
  },
}))

import { DIARY_NODE_HANDLERS, extractMood } from '@core/platform/workflow/nodes/diary-nodes'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'

const collectNode = DIARY_NODE_HANDLERS.find(n => n.type === 'collect-diary') as WorkflowNodeHandler

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return {
    config,
    runId: 'run_1',
    nodeId: 'collect1',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    emitProgress: vi.fn(),
  } as never as WorkflowNodeContext
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('extractMood', () => {
  it('合法 mood 1-5 解析', () => {
    expect(extractMood('mood: 4')).toBe(4)
    expect(extractMood('---\nmood: 2\n---')).toBe(2)
    expect(extractMood('brain: false\nmood:5\n')).toBe(5)
  })

  it('缺失/非法/越界返回 null', () => {
    expect(extractMood(undefined)).toBeNull()
    expect(extractMood('mood: good')).toBeNull()
    expect(extractMood('mood: 0')).toBeNull()
    expect(extractMood('mood: 6')).toBeNull()
  })
})

describe('collect-diary 心情聚合', () => {
  it('带 mood 的 section 头包含 心情：N/5，与标签并存', async () => {
    mockDiary.getEntriesByDateRange.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'e1', folderId: 'f1', title: '高强度一天', preview: '写了很多', wordCount: 10,
          tags: ['工作'], frontmatter: 'mood: 3\nbrain: false',
          createdAt: '2026-09-15T10:00:00Z', updatedAt: '2026-09-15T10:00:00Z',
        },
        {
          id: 'e2', folderId: 'f1', title: '平静一天', preview: '散步', wordCount: 5,
          tags: [], frontmatter: undefined,
          createdAt: '2026-09-16T10:00:00Z', updatedAt: '2026-09-16T10:00:00Z',
        },
      ],
    })

    const result = (await collectNode.execute(makeCtx({ days: '30' }))) as {
      status: string
      output: { content: string }
    }
    expect(result.status).toBe('succeeded')
    expect(result.output.content).toContain('心情：3/5')
    expect(result.output.content).toContain('标签：工作')
    // 无 mood 的条目不出现在何心情标记
    const e2Section = result.output.content.split('### ').find(s => s.includes('平静一天'))
    expect(e2Section).toBeDefined()
    expect(e2Section!).not.toContain('心情')
  })
})
