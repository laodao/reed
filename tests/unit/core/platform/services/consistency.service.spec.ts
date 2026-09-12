/**
 * ConsistencyService 单测（fake dbManager 注入）
 * 覆盖：R1 死亡后出场、R2 关系失效后同框、R3 物品易主、R4 技能时间线、R5 回忆标记、R6 状态回退、写前校验。
 */
import { describe, it, expect, vi } from 'vitest'
import { ConsistencyService } from '@core/platform/services/longwriting/graph/consistency.service'

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

  // ==================== R7 钩子节拍（49 号） ====================

  function makeScriptDb(summaries: string[], extra: Record<string, unknown> = {}) {
    return makeFakeDb({
      lwOutlines: {
        getById: vi.fn(async () => null),
        getByProjectId: vi.fn(async () =>
          summaries.map((s, i) => ({ id: `o${i}`, name: `第${i + 1}集`, nodeType: 'chapter', orderIndex: i, summary: s })),
        ),
      },
      ...extra,
    })
  }

  it('R7：相邻集钩子类型连续同型 → warning；全异型 → 无冲突', async () => {
    const same = makeScriptDb([
      '剧情梗概一【集尾卡点】悬念甲（悬念钩）',
      '剧情梗概二【集尾卡点】悬念乙（悬念钩）',
    ])
    const r1 = await new ConsistencyService(same as any).scanContradictions('p1')
    expect(r1.filter((c) => c.rule === 'R7')).toHaveLength(1)

    const diff = makeScriptDb([
      '剧情梗概一【集尾卡点】悬念甲（悬念钩）',
      '剧情梗概二【集尾卡点】危机乙（危机钩）',
    ])
    const r2 = await new ConsistencyService(diff as any).scanContradictions('p1')
    expect(r2.filter((c) => c.rule === 'R7')).toHaveLength(0)
  })

  it('R7：script 项目缺卡点标注 / 卡点缺钩型 → warning；非 script 项目（无标记）→ 不检查', async () => {
    const missing = makeScriptDb([
      '剧情梗概一【集尾卡点】悬念甲（悬念钩）',
      '剧情梗概二【集尾卡点】危机乙（危机钩）',
      '剧情梗概三（没有任何卡点标注）',
    ])
    const r1 = await new ConsistencyService(missing as any).scanContradictions('p1')
    const r7a = r1.filter((c) => c.rule === 'R7')
    expect(r7a.some((c) => c.message.includes('缺【集尾卡点】'))).toBe(true)

    const noType = makeScriptDb([
      '剧情梗概一【集尾卡点】悬念甲（悬念钩）',
      '剧情梗概二【集尾卡点】留白式收尾',
    ])
    const r2 = await new ConsistencyService(noType as any).scanContradictions('p1')
    expect(r2.filter((c) => c.rule === 'R7').some((c) => c.message.includes('未标注钩子类型'))).toBe(true)

    const novel = makeScriptDb(['普通章节概要一', '普通章节概要二', '普通章节概要三'])
    const r3 = await new ConsistencyService(novel as any).scanContradictions('p1')
    expect(r3.filter((c) => c.rule === 'R7')).toHaveLength(0)
  })

  // ==================== R8 伏笔台账（49 号） ====================

  function makeForeshadowDb(list: unknown[], chaptersWithContent: number[]) {
    const outlineCount = Math.max(...chaptersWithContent, 0) + 1
    return makeFakeDb({
      lwOutlines: {
        getById: vi.fn(async () => null),
        getByProjectId: vi.fn(async () =>
          Array.from({ length: outlineCount }, (_, i) => ({ id: `o${i}`, name: `第${i + 1}章`, nodeType: 'chapter', orderIndex: i, summary: '' })),
        ),
      },
      lwForeshadows: { getByProjectId: vi.fn(async () => list) },
      lwChapters: {
        getByOutlineId: vi.fn(async (oid: string) => {
          const i = Number(oid.replace('o', ''))
          return chaptersWithContent.includes(i) ? { content: '有正文的章节'.repeat(10) } : { content: '' }
        }),
      },
    })
  }

  it('R8：回收早于埋设 → error', async () => {
    const db = makeForeshadowDb([{ content: '玄天鉴的裂纹', plantedChapter: 6, payoffChapter: 3, status: 'paid' }], [1, 2, 3])
    const r = await new ConsistencyService(db as any).scanContradictions('p1')
    const r8 = r.filter((c) => c.rule === 'R8')
    expect(r8).toHaveLength(1)
    expect(r8[0].severity).toBe('error')
    expect(r8[0].message).toContain('倒置')
  })

  it('R8：超期未收（已写超过埋设+5 章）→ warning；未超期 / 已回收 → 无', async () => {
    // 已写第 1、7 章有正文 → writtenMax=7，第 1 章埋的伏笔超期（7 >= 1+5）
    const overdue = makeForeshadowDb([{ content: '神秘来信', plantedChapter: 1, payoffChapter: null, status: 'open' }], [0, 6])
    const r1 = await new ConsistencyService(overdue as any).scanContradictions('p1')
    const r8a = r1.filter((c) => c.rule === 'R8')
    expect(r8a).toHaveLength(1)
    expect(r8a[0].severity).toBe('warning')
    expect(r8a[0].message).toContain('未回收')

    // 已写到第 3 章：未超期；paid 且回收晚于埋设：无冲突
    const ok = makeForeshadowDb(
      [
        { content: '神秘来信', plantedChapter: 1, payoffChapter: null, status: 'open' },
        { content: '旧伤', plantedChapter: 1, payoffChapter: 3, status: 'paid' },
      ],
      [0, 1, 2],
    )
    const r2 = await new ConsistencyService(ok as any).scanContradictions('p1')
    expect(r2.filter((c) => c.rule === 'R8')).toHaveLength(0)
  })
})
