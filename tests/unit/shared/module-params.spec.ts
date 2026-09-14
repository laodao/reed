/**
 * 模块参数框架测试（登记表 + 通用解析 + 保存口径）
 * @module tests/unit/shared/module-params.spec
 *
 * 背景（2026-09-13 用户需求第二轮）：「参数设置」要按模块分 Tab，每个模块的相关参数都能调。
 * 本用例钉死**框架级**的纪律（与具体模块解耦），避免这套通用能力日后被改坏：
 * 1. 登记表自身合规：键名来自注册表、路径不重复、默认值 ≤ 硬上限、默认值来自各域常量；
 * 2. 解析纪律：不配置 = 内置默认、部分覆盖只影响该字段、非法值回落、超上限夹取并说明；
 * 3. 记录型（numberMap）合并口径：默认打底 + 用户覆盖 + 自定义键；
 * 4. 保存口径：只写用户碰过的字段、复位 = 删除该字段。
 */

import { describe, it, expect } from 'vitest'
import { MODULE_PARAMS, getModuleParams, modulesUsingSettingsKey } from '@shared/constants/module-params'
import { SETTINGS_KEYS, isRegisteredSettingsKey } from '@shared/constants/settings-keys'
import type { ModuleNumberMapParamSpec, ModuleNumberParamSpec } from '@shared/types/module-params.types'
import {
  moduleParamSettingsKeys,
  moduleParamSpecs,
  pruneEmptyObjects,
  readParamPath,
  resolveModuleParams,
  writeParamPath,
  writeModuleParam,
} from '@shared/utils/module-params'
import { AGENT_BUDGET_DEFAULTS } from '@shared/types/agent-budget.types'
import { WORKFLOW_DEFAULTS } from '@shared/types/workflow.types'

const DOMAIN_LEARNING = getModuleParams('domainLearning')!
const AGENT_RUNTIME = getModuleParams('agentRuntime')!
const WORKFLOW = getModuleParams('workflow')!

