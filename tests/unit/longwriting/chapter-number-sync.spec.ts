/**
 * 章节号级联同步单测（天下捕快实跑修复 2026-09-21）
 * diffChapterNumbers 纯函数 + cascadeChapterNumberChange 对假库的整体搬移。
 * 实测背景：插入新第 1 章后，events/快照/伏笔/卡头全部留在旧号——本组用例
 * 锁死"结构变更必须级联"这一不变量。
 */
import { describe, it, expect } from 'vitest'
import { buildOutlineDocOrder, type OutlineNodeLike } from '@core/platform/services/longwriting/outline-order'
import { diffChapterNumbers, syncCompanionChapterNumbers, syncPrewriteCardHeaders } from '@core/platform/services/longwriting/chapter-number-sync'

function tree(pairs: Array<[string, string | null, string, string?]>, overrides: Record<string, number> = {}): OutlineNodeLike[] {
  // [id, parentId, name, nodeType]；orderIndex 按数组序
  return pairs.map(([id, parentId, name, nodeType], i) => ({
    id,
    parentId,
    name,
    nodeType: nodeType ?? (name.startsWith('卷') ? 'volume' : 'chapter'),
    orderIndex: overrides[id] ?? i,
  }))
}

const BEFORE = tree([
  ['c1', null, '第1章·雨夜命案'],
  ['c2', null, '第2章·暗巷错认'],
  ['c3', null, '第3章·义庄命案'],
])

describe('diffChapterNumbers', () => {
  it('无结构变化 → 空映射（幂等 no-op）', () => {
    const d = diffChapterNumbers(buildOutlineDocOrder(BEFORE), buildOutlineDocOrder(BEFORE))
    expect(d.mapping.size).toBe(0)
    expect(d.added).toHaveLength(0)
    expect(d.removed).toHaveLength(0)
  })

  it('头部插章：后续章号整体 +1，前插节点为新增', () => {
    const afterTree = tree([
      ['c0', null, '第1章·雪麓下山'],
      ['c1', null, '第2章·雨夜命案'],
      ['c2', null, '第3章·暗巷错认'],
      ['c3', null, '第4章·义庄命案'],
    ])
    const d = diffChapterNumbers(buildOutlineDocOrder(BEFORE), buildOutlineDocOrder(afterTree))
    expect(d.mapping.get(1)).toBe(2)
    expect(d.mapping.get(2)).toBe(3)
    expect(d.mapping.get(3)).toBe(4)
    expect(d.added).toEqual([1])
    expect(d.removed).toHaveLength(0)
  })

  it('删除首章：剩余章号前移，被删章进 removed', () => {
    const afterTree = tree([
      ['c2', null, '第1章·暗巷错认'],
      ['c3', null, '第2章·义庄命案'],
    ])
    const d = diffChapterNumbers(buildOutlineDocOrder(BEFORE), buildOutlineDocOrder(afterTree))
    expect(d.mapping.get(2)).toBe(1)
    expect(d.mapping.get(3)).toBe(2)
    expect(d.removed).toEqual([1])
  })

  it('交换式移动（5↔6）双向映射并存', () => {
    const t5 = tree([
      ['a', null, '第1章·甲'], ['b', null, '第2章·乙'], ['c', null, '第3章·丙'], ['d', null, '第4章·丁'],
      ['e', null, '第5章·戊'], ['f', null, '第6章·己'],
    ])
    const t6 = tree([
      ['a', null, '第1章·甲'], ['b', null, '第2章·乙'], ['c', null, '第3章·丙'], ['d', null, '第4章·丁'],
      ['e', null, '第6章·戊'], ['f', null, '第5章·己'],
    ], { e: 5, f: 4 })
    const d = diffChapterNumbers(buildOutlineDocOrder(t5), buildOutlineDocOrder(t6))
    expect(d.mapping.get(5)).toBe(6)
    expect(d.mapping.get(6)).toBe(5)
  })
})

