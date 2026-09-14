// @vitest-environment happy-dom
/**
 * 知识体系方案确认弹窗测试（PlanConfirmDialog）
 * @module tests/unit/renderer/domain-learning/plan-confirm-dialog.spec
 *
 * 背景（2026-09-13 用户需求）：首批知识生成要先弹窗确认诉求理解、再弹窗确认知识体系
 * （可勾选增删 + 调序），用户确认后才驱动落库轮。这里钉死弹窗的交互与"驱动下一轮"的消息标记。
 *
 * 做法：假 window.electronAPI.domainLearning（getPlan/confirmPlan/agentSend），
 * el-dialog 用 stub 避免 teleport，其余 Element Plus 组件用真实实现（复选框要真的能勾）。
 * 假 IPC 的出站参数一律走 `structuredClone` —— 与 Electron `ipcRenderer.invoke` 一致，
 * 这样「Vue 代理混进 IPC 参数」这类问题（"An object could not be cloned."）会在测试里现形。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import PlanConfirmDialog from '../../../../src/renderer/src/views/domain-learning/PlanConfirmDialog.vue'
import type { DlPlanView } from '../../../../src/shared/types/domain-learning.types'

const PLAN: DlPlanView = {
  spaceId: 'sp1',
  understanding: {
    id: 'p1',
    step: 'understanding',
    status: 'draft',
    revision: 1,
    feedback: null,
    updatedAt: null,
    payload: {
      goalSummary: '想搞懂金融产品与市场，能自己看数据',
      coverage: ['股票', '债券', '期货', '美元'],
      audience: '零基础',
      notDoing: ['个人记账'],
      keyExpectations: ['能读财报'],
    },
  },
  syllabus: {
    id: 'p2',
    step: 'syllabus',
    status: 'draft',
    revision: 1,
    feedback: null,
    updatedAt: null,
    payload: {
      branches: [
        {
          name: '金融产品',
          definitionShort: '各类金融工具',
          concepts: [
            { name: '股票', layer: 0, prerequisites: [] },
            { name: '债券', layer: 0, prerequisites: ['股票'] },
          ],
        },
        { name: '市场与价格', concepts: [{ name: '汇率与美元', layer: 1 }] },
      ],
    },
  },
  understandingConfirmed: false,
  syllabusConfirmed: false,
  confirmedConceptCount: 0,
}

const confirmCalls: Array<Record<string, unknown>> = []
const sendCalls: Array<Record<string, unknown>> = []

/** 与 Electron ipcRenderer.invoke 同款：出站参数必须能结构化克隆（Vue 代理会在这里抛错） */
function ipcClone<T>(value: T): T {
  return structuredClone(value)
}