describe('登记表自身合规（新增模块参数时的护栏）', () => {
  it('每个模块都有唯一 key / 中文名 / 说明 / 已注册的 settings 键', () => {
    const keys = MODULE_PARAMS.map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const m of MODULE_PARAMS) {
      expect(m.key).toMatch(/^[a-z][a-zA-Z0-9]*$/)
      expect(m.name.trim().length).toBeGreaterThan(0)
      expect(m.description.trim().length).toBeGreaterThan(0)
      for (const k of moduleParamSettingsKeys(m)) {
        expect(isRegisteredSettingsKey(k), `${m.key} 用了未注册的 settings 键 ${k}`).toBe(true)
      }
    }
  })

  it('参数路径在模块内唯一；label/hint 必填（hint 是用户判断该不该调的唯一依据）', () => {
    for (const m of MODULE_PARAMS) {
      const paths = moduleParamSpecs(m).map((s) => `${s.settingsKey ?? m.settingsKey}#${s.path}`)
      expect(new Set(paths).size, `${m.key} 有重复参数路径`).toBe(paths.length)
      for (const s of moduleParamSpecs(m)) {
        expect(s.label.trim().length, `${m.key}.${s.path} 缺 label`).toBeGreaterThan(0)
        expect(s.hint.trim().length, `${m.key}.${s.path} 缺 hint`).toBeGreaterThan(0)
      }
    }
  })

  it('数字型：默认值 ≥ 下限且 ≤ 硬上限；下限 ≤ 上限', () => {
    for (const m of MODULE_PARAMS) {
      for (const s of moduleParamSpecs(m)) {
        if (s.kind === 'number') {
          const n = s as ModuleNumberParamSpec
          // "0 有语义"的字段（如 0 = 不启用 / 不等待）默认值可以是 0，也可以是非 0；
          // 但绝不允许负数（解析层也把负数视为非法并回落）
          expect(n.default, `${m.key}.${n.path} 默认值为负`).toBeGreaterThanOrEqual(0)
          if (!n.zeroMeansDisabled) {
            expect(n.default, `${m.key}.${n.path} 默认值非正`).toBeGreaterThan(0)
          }
          expect(n.default, `${m.key}.${n.path} 默认超过硬上限`).toBeLessThanOrEqual(n.ceiling)
        }
        if (s.kind === 'numberMap') {
          const map = s as ModuleNumberMapParamSpec
          for (const [key, v] of Object.entries(map.defaults)) {
            const ceiling = map.ceilings?.[key] ?? map.ceiling
            expect(v, `${m.key}.${map.path}.${key} 默认超过硬上限`).toBeLessThanOrEqual(ceiling)
          }
        }
      }
    }
  })

  it('默认值引用各域常量，不在这里另抄一份（防两处漂移）', () => {
    // agent:budget 下的模块：默认值必须与 AGENT_BUDGET_DEFAULTS 一致
    for (const m of [DOMAIN_LEARNING, AGENT_RUNTIME]) {
      const r = resolveModuleParams(m, { [SETTINGS_KEYS.agentBudget]: null })
      for (const s of moduleParamSpecs(m)) {
        if (s.kind === 'number') {
          const actual = readParamPath(r.trees[SETTINGS_KEYS.agentBudget], s.path)
          const expected = readParamPath(AGENT_BUDGET_DEFAULTS, s.path)
          expect(actual, `${m.key}.${s.path} 与 AGENT_BUDGET_DEFAULTS 不一致`).toBe(expected)
        }
      }
    }
    // workflow：maxDurationMs / multiTurn 等来自 WORKFLOW_DEFAULTS
    const wf = resolveModuleParams(WORKFLOW, { [SETTINGS_KEYS.wfDefaults]: null })
    expect(readParamPath(wf.trees[SETTINGS_KEYS.wfDefaults], 'maxDurationMs')).toBe(WORKFLOW_DEFAULTS.maxDurationMs)
    expect(readParamPath(wf.trees[SETTINGS_KEYS.wfDefaults], 'multiTurn')).toBe(WORKFLOW_DEFAULTS.multiTurn)
  })

  it('同一个 settings 键可以被多个模块共用（按归属分 Tab 的前提）', () => {
    const shared = modulesUsingSettingsKey(SETTINGS_KEYS.agentBudget).map((m) => m.key)
    expect(shared).toContain('agentRuntime')
    expect(shared).toContain('domainLearning')
    expect(shared).toContain('systemAgent')
    expect(shared).toContain('episodeProduction')
    expect(shared).toContain('eventSystem')
  })

  /**
   * 结构守卫（跨所有模块）：视图模型里的每一项，都必须能在**它自己声明的 settings 键 + 绝对路径**
   * 上按声明的默认值取到。
   *
   * 为什么需要它：这个框架有一个真实踩过的坑——"一个 Tab 覆盖多个 settings 键"时，
   * 分组级 `settingsKey` 没被识别，参数静默落到了错误的键上（设置页只能读到第一个键，
   * 用户改了没效果）。这条守卫把"声明位置"与"实际写入位置"对齐，任何路径/前缀写错都会当场失败。
   */
  it('每一项参数都能在它声明的键与路径上按默认值取到（防跨键/前缀写错）', () => {
    for (const m of MODULE_PARAMS) {
      const r = resolveModuleParams(m, {})
      for (const group of r.groups) {
        for (const entry of group.entries) {
          const tree = r.trees[entry.settingsKey]
          expect(tree, `${m.key} 的 ${entry.valueKey} 声明了键 ${entry.settingsKey}，但该键没有 tree`).toBeTruthy()
          const actual = readParamPath(tree, entry.absolutePath)
          expect(
            actual,
            `${m.key} 的 ${entry.valueKey} 在 ${entry.settingsKey}#${entry.absolutePath} 上取不到默认值`,
          ).toEqual(entry.default)
        }
      }
    }
  })
})

