// @vitest-environment happy-dom
/**
 * 领域学习 store：跨空间知识点检索 / 异空间建点（2026-10-05 前置 chip「跳转/创建」）
 * @module tests/unit/renderer/domain-learning/store-cross-space
 *
 * 背景：前置 chip 要判定「系统已有该知识点 → 跳转 / 没有 → 创建」。三个新出站口：
 *  - searchConceptsAcrossSpaces（dl:search-concepts）：按名跨空间查命中，失败降级空数组；
 *  - fetchSpaceViewDetached（dl:get-space-view）：拉**其他空间**视图建分类树——绝不能写
 *    currentSpaceView（那是当前页主数据源，串写会把学习空间页顶掉）；
 *  - createConceptDetached（dl:save-concept）：跨主题建点不刷新视图，同理。
 * 用与 Electron 同款假 IPC（出站过 structuredClone）逐个钉死。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDomainLearningStore } from '@/stores/domain-learning'
import type { DlConceptHit, DlSpaceView } from '@shared/types/domain-learning.types'

const searchCalls: Array<Record<string, unknown>> = []
const saveConceptCalls: Array<Record<string, unknown>> = []
const deleteConceptCalls: Array<Record<string, unknown>> = []
const getSpaceViewCalls: string[] = []

const HITS: DlConceptHit[] = [
  { name: '极限', conceptId: 'c-remote', spaceId: 'sp2', spaceName: '高等数学', nodeType: 'concept', mastery: 'mastered', hasCard: true },
]

/** 其他空间的聚合视图（fetchSpaceViewDetached / createConceptDetached 的返回源） */
const FOREIGN_VIEW = {
  id: 'sp2',
  name: '高等数学',
  goal: { text: '考研' },
  tagline: '',
  profile: null,
  prerequisites: [],
  bookSuggestions: [],
  coverage: null,
  status: 'active',
  stats: { total: 1, mastered: 0, learning: 0 },
  concepts: [],
  relations: [],
  tree: [{ id: 'g1', name: '极限与连续', children: [{ id: 'g2', name: '微分', children: [] }] }],
  turns: [],
  openQuestionCount: 0,
} as unknown as DlSpaceView

function installFakeApi(opts: { failSearch?: boolean; foreignView?: DlSpaceView | null } = {}): void {
  searchCalls.length = 0
  saveConceptCalls.length = 0
  deleteConceptCalls.length = 0
  getSpaceViewCalls.length = 0
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    domainLearning: {
      searchConcepts: async (p: { names: string[] }) => {
        searchCalls.push(structuredClone(p))
        if (opts.failSearch) return { success: false, error: 'boom' }
        return { success: true, data: HITS }
      },
      getSpaceView: async (id: string) => {
        getSpaceViewCalls.push(id)
        return { success: true, data: opts.foreignView ?? null }
      },
      saveConcept: async (p: Record<string, unknown>) => {
        saveConceptCalls.push(structuredClone(p))
        return { success: true, data: { conceptId: 'c-new', created: true, linkedPrereqs: [], missingPrereqs: [] } }
      },
      deleteConcept: async (p: Record<string, unknown>) => {
        deleteConceptCalls.push(structuredClone(p))
        return { success: true, data: { conceptId: p.conceptId, relations: 2, cards: 1, notes: 0, questions: 0 } }
      },
    },
  }
}

describe('domain-learning store：跨空间检索与异空间建点', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installFakeApi()
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('searchConceptsAcrossSpaces：出站 { names }，命中原样返回', async () => {
    const store = useDomainLearningStore()
    const hits = await store.searchConceptsAcrossSpaces(['极限', '导数'])
    expect(searchCalls).toEqual([{ names: ['极限', '导数'] }])
    expect(hits).toEqual(HITS)
  })

  it('searchConceptsAcrossSpaces：空名单不发 IPC；失败降级空数组（按"系统没有"走创建）', async () => {
    const store = useDomainLearningStore()
    expect(await store.searchConceptsAcrossSpaces([])).toEqual([])
    expect(searchCalls).toHaveLength(0)

    installFakeApi({ failSearch: true })
    expect(await store.searchConceptsAcrossSpaces(['极限'])).toEqual([])
    expect(searchCalls).toHaveLength(1)
  })

  it('fetchSpaceViewDetached：拉到视图但**不写 currentSpaceView**（防串掉当前页）', async () => {
    const store = useDomainLearningStore()
    installFakeApi({ foreignView: FOREIGN_VIEW })
    const v = await store.fetchSpaceViewDetached('sp2')
    expect(v?.name).toBe('高等数学')
    expect(getSpaceViewCalls).toEqual(['sp2'])
    expect(store.currentSpaceView).toBeNull()
  })

  it('createConceptDetached：建点送达但**不刷新 currentSpaceView**', async () => {
    const store = useDomainLearningStore()
    installFakeApi({ foreignView: FOREIGN_VIEW })
    const r = await store.createConceptDetached({ id: 'sp2', name: '极限', nodeType: 'concept', parentId: 'g1' })
    expect(r?.conceptId).toBe('c-new')
    expect(saveConceptCalls).toEqual([{ id: 'sp2', name: '极限', nodeType: 'concept', parentId: 'g1' }])
    // 与 createConceptOf 的差异点：异空间建点不回拉任何视图
    expect(getSpaceViewCalls).toHaveLength(0)
    expect(store.currentSpaceView).toBeNull()
  })

  it('createConceptDetached：失败置 error、返回 null', async () => {
    const store = useDomainLearningStore()
    ;(window as unknown as { electronAPI: { domainLearning: Record<string, unknown> } }).electronAPI.domainLearning.saveConcept =
      async () => ({ success: false, error: '同名已存在' })
    const r = await store.createConceptDetached({ id: 'sp2', name: '极限' })
    expect(r).toBeNull()
    expect(store.error).toBe('同名已存在')
  })
})

describe('domain-learning store：删除知识点（deleteConceptOf）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installFakeApi()
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('出站 { id, conceptId }；删除的是当前空间时刷新视图（getSpaceView 再拉一次）', async () => {
    const store = useDomainLearningStore()
    installFakeApi({ foreignView: FOREIGN_VIEW })
    await store.fetchSpaceView('sp2')
    expect(getSpaceViewCalls).toEqual(['sp2'])

    const r = await store.deleteConceptOf({ id: 'sp2', conceptId: 'c1' })
    expect(r).toMatchObject({ conceptId: 'c1', relations: 2, cards: 1 })
    expect(deleteConceptCalls).toEqual([{ id: 'sp2', conceptId: 'c1' }])
    expect(getSpaceViewCalls).toEqual(['sp2', 'sp2'])
    expect(store.error).toBeNull()
  })

  it('删除失败：置 error、返回 null', async () => {
    const store = useDomainLearningStore()
    ;(window as unknown as { electronAPI: { domainLearning: Record<string, unknown> } }).electronAPI.domainLearning.deleteConcept =
      async () => ({ success: false, error: '目录节点不支持在此删除' })
    const r = await store.deleteConceptOf({ id: 'sp2', conceptId: 'g1' })
    expect(r).toBeNull()
    expect(store.error).toBe('目录节点不支持在此删除')
  })
})