describe('syncCompanionChapterNumbers（假库整体搬移）', () => {
  function fakeDb(rows: { events?: any[]; states?: any[]; foreshadows?: any[] }) {
    const updates: Array<{ table: string; id: string; patch: any }> = []
    const mk = (table: string, list: any[]) => ({
      find: async () => list.map((r) => ({ ...r })),
    })
    const em = {
      getRepository: (entity: { name: string }) => {
        const table = entity.name
        const list = table === 'LwEventEntity' ? rows.events : table === 'LwEntityStateEntity' ? rows.states : table === 'LwForeshadowEntity' ? rows.foreshadows : []
        return mk(table, list)
      },
      update: async (entity: { name: string }, crit: { id: string }, patch: any) => {
        updates.push({ table: entity.name, id: crit.id, patch })
      },
    }
    return { db: { dataSource: { transaction: async (cb: (em: any) => Promise<void>) => cb(em) } }, updates }
  }

  it('事件/快照/伏笔按映射整体搬移，未命中章号保持原样', async () => {
    const { db, updates } = fakeDb({
      events: [
        { id: 'e1', projectId: 'p1', chapterNumber: 1 },
        { id: 'e2', projectId: 'p1', chapterNumber: 2 },
      ],
      states: [{ id: 's1', projectId: 'p1', chapterNumber: 3, entityType: 'item', entityId: 'i1', entityName: '告密信', stateSummary: 'x', keyChanges: [] }],
      foreshadows: [
        { id: 'f1', projectId: 'p1', plantedChapter: 2, payoffChapter: null, rolledTo: null, developChapters: null },
        { id: 'f2', projectId: 'p1', plantedChapter: 99, payoffChapter: 100, rolledTo: null, developChapters: '[2,3]' },
      ],
    })
    const afterTree = tree([
      ['c0', null, '第1章·雪麓下山'],
      ['c1', null, '第2章·雨夜命案'],
      ['c2', null, '第3章·暗巷错认'],
      ['c3', null, '第4章·义庄命案'],
    ])
    const diff = diffChapterNumbers(buildOutlineDocOrder(BEFORE), buildOutlineDocOrder(afterTree))
    const report = await syncCompanionChapterNumbers(db, 'p1', diff)
    expect(report.events).toBe(2) // e1: 1→2；e2: 2→3
    const byId = new Map(updates.map((u) => [u.id, u.patch]))
    expect(byId.get('e1')).toEqual({ chapterNumber: 2 })
    expect(byId.get('e2')).toEqual({ chapterNumber: 3 })
    expect(report.entityStates).toBe(1)
    expect(byId.get('s1')).toEqual({ chapterNumber: 4 })
    expect(byId.get('f1')).toEqual({ plantedChapter: 3 })
    // 映射外章号（99/100，旧稿案号类）原样保留；develop_chapters 数组仍逐元素搬移
    expect(byId.get('f2')).toEqual({ developChapters: '[3,4]' })
  })
})

describe('syncPrewriteCardHeaders', () => {
  it('旧号旧名卡头重写为当前章号与大纲名；正文不动', async () => {
    const calls: Array<{ id: string; content: string }> = []
    const db = {
      lwPrewrites: {
        getByOutlineId: async (oid: string) =>
          oid === 'o1'
            ? { id: 'p1', content: '## 本章设计卡（第1章 第1章·雨夜命案）\n\n【本章概要】xxx' }
            : null,
        update: async (oid: string, data: { content: string }) => {
          calls.push({ id: oid, content: data.content })
          return { id: 'p1' }
        },
      },
    }
    const n = await syncPrewriteCardHeaders(db, new Map([['o1', { name: '第2章·雨夜命案', no: 2 }]]))
    expect(n).toBe(1)
    expect(calls[0].content).toBe('## 本章设计卡（第2章 第2章·雨夜命案）\n\n【本章概要】xxx')
  })

  it('已是新口径的卡头不重复写', async () => {
    const db = {
      lwPrewrites: {
        getByOutlineId: async () => ({ id: 'p1', content: '## 本章设计卡（第1章 第1章·雪麓下山）\n正文' }),
        update: async () => {
          throw new Error('不应触发更新')
        },
      },
    }
    const n = await syncPrewriteCardHeaders(db, new Map([['o1', { name: '第1章·雪麓下山', no: 1 }]]))
    expect(n).toBe(0)
  })
})