describe('通用解析：默认 → 覆盖 → 夹取（不配置时行为与改造前一致）', () => {
  it('不配置 → 全部内置默认，且没有被标记为"用户设置过"', () => {
    for (const raw of [null, undefined, 42, 'x', []]) {
      const r = resolveModuleParams(DOMAIN_LEARNING, { [SETTINGS_KEYS.agentBudget]: raw })
      expect(r.values['maxSteps.research']).toBe(AGENT_BUDGET_DEFAULTS.maxSteps.research)
      expect(r.values['domainLearning.saveBudget.concepts']).toBe(AGENT_BUDGET_DEFAULTS.domainLearning.saveBudget.concepts)
      expect(Object.keys(r.touched)).toEqual([])
    }
  })

  it('部分覆盖：只影响写了的字段，其余保持默认', () => {
    const r = resolveModuleParams(DOMAIN_LEARNING, {
      [SETTINGS_KEYS.agentBudget]: { maxSteps: { research: 20 } },
    })
    expect(r.values['maxSteps.research']).toBe(20)
    expect(r.touched['maxSteps.research']).toBe(true)
    expect(r.values['maxSteps.task']).toBe(AGENT_BUDGET_DEFAULTS.maxSteps.task)
    expect(r.touched['maxSteps.task']).toBeUndefined()
    expect(r.notes).toEqual([])
  })

  it('超硬上限 → 夹到上限并记说明（用户能看到值没被完整采纳）', () => {
    const r = resolveModuleParams(WORKFLOW, {
      [SETTINGS_KEYS.wfDefaults]: { maxRetryCount: 9999 },
    })
    expect(r.values['maxRetryCount']).toBe(10)
    expect(r.notes.some((n) => n.includes('硬上限'))).toBe(true)
  })

  it('非法值 → 回落默认并记说明（0/负数/NaN/字符串）', () => {
    const r = resolveModuleParams(WORKFLOW, {
      [SETTINGS_KEYS.wfDefaults]: { maxRetryCount: 0, maxLoopIterations: -3, maxOutputChars: 'abc', maxNodeRuns: null },
    })
    expect(r.values['maxRetryCount']).toBe(WORKFLOW_DEFAULTS.maxRetryCount)
    expect(r.values['maxLoopIterations']).toBe(WORKFLOW_DEFAULTS.maxLoopIterations)
    expect(r.values['maxOutputChars']).toBe(WORKFLOW_DEFAULTS.maxOutputChars)
    expect(r.values['maxNodeRuns']).toBe(WORKFLOW_DEFAULTS.maxNodeRuns)
    expect(r.notes.filter((n) => n.includes('回落默认')).length).toBeGreaterThanOrEqual(3)
  })

  it('零有语义的字段（0 = 不启用）保留 0，不被当成非法值', () => {
    const r = resolveModuleParams(WORKFLOW, { [SETTINGS_KEYS.wfDefaults]: { maxTotalToolCalls: 0 } })
    expect(r.values['maxTotalToolCalls']).toBe(0)
    expect(r.touched['maxTotalToolCalls']).toBe(true)
    expect(r.notes).toEqual([])
  })

  it('布尔字段：只有真正的布尔算覆盖，其它类型回落默认并记说明', () => {
    const ok = resolveModuleParams(WORKFLOW, { [SETTINGS_KEYS.wfDefaults]: { multiTurn: true } })
    expect(ok.values['multiTurn']).toBe(true)
    expect(ok.touched['multiTurn']).toBe(true)

    const bad = resolveModuleParams(WORKFLOW, { [SETTINGS_KEYS.wfDefaults]: { multiTurn: 'yes' } })
    expect(bad.values['multiTurn']).toBe(false)
    // touched 的口径是"载荷里出现过"（用户确实碰过这项，只是值不合法被回落），
    // 设置页据此显示「已自定义」并说明回落原因——不静默
    expect(bad.touched['multiTurn']).toBe(true)
    expect(bad.notes.some((n) => n.includes('不是布尔值'))).toBe(true)
  })

  it('跨字段一致性护栏在单字段夹取之后执行，并写进说明', () => {
    const r = resolveModuleParams(DOMAIN_LEARNING, {
      [SETTINGS_KEYS.agentBudget]: { domainLearning: { saveBudget: { concepts: 100, relations: 5 } } },
    })
    expect(r.values['domainLearning.saveBudget.relations']).toBe(100)
    expect(r.notes.some((n) => n.includes('小于'))).toBe(true)

    const agent = resolveModuleParams(AGENT_RUNTIME, {
      [SETTINGS_KEYS.agentBudget]: { maxSteps: { subagent: 30, subagentCeiling: 10 } },
    })
    expect(agent.values['maxSteps.subagentCeiling']).toBe(30)
    expect(agent.notes.some((n) => n.includes('低于'))).toBe(true)
  })
})

