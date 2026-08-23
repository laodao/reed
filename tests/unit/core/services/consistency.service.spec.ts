/**
 * ConsistencyService 单测（fake dbManager 注入）
 * 覆盖：R1 死亡后出场、R2 关系失效后同框、R3 物品易主、R4 技能时间线、R5 回忆标记、R6 状态回退、写前校验。
 */
import { describe, it, expect, vi } from 'vitest'
import { ConsistencyService } from '@core/services/longwriting/graph/consistency.service'

function makeFakeDb(over: Record<string, unknown> = {}) {
  return {
    lwCharacters: {
      getByProjectId: vi.fn(async () => [
        { id: 'c1', name: '林晓' },
        { id: 'c2', name: '顾言' },
      ]),
    },
    lwLocations: { getByProjectId: vi.fn(async () => [{ id: 'l1', name: '青云宗' }]) },
    lwItems: { getByProjectId: vi.fn(async () => [{ id: 'i1', name: '无名剑' }]) },
    lwSkills: { getByProjectId: vi.fn(async () => [{ id: 'sk1', name: '御剑术' }]) },
    lwOutlines: {
      getById: vi.fn(async (id: string) =>
        id === 'outline-dead'
          ? { id: 'outline-dead', projectId: 'p1', name: '第5章', nodeType: 'chapter', level: 2, orderIndex: 4, involvedCharacters: ['c1'], involvedLocations: [], involvedItems: [], summary: '' }
          : { id: 'outline-ok', projectId: 'p1', name: '第1章', nodeType: 'chapter', level: 2, orderIndex: 0, involvedCharacters: ['c1'], involvedLocations: [], involvedItems: [], summary: '' },
      ),
      getByProjectId: vi.fn(async () => [
        { id: 'o1', name: '第1章', nodeType: 'chapter', level: 2, orderIndex: 0, involvedCharacters: ['c1'], involvedItems: [], summary: '' },
        { id: 'o2', name: '第2章', nodeType: 'chapter', level: 2, orderIndex: 1, involvedCharacters: ['c1', 'c2'], involvedItems: ['i1'], summary: '' },
        { id: 'o3', name: '第3章', nodeType: 'chapter', level: 2, orderIndex: 2, involvedCharacters: ['c1', 'c2'], involvedItems: ['i1'], summary: '林晓回忆起往事' },
      ]),
    },
    lwGraphEdges: {
      getByProjectId: vi.fn(async () => [
        { id: 'e1', projectId: 'p1', sourceType: 'character', sourceId: 'c1', targetType: 'character', targetId: 'c2', relationType: 'marriage', validFromChapter: 1, validUntilChapter: 2 },
        { id: 'e2', projectId: 'p1', sourceType: 'character', sourceId: 'c1', targetType: 'skill', targetId: 'sk1', relationType: 'masters', validFromChapter: 3, validUntilChapter: undefined },
      ]),
    },
    lwEntityStates: {
      getLatestEntityState: vi.fn(async (_pid: string, type: string, id: string) => {
        if (type === 'character' && id === 'c1') return { id: 's', entityType: 'character', entityId: 'c1', entityName: '林晓', chapterNumber: 2, stateSummary: '林晓已死亡', keyChanges: ['战死'] }
        if (type === 'character' && id === 'c2') return null
        if (type === 'item' && id === 'i1') return { id: 's', entityType: 'item', entityId: 'i1', entityName: '无名剑', chapterNumber: 1, stateSummary: '剑被顾言夺走', keyChanges: ['易主'] }
        return null
      }),
      // 按目标章节时间点返回状态：第 1 章 c1 受伤；第 2 章起死亡
      getEntityStateAtChapter: vi.fn(async (_pid: string, type: string, id: string, cn: number) => {
        if (type === 'character' && id === 'c1') {
          return cn >= 2
            ? { id: 's2', entityType: 'character', entityId: 'c1', entityName: '林晓', chapterNumber: 2, stateSummary: '林晓已死亡', keyChanges: ['战死'] }
            : { id: 's1', entityType: 'character', entityId: 'c1', entityName: '林晓', chapterNumber: 1, stateSummary: '受伤', keyChanges: [] }
        }
        if (type === 'item' && id === 'i1') return { id: 's4', entityType: 'item', entityId: 'i1', entityName: '无名剑', chapterNumber: 1, stateSummary: '剑被顾言夺走', keyChanges: ['易主'] }
        return null
      }),
      getByProjectId: vi.fn(async () => [
        { id: 's1', entityType: 'character', entityId: 'c1', entityName: '林晓', chapterNumber: 1, stateSummary: '受伤', keyChanges: [], createdAt: 1 },
        { id: 's2', entityType: 'character', entityId: 'c1', entityName: '林晓', chapterNumber: 2, stateSummary: '林晓已死亡', keyChanges: ['战死'], createdAt: 2 },
        { id: 's3', entityType: 'character', entityId: 'c1', entityName: '林晓', chapterNumber: 4, stateSummary: '复活归来', keyChanges: ['重生'], createdAt: 3 },
        { id: 's4', entityType: 'item', entityId: 'i1', entityName: '无名剑', chapterNumber: 1, stateSummary: '完好', keyChanges: ['易主'], createdAt: 4 },
      ]),
    },
    ...over,
  }
}

