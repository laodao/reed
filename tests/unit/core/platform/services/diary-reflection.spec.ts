/**
 * createReflectionEntry 测试（spec 2026-09-24 F2 精细化加工反思流）
 * @module tests/unit/core/platform/services/diary-reflection
 * @description 走真实 DiaryService（mock 数据库与路径层），验证：自动建
 *              「学习反思」目录（复用）、标题截断、内容含卡片名与反思正文、
 *              空反思兜底文案。
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpRoot = mkdtempSync(join(tmpdir(), 'diary-reflection-'))

const mockDb = {
  diaryFolders: {
    findAll: vi.fn(),
    create: vi.fn(),
    existsByName: vi.fn(),
    findById: vi.fn(),
  },
  diaryEntries: {
    create: vi.fn(),
  },
  diaryLinks: {
    createMany: vi.fn(),
    updateTarget: vi.fn(),
  },
}

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => mockDb,
}))

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getUserDataPath: () => tmpRoot,
  }),
}))

import { DiaryService } from '@core/platform/services/diary.service'

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.diaryFolders.findAll.mockResolvedValue([])
  mockDb.diaryFolders.existsByName.mockResolvedValue(false)
  mockDb.diaryFolders.findById.mockResolvedValue({ id: 'folder-学习反思', path: '学习反思' })
  mockDb.diaryFolders.create.mockImplementation(async (req: { name: string }, relPath: string) => ({
    id: `folder-${req.name}`,
    name: req.name,
    path: relPath,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
  mockDb.diaryEntries.create.mockImplementation(async (req: { folderId: string; title: string }, relPath: string) => ({
    id: 'entry-1',
    folderId: req.folderId,
    title: req.title,
    filePath: relPath,
    wordCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
  mockDb.diaryLinks.createMany.mockResolvedValue(undefined)
  mockDb.diaryLinks.updateTarget.mockResolvedValue(undefined)
})

describe('createReflectionEntry（F2）', () => {
  it('自动创建「学习反思」目录并落条目，标题含卡片名，内容含反思', async () => {
    const result = await new DiaryService().createReflectionEntry('费曼技巧的边界', '和上次项目复盘联想到一起了', '学习库')
    expect(result.success).toBe(true)
    expect(mockDb.diaryFolders.create).toHaveBeenCalledWith({ name: '学习反思' }, '学习反思')
    const entryReq = mockDb.diaryEntries.create.mock.calls[0][0] as { title: string }
    expect(entryReq.title).toContain('费曼技巧的边界')
    // 内容落盘（createEntry 写文件）
    const written = readFileSync(join(tmpRoot, 'diary', '学习反思', `${entryReq.title}.md`), 'utf-8')
    expect(written).toContain('复习卡片：费曼技巧的边界（学习库）')
    expect(written).toContain('和上次项目复盘联想到一起了')
  })

  it('目录已存在则复用不重建', async () => {
    mockDb.diaryFolders.findAll.mockResolvedValue([
      { id: 'existing', name: '学习反思', parentId: undefined, path: '学习反思' },
    ])
    await new DiaryService().createReflectionEntry('卡片X', '联想Y')
    expect(mockDb.diaryFolders.create).not.toHaveBeenCalled()
    expect((mockDb.diaryEntries.create.mock.calls[0][0] as { folderId: string }).folderId).toBe('existing')
  })

  it('空反思兜底文案 + 长卡名截断', async () => {
    const longTitle = '卡'.repeat(80)
    const result = await new DiaryService().createReflectionEntry(longTitle, '')
    expect(result.success).toBe(true)
    expect(result.data!.title.length).toBeLessThanOrEqual(53) // 反思： + 50 字
    const written = readFileSync(
      join(tmpRoot, 'diary', '学习反思', `${result.data!.title}.md`),
      'utf-8'
    )
    expect(written).toContain('（未填写联想内容）')
  })
})

afterAll(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // 清理失败不影响测试结果
  }
})
