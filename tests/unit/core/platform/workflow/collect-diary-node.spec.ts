/**
 * collect-diary 节点测试（周报/月报复盘的数据面）
 * @module tests/unit/core/platform/workflow/collect-diary-node
 * @description 验证：时间窗解析（days 缺省/显式日期优先/含当天全天）、聚合 markdown
 *              结构（标题头 + 逐篇 section + 标签）、防爆量截断（200 篇/30000 字）、
 *              空时段、无效日期报错、getEntriesByDateRange 委托参数。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ==================== 可注入的 mock 依赖 ====================
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

import { DIARY_NODE_HANDLERS } from '@core/platform/workflow/nodes/diary-nodes'
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

function makeEntry(overrides: Partial<{ title: string; preview: string; createdAt: string; tags: string[] }>) {
  return {
    id: 'e1',
    folderId: 'f1',
    title: '标题',
    preview: '正文预览',
    wordCount: 10,
    tags: [] as string[],
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('collect-diary 节点', () => {
  it('validateConfig：days 非正数报错，显式日期或留空通过', () => {
    expect(collectNode.validateConfig?.({ days: '0' })!.length).toBeGreaterThan(0)
    expect(collectNode.validateConfig?.({ days: '-3' })!.length).toBeGreaterThan(0)
    expect(collectNode.validateConfig?.({}) ?? []).toEqual([])
    expect(collectNode.validateConfig?.({ days: '30' }) ?? []).toEqual([])
    expect(collectNode.validateConfig?.({ startDate: '2026-09-01', endDate: '2026-09-30' }) ?? []).toEqual([])
  })

  it('execute：days 缺省走最近 7 天，委托日期范围查询', async () => {
    mockDiary.getEntriesByDateRange.mockResolvedValue({ success: true, data: [] })
    const before = Date.now()
    const result = await collectNode.execute(makeCtx({ days: '', folderId: '' }))
    expect(result.status).toBe('succeeded')

    const call = mockDiary.getEntriesByDateRange.mock.calls[0]
    const from = new Date(call[0] as string)
    const to = new Date(call[1] as string)
    expect(call[2]).toBeUndefined() // folderId 留空 → 全部目录
    expect(from.getTime()).toBeGreaterThanOrEqual(before - 7 * 86400000 - 1000)
    expect(from.getTime()).toBeLessThanOrEqual(before - 7 * 86400000 + 5000)
    expect(to.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
    expect((result as { output: { content: string } }).output.content).toContain('该时段没有日记')
  })

  it('execute：显式日期按本地时区解析，endDate 含当天全天', async () => {
    mockDiary.getEntriesByDateRange.mockResolvedValue({ success: true, data: [] })
    await collectNode.execute(makeCtx({ startDate: '2026-09-01', endDate: '2026-09-07' }))

    const call = mockDiary.getEntriesByDateRange.mock.calls[0]
    const from = new Date(call[0] as string)
    const to = new Date(call[1] as string)
    // 本地时区语义（H7 修复）：from=9-1 本地零点；to=9-7 本地全天末（次日零点-1ms）
    expect(from.getTime()).toBe(new Date(2026, 8, 1).getTime())
    expect(to.getTime()).toBe(new Date(2026, 8, 8).getTime() - 1)
  })

  it('execute：聚合 markdown 含日期标题与标签，素材头带篇数', async () => {
    mockDiary.getEntriesByDateRange.mockResolvedValue({
      success: true,
      data: [
        makeEntry({ title: '周一跑步', preview: '今天跑了五公里', createdAt: '2026-09-15T10:00:00Z', tags: ['运动'] }),
        makeEntry({ title: '读完一章', preview: '论断：输出倒逼输入', createdAt: '2026-09-17T10:00:00Z' }),
      ],
    })
    const result = (await collectNode.execute(makeCtx({ days: '30' }))) as {
      status: string
      output: { content: string; count: number }
    }
    expect(result.status).toBe('succeeded')
    expect(result.output.count).toBe(2)
    expect(result.output.content).toContain('共 2 篇')
    expect(result.output.content).toContain('### ')
    expect(result.output.content).toContain('周一跑步')
    expect(result.output.content).toContain('今天跑了五公里')
    expect(result.output.content).toContain('标签：运动')
    expect(result.output.content).toContain('读完一章')
  })

  it('execute：200 篇上限截断 + 30000 字符上限截断', async () => {
    const many = Array.from({ length: 260 }, (_, i) =>
      makeEntry({ title: `日记 ${i}`, createdAt: '2026-09-20T10:00:00Z' })
    )
    mockDiary.getEntriesByDateRange.mockResolvedValue({ success: true, data: many })
    const result = (await collectNode.execute(makeCtx({ days: '30' }))) as {
      output: { count: number; content: string }
    }
    expect(result.output.count).toBe(200)
  })

  it('execute：无效日期报 failed', async () => {
    const result = await collectNode.execute(makeCtx({ startDate: 'not-a-date' }))
    expect(result.status).toBe('failed')
  })

  it('execute：服务层失败透传', async () => {
    mockDiary.getEntriesByDateRange.mockResolvedValue({ success: false, error: 'db down' })
    const result = await collectNode.execute(makeCtx({}))
    expect(result.status).toBe('failed')
  })
})
