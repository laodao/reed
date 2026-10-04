// @vitest-environment happy-dom
/**
 * 主题学习空间页：起步研究（生成首批知识）时 Agent 活动行的位置
 * @module tests/unit/renderer/domain-learning/space-boot-activity.spec
 *
 * 背景（2026-09-13 用户需求）：在空主题页点「生成首批知识」后，agent 的执行过程
 * 原先显示在**页面顶部**，离用户点击的位置很远；应改为显示在该按钮所在的起步提示框内、
 * 按钮下面（与知识全景页的起步态一致）。非空空间里的长任务（研究此概念/补全知识地图）
 * 仍保留置顶活动行。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { DlSpaceView } from '../../../../src/shared/types/domain-learning.types'

const routeStub = { params: { id: 'sp1' }, path: '/domain-learning/sp1', query: {}, meta: {} }

vi.mock('vue-router', () => ({
  useRoute: () => routeStub,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const { fakeStore } = vi.hoisted(() => ({
  fakeStore: {
    currentSpaceView: null as unknown,
    error: '',
    loadingView: false,
    notes: [] as unknown[],
    notesAll: [] as unknown[],
    plan: null as unknown,
    fetchSpaceView: async () => {},
    fetchNotesAll: async () => {},
    fetchNotesOf: async () => {},
    fetchPlan: async () => null,
    subscribeAgentEvent: () => () => {},
    subscribeStream: () => () => {},
    unsubscribeAll: () => {},
    sendAgent: async () => null,
    cancelAgent: async () => {},
    ackMastered: async () => {},
    ackConfused: async () => {},
    createConceptOf: async () => {},
    pickNext: async () => {},
    publishCard: async () => {},
    removeNoteOf: async () => {},
    saveNote: async () => {},
  },
}))

vi.mock('@/stores/domain-learning', () => ({
  useDomainLearningStore: () => fakeStore,
}))
vi.mock('@/stores/tabs', () => ({
  useTabsStore: () => ({ preloadTab: vi.fn() }),
}))

/** 最小可用空间视图（空主题：只有领域根目录） */
function viewOf(concepts: Array<Record<string, unknown>>): DlSpaceView {
  const base = {
    id: 'sp1',
    name: '量子计算入门',
    goal: '入门',
    tagline: '',
    profile: null,
    prerequisites: [],
    bookSuggestions: [],
    coverage: null,
    status: 'active',
    stats: { total: 0, mastered: 0, learning: 0 },
    relations: [],
    turns: [],
    openQuestionCount: 0,
  }
  const root = {
    id: 'root',
    parentId: null,
    nodeType: 'group',
    name: '量子计算入门·领域根',
    en: null,
    desc: null,
    researchState: 'unresearched',
    mastery: 'untouched',
    source: 'material',
    attrs: null,
    declaredPrereqs: [],
    hasCard: false,
  }
  const all = [root, ...concepts]
  return {
    ...base,
    concepts: all,
    tree: [
      {
        id: 'root',
        name: '量子计算入门·领域根',
        children: concepts.map((c) => ({ id: String(c.id), name: String(c.name), conceptId: String(c.id) })),
      },
    ],
    stats: { total: concepts.length, mastered: 0, learning: 0 },
  } as unknown as DlSpaceView
}

async function mountPage(view: DlSpaceView) {
  fakeStore.currentSpaceView = view
  const DomainLearningSpace = (
    await import('../../../../src/renderer/src/views/domain-learning/DomainLearningSpace.vue')
  ).default
  const w = shallowMount(DomainLearningSpace, { global: { plugins: [createPinia()] } })
  await flushPromises()
  return w
}

/** 起步卡片内 DOM 顺序（按钮 → 活动行） */
function cardOrder(card: Element): { button: number; strip: number } {
  const all = Array.from(card.querySelectorAll('*'))
  return {
    button: all.findIndex((el) => /button/i.test(el.tagName)),
    strip: all.findIndex((el) => /agent-activity-strip/i.test(el.tagName)),
  }
}

describe('主题学习空间页 · 起步研究活动行位置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeStore.currentSpaceView = null
  })

  it('空主题（起步态）：活动行只在起步卡片内，且排在「生成首批知识」按钮之后', async () => {
    const w = await mountPage(viewOf([]))
    const bootCard = w.find('.boot-card')
    expect(bootCard.exists()).toBe(true)

    const strips = w.findAll('agent-activity-strip-stub')
    expect(strips).toHaveLength(1)
    expect(bootCard.element.contains(strips[0].element)).toBe(true)

    const order = cardOrder(bootCard.element)
    expect(order.button).toBeGreaterThanOrEqual(0)
    expect(order.strip).toBeGreaterThan(order.button)
    w.unmount()
  })

  it('非空空间：活动行置顶显示，起步卡片不再出现（避免双份活动行）', async () => {
    const w = await mountPage(
      viewOf([
        {
          id: 'c1',
          parentId: 'root',
          nodeType: 'concept',
          name: '量子比特',
          en: null,
          desc: null,
          researchState: 'extracted',
          mastery: 'untouched',
          source: 'material',
          attrs: null,
          declaredPrereqs: [],
          hasCard: false,
        },
      ]),
    )
    expect(w.find('.boot-card').exists()).toBe(false)

    const strips = w.findAll('agent-activity-strip-stub')
    expect(strips).toHaveLength(1)
    // 置顶：不挂在起步卡片里（起步卡片此时也不存在）
    expect(strips[0].element.closest('.boot-card')).toBeNull()
    w.unmount()
  })
})
