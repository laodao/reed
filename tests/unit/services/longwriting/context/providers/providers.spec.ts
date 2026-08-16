/**
 * 步骤1 P2/P3：10 个 ContextProvider 测试
 * @description 共享 mock BuildContext 工厂，每个 provider ≥3 用例
 */

import { describe, it, expect, vi } from 'vitest'
import type { BuildContext } from '@core/services/longwriting/context/context.types'
import { StoryOverviewProvider } from '@core/services/longwriting/context/providers/story-overview.provider'
import { BackgroundProvider } from '@core/services/longwriting/context/providers/background.provider'
import { CharacterProvider } from '@core/services/longwriting/context/providers/character.provider'
import { LocationProvider } from '@core/services/longwriting/context/providers/location.provider'
import { ItemProvider } from '@core/services/longwriting/context/providers/item.provider'
import { EntityStateProvider } from '@core/services/longwriting/context/providers/entity-state.provider'
import { PreviousChapterProvider } from '@core/services/longwriting/context/providers/previous-chapter.provider'
import { PrewriteProvider } from '@core/services/longwriting/context/providers/prewrite.provider'
import { MemoryProvider } from '@core/services/longwriting/context/providers/memory.provider'
import { VectorSearchProvider } from '@core/services/longwriting/context/providers/vector-search.provider'

function makeCtx(overrides: Partial<BuildContext> = {}): BuildContext {
  return {
    projectId: 'p1',
    outline: {
      id: 'o1', projectId: 'p1', name: '第3章', level: 2, nodeType: 'section',
      summary: '林锋码头追凶', involvedCharacters: ['c1'], involvedLocations: ['l1'],
      involvedItems: ['i1'], status: 'progressing', estimatedWords: 3000, orderIndex: 3,
    } as any,
    overview: {
      id: 'ov1', projectId: 'p1', storyType: 'xuanhuan', title: '暗夜追凶',
      coreConflict: '真相vs权力', coreIdea: '一个刑警的执念', summary: '',
      keyCharacters: [], keyLocations: [], estimatedChapters: 30,
      isLocked: false, isSaved: true, createdAt: 0, updatedAt: 0,
    } as any,
    background: { eraType: 'modern', eraDescription: '21世纪', socialStructure: '', specialRules: '' },
    characters: [{ id: 'c1', name: '林锋', gender: 'male', age: 35, rolePosition: 'protagonist', appearance: '高瘦' } as any],
    locations: [{ id: 'l1', name: '码头', type: 'building', importance: 'main', description: '港口' } as any],
    items: [{ id: 'i1', name: '匕首', type: 'weapon', level: 'rare', description: '凶器' } as any],
    chapterNumber: 3,
    totalChapters: 30,
    outlineTree: [],
    involvedCharacterIds: ['c1'],
    involvedLocationIds: ['l1'],
    involvedItemIds: ['i1'],
    previousChapterEnding: '上一章结尾内容',
    chapterStateSummary: { storyTime: 'D3夜', currentLocation: '码头', characterStates: '林锋受伤', pendingEvents: '追查', keyChanges: '' } as any,
    prewrite: { id: 'pw1', outlineId: 'o1', content: '预写提纲内容', isConfirmed: true, createdAt: 0, updatedAt: 0 } as any,
    entityStateMap: new Map([['character:c1', '左臂受伤'], ['location:l1', '雨夜']]),
    vectorIndexService: { search: vi.fn(async () => []) } as any,
    dbManager: { lwMemories: { getById: vi.fn(async () => null) } } as any,
    ...overrides,
  }
}

const input = { projectId: 'p1', outlineId: 'o1', targetWords: 3000 }

