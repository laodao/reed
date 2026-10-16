/**
 * diary-brain-sync 服务测试（spec 2026-09-24 日记增强 P2 红线逻辑）
 * @module tests/unit/core/platform/services/diary-brain-sync
 * @description 验证：条目级排除（frontmatter brain:false）、字数阈值、opt-in 守卫、
 *              内容未变跳过、happy-path upsert（source=diary+entryId）、「日记」库
 *              自动创建与提议制 brainConfig（阈值不可达全部人批）、开关关闭出库清理。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ==================== 可注入的 mock 依赖 ====================
const mockDiary = {
  getEntry: vi.fn(),
  getEntries: vi.fn(),
  getDeletedEntries: vi.fn(),
  updateFolder: vi.fn(),
}

const mockKbService = {
  createKnowledgeBase: vi.fn(),
  updateKnowledgeBase: vi.fn(),
  addDocument: vi.fn(),
  deleteDocument: vi.fn(),
}

const mockDb = {
  knowledgeBases: {
    findById: vi.fn(),
    findAll: vi.fn(),
  },
  diaryFolders: {
    findById: vi.fn(),
  },
  diaryEntries: {
    findByFolder: vi.fn(),
  },
  kbDocuments: {
    findBySource: vi.fn(),
    findById: vi.fn(),
  },
}

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => mockDb,
}))

vi.mock('@core/platform/services/diary.service', () => ({
  DiaryService: class {
    constructor() {
      return mockDiary as never
    }
  },
}))

vi.mock('@core/platform/services/knowledge-base.service', () => ({
  KnowledgeBaseService: class {
    constructor() {
      return mockKbService as never
    }
  },
}))

import {
  DiaryBrainSyncService,
  getDiaryBrainSyncService,
  isEntryExcluded,
  MIN_SYNC_CONTENT_CHARS,
} from '@core/platform/services/diary-brain-sync.service'

function makeEntry(overrides: Partial<{ id: string; folderId: string; title: string; content: string; frontmatter: string }> = {}) {
  return {
    id: 'entry-1',
    folderId: 'folder-1',
    title: '关于输出的思考',
    content: '长'.repeat(MIN_SYNC_CONTENT_CHARS + 10),
    frontmatter: undefined as string | undefined,
    filePath: 'folder-1/entry-1.md',
    wordCount: 310,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.knowledgeBases.findById.mockResolvedValue({ id: 'kb-diary', name: '日记', description: '' })
  mockDb.knowledgeBases.findAll.mockResolvedValue([])
  mockKbService.createKnowledgeBase.mockResolvedValue({
    success: true,
    data: { id: 'kb-diary', name: '日记' },
  })
  mockKbService.updateKnowledgeBase.mockResolvedValue({ success: true })
  mockKbService.addDocument.mockResolvedValue({ success: true, data: { doc: { id: 'doc-1' }, isUpdate: false } })
  mockDiary.updateFolder.mockResolvedValue({ success: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isEntryExcluded（条目级排除红线）', () => {
  it('frontmatter brain: false → 排除', () => {
    expect(isEntryExcluded({ frontmatter: '---\nbrain: false\n---' })).toBe(true)
    expect(isEntryExcluded({ frontmatter: 'brain:  false' })).toBe(true)
  })

  it('无 frontmatter / brain: true / 其他字段 → 不排除', () => {
    expect(isEntryExcluded({ frontmatter: undefined })).toBe(false)
    expect(isEntryExcluded({ frontmatter: 'brain: true' })).toBe(false)
    expect(isEntryExcluded({ frontmatter: 'mood: good' })).toBe(false)
  })
})

describe('syncEntryNow（守卫链）', () => {
  it('正文低于阈值跳过，不调用 addDocument', async () => {
    mockDiary.getEntry.mockResolvedValue({ success: true, data: makeEntry({ content: '短文' }) })
    const svc = new DiaryBrainSyncService()
    const result = await svc.syncEntryNow('entry-1')
    expect(result.synced).toBe(false)
    expect(result.reason).toBe('too-short')
    expect(mockKbService.addDocument).not.toHaveBeenCalled()
  })

  it('frontmatter 排除的条目跳过', async () => {
    mockDiary.getEntry.mockResolvedValue({
      success: true,
      data: makeEntry({ frontmatter: 'brain: false' }),
    })
    const svc = new DiaryBrainSyncService()
    const result = await svc.syncEntryNow('entry-1')
    expect(result.reason).toBe('excluded')
    expect(mockKbService.addDocument).not.toHaveBeenCalled()
  })

  it('目录未 opt-in 跳过（隐私红线）', async () => {
    mockDiary.getEntry.mockResolvedValue({ success: true, data: makeEntry() })
    mockDb.diaryFolders.findById.mockResolvedValue({ id: 'folder-1', brainOptIn: false })
    const svc = new DiaryBrainSyncService()
    const result = await svc.syncEntryNow('entry-1')
    expect(result.reason).toBe('not-opted-in')
    expect(mockKbService.addDocument).not.toHaveBeenCalled()
  })

  it('happy path：opt-in 目录的合格条目 upsert 到「日记」库，source=diary+entryId', async () => {
    mockDiary.getEntry.mockResolvedValue({ success: true, data: makeEntry() })
    mockDb.diaryFolders.findById.mockResolvedValue({ id: 'folder-1', brainOptIn: true })
    // 「日记」库已存在（方案 a：由用户显式创建，sync 只查找不创建）
    mockDb.knowledgeBases.findAll.mockResolvedValue([
      { id: 'kb-diary', name: '日记', description: '', brainConfig: null },
    ])

    const svc = new DiaryBrainSyncService()
    const result = await svc.syncEntryNow('entry-1')
    expect(result.synced).toBe(true)
    // 命中已存在库 → 绝不创建，但补写提议制红线配置
    expect(mockKbService.createKnowledgeBase).not.toHaveBeenCalled()
    expect(mockKbService.updateKnowledgeBase).toHaveBeenCalledTimes(1)

    const cfgArg = mockKbService.updateKnowledgeBase.mock.calls[0][1].brainConfig as string
    const cfg = JSON.parse(cfgArg)
    expect(cfg.enabled).toBe(true)
    expect(cfg.digestion.enabled).toBe(true)
    expect(cfg.autoApproveThreshold).toBe(1) // 提议制：阈值取上界，全部人批
    expect(cfg.learning.enabled).toBe(false)

    expect(mockKbService.addDocument).toHaveBeenCalledWith('kb-diary', expect.objectContaining({
      type: 'text',
      source: { type: 'diary', id: 'entry-1' },
    }))
  })

  it('软删除条目不同步（隐私红线 H3）', async () => {
    mockDiary.getEntry.mockResolvedValue({
      success: true,
      data: makeEntry({ id: 'entry-del' }),
    })
    mockDb.diaryFolders.findById.mockResolvedValue({ id: 'folder-1', brainOptIn: true })
    const entry = mockDiary.getEntry.mock.calls
    void entry
    // deletedAt 守卫：findById 返回带 deletedAt 的条目
    mockDiary.getEntry.mockReset()
    mockDiary.getEntry.mockResolvedValue({
      success: true,
      data: { ...makeEntry(), deletedAt: new Date() },
    })
    const svc = new DiaryBrainSyncService()
    const result = await svc.syncEntryNow('entry-del')
    expect(result.reason).toBe('deleted')
    expect(mockKbService.addDocument).not.toHaveBeenCalled()
  })

  it('取消待同步定时器并清内容记忆（删除即退出队列）', async () => {
    mockDiary.getEntry.mockResolvedValue({ success: true, data: makeEntry() })
    mockDb.diaryFolders.findById.mockResolvedValue({ id: 'folder-1', brainOptIn: true })
    const svc = new DiaryBrainSyncService()
    svc.scheduleEntrySync('entry-1')
    svc.cancelScheduledSync('entry-1')
    await new Promise(r => setTimeout(r, 20))
    expect(mockKbService.addDocument).not.toHaveBeenCalled()
  })

  it('内容未变跳过（会话内幂等）', async () => {
    mockDiary.getEntry.mockResolvedValue({ success: true, data: makeEntry() })
    mockDb.diaryFolders.findById.mockResolvedValue({ id: 'folder-1', brainOptIn: true })
    mockDb.knowledgeBases.findAll.mockResolvedValue([
      { id: 'kb-diary', name: '日记', description: '', brainConfig: null },
    ])

    const svc = new DiaryBrainSyncService()
    await svc.syncEntryNow('entry-1')
    const second = await svc.syncEntryNow('entry-1')
    expect(second.reason).toBe('unchanged')
    expect(mockKbService.addDocument).toHaveBeenCalledTimes(1)
  })
})

describe('findDiaryKnowledgeBase（只读查找，绝不创建）', () => {
  it('已存在同名库 → 复用不重建', async () => {
    mockDb.knowledgeBases.findAll.mockResolvedValue([
      { id: 'kb-existing', name: '日记', description: '', brainConfig: null },
    ])
    const svc = new DiaryBrainSyncService()
    const kb = await svc.findDiaryKnowledgeBase()
    expect(kb?.id).toBe('kb-existing')
    expect(mockKbService.createKnowledgeBase).not.toHaveBeenCalled()
  })

  it('描述含 marker 的库也被识别（防重命名失效）', async () => {
    mockDb.knowledgeBases.findAll.mockResolvedValue([
      { id: 'kb-renamed', name: '我的日记本', description: '...[diary-brain-sync]' },
    ])
    const svc = new DiaryBrainSyncService()
    const kb = await svc.findDiaryKnowledgeBase()
    expect(kb?.id).toBe('kb-renamed')
  })
})

describe('setFolderBrainOptIn（开关编排）', () => {
  it('关闭：置位 + 出库清理（目录内含回收站条目的文档都被删）', async () => {
    mockDiary.getEntries.mockResolvedValue({
      success: true,
      data: [{ id: 'e1' }, { id: 'e2' }],
    })
    mockDiary.getDeletedEntries.mockResolvedValue({
      success: true,
      data: [{ id: 'e3', folderId: 'folder-1' }, { id: 'e9', folderId: 'other' }],
    })
    mockDb.knowledgeBases.findAll.mockResolvedValue([
      { id: 'kb-diary', name: '日记', description: '' },
    ])
    mockDb.kbDocuments.findBySource.mockImplementation((_kbId: string, source: { id: string }) =>
      Promise.resolve(source.id === 'e9' ? null : { id: `doc-${source.id}` })
    )

    const svc = new DiaryBrainSyncService()
    const result = await svc.setFolderBrainOptIn('folder-1', false)
    expect(result.success).toBe(true)
    expect(mockDiary.updateFolder).toHaveBeenCalledWith('folder-1', { brainOptIn: false })
    // e1/e2/e3 出库；e9 属其他目录不动
    const purged = mockKbService.deleteDocument.mock.calls.map(c => c[0])
    expect(purged.sort()).toEqual(['doc-e1', 'doc-e2', 'doc-e3'])
  })

  it('开启：库未就绪 → needSetup 且不置位；库就绪 → 置位 + 回填', async () => {
    const svc = new DiaryBrainSyncService()

    // 无「日记」库 → needSetup，不回填不置位
    mockDb.knowledgeBases.findAll.mockResolvedValue([])
    const blocked = await svc.setFolderBrainOptIn('folder-1', true)
    expect((blocked as { needSetup?: boolean }).needSetup).toBe(true)
    expect(mockDiary.updateFolder).not.toHaveBeenCalled()
    expect(mockKbService.addDocument).not.toHaveBeenCalled()

    // 库就绪（含 embedding 配置）→ 正常置位回填
    mockDb.knowledgeBases.findAll.mockResolvedValue([
      {
        id: 'kb-diary', name: '日记', description: '', brainConfig: null,
        embeddingConfig: JSON.stringify({ modelId: 'text-embed', provider: 'local' }),
      },
    ])
    mockDiary.getEntries.mockResolvedValue({ success: true, data: [{ id: 'e1' }] })
    mockDb.diaryEntries.findByFolder.mockResolvedValue([{ id: 'e1' }])
    mockDiary.getDeletedEntries.mockResolvedValue({ success: true, data: [] })
    mockDiary.getEntry.mockResolvedValue({ success: true, data: makeEntry({ id: 'e1' }) })
    mockDb.diaryFolders.findById.mockResolvedValue({ id: 'folder-1', brainOptIn: true })

    const ok = await svc.setFolderBrainOptIn('folder-1', true)
    expect(ok.success).toBe(true)
    expect(mockDiary.updateFolder).toHaveBeenCalledWith('folder-1', { brainOptIn: true })
    expect(mockKbService.addDocument).toHaveBeenCalledTimes(1)
  })
})

describe('共享单例', () => {
  it('getDiaryBrainSyncService 返回同一实例', () => {
    expect(getDiaryBrainSyncService()).toBe(getDiaryBrainSyncService())
  })
})