describe('记录型参数（numberMap）：默认打底 + 用户覆盖 + 自定义键', () => {
  it('默认表全部展开；只标出用户真正设过的键', () => {
    const r = resolveModuleParams(DOMAIN_LEARNING, { [SETTINGS_KEYS.agentBudget]: null })
    expect(r.values['maxCalls.byTool.dl_save_concept']).toBe(AGENT_BUDGET_DEFAULTS.maxCalls.byTool.dl_save_concept)
    expect(r.touched['maxCalls.byTool.dl_save_concept']).toBeUndefined()
    const map = r.trees[SETTINGS_KEYS.agentBudget].maxCalls as Record<string, Record<string, number>>
    expect(map.byTool.dl_save_concept).toBe(AGENT_BUDGET_DEFAULTS.maxCalls.byTool.dl_save_concept)
  })

  it('覆盖生效、未列出的键保留默认、自定义键也接受', () => {
    const r = resolveModuleParams(DOMAIN_LEARNING, {
      [SETTINGS_KEYS.agentBudget]: {
        maxCalls: { byTool: { dl_save_concept: 40, my_new_tool: 7 }, read: { http_get: 9 } },
      },
    })
    expect(r.values['maxCalls.byTool.dl_save_concept']).toBe(40)
    expect(r.values['maxCalls.byTool.my_new_tool']).toBe(7)
    expect(r.touched['maxCalls.byTool.my_new_tool']).toBe(true)
    expect(r.values['maxCalls.byTool.dl_save_relation']).toBe(AGENT_BUDGET_DEFAULTS.maxCalls.byTool.dl_save_relation)
    expect(r.values['maxCalls.read.http_get']).toBe(9)
    expect(r.values['maxCalls.read.wf_web_extract']).toBe(AGENT_BUDGET_DEFAULTS.maxCalls.read.wf_web_extract)
  })

  it('非法键名忽略并记说明；单键夹取到自己的上限', () => {
    const r = resolveModuleParams(DOMAIN_LEARNING, {
      [SETTINGS_KEYS.agentBudget]: {
        maxCalls: { byTool: { 'Bad Name!': 5, dl_save_card: 9999 } },
      },
    })
    const map = r.trees[SETTINGS_KEYS.agentBudget].maxCalls as Record<string, Record<string, number>>
    expect(map.byTool['Bad Name!']).toBeUndefined()
    expect(map.byTool.dl_save_card).toBe(20) // AGENT_BUDGET_LIMITS.maxCalls.byTool.dl_save_card
    expect(r.notes.some((n) => n.includes('非法键名'))).toBe(true)
    expect(r.notes.some((n) => n.includes('硬上限'))).toBe(true)
  })

  it('视图模型：每行带 mapKey/mapLabel/default/ceiling，只有第一行带"可新增自定义键"', () => {
    const r = resolveModuleParams(DOMAIN_LEARNING, { [SETTINGS_KEYS.agentBudget]: null })
    const rows = r.groups.flatMap((g) => g.entries).filter((e) => e.kind === 'numberMap')
    expect(rows.length).toBeGreaterThan(5)
    expect(rows[0].mapLabel).toBeTruthy()
    expect(rows[0].allowCustomKeys).toBe(true)
    expect(rows[1].allowCustomKeys).toBeFalsy()
    expect(rows.every((e) => typeof e.ceiling === 'number' && typeof e.default === 'number')).toBe(true)
  })
})

describe('保存/复位口径（设置页与宿主共用）', () => {
  it('writeParamPath 只动目标字段（不可变，返回新对象）', () => {
    const raw = { maxSteps: { research: 20, task: 16 }, guards: { maxAuditPreviewChars: 800 } }
    const next = writeParamPath(raw, 'maxSteps.research', 30)
    expect(readParamPath(next, 'maxSteps.research')).toBe(30)
    expect(readParamPath(next, 'maxSteps.task')).toBe(16)
    expect(readParamPath(next, 'guards.maxAuditPreviewChars')).toBe(800)
    expect(readParamPath(raw, 'maxSteps.research')).toBe(20) // 原对象不被改
  })

  it('value = undefined → 删除该字段（复位为"跟随内置默认"）', () => {
    const next = writeParamPath({ maxSteps: { research: 30, task: 16 } }, 'maxSteps.research', undefined)
    expect(readParamPath(next, 'maxSteps.research')).toBeUndefined()
    expect(readParamPath(next, 'maxSteps.task')).toBe(16)
  })

  it('writeModuleParam 按 entry 定位写进对应的 settings 键', () => {
    const r = resolveModuleParams(DOMAIN_LEARNING, { [SETTINGS_KEYS.agentBudget]: null })
    const entry = r.groups.flatMap((g) => g.entries).find((e) => e.valueKey === 'domainLearning.maxSaveBudget')!
    const next = writeModuleParam({}, entry, 80)
    expect(readParamPath(next[SETTINGS_KEYS.agentBudget], 'domainLearning.maxSaveBudget')).toBe(80)
  })

  it('pruneEmptyObjects 清掉复位后的空壳（不留 {} 残渣）', () => {
    expect(pruneEmptyObjects({ a: { b: {} }, c: 1, d: { e: 2 } })).toEqual({ c: 1, d: { e: 2 } })
  })
})