describe('StoryOverviewProvider', () => {
  it('有 overview 时生成概要项（含标题/类型/冲突/进度）', async () => {
    const sec = await new StoryOverviewProvider().build(input as any, makeCtx())
    expect(sec.priority).toBe(4)
    expect(sec.items.length).toBeGreaterThan(0)
    expect(sec.items[0].content).toContain('暗夜追凶')
    expect(sec.items[0].content).toContain('玄幻')
    expect(sec.items[0].content).toContain('真相vs权力')
    expect(sec.items[0].content).toContain('第3章')
  })
  it('overview null 时返回空 items', async () => {
    const sec = await new StoryOverviewProvider().build(input as any, makeCtx({ overview: null }))
    expect(sec.items).toHaveLength(0)
  })
  it('item id 稳定', async () => {
    const sec = await new StoryOverviewProvider().build(input as any, makeCtx())
    expect(sec.items[0].id).toBe('storyOverview:overview')
  })
})

describe('BackgroundProvider', () => {
  it('有 background 生成世界观项', async () => {
    const sec = await new BackgroundProvider().build(input as any, makeCtx())
    expect(sec.priority).toBe(10)
    expect(sec.items[0].content).toContain('时代背景：现代')
  })
  it('background null 返回空', async () => {
    const sec = await new BackgroundProvider().build(input as any, makeCtx({ background: null }))
    expect(sec.items).toHaveLength(0)
  })
})

describe('CharacterProvider', () => {
  it('涉及角色完整信息 + 当前状态', async () => {
    const sec = await new CharacterProvider().build(input as any, makeCtx())
    expect(sec.priority).toBe(2)
    expect(sec.items).toHaveLength(1)
    expect(sec.items[0].content).toContain('林锋')
    expect(sec.items[0].content).toContain('左臂受伤') // 来自 entityStateMap
    expect(sec.items[0].id).toBe('character:c1')
  })
  it('未涉及角色不出现', async () => {
    const ctx = makeCtx({ characters: [{ id: 'c1', name: '林锋' }, { id: 'c2', name: '陈雪' }] as any, involvedCharacterIds: ['c1'] })
    const sec = await new CharacterProvider().build(input as any, ctx)
    expect(sec.items).toHaveLength(1)
    expect(sec.items[0].content).not.toContain('陈雪')
  })
  it('无涉及角色返回空', async () => {
    const sec = await new CharacterProvider().build(input as any, makeCtx({ involvedCharacterIds: [] }))
    expect(sec.items).toHaveLength(0)
  })
})

describe('LocationProvider', () => {
  it('涉及场景信息', async () => {
    const sec = await new LocationProvider().build(input as any, makeCtx())
    expect(sec.priority).toBe(7)
    expect(sec.items[0].content).toContain('码头')
    expect(sec.items[0].content).toContain('雨夜')
  })
})

describe('ItemProvider', () => {
  it('涉及物品（补全 involvedItems）', async () => {
    const sec = await new ItemProvider().build(input as any, makeCtx())
    expect(sec.items).toHaveLength(1)
    expect(sec.items[0].content).toContain('匕首')
    expect(sec.items[0].id).toBe('item:i1')
  })
})

describe('EntityStateProvider', () => {
  it('生成涉及实体的状态约束', async () => {
    const sec = await new EntityStateProvider().build(input as any, makeCtx())
    expect(sec.priority).toBe(2)
    expect(sec.items.length).toBe(2) // character:c1 + location:l1
    expect(sec.items.some((i) => i.content.includes('左臂受伤'))).toBe(true)
    expect(sec.items.some((i) => i.content.includes('雨夜'))).toBe(true)
  })
  it('无状态的实体不出现', async () => {
    const sec = await new EntityStateProvider().build(input as any, makeCtx({ entityStateMap: new Map() }))
    expect(sec.items).toHaveLength(0)
  })
})

