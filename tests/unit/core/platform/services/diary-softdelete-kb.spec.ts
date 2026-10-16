/**
 * 软删除/恢复 × 「日记」知识库联动测试（review M13）
 * @module tests/unit/core/platform/services/diary-softdelete-kb
 * @description 软删除此前只取消挂起的防抖同步，已同步进知识库的全文仍可被检索——
 *              现在软删除同时 purgeEntryIds 下架（与 purgeEntry 硬删除同款）；
 *              恢复成功后触发 syncEntryNow 重新同步（purge 后重新 upsert 幂等）。
 *              mock 数据库/路径/同步服务三层，走真实 DiaryService。
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpRoot = mkdtempSync(join(tmpdir(), 'diary-softdelete-kb-'))

const mockDb = {
  diaryEntries: {
    findById: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  },
}

const mockSync = {
  scheduleEntrySync: vi.fn(),
  cancelScheduledSync: vi.fn(),
  purgeEntryIds: vi.fn(),
  syncEntryNow: vi.fn(),
}

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => mockDb,
}))

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getUserDataPath: () => tmpRoot,
  }),
}))

// DiaryService 内部动态 import('./diary-brain-sync.service')——vi.mock 按解析后
// 模块路径拦截，动态导入同样命中
vi.mock('@core/platform/services/diary-brain-sync.service', () => ({
  getDiaryBrainSyncService: () => mockSync,
}))

import { DiaryService } from '@core/platform/services/diary.service'

/** 等待 fire-and-forget 的动态 import 微任务队列排空 */
const flushAsyncHooks = (): Promise<void> => new Promise(r => setTimeout(r, 10))

beforeEach(() => {
  vi.clearAllMocks()
  mockSync.purgeEntryIds.mockResolvedValue(undefined)
  mockSync.syncEntryNow.mockResolvedValue({ synced: true })
})

describe('deleteEntry（软删除）× 知识库下架', () => {
  it('软删除 → 取消防抖同步 + purgeEntryIds 下架已同步的 KB 文档', async () => {
    mockDb.diaryEntries.findById.mockResolvedValue({
      id: 'e1',
      folderId: 'f1',
      title: 'T',
      filePath: 'f1/T.md',
    })
    mockDb.diaryEntries.softDelete.mockResolvedValue(undefined)

    const result = await new DiaryService().deleteEntry('e1')

    expect(result.success).toBe(true)
    expect(mockDb.diaryEntries.softDelete).toHaveBeenCalledWith('e1')
    await flushAsyncHooks()
    expect(mockSync.cancelScheduledSync).toHaveBeenCalledWith('e1')
    // M13 修复点：软删除也要把「日记」库里的全文下架（此前只有硬删除 purgeEntry 才清）
    expect(mockSync.purgeEntryIds).toHaveBeenCalledWith(['e1'])
  })

  it('条目不存在 → 不触发任何同步层动作', async () => {
    mockDb.diaryEntries.findById.mockResolvedValue(null)

    const result = await new DiaryService().deleteEntry('missing')

    expect(result.success).toBe(false)
    await flushAsyncHooks()
    expect(mockSync.cancelScheduledSync).not.toHaveBeenCalled()
    expect(mockSync.purgeEntryIds).not.toHaveBeenCalled()
  })
})

describe('restoreEntry（恢复）× 重新同步', () => {
  it('恢复成功 → 触发 syncEntryNow 重新入「日记」库（purge 后幂等 upsert）', async () => {
    mockDb.diaryEntries.restore.mockResolvedValue(true)

    const result = await new DiaryService().restoreEntry('e1')

    expect(result.success).toBe(true)
    await flushAsyncHooks()
    // M13 修复点：软删除时已 purge，恢复后必须重新同步，否则恢复的日记永久缺席知识库
    expect(mockSync.syncEntryNow).toHaveBeenCalledWith('e1')
  })

  it('恢复失败（记录不存在）→ 不触发同步', async () => {
    mockDb.diaryEntries.restore.mockResolvedValue(false)

    const result = await new DiaryService().restoreEntry('missing')

    expect(result.success).toBe(false)
    await flushAsyncHooks()
    expect(mockSync.syncEntryNow).not.toHaveBeenCalled()
  })
})

afterAll(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // 清理失败不影响测试结果
  }
})
