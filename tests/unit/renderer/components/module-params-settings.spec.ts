// @vitest-environment happy-dom
/**
 * 「参数设置」页面与模块面板测试
 * @module tests/unit/renderer/components/module-params-settings.spec
 *
 * 背景（2026-09-13 用户需求第二轮）：「这个功能应该叫参数设置，界面内按照模块应该有多个 tab，
 * 每个模块有一个 tab」。用假的 window.electronAPI.settings 驱动，钉死：
 * - Tab 来自登记表（有几个模块就有几个 Tab，不在前端写死）；
 * - 显示生效值（无配置 = 内置默认）；
 * - **只写用户碰过的字段**（没碰过的保持"跟随默认"）；
 * - 保存前现读最新载荷再合并 —— 多个模块共用同一个 settings 键时**不会互相覆盖**；
 * - 「跟随默认」= 从载荷里删掉该字段；「恢复本模块默认」不动同键下别的模块的字段；
 * - 平台开关 `ui:params` 收起/展开编辑区，并兼容第一轮的 `agent:budget.ui.enabled`。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ModuleParamsSettings from '../../../../src/renderer/src/components/settings/ModuleParamsSettings.vue'
import ModuleParamPanel from '../../../../src/renderer/src/components/settings/ModuleParamPanel.vue'
import { getModuleParams, MODULE_PARAMS } from '../../../../src/shared/constants/module-params'
import { SETTINGS_KEYS } from '../../../../src/shared/constants/settings-keys'
import { AGENT_BUDGET_DEFAULTS } from '../../../../src/shared/types/agent-budget.types'
import { WORKFLOW_DEFAULTS } from '../../../../src/shared/types/workflow.types'

let store: Record<string, unknown>
let setCalls: Array<{ key: string; value: unknown }>

function installFakeApi(): void {
  store = {}
  setCalls = []
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    settings: {
      get: async (key?: string) => ({ success: true, data: key ? (store[key] ?? null) : store }),
      set: async (key: string, value: unknown) => {
        setCalls.push({ key, value })
        store[key] = value
        return { success: true }
      },
    },
  }
}

const mountOpts = {
  global: {
    plugins: [ElementPlus],
    stubs: { 'el-skeleton': true },
  },
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

const DOMAIN_LEARNING = getModuleParams('domainLearning')!
const WORKFLOW = getModuleParams('workflow')!

function inputOf(w: ReturnType<typeof mount>, labelText: string) {
  const row = w.findAll('.mp-row').find((r) => r.text().includes(labelText))
  expect(row, `找不到「${labelText}」这一行`).toBeTruthy()
  return row!.find('input')
}

function buttonByText(w: ReturnType<typeof mount>, text: string) {
  return w.findAll('button').find((b) => b.text().includes(text))
}

describe('「参数设置」页面（模块 Tab + 平台开关）', () => {
  beforeEach(() => installFakeApi())
  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('Tab 来自登记表：每个模块一个 Tab，顺序与登记表一致', async () => {
    const w = mount(ModuleParamsSettings, mountOpts)
    await flush()
    const labels = w.findAll('.el-tabs__item').map((t) => t.text())
    expect(labels).toEqual(MODULE_PARAMS.map((m) => m.name))
    expect(labels.length).toBeGreaterThanOrEqual(6)
    expect(labels).toContain('AI 运行时')
    expect(labels).toContain('工作流')
    w.unmount()
  })

  it('默认展开编辑区；开关写 `ui:params`（平台级，不再是 agent:budget 的子字段）', async () => {
    const w = mount(ModuleParamsSettings, mountOpts)
    await flush()
    expect(w.find('.el-tabs').exists()).toBe(true)

    const sw = w.find('.mp-switch input[type="checkbox"]')
    await sw.setValue(false)
    await flush()
    expect(setCalls.some((c) => c.key === SETTINGS_KEYS.uiParams)).toBe(true)
    const saved = setCalls.find((c) => c.key === SETTINGS_KEYS.uiParams)!.value as { enabled: boolean }
    expect(saved.enabled).toBe(false)
    expect(w.text()).toContain('参数编辑已收起')
    expect(w.find('.el-tabs').exists()).toBe(false)
    w.unmount()
  })

  it('兼容第一轮：`agent:budget.ui.enabled = false` 时编辑区仍是收起的', async () => {
    store[SETTINGS_KEYS.agentBudget] = { ui: { enabled: false } }
    const w = mount(ModuleParamsSettings, mountOpts)
    await flush()
    expect(w.text()).toContain('参数编辑已收起')
    w.unmount()
  })
})

describe('模块参数面板（通用渲染 + 保存口径）', () => {
  beforeEach(() => installFakeApi())
  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
  })

  it('无配置时显示内置默认值（= 改造前写死的那些）', async () => {
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: DOMAIN_LEARNING } })
    await flush()
    expect((inputOf(w, '研究知识点步数').element as HTMLInputElement).value).toBe(
      String(AGENT_BUDGET_DEFAULTS.maxSteps.research),
    )
    expect((inputOf(w, '落库知识点').element as HTMLInputElement).value).toBe(
      String(AGENT_BUDGET_DEFAULTS.maxCalls.byTool.dl_save_concept),
    )
    w.unmount()
  })

  it('已有配置时显示配置值；只写用户碰过的字段（其余保持"跟随默认"）', async () => {
    store[SETTINGS_KEYS.agentBudget] = { maxSteps: { research: 20 } }
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: DOMAIN_LEARNING } })
    await flush()
    expect((inputOf(w, '研究知识点步数').element as HTMLInputElement).value).toBe('20')

    await inputOf(w, '落库知识点').setValue('25')
    await flush()
    await buttonByText(w, '保存')!.trigger('click')
    await flush()

    const call = setCalls.filter((c) => c.key === SETTINGS_KEYS.agentBudget).pop()!
    const saved = call.value as Record<string, any>
    expect(saved.maxCalls.byTool.dl_save_concept).toBe(25)
    expect(saved.maxSteps.research).toBe(20) // 别人的字段原样保留
    expect(saved.maxSteps.task).toBeUndefined() // 没碰过的不写
    expect(saved.domainLearning).toBeUndefined()
    w.unmount()
  })

  it('保存前现读最新载荷：别的 Tab 刚写进同一个键的字段不会被覆盖', async () => {
    store[SETTINGS_KEYS.agentBudget] = { maxSteps: { research: 20 } }
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: DOMAIN_LEARNING } })
    await flush()
    // 模拟"另一个 Tab（同为 agent:budget）先保存了"
    store[SETTINGS_KEYS.agentBudget] = { maxSteps: { research: 20, systemAgent: 30 } }

    await inputOf(w, '落库知识点').setValue('25')
    await flush()
    await buttonByText(w, '保存')!.trigger('click')
    await flush()

    const saved = setCalls.filter((c) => c.key === SETTINGS_KEYS.agentBudget).pop()!.value as Record<string, any>
    expect(saved.maxCalls.byTool.dl_save_concept).toBe(25)
    expect(saved.maxSteps.systemAgent).toBe(30) // 另一个 Tab 的改动活下来了
    w.unmount()
  })

  it('「跟随默认」把该字段从载荷里删掉（将来默认值升级能吃到）', async () => {
    store[SETTINGS_KEYS.agentBudget] = { maxSteps: { research: 20 } }
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: DOMAIN_LEARNING } })
    await flush()
    const row = w.findAll('.mp-row').find((r) => r.text().includes('研究知识点步数'))!
    const reset = row.findAll('button').find((b) => b.text().includes('跟随默认'))!
    await reset.trigger('click')
    await flush()
    await buttonByText(w, '保存')!.trigger('click')
    await flush()

    const saved = setCalls.filter((c) => c.key === SETTINGS_KEYS.agentBudget).pop()!.value as Record<string, any>
    expect(saved.maxSteps).toBeUndefined() // 空壳被 prune 掉
    w.unmount()
  })

  it('「恢复本模块默认」只清本模块登记的字段，不动同键下别的模块的字段', async () => {
    store[SETTINGS_KEYS.agentBudget] = {
      maxSteps: { research: 30, systemAgent: 33 }, // systemAgent 属于「系统助手」Tab
      domainLearning: { maxSaveBudget: 99 },
    }
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: DOMAIN_LEARNING } })
    await flush()
    await buttonByText(w, '恢复本模块默认')!.trigger('click')
    await flush()

    const saved = setCalls.filter((c) => c.key === SETTINGS_KEYS.agentBudget).pop()!.value as Record<string, any>
    expect(saved.maxSteps.research).toBeUndefined()
    expect(saved.maxSteps.systemAgent).toBe(33)
    expect(saved.domainLearning).toBeUndefined()
    w.unmount()
  })

  it('填超硬上限：夹到上限并在页面上提示（不静默）', async () => {
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: WORKFLOW } })
    await flush()
    await inputOf(w, '节点重试次数').setValue('9999')
    await flush()
    // input-number 的 max 会先把值夹到上限，再断言页面显示上限值
    expect((inputOf(w, '节点重试次数').element as HTMLInputElement).value).toBe('10')
    w.unmount()
  })

  it('布尔参数用开关；记录型参数逐行展示键名', async () => {
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: WORKFLOW } })
    await flush()
    const switchRow = w.findAll('.mp-row').find((r) => r.text().includes('LLM 节点共享对话上下文'))!
    expect(switchRow.find('input[type="checkbox"]').exists()).toBe(true)

    const w2 = mount(ModuleParamPanel, { ...mountOpts, props: { definition: DOMAIN_LEARNING } })
    await flush()
    expect(w2.text()).toContain('dl_save_concept')
    expect(w2.text()).toContain('写类工具')
    w.unmount()
    w2.unmount()
  })

  it('工作流 Tab 用 wf:defaults 键，与 agent:budget 互不影响', async () => {
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: WORKFLOW } })
    await flush()
    await inputOf(w, '循环最大迭代数').setValue('150')
    await flush()
    await buttonByText(w, '保存')!.trigger('click')
    await flush()
    const saved = setCalls.filter((c) => c.key === SETTINGS_KEYS.wfDefaults).pop()!.value as Record<string, any>
    expect(saved.maxLoopIterations).toBe(150)
    expect(setCalls.every((c) => c.key === SETTINGS_KEYS.wfDefaults)).toBe(true)
    w.unmount()
  })

  it('节点重试上限的默认值来自 WORKFLOW_DEFAULTS（不在这里另抄一份）', async () => {
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: WORKFLOW } })
    await flush()
    expect((inputOf(w, '节点重试次数').element as HTMLInputElement).value).toBe(
      String(WORKFLOW_DEFAULTS.maxRetryCount),
    )
    w.unmount()
  })

  /**
   * 一个 Tab 覆盖两个 settings 键（「上下文与记忆」= agent:context + agent:memory）：
   * 读要读两个键，写要写到各自所属的键上（不能串味）。
   */
  it('跨两个 settings 键的 Tab：分别读、分别写', async () => {
    const AGENT_CONTEXT = getModuleParams('agentContext')!
    store[SETTINGS_KEYS.agentContext] = { windowTokens: 40_000 }
    store[SETTINGS_KEYS.agentMemory] = { assembleTopK: 5 }
    const w = mount(ModuleParamPanel, { ...mountOpts, props: { definition: AGENT_CONTEXT } })
    await flush()
    expect((inputOf(w, '上下文窗口').element as HTMLInputElement).value).toBe('40000')
    expect((inputOf(w, '每次召回条数').element as HTMLInputElement).value).toBe('5')

    // 改记忆侧的参数 → 只写 agent:memory
    await inputOf(w, '单次蒸馏条数').setValue('7')
    await flush()
    await buttonByText(w, '保存')!.trigger('click')
    await flush()

    const memoryWrite = setCalls.filter((c) => c.key === SETTINGS_KEYS.agentMemory).pop()
    expect(memoryWrite).toBeTruthy()
    const savedMemory = memoryWrite!.value as Record<string, unknown>
    expect(savedMemory.distillMaxItems).toBe(7)
    expect(savedMemory.assembleTopK).toBe(5) // 别的字段原样保留
    // 上下文那个键没被碰过（没改它就不写它）
    expect(setCalls.some((c) => c.key === SETTINGS_KEYS.agentContext)).toBe(false)
    w.unmount()
  })
})
