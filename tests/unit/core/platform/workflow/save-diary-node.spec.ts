/**
 * save-diary 节点测试（知识提炼存日记的核心节点）
 * @module tests/unit/core/platform/workflow/save-diary-node
 * @description 验证：配置校验（folderId/title/content）、缺省 folderId 自动创建
 *              「AI 提炼」文件夹、createEntry 委托成功/失败、输出 entryId/title。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ==================== 可注入的 mock 依赖 ====================
const mockDiary = {
  getAllFolders: vi.fn(),
  createFolder: vi.fn(),
  createEntry: vi.fn(),
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

const saveDiaryNode = DIARY_NODE_HANDLERS.find(n => n.type === 'save-diary') as WorkflowNodeHandler

function makeCtx(config: Record<string, unknown>): WorkflowNodeContext {
  return {
    config,
    runId: 'run_1',
    nodeId: 'diary1',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    emitProgress: vi.fn(),
  } as never as WorkflowNodeContext
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('save-diary 节点', () => {
  it('validateConfig：缺 content 报错', () => {
    const errors = saveDiaryNode.validateConfig?.({ content: '', title: '' })
    expect(errors).toBeDefined()
    expect(errors!.length).toBeGreaterThan(0)
  })

  it('validateConfig：content 有值通过（title 可空，自动生成）', () => {
    const errors = saveDiaryNode.validateConfig?.({ content: '{{llm1.content}}', title: '' })
    expect(errors).toEqual([])
  })

  it('execute：空 title 自动生成（内容首行）', async () => {
    mockDiary.createEntry.mockResolvedValue({
      success: true,
      data: { id: 'entry_x', title: '读后感：XXX', folderId: 'folder_1' },
    })
    const ctx = makeCtx({ folderId: 'folder_1', title: '', content: '读后感：XXX\n\n正文' })
    const result = await saveDiaryNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    expect(mockDiary.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('读后感：XXX') })
    )
  })

  it('execute：有 folderId 时直接调 createEntry，输出 entryId', async () => {
    mockDiary.createEntry.mockResolvedValue({
      success: true,
      data: { id: 'entry_1', title: '读后感：XXX' },
    })
    const ctx = makeCtx({
      folderId: 'folder_1',
      title: '读后感：XXX',
      content: '# 读后感\n\n正文',
    })
    const result = await saveDiaryNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    expect(mockDiary.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: 'folder_1', title: '读后感：XXX', content: expect.stringContaining('读后感') })
    )
    expect((result as { output: Record<string, unknown> }).output.entryId).toBe('entry_1')
  })

  it('execute：缺 folderId 时自动创建「AI 提炼」文件夹再写入', async () => {
    mockDiary.getAllFolders.mockResolvedValue({ success: true, data: [] })
    mockDiary.createFolder.mockResolvedValue({ success: true, data: { id: 'folder_new' } })
    mockDiary.createEntry.mockResolvedValue({
      success: true,
      data: { id: 'entry_2', title: '书评' },
    })
    const ctx = makeCtx({ title: '书评', content: '正文内容' })
    const result = await saveDiaryNode.execute(ctx)
    expect(result.status).toBe('succeeded')
    expect(mockDiary.createFolder).toHaveBeenCalledWith(expect.objectContaining({ name: 'AI 提炼' }))
    expect(mockDiary.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: 'folder_new' })
    )
    expect((result as { output: Record<string, unknown> }).output.entryId).toBe('entry_2')
  })

  it('execute：createEntry 失败 → 节点 failed', async () => {
    mockDiary.createEntry.mockResolvedValue({ success: false, error: '目录不存在' })
    const ctx = makeCtx({ folderId: 'x', title: 't', content: 'c' })
    const result = await saveDiaryNode.execute(ctx)
    expect(result.status).toBe('failed')
    expect((result as { error?: string }).error).toContain('目录不存在')
  })
})
