// @vitest-environment happy-dom
/**
 * 中栏讲义动作行的图标化契约（源码级断言 + 核验图标渲染契约）
 * @module tests/unit/renderer/domain-learning/lesson-action-icons
 *
 * 背景（2026-09-15 用户需求）：讲义标题栏右侧的「待复核 / 确认发布 / 导出 / 历史」
 * 文字控件太占横向空间，全部压成图标（悬停看 tooltip 详情）。
 *
 * 该视图（DomainLearningSpace.vue）体量大、mount 代价高；这里按本仓既有做法
 * （见 lesson-export-command.spec.ts、qa-answer-view.spec.ts 的源码级断言）钉死两点：
 * 1) 动作行内每个 el-button 都是纯图标（circle + icon，无可见文字）；
 * 2) 原本靠文字承载的信息（发布版本号、待复核条数、导出格式）必须挪进 tooltip/角标，不许丢。
 * 另外用 shallowMount 做一次真渲染，钉死「待复核 3 → 警示色调图标 + 角标 3 + 详情进 tooltip」
 * 的状态映射（源码断言看不出映射接错）。行为层的守卫仍在
 * store-ipc-payload.spec.ts / lesson-export-command.spec.ts。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { DlSpaceView } from '../../../../src/shared/types/domain-learning.types'

const SFC_PATH = resolve(
  __dirname,
  '../../../../src/renderer/src/views/domain-learning/DomainLearningSpace.vue'
)
const sfc = readFileSync(SFC_PATH, 'utf8')

/** 截取中栏讲义标题栏右侧的动作行（`<div class="lesson-actions">` → 末条反馈提示之前）。
 *  收尾标记不带闭合引号：2026-10-05 反馈横幅化后该行变成 `v-if="lastFeedback && !lastFeedbackIsWarn"`，
 *  前缀匹配对横幅化前后两种写法都成立。 */
function actionsBlock(src: string): string {
  const start = src.indexOf('<div class="lesson-actions">')
  const end = src.indexOf('<span v-if="lastFeedback', start)
  expect(start, '未找到 .lesson-actions 动作行').toBeGreaterThan(-1)
  expect(end, '未找到动作行收尾标记').toBeGreaterThan(start)
  return src.slice(start, end)
}

const block = actionsBlock(sfc)

/** 动作行内的 el-button 片段（自闭合或带内容，逐个取出后按内容判定） */
const actionButtons = Array.from(block.matchAll(/<el-button[\s\S]*?(?:\/>|<\/el-button>)/g)).map(m => m[0])