function installFakeApi(plan: DlPlanView = PLAN): void {
  confirmCalls.length = 0
  sendCalls.length = 0
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    domainLearning: {
      getPlan: async () => ({ success: true, data: plan }),
      confirmPlan: async (p: Record<string, unknown>) => {
        confirmCalls.push(ipcClone(p))
        return { success: true, data: { message: '已确认' } }
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
  props: { spaceId: 'sp1', modelValue: true, mode: 'research' as const },
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

describe('PlanConfirmDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installFakeApi()
  })

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    vi.restoreAllMocks()
  })

  it('展示模型对诉求的理解（目标 + 要覆盖的对象与场景）', async () => {
    const w = mount(PlanConfirmDialog, mountOpts)
    await flush()
    const text = w.text()
    expect(text).toContain('我理解的你的诉求')
    expect(text).toContain('想搞懂金融产品与市场')
    for (const c of ['股票', '债券', '期货', '美元']) expect(text).toContain(c)
    expect(text).toContain('明确不做')
    expect(text).toContain('个人记账')
    w.unmount()
  })

  it('确认诉求理解 → 调 confirmPlan(understanding) 并发出「已确认诉求理解」消息驱动第 2 步', async () => {
    const w = mount(PlanConfirmDialog, mountOpts)
    await flush()
    const btn = buttonByText(w, '确认理解')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flush()

    expect(confirmCalls).toHaveLength(1)
    expect(confirmCalls[0]).toMatchObject({ id: 'sp1', step: 'understanding' })
    expect(sendCalls).toHaveLength(1)
    expect(String(sendCalls[0].message)).toContain('【已确认诉求理解】')
    expect(sendCalls[0].mode).toBe('research')
    w.unmount()
  })

  it('知识体系：默认全选 3 个；取消勾选后「确认并生成」只提交剩下的，并发出「已确认知识体系」消息', async () => {
    const w = mount(PlanConfirmDialog, mountOpts)
    await flush()
    expect(w.findAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(5) // 2 分支 + 3 知识点

    // 取消勾选「债券」那一项（按行文本定位，别依赖 DOM 里的下标）
    const bondRow = w.findAll('.pc-concept').find((el) => el.text().includes('债券'))
    expect(bondRow).toBeTruthy()
    await bondRow!.find('input[type="checkbox"]').setValue(false)
    await flush()

    const btn = buttonByText(w, '确认并生成')
    expect(btn).toBeTruthy()
    expect(btn!.text()).toContain('2 个知识点')
    await btn!.trigger('click')
    await flush()

    const syllabusCall = confirmCalls.find((c) => c.step === 'syllabus')
    expect(syllabusCall).toBeTruthy()
    const payload = syllabusCall!.payload as { branches: Array<{ name: string; concepts: Array<{ name: string }> }> }
    const names = payload.branches.flatMap((b) => b.concepts.map((c) => c.name))
    expect(names).toEqual(['股票', '汇率与美元'])
    expect(String(sendCalls[0].message)).toContain('【已确认知识体系】')
    w.unmount()
  })

  /**
   * 回归：用户在最后一步点「确认并生成 N 个知识点」时，载荷里带着 prerequisites 数组。
   * 草稿来自 store 的 reactive 数据，若把代理原样透传，ipcRenderer.invoke 会抛
   * 「An object could not be cloned.」——store 把它吞成 ok:false，界面只弹错误、不驱动落库轮。
   * 这里用结构化克隆的假 IPC 把该路径钉死。
   */
  it('知识体系载荷可结构化克隆过 IPC（含前置数组），确认后确实驱动落库轮', async () => {
    const w = mount(PlanConfirmDialog, mountOpts)
    await flush()

    const btn = buttonByText(w, '确认并生成')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flush()

    const syllabusCall = confirmCalls.find((c) => c.step === 'syllabus')
    expect(syllabusCall).toBeTruthy() // 克隆失败时 store 返回 ok:false，这里拿不到调用
    const payload = syllabusCall!.payload as {
      branches: Array<{ name: string; concepts: Array<{ name: string; prerequisites?: string[] }> }>
    }
    const bond = payload.branches[0].concepts.find((c) => c.name === '债券')
    expect(bond?.prerequisites).toEqual(['股票'])
    expect(String(sendCalls[0].message)).toContain('【已确认知识体系】')
    w.unmount()
  })

  it('调整指令：把意见交给模型重做（消息带【方案调整】）', async () => {
    const w = mount(PlanConfirmDialog, mountOpts)
    await flush()
    await w.find('textarea').setValue('我不要个人记账，要能看懂股票行情和财报')
    const btn = buttonByText(w, '让模型按这个改一版')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flush()
    expect(sendCalls).toHaveLength(1)
    expect(String(sendCalls[0].message)).toContain('【方案调整】')
    expect(String(sendCalls[0].message)).toContain('股票行情')
    expect(confirmCalls).toHaveLength(0) // 调整不确认
    w.unmount()
  })

  it('已确认状态下不再显示确认按钮（只读展示）', async () => {
    installFakeApi({ ...PLAN, understandingConfirmed: true, syllabusConfirmed: true, confirmedConceptCount: 3 })
    const w = mount(PlanConfirmDialog, mountOpts)
    await flush()
    expect(buttonByText(w, '确认理解')).toBeUndefined()
    expect(buttonByText(w, '确认并生成')).toBeUndefined()
    w.unmount()
  })
})