describe('ConsistencyService', () => {
  it('validateBeforeGeneration：涉及已死亡角色 → R1 error', async () => {
    const svc = new ConsistencyService(makeFakeDb() as any)
    const conflicts = await svc.validateBeforeGeneration('p1', 'outline-dead', 5)
    expect(conflicts.length).toBeGreaterThan(0)
    const r1 = conflicts.find(c => c.rule === 'R1')
    expect(r1?.severity).toBe('error')
    expect(r1?.message).toContain('林晓')
    expect(r1?.message).toContain('死亡')
  })

  it('validateBeforeGeneration：正常大纲无冲突', async () => {
    const svc = new ConsistencyService(makeFakeDb() as any)
    const conflicts = await svc.validateBeforeGeneration('p1', 'outline-ok', 1)
    expect(conflicts).toHaveLength(0)
  })

  it('scanContradictions：R1 死亡后出场（第2章死，第3章仍 involved）', async () => {
    const svc = new ConsistencyService(makeFakeDb() as any)
    const conflicts = await svc.scanContradictions('p1')
    const r1 = conflicts.filter(c => c.rule === 'R1')
    expect(r1.length).toBeGreaterThan(0)
    expect(r1.some(c => c.message.includes('林晓'))).toBe(true)
  })

  it('scanContradictions：R2 关系第2章失效后第3章仍同框', async () => {
    const svc = new ConsistencyService(makeFakeDb() as any)
    const conflicts = await svc.scanContradictions('p1')
    const r2 = conflicts.filter(c => c.rule === 'R2')
    expect(r2.length).toBeGreaterThan(0)
    expect(r2[0].message).toContain('marriage') // relationType 原文
  })

  it('scanContradictions：R3 物品易主后仍涉及', async () => {
    const svc = new ConsistencyService(makeFakeDb() as any)
    const conflicts = await svc.scanContradictions('p1')
    const r3 = conflicts.filter(c => c.rule === 'R3')
    expect(r3.length).toBeGreaterThan(0)
  })

  it('scanContradictions：R4 技能第3章学会，第2章已涉及角色', async () => {
    const svc = new ConsistencyService(makeFakeDb() as any)
    const conflicts = await svc.scanContradictions('p1')
    const r4 = conflicts.filter(c => c.rule === 'R4')
    expect(r4.length).toBeGreaterThan(0)
    expect(r4[0].message).toContain('御剑术')
  })

  it('scanContradictions：R5 回忆章节涉及已死亡角色', async () => {
    const svc = new ConsistencyService(makeFakeDb() as any)
    const conflicts = await svc.scanContradictions('p1')
    const r5 = conflicts.filter(c => c.rule === 'R5')
    expect(r5.length).toBeGreaterThan(0)
    expect(r5[0].message).toContain('回忆')
  })

  it('scanContradictions：R6 死亡后状态回退（复活）', async () => {
    const svc = new ConsistencyService(makeFakeDb() as any)
    const conflicts = await svc.scanContradictions('p1')
    const r6 = conflicts.filter(c => c.rule === 'R6')
    expect(r6.length).toBeGreaterThan(0)
    expect(r6[0].message).toContain('复活')
  })

  it('scanContradictions：干净数据无冲突', async () => {
    const cleanDb = makeFakeDb({
      lwEntityStates: { getByProjectId: vi.fn(async () => []), getLatestEntityState: vi.fn(async () => null) },
      lwGraphEdges: { getByProjectId: vi.fn(async () => []) },
      lwOutlines: { getByProjectId: vi.fn(async () => []) },
    })
    const svc = new ConsistencyService(cleanDb as any)
    expect(await svc.scanContradictions('p1')).toHaveLength(0)
  })
})