describe('讲义动作行：四个控件图标化', () => {
  it('动作行里每个 el-button 都是 circle 图标按钮、且无可见文字', () => {
    // 懂了 / 没懂 / 讲义演示 / 确认发布 / 导出 / 历史 —— 至少 6 个图标按钮
    expect(actionButtons.length).toBeGreaterThanOrEqual(6)
    for (const tag of actionButtons) {
      expect(tag.replace(/<[^>]*>/g, '').trim(), `按钮仍残留可见文字：${tag}`).toBe('')
      expect(tag, `按钮缺少 circle：${tag}`).toMatch(/circle/)
      expect(tag, `按钮缺少图标：${tag}`).toMatch(/:icon="/)
    }
  })

  it('文字按钮字样不再出现在动作行（确认发布 v? / 导出 / 历史 已全部换成 icon）', () => {
    expect(block).not.toMatch(/>\s*确认发布/)
    expect(block).not.toMatch(/>\s*导出/)
    expect(block).not.toMatch(/>历史</)
  })

  it('待复核：弃用文字 el-tag，改为状态图标 + 条数角标（详情仍在 verifyTip）', () => {
    expect(block).not.toContain('verifyTagType')
    expect(block).toMatch(/:content="verifyTip"/)
    expect(block).toMatch(/class="verify-chip"/)
    expect(block).toMatch(/verify-icon|verifyIcon/)
    // 条数是「待复核 N」里唯一不可丢的信息，必须以角标形式保留
    expect(block).toMatch(/verifyIssues/)
  })

  it('脚本侧提供核验状态 → 图标/色调/条数的映射（单一来源，不留死分支）', () => {
    expect(sfc).toMatch(/const verifyIcon = computed/)
    expect(sfc).toMatch(/const verifyTone = computed/)
    expect(sfc).toMatch(/const verifyIssues = computed/)
    // 旧文字档位映射已无调用方，须一并删除（noUnusedLocals 下留着会挂 typecheck）
    expect(sfc).not.toContain('verifyTagType')
  })

  it('确认发布：版本号挪进 tooltip，不因图标化丢信息', () => {
    expect(block).toMatch(/@click="publishCurrentLesson"/)
    expect(block).toMatch(/:content="publishTip"/)
    expect(sfc).toMatch(/const publishTip = computed/)
    expect(sfc).toMatch(/确认发布 v\$\{/)
  })

  it('导出：仍是下拉（格式三选一），触发器为图标按钮', () => {
    expect(block).toMatch(/@command="onExportCommand"/)
    expect(block).toMatch(/:icon="Download"/)
    expect(block).toMatch(/command="md"/)
    expect(block).toMatch(/command="pdf"/)
    expect(block).toMatch(/command="image"/)
  })

  it('历史：仍调 openVersionHistory，触发器为图标按钮', () => {
    expect(block).toMatch(/@click="openVersionHistory"/)
    expect(block).toMatch(/:icon="Clock"/)
  })

  it('三个操作按钮各自带 tooltip（纯图标后靠悬停自解释）', () => {
    expect(block).toContain('导出讲义') // 导出：格式清单写在悬停提示里
    expect(block).toContain('版本历史') // 历史：可做的事（预览/导出/恢复）写在悬停提示里
    expect(sfc).toContain('确认发布') // 发布：文案 + 版本号在 publishTip 里，模板只绑 :content
  })

  it('图标按钮带无障碍名称（文字撤掉后读屏器不能只剩一个无名按钮）', () => {
    for (const name of ['确认发布', '导出讲义', '版本历史']) {
      expect(block, `缺少 aria-label=${name}`).toContain(`aria-label="${name}"`)
    }
    // 核验状态是纯展示：role=img + aria-label，且可键盘聚焦（否则键盘用户看不到 tooltip）
    expect(block).toMatch(/role="img"/)
    expect(block).toMatch(/:aria-label="verifyLabel"/)
    expect(block).toMatch(/tabindex="0"/)
  })
})

// ==================== 渲染契约：核验图标的"状态 → 色调/角标/详情"映射 ====================
// 视图依赖重，沿用本仓 shallowMount + 假 store 的做法（见 space-boot-activity.spec.ts），
// 只断言动作行这一块的 DOM：色调档位、待复核条数角标、悬停详情文案。
const routeStub = { params: { id: 'sp1' }, path: '/domain-learning/sp1', query: {}, meta: {} }

vi.mock('vue-router', () => ({
  useRoute: () => routeStub,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
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
    saveNote: async () => {}
  }
}))

vi.mock('@/stores/domain-learning', () => ({
  useDomainLearningStore: () => fakeStore
}))
vi.mock('@/stores/tabs', () => ({
  useTabsStore: () => ({ preloadTab: vi.fn(), updateTabTitle: vi.fn() })
}))

/** 最小可用空间视图：根目录 + 一个「待复核 3 条」的草稿讲义概念 */
function viewWithCard(): DlSpaceView {
  const concept = {
    id: 'c1',
    parentId: 'root',
    nodeType: 'concept',
    name: '导数',
    en: null,
    desc: null,
    researchState: 'done',
    mastery: 'untouched',
    source: 'material',
    attrs: null,
    declaredPrereqs: [],
    hasCard: true,
    card: {
      id: 'card1',
      conceptId: 'c1',
      essenceType: 'K-concept',
      sections: [],
      version: 2,
      status: 'draft',
      verification: { status: 'needs_review', issues: 3, checkedAt: null, note: null }
    }
  }
  return {
    id: 'sp1',
    name: '微积分入门',
    goal: '入门',
    tagline: '',
    profile: null,
    prerequisites: [],
    bookSuggestions: [],
    coverage: null,
    status: 'active',
    concepts: [
      {
        id: 'root',
        parentId: null,
        nodeType: 'group',
        name: '微积分入门·领域根',
        en: null,
        desc: null,
        researchState: 'unresearched',
        mastery: 'untouched',
        source: 'material',
        attrs: null,
        declaredPrereqs: [],
        hasCard: false
      },
      concept
    ],
    tree: [
      {
        id: 'root',
        name: '微积分入门·领域根',
        children: [{ id: 'c1', name: '导数', conceptId: 'c1' }]
      }
    ],
    relations: [],
    turns: [],
    stats: { total: 1, mastered: 0, learning: 0 },
    openQuestionCount: 0
  } as unknown as DlSpaceView
}

describe('讲义动作行：核验状态图标的渲染映射', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeStore.currentSpaceView = viewWithCard()
  })

  it('待复核 3 条 → 警示色调图标 + 角标 3，且详情（含条数）进 tooltip', async () => {
    const DomainLearningSpace = (
      await import('../../../../src/renderer/src/views/domain-learning/DomainLearningSpace.vue')
    ).default
    const w = shallowMount(DomainLearningSpace, { global: { plugins: [createPinia()] } })
    await flushPromises()

    // 左栏选中带讲义的概念 → 中栏动作行渲染
    await w.find('.tree-leaf').trigger('click')
    await flushPromises()

    const chip = w.find('.verify-chip')
    expect(chip.exists(), '未渲染核验状态图标').toBe(true)
    expect(chip.classes()).toContain('warn')
    expect(chip.find('.verify-count').text()).toBe('3')
    // 文字撤掉后，状态靠无障碍名称承载
    expect(chip.attributes('aria-label')).toBe('待复核 3')
    expect(chip.attributes('tabindex')).toBe('0')

    // 悬停详情 + 发布提示：图标化后信息不许丢
    const tips = w.findAll('el-tooltip').map(t => t.attributes('content') ?? '')
    expect(tips.some(t => t.includes('待复核 3'))).toBe(true)
    expect(tips.some(t => t.includes('确认发布 v2'))).toBe(true)

    // 动作行里不再有可见文字按钮
    const actionsText = w.find('.lesson-actions').text()
    expect(actionsText).not.toContain('确认发布')
    expect(actionsText).not.toContain('导出')
    expect(actionsText).not.toContain('历史')
  })
})
