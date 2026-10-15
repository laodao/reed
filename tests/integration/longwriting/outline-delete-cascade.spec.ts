/**
 * 大纲删除级联单测（§B，2026-09-20）
 * deleteOutline：有正文未 force → needsConfirm 不删；force → 事务级联清空
 * 版本/正文/预写/状态摘要/大纲关联/大纲节点，并汇总 chapterNos 供伴生数据清理。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  db: {} as any,
  em: { delete: vi.fn(async () => ({ affected: 1 })) },
  transaction: vi.fn(async (cb: (em: unknown) => Promise<void>) => cb({ delete: (t: unknown, c: unknown) => h.em.delete(t, c) })),
}))

vi.mock('@core/database/database-manager.interface', () => ({ getCoreDatabaseManager: () => h.db }))

import { LongWritingService } from '@core/packs/longwriting/services/longwriting.service'

const OUTLINES = [
  { id: 'vol', projectId: 'p1', nodeType: 'volume', parentId: null, name: '卷一' },
  { id: 'c1', projectId: 'p1', nodeType: 'chapter', parentId: 'vol', name: '第1章·有正文' },
  { id: 'c2', projectId: 'p1', nodeType: 'chapter', parentId: 'vol', name: '第2章·空' },
]

function fakeDb(): void {
  h.em.delete.mockClear()
  h.db = {
    lwOutlines: {
      getById: async (id: string) => OUTLINES.find((o) => o.id === id) ?? null,
      getByProjectId: async () => OUTLINES.map((o) => ({ ...o })),
      delete: vi.fn(async () => true),
    },
    lwChapters: {
      getByOutlineId: async (oid: string) =>
        oid === 'c1' ? { id: 'ch_1', outlineId: 'c1', content: '有正文的章节' } : null,
      delete: vi.fn(async () => true),
    },
    dataSource: { transaction: h.transaction },
  }
}

beforeEach(() => {
  fakeDb()
})

describe('deleteOutline 级联（§B）', () => {
  it('删卷（子树含 2 章）：force=false 且 c1 有正文 → needsConfirm 不删', async () => {
    const svc = LongWritingService.getInstance()
    const r = await svc.deleteOutline('vol', false)
    expect(r.needsConfirm).toBe(true)
    expect(r.deleted).toBe(false)
    expect(r.chapters).toEqual(['第1章·有正文'])
    expect(h.em.delete).not.toHaveBeenCalled()
  })

  it('force=true：事务级联清空版本/正文/预写/摘要/关联/大纲节点，chapterNos 汇总', async () => {
    const svc = LongWritingService.getInstance()
    const r = await svc.deleteOutline('vol', true)
    expect(r.deleted).toBe(true)
    expect(r.needsConfirm).toBe(false)
    expect(r.chapterNos).toHaveLength(1) // 仅 c1 有正文行；c2 无章节行不产生伴生清理
    const deletedByEntity = h.em.delete.mock.calls.map((c) => (c[0] as { name: string }).name)
    expect(deletedByEntity.filter((n) => n === 'LwChapterVersionEntity')).toHaveLength(1) // 仅 c1 有正文行
    expect(deletedByEntity.filter((n) => n === 'LwChapterEntity')).toHaveLength(1)
    expect(deletedByEntity.filter((n) => n === 'LwOutlineEntity')).toHaveLength(3)
  })

  it('删空章节（c2）无需确认直接删除', async () => {
    const svc = LongWritingService.getInstance()
    const r = await svc.deleteOutline('c2', false)
    expect(r.deleted).toBe(true)
    expect(r.needsConfirm).toBe(false)
  })

  it('节点不存在 → deleted=false 且不炸', async () => {
    const svc = LongWritingService.getInstance()
    const r = await svc.deleteOutline('nope', false)
    expect(r.deleted).toBe(false)
  })
})