describe('PreviousChapterProvider', () => {
  it('上一章结尾 + 状态摘要', async () => {
    const sec = await new PreviousChapterProvider().build(input as any, makeCtx())
    expect(sec.priority).toBe(3)
    expect(sec.items.some((i) => i.content.includes('上一章结尾内容'))).toBe(true)
    expect(sec.items.some((i) => i.content.includes('D3夜'))).toBe(true)
  })
  it('首章返回开篇占位', async () => {
    const sec = await new PreviousChapterProvider().build(input as any, makeCtx({ previousChapterEnding: '' }))
    expect(sec.items.some((i) => i.title === '开篇章节')).toBe(true)
  })
  it('无状态摘要时只有结尾项', async () => {
    const sec = await new PreviousChapterProvider().build(input as any, makeCtx({ chapterStateSummary: null }))
    expect(sec.items).toHaveLength(1)
  })
})

describe('PrewriteProvider', () => {
  it('有预写生成提纲项', async () => {
    const sec = await new PrewriteProvider().build(input as any, makeCtx())
    expect(sec.priority).toBe(5)
    expect(sec.items[0].content).toContain('预写提纲内容')
  })
  it('无预写返回空', async () => {
    const sec = await new PrewriteProvider().build(input as any, makeCtx({ prewrite: null }))
    expect(sec.items).toHaveLength(0)
  })
})

describe('MemoryProvider（vector 检索）', () => {
  it('调 vectorIndexService.search 带 chapterNumberLte + entityType=memory', async () => {
    const search = vi.fn(async () => [
      { entityType: 'memory', entityId: 'm1', chunkId: 'ck1', score: 0.9, preview: '...' },
    ])
    const getById = vi.fn(async () => ({ id: 'm1', title: '林锋离职', description: '六年前', memoryType: 'character_event', importance: 'critical' }))
    const ctx = makeCtx({
      vectorIndexService: { search } as any,
      dbManager: { lwMemories: { getById } } as any,
    })
    const sec = await new MemoryProvider().build(input as any, ctx)
    expect(search).toHaveBeenCalled()
    expect(search.mock.calls[0][2]).toMatchObject({ entityType: 'memory', chapterNumberLte: 2, topK: 15 })
    expect(sec.items).toHaveLength(1)
    expect(sec.items[0].source).toBe('vector')
    expect(sec.items[0].score).toBe(0.9)
    expect(sec.items[0].content).toContain('林锋离职')
  })
  it('vector 空就空 items（不降级）', async () => {
    const ctx = makeCtx({ vectorIndexService: { search: vi.fn(async () => []) } as any })
    const sec = await new MemoryProvider().build(input as any, ctx)
    expect(sec.items).toHaveLength(0)
  })
  it('memory 回查不到则跳过', async () => {
    const ctx = makeCtx({
      vectorIndexService: { search: vi.fn(async () => [{ entityType: 'memory', entityId: 'mX', chunkId: 'ck', score: 0.8, preview: '' }]) } as any,
      dbManager: { lwMemories: { getById: vi.fn(async () => null) } } as any,
    })
    const sec = await new MemoryProvider().build(input as any, ctx)
    expect(sec.items).toHaveLength(0)
  })
})

describe('VectorSearchProvider（vector 补充）', () => {
  it('检索历史片段不限 entityType', async () => {
    const search = vi.fn(async () => [
      { entityType: 'chapter', entityId: 'o_prev', chunkId: 'ck1', score: 0.85, preview: '第2章片段' },
      { entityType: 'character', entityId: 'c2', chunkId: 'ck2', score: 0.7, preview: '陈雪设定' },
    ])
    const ctx = makeCtx({ vectorIndexService: { search } as any })
    const sec = await new VectorSearchProvider().build(input as any, ctx)
    expect(search.mock.calls[0][2]).toMatchObject({ chapterNumberLte: 2, topK: 8 })
    expect(search.mock.calls[0][2].entityType).toBeUndefined()
    expect(sec.items).toHaveLength(2)
    expect(sec.items[0].score).toBeGreaterThanOrEqual(sec.items[1].score) // 按 score 降序
  })
  it('空结果返回空 items', async () => {
    const ctx = makeCtx({ vectorIndexService: { search: vi.fn(async () => []) } as any })
    const sec = await new VectorSearchProvider().build(input as any, ctx)
    expect(sec.items).toHaveLength(0)
  })
})
