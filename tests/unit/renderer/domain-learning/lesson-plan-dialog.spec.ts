// @vitest-environment happy-dom
/**
 * 讲义方案确认弹窗（LessonPlanDialog；2026-09-14 讲义流水线）
 * @module tests/unit/renderer/domain-learning/lesson-plan-dialog.spec
 *
 * 参考 ppt-master 的两阶段确认：讲义**动笔之前**先把读者画像/目标/篇幅/术语与记号/示例参数/
 * 区级计划（每区版式 + 读者动作）摆给用户确认；用户可改版式或写调整意见。
 * 这里钉死：展示什么、确认时提交什么（含用户改过的版式）、驱动下一轮的消息标记、以及"防串台"。
 *
 * 出站参数一律走 `structuredClone`（与 Electron ipcRenderer.invoke 一致）——
 * Vue 代理混进 IPC 参数那类问题会在测试里现形。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import LessonPlanDialog from '../../../../src/renderer/src/views/domain-learning/LessonPlanDialog.vue'
import type { DlLessonPlanPayload, DlPlanView } from '../../../../src/shared/types/domain-learning.types'

const LESSON: DlLessonPlanPayload = {
  essenceType: 'K-concept',
  spec: {
    audience: '没读过金融教材、会看 Excel 的职场人',
    outcomes: ['能说出股权与债权的区别', '能判断一个产品属于哪一类'],
    depth: '入门',
    budget: { sections: 4, charsPerSection: 400 },
    tone: '生活类比先行',
    glossary: [{ term: '衍生品', plain: '价值取决于另一种资产的合约' }],
    notation: [{ symbol: 'Σ', read: '求和', example: '1+2+3=Σ3' }],
    exampleParams: [{ name: '票面利率', value: '3%' }],
    roster: [
      { key: 'meta', layout: 'keypoints', job: '让读者判断自己能不能学', carrier: 'points', takeaway: '会四则运算即可' },
      { key: 'definition', layout: 'prose', job: '给出金融资产的正式定义' },
      { key: 'structure', layout: 'compare', job: '把五类资产摆成一张对照表', carrier: 'table' },
    ],
    visualPlan: '五类资产用对照表，收益结构用柱状图',
  },
}

function planView(over: Partial<DlPlanView> = {}, lesson: DlLessonPlanPayload | null = LESSON, conceptId = 'k1'): DlPlanView {
  return {
    spaceId: 'sp1',
    understanding: null,
    syllabus: null,
    understandingConfirmed: false,
    syllabusConfirmed: false,
    confirmedConceptCount: 0,
    lesson: lesson
      ? { id: 'p3', step: 'lesson', status: 'draft', revision: 1, feedback: null, updatedAt: null, payload: lesson }
      : null,
    lessonConceptId: conceptId,
    lessonConfirmed: false,
    ...over,
  }
}

const confirmCalls: Array<Record<string, unknown>> = []
const sendCalls: Array<Record<string, unknown>> = []

function ipcClone<T>(value: T): T {
  return structuredClone(value)
}

function installFakeApi(plan: DlPlanView): void {
  confirmCalls.length = 0
  sendCalls.length = 0
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    domainLearning: {
      getPlan: async () => ({ success: true, data: plan }),
      confirmPlan: async (p: Record<string, unknown>) => {
        confirmCalls.push(ipcClone(p))
        // 与宿主一致：单测里也返回可读回执
        return { success: true, data: { message: '已确认讲义方案——现在请按区级计划逐区精写正文' } }
      },
      agentSend: async (p: Record<string, unknown>) => {
        sendCalls.push(ipcClone(p))
        return { success: true, data: { actionSummaries: [], content: 'ok', suggestions: [] } }
      },
      onAgentEvent: () => () => {},
      onStream: () => () => {},
    },
  }
}

const mountOpts = {
  props: { spaceId: 'sp1', modelValue: true, conceptId: 'k1', conceptName: '金融资产的基本类型' },
  global: {
    plugins: [ElementPlus],
    stubs: { 'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue" class="dlg"><slot /></div>' } },
  },
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

function buttonByText(w: ReturnType<typeof mount>, text: string) {
  return w.findAll('button').find((b) => b.text().includes(text))
}

describe('LessonPlanDialog（讲义方案确认）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installFakeApi(planView())
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('展示规格：读者画像 / 学完能做到 / 深度篇幅 / 术语与记号 / 算例参数 / 视觉计划', async () => {
    const w = mount(LessonPlanDialog, mountOpts)
    await flush()
    const text = w.text()
    expect(text).toContain('没读过金融教材、会看 Excel 的职场人')
    expect(text).toContain('能判断一个产品属于哪一类')
    expect(text).toContain('入门')
    expect(text).toContain('目标 4 区')
    expect(text).toContain('衍生品')
    expect(text).toContain('Σ')
    expect(text).toContain('票面利率=3%')
    expect(text).toContain('五类资产用对照表')
    w.unmount()
  })

  it('区级计划逐区展示：区名 + 可改的版式 + 读者动作', async () => {
    const w = mount(LessonPlanDialog, mountOpts)
    await flush()
    const rows = w.findAll('.lp-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('meta')
    expect(rows[0].text()).toContain('让读者判断自己能不能学')
    expect(rows[2].text()).toContain('structure')
    expect(rows[2].text()).toContain('载体：table')
    // 每行一个版式选择器（可改）
    expect(w.findAll('.lp-layout')).toHaveLength(3)
    w.unmount()
  })

  it('确认方案 → confirmPlan(lesson) 带上 conceptId 与（改过的）区级计划，并发出「已确认讲义方案」驱动逐区精写', async () => {
    const w = mount(LessonPlanDialog, mountOpts)
    await flush()

    // 把「构成与分类」那区从对比表改成图解（模拟用户在弹窗里改版式）
    const selects = w.findAllComponents({ name: 'ElSelect' })
    expect(selects.length).toBeGreaterThanOrEqual(3)
    await selects[2].vm.$emit('update:modelValue', 'figure')
    await flush()

    const btn = buttonByText(w, '确认方案')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flush()

    expect(confirmCalls).toHaveLength(1)
    expect(confirmCalls[0]).toMatchObject({ id: 'sp1', step: 'lesson', conceptId: 'k1' })
    const payload = confirmCalls[0].payload as { conceptId: string; essenceType: string; spec: { roster: Array<{ key: string; layout: string }> } }
    expect(payload.conceptId).toBe('k1')
    expect(payload.essenceType).toBe('K-concept')
    expect(payload.spec.roster.find((r) => r.key === 'structure')!.layout).toBe('figure')

    expect(sendCalls).toHaveLength(1)
    expect(String(sendCalls[0].message)).toContain('【已确认讲义方案】')
    expect(sendCalls[0].conceptId).toBe('k1')
    expect(sendCalls[0].mode).toBe('research')
    w.unmount()
  })

  it('调整意见 → 发「【讲义方案调整】」消息让模型重做一版（不确认）', async () => {
    const w = mount(LessonPlanDialog, mountOpts)
    await flush()
    await w.find('textarea').setValue('术语表补上久期与凸性')
    const btn = buttonByText(w, '让模型按这个改一版')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flush()

    expect(confirmCalls).toHaveLength(0)
    expect(sendCalls).toHaveLength(1)
    expect(String(sendCalls[0].message)).toContain('【讲义方案调整】')
    expect(String(sendCalls[0].message)).toContain('久期与凸性')
    w.unmount()
  })

  it('防串台：方案属于别的概念时不展示内容（讲义是按概念写的）', async () => {
    installFakeApi(planView({}, LESSON, 'other-concept'))
    const w = mount(LessonPlanDialog, mountOpts)
    await flush()
    expect(w.find('.lp-section').exists()).toBe(false)
    expect(w.text()).toContain('还没有讲义方案')
    w.unmount()
  })

  it('已确认状态：不再显示确认按钮，标题标已确认', async () => {
    installFakeApi(planView({ lessonConfirmed: true }))
    const w = mount(LessonPlanDialog, mountOpts)
    await flush()
    expect(w.text()).toContain('已确认')
    expect(buttonByText(w, '确认方案')).toBeFalsy()
    w.unmount()
  })
})
