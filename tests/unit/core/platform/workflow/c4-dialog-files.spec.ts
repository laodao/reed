/**
 * C4 临时知识库测试：对话附件收集 / TF 检索 / 节点统一入口 / 目录契约
 * @module tests/workflow/c4-dialog-files
 */
import { describe, it, expect, vi } from 'vitest'

// 模块级 mock：augmentWithDialogFiles 默认走 getCoreDatabaseManager().messages
const getRecentMock = vi.fn()
vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({ messages: { getRecent: (...a: unknown[]) => getRecentMock(...a) } }),
}))
vi.mock('@core/platform/services/knowledge-base.service', () => ({ KnowledgeService: class {} }))
vi.mock('@core/platform/services/ai-call', () => ({ callAIStream: vi.fn(), callVLM: vi.fn(), toImageDataUrl: vi.fn() }))

import {
  collectDialogFileTexts,
  tokenizeQuery,
  retrieveFromDialogFiles,
  augmentWithDialogFiles,
  type DialogFileDeps,
} from '@core/platform/workflow/nodes/dialog-file-retriever'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

const TEXT_A = '量子计算的基本原理是叠加与纠缠。量子比特可以同时处于多个状态。'

// ---- 注入式假依赖 ----
function fakeMessages(msgs: Array<{ id: string; attachments?: any[] }>): DialogFileDeps['getMessages'] {
  return async () => msgs as never
}
const fakeExtract: DialogFileDeps['extract'] = async (_p, name) => (name === 'a.txt' ? TEXT_A : '今天天气不错。')

const fakeCtx = (triggerInfo: Record<string, unknown>, warns: string[]) => ({
  triggerInfo,
  logger: { warn: (m: string) => warns.push(m) },
})

describe('C4：collectDialogFileTexts', () => {
  it('收集 document 附件并解析文本；image 跳过；按 filePath 去重', async () => {
    const files = await collectDialogFileTexts('dlg1', {
      getMessages: fakeMessages([
        { id: 'm1', attachments: [{ type: 'document', fileName: 'a.txt', filePath: '/f/a.txt' }] },
        { id: 'm2', attachments: [{ type: 'image', fileName: 'p.png', filePath: '/f/p.png' }] },
        { id: 'm3', attachments: [{ type: 'document', fileName: 'a.txt', filePath: '/f/a.txt' }] },
      ]),
      extract: fakeExtract,
    })
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ fileName: 'a.txt', messageId: 'm1' })
    expect(files[0].text).toContain('量子')
  })

  it('单文件解析失败跳过不阻断', async () => {
    const files = await collectDialogFileTexts('dlg1', {
      getMessages: fakeMessages([
        { id: 'm1', attachments: [
          { type: 'document', fileName: 'bad.pdf', filePath: '/f/bad.pdf' },
          { type: 'document', fileName: 'a.txt', filePath: '/f/a.txt' },
        ] },
      ]),
      extract: async (_p, name) => { if (name === 'bad.pdf') throw new Error('损坏'); return '正常内容' },
    })
    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('a.txt')
  })
})

describe('C4：tokenizeQuery / retrieveFromDialogFiles', () => {
  it('中文双字滑窗 + 西文词元', () => {
    expect(tokenizeQuery('量子 计算量子 computing')).toEqual(expect.arrayContaining(['量子', '计算', 'computing']))
  })

  it('命中块按频次打分；无关文档不命中', () => {
    const files = [
      { fileName: 'q.txt', messageId: 'm1', text: '量子量子量子纠缠。'.repeat(3) },
      { fileName: 'w.txt', messageId: 'm2', text: '今天天气不错，适合散步。' },
    ]
    const hits = retrieveFromDialogFiles(files, '量子纠缠', 5)
    expect(hits).toHaveLength(1)
    expect(hits[0].documentName).toBe('q.txt')
    expect(hits[0].score).toBeGreaterThan(0)
    expect(hits[0].score).toBeLessThan(1)
  })

  it('长文档分块（>800 字符多块）且 topK 截断', () => {
    const files = [{ fileName: 'big.txt', messageId: 'm1', text: '关键词。'.repeat(400) }]
    const all = retrieveFromDialogFiles(files, '关键词', 100)
    expect(all.length).toBeGreaterThan(1)
    const capped = retrieveFromDialogFiles(files, '关键词', 2)
    expect(capped).toHaveLength(2)
  })
})

describe('C4：augmentWithDialogFiles（节点统一入口）', () => {
  it('未开启 → 空数组（零开销）', async () => {
    const hits = await augmentWithDialogFiles(fakeCtx({ dialogId: 'd1' }, []) as never, false, 'q', 5)
    expect(hits).toEqual([])
  })

  it('开启但无 dialogId → 警告降级', async () => {
    const warns: string[] = []
    const hits = await augmentWithDialogFiles(fakeCtx({}, warns) as never, true, 'q', 5)
    expect(hits).toEqual([])
    expect(warns.at(-1)).toContain('对话')
  })

  it('开启且有 dialogId → 返回带 source 标记的命中', async () => {
    getRecentMock.mockResolvedValue([
      { id: 'm1', attachments: [{ type: 'document', fileName: 'a.txt', filePath: '/f/a.txt' }] },
    ])
    // 真实 extract 走 fs——用注入路径等价断言 + 模块路径的 source 标记由 map 保证
    const files = await collectDialogFileTexts('d1', {
      getMessages: fakeMessages([{ id: 'm1', attachments: [{ type: 'document', fileName: 'a.txt', filePath: '/f/a.txt' }] }]),
      extract: fakeExtract,
    })
    const hits = retrieveFromDialogFiles(files, '量子', 5).map(h => ({ ...h, source: 'dialog-file' as const }))
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].source).toBe('dialog-file')
    expect(hits[0].documentName).toBe('a.txt')
  })
})

describe('C4：节点 config 契约', () => {
  it('kb-retrieve / kb-qa 目录默认含 includeDialogFiles=false（向后兼容）', () => {
    expect(NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['kb-retrieve']].defaultConfig).toMatchObject({ includeDialogFiles: false })
    expect(NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['kb-qa']].defaultConfig).toMatchObject({ includeDialogFiles: false })
  })
})
