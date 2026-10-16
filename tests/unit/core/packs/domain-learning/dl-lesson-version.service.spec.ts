/**
 * 讲义版本管理服务测试（DlLessonVersionService）
 *
 * 钉死：列表降序且 isCurrent 标注正确；恢复 = 新建最新版、旧版留档、
 * verification 不继承、changeSource='restore'、revisionNote 含源版本号；
 * 概念 cardId 同步更新到新版；归属校验拦截跨空间/跨概念访问。
 */

import { describe, it, expect } from 'vitest'
import { DlLessonVersionService } from '@core/packs/domain-learning/services/dl-lesson-version.service'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'
import type { DlCardRow } from '@core/database/repositories/dl-card.repository'
import type { DlConceptRow } from '@core/database/repositories/dl-concept.repository'

function cardRow(over: Partial<DlCardRow> = {}): DlCardRow {
  return {
    id: 'card1',
    userId: 'u1',
    projectId: 's1',
    conceptId: 'c1',
    essenceType: 'K-concept',
    sections: [{ key: 'meta', title: '本质', md: 'v1 内容' }],
    works: [{ kind: '专著', title: '书A' }],
    contentMd: null,
    evidenceSources: [{ kind: 'kb', title: '来源A' }],
    version: 1,
    status: 'published',
    verification: { status: 'verified', issues: [], checkedAt: '2026-09-15T00:00:00Z', note: null },
    revisionNote: null,
    changeSource: 'agent',
    changed: null,
    createdAt: new Date('2026-09-15T00:00:00Z'),
    updatedAt: new Date('2026-09-15T00:00:00Z'),
    ...over,
  }
}

interface FakeDbState {
  cards: DlCardRow[]
  concepts: DlConceptRow[]
  createdCards: DlCardRow[]
  patchedConcepts: Array<{ id: string; patch: Record<string, unknown> }>
}

function fakeDb(initialCards: DlCardRow[] = []): { db: ICoreDatabaseManager; state: FakeDbState } {
  const state: FakeDbState = {
    cards: [...initialCards],
    concepts: [{ id: 'c1', projectId: 's1', nodeType: 'concept', name: 'X', cardId: initialCards.length ? initialCards[initialCards.length - 1].id : null } as unknown as DlConceptRow],
    createdCards: [],
    patchedConcepts: [],
  }
  const db = {
    dlCards: {
      listVersionsByConcept: async (_p: string, conceptId: string) =>
        state.cards.filter((c) => c.conceptId === conceptId).sort((a, b) => a.version - b.version),
      getCurrentByConcept: async (_p: string, conceptId: string) => {
        const list = state.cards.filter((c) => c.conceptId === conceptId)
        return list.length ? list[list.length - 1] : null
      },
      getById: async (id: string) => state.cards.find((c) => c.id === id) ?? null,
      create: async (input: any) => {
        const row = cardRow({
          id: input.id,
          projectId: input.projectId,
          conceptId: input.conceptId,
          essenceType: input.essenceType,
          sections: input.sections,
          works: input.works,
          evidenceSources: input.evidenceSources,
          version: input.version,
          status: input.status,
          verification: input.verification,
          revisionNote: input.revisionNote,
          changeSource: input.changeSource,
          changed: input.changed,
        })
        state.cards.push(row)
        state.createdCards.push(row)
        return row
      },
    },
    dlConcepts: {
      patch: async (id: string, patch: any) => {
        state.patchedConcepts.push({ id, patch })
        const c = state.concepts.find((x) => x.id === id)
        if (c) Object.assign(c, patch)
      },
    },
  } as unknown as ICoreDatabaseManager
  return { db, state }
}

describe('DlLessonVersionService.listVersions', () => {
  it('按 version 降序，isCurrent 仅最新版为 true', async () => {
    const { db } = fakeDb([cardRow({ id: 'c1-v1', version: 1 }), cardRow({ id: 'c1-v2', version: 2, status: 'draft' })])
    const svc = new DlLessonVersionService(db)
    const list = await svc.listVersions('s1', 'c1')
    expect(list.map((x) => x.version)).toEqual([2, 1])
    expect(list[0].isCurrent).toBe(true)
    expect(list[1].isCurrent).toBe(false)
    expect(list[0].status).toBe('draft')
    expect(list[1].status).toBe('published')
  })

  it('无版本时返回空数组', async () => {
    const { db } = fakeDb([])
    expect(await new DlLessonVersionService(db).listVersions('s1', 'c1')).toEqual([])
  })
})

describe('DlLessonVersionService.getVersion', () => {
  it('归属校验通过时返回卡片；跨空间/不存在返回 null', async () => {
    const { db } = fakeDb([cardRow({ id: 'x' })])
    const svc = new DlLessonVersionService(db)
    expect((await svc.getVersion('s1', 'x'))?.id).toBe('x')
    expect(await svc.getVersion('s2', 'x')).toBeNull()
    expect(await svc.getVersion('s1', 'nope')).toBeNull()
  })
})

describe('DlLessonVersionService.restore', () => {
  it('新建最新版、旧版保留、verification 清空、changeSource=restore、revisionNote 含源版本号', async () => {
    const { db, state } = fakeDb([
      cardRow({ id: 'v1', version: 1, status: 'published', verification: { status: 'verified', issues: [], checkedAt: null, note: null } }),
      cardRow({ id: 'v2', version: 2, status: 'draft', verification: null }),
    ])
    const svc = new DlLessonVersionService(db)
    const r = await svc.restore('s1', 'c1', 'v1')

    expect(r.restoredFrom).toBe(1)
    expect(r.version).toBe(3)
    expect(state.createdCards).toHaveLength(1)
    const created = state.createdCards[0]
    expect(created.id).toBe(r.cardId)
    expect(created.version).toBe(3)
    expect(created.status).toBe('draft')
    expect(created.verification).toBeNull()
    expect(created.changeSource).toBe('restore')
    expect(created.revisionNote).toBe('恢复自 v1')
    // 内容复制自 v1（不是 v2）
    expect(created.sections[0].md).toBe('v1 内容')
    expect(created.works?.[0].title).toBe('书A')
    // 旧版全部保留
    expect(state.cards.map((c) => c.version).sort()).toEqual([1, 2, 3])
    // 概念 cardId 更新到新版
    expect(state.patchedConcepts).toEqual([{ id: 'c1', patch: { cardId: r.cardId, researchState: 'extracted' } }])
  })

  it('cardId 不属于该概念或空间时抛错', async () => {
    const { db } = fakeDb([cardRow({ id: 'other', conceptId: 'c9' })])
    const svc = new DlLessonVersionService(db)
    await expect(svc.restore('s1', 'c1', 'other')).rejects.toThrow('指定的讲义版本不存在或不属于该知识点')
    await expect(svc.restore('s2', 'c1', 'other')).rejects.toThrow('指定的讲义版本不存在或不属于该知识点')
  })
})