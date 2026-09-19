/**
 * 跨章事实表构建单测（2026-09-19 写后审查数据面）
 * formatEntityFactLines 纯函数直测；buildCrossChapterFactSheet 用 fake db 走装配路径。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ db: undefined as any }))
vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => h.db,
}))

import { buildCrossChapterFactSheet, formatEntityFactLines } from '@core/packs/longwriting/services/cross-chapter-facts'

type Snap = {
  id: string
  projectId: string
  entityType: string
  entityId: string
  entityName: string
  chapterNumber: number
  stateSummary: string
  keyChanges: string[]
  createdAt: number
  updatedAt: number
}

const snap = (over: Partial<Snap>): Snap => ({
  id: 's', projectId: 'p', entityType: 'character', entityId: 'e1', entityName: '沈觉',
  chapterNumber: 1, stateSummary: '活着', keyChanges: [], createdAt: 1, updatedAt: 1, ...over,
})

describe('formatEntityFactLines（纯函数）', () => {
  it('每实体取 uptoChapter 之前最新切片；本章及以后的切片不进事实表', () => {
    const lines = formatEntityFactLines([
      snap({ chapterNumber: 1, stateSummary: '初到汴京' }),
      snap({ chapterNumber: 3, stateSummary: '已接手济生堂' }),
      snap({ chapterNumber: 5, stateSummary: '本章切片不算前文' }),
    ], 5)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('第3章时点')
    expect(lines[0]).toContain('已接手济生堂')
    expect(lines[0]).not.toContain('本章切片')
  })

  it('keyChanges 附在行尾；无变化则不附', () => {
    const lines = formatEntityFactLines([
      snap({ entityId: 'e1', entityName: '沈觉', chapterNumber: 2, stateSummary: '左虎口有旧茧', keyChanges: ['虎口旧茧加厚'] }),
      snap({ entityId: 'e2', entityName: '宋晏温', chapterNumber: 2, stateSummary: '立案侦查', keyChanges: [] }),
    ], 3)
    const shen = lines.find((l) => l.includes('沈觉'))!
    const song = lines.find((l) => l.includes('宋晏温'))!
    expect(shen).toContain('第2章变化：虎口旧茧加厚')
    expect(song).not.toContain('变化')
  })

  it('人物排在地点/物品前；超上限按序截断', () => {
    const many: Snap[] = [
      snap({ entityType: 'item', entityId: `i${1}`, entityName: '铜镜' }),
      ...Array.from({ length: 45 }, (_, i) => snap({ entityType: 'character', entityId: `c${i}`, entityName: `角色${i}` })),
      snap({ entityType: 'location', entityId: 'l1', entityName: '济生堂' }),
    ]
    const lines = formatEntityFactLines(many, 9, 40)
    expect(lines).toHaveLength(40)
    const charIdx = lines.findIndex((l) => l.includes('【人物'))
    const locIdx = lines.findIndex((l) => l.includes('【地点'))
    const itemIdx = lines.findIndex((l) => l.includes('【物品'))
    expect(charIdx).toBeGreaterThanOrEqual(0)
    // 人物全部保留（45 人截到 40 上限时人物段占满前 40），地点/物品被挤出
    expect(locIdx).toBe(-1)
    expect(itemIdx).toBe(-1)
    expect(charIdx).toBe(0)
  })
})

describe('buildCrossChapterFactSheet（装配路径，fake db）', () => {
  beforeEach(() => {
    h.db = undefined
  })

  it('拼装四段：上一章状态 + 要素状态表 + 事件时间线 + 上一章结尾', async () => {
    const prevOutline = { id: 'o1', nodeType: 'chapter', parentId: null, orderIndex: 0 }
    const curOutline = { id: 'o2', nodeType: 'chapter', parentId: null, orderIndex: 1 }
    h.db = {
      lwChapterStateSummaries: {
        getLatestBeforeChapter: vi.fn(async () => ({
          chapterNumber: 2, storyTime: '元丰二年正月十四夜里', currentLocation: '济生堂',
          characterStates: '沈觉未眠；赵四肝风内动', pendingEvents: '大理寺将至', keyChanges: '',
        })),
      },
      lwEntityStates: {
        getByProjectId: vi.fn(async () => [
          snap({ entityType: 'character', entityId: 'c1', entityName: '沈觉', chapterNumber: 2, stateSummary: '虎口旧茧加厚', keyChanges: ['茧加厚'] }),
          snap({ entityType: 'item', entityId: 'i1', entityName: '铜镜', chapterNumber: 1, stateSummary: '藏在沈觉袖中', keyChanges: [] }),
        ]),
      },
      lwEvents: {
        getByProjectId: vi.fn(async () => [
          { chapterNumber: 2, storyTime: '二更天', name: '州桥救老卢' },
          { chapterNumber: 1, storyTime: '', name: '初醒' },
        ]),
      },
      lwOutlines: { getByProjectId: vi.fn(async () => [prevOutline, curOutline]) },
      lwChapters: { getByOutlineId: vi.fn(async (id: string) => (id === 'o2' ? { content: '上一章的最后一句。' } : null)) },
    }

    const sheet = await buildCrossChapterFactSheet('p', 3)
    expect(sheet).toContain('【上一章（第2章）结束状态】')
    expect(sheet).toContain('元丰二年正月十四夜里')
    expect(sheet).toContain('【跨章要素状态表')
    expect(sheet).toContain('沈觉【人物·第2章时点】')
    expect(sheet).toContain('铜镜【物品·第1章时点】')
    expect(sheet).toContain('【近章事件时间线】')
    expect(sheet).toContain('第2章（二更天）：州桥救老卢')
    expect(sheet).toContain('【上一章结尾（原文末段）】')
    expect(sheet).toContain('上一章的最后一句。')
  })

  it('无任何图谱数据 → 返回空串（审查退化为本章内检查）', async () => {
    h.db = {
      lwChapterStateSummaries: { getLatestBeforeChapter: vi.fn(async () => null) },
      lwEntityStates: { getByProjectId: vi.fn(async () => []) },
      lwEvents: { getByProjectId: vi.fn(async () => []) },
      lwOutlines: { getByProjectId: vi.fn(async () => []) },
    }
    const sheet = await buildCrossChapterFactSheet('p', 2)
    expect(sheet).toBe('')
  })
})
