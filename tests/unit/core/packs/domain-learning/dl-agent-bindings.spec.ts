/**
 * 领域学习 Agent 工具绑定组装测试（dl-agent-bindings，M2-B 采集扩展）
 * @module tests/unit/core/packs/domain-learning/dl-agent-bindings.spec
 *
 * 钉死口径：research 带读工具（KB/网页/API + 有默认搜索源才 web_search），
 * tutor 不带读工具（答疑引证 = 快照注入，防工具滥用）；registry 缺失工具名被过滤；
 * 动作/系统透出两模式都有；读工具与动作工具带 maxCalls 频控。
 */

import { describe, it, expect } from 'vitest'
import {
  DL_READ_TOOL_NAMES,
  DL_READ_TOOL_MAX_CALLS,
  DL_WEB_SEARCH_TOOL,
  buildDlBindings,
  isPlanningSaveRound,
} from '@core/packs/domain-learning/services/dl-agent-bindings'
import { dlAgentToolNames, buildDlAgentToolDefs, DL_TASK_PROGRESS_TOOL } from '@core/packs/domain-learning/services/dl-agent-tools'
import { loadAgentBudget } from '@core/platform/agent-runtime/budget/agent-budget'
import { AGENT_BUDGET_DEFAULTS } from '@shared/types/agent-budget.types'
import {
  DL_PLANNING_SAVE_BUDGET,
  DL_SAVE_BUDGET_MAX,
  DL_SYSTEM_PASSTHROUGH,
  DL_TASK_WORKFLOW_TOOLS,
  DL_TOOL_MAX_CALLS,
} from '@core/packs/domain-learning/services/dl-agent.types'
import type { AgentToolBinding } from '@shared/types/agent.types'

const ALL_TOOLS = [...dlAgentToolNames(), DL_TASK_PROGRESS_TOOL, ...DL_READ_TOOL_NAMES, DL_WEB_SEARCH_TOOL, ...DL_SYSTEM_PASSTHROUGH]

function namesOf(bindings: AgentToolBinding[]): string[] {
  return bindings.map((b) => b.tool)
}

describe('dl-agent-bindings', () => {
  it('research + 读工具全可用 + web 可用：动作+四读工具+系统透出，读/动作带 maxCalls', () => {
    const bindings = buildDlBindings({
      mode: 'research',
      availableToolNames: ALL_TOOLS,
      webSearchAvailable: true,
    })
    const names = namesOf(bindings)
    for (const t of dlAgentToolNames()) expect(names).toContain(t)
    for (const t of DL_READ_TOOL_NAMES) expect(names).toContain(t)
    expect(names).toContain(DL_WEB_SEARCH_TOOL)
    for (const t of DL_SYSTEM_PASSTHROUGH) expect(names).toContain(t)

    for (const b of bindings) {
      if (DL_SYSTEM_PASSTHROUGH.includes(b.tool as (typeof DL_SYSTEM_PASSTHROUGH)[number])) {
        expect(b.maxCalls).toBeUndefined()
      } else {
        expect(b.maxCalls).toBeGreaterThan(0)
      }
    }
  })

  it('research + 无默认搜索源：不 bind web_search（其余读工具仍在）', () => {
    const bindings = buildDlBindings({
      mode: 'research',
      availableToolNames: ALL_TOOLS,
      webSearchAvailable: false,
    })
    const names = namesOf(bindings)
    expect(names).not.toContain(DL_WEB_SEARCH_TOOL)
    for (const t of DL_READ_TOOL_NAMES) expect(names).toContain(t)
  })

  it('research + registry 缺失某读工具（如 wf_kb_retrieve 未注册）：绑定被过滤不报错', () => {
    const missing = [...ALL_TOOLS].filter((t) => t !== 'wf_kb_retrieve')
    const bindings = buildDlBindings({
      mode: 'research',
      availableToolNames: missing,
      webSearchAvailable: true,
    })
    const names = namesOf(bindings)
    expect(names).not.toContain('wf_kb_retrieve')
    expect(names).toContain('wf_web_extract')
    expect(names).toContain(DL_WEB_SEARCH_TOOL)
  })

  it('availableToolNames 缺省 = 不过滤（信任注册完整）', () => {
    const bindings = buildDlBindings({ mode: 'research', webSearchAvailable: true })
    for (const t of [...DL_READ_TOOL_NAMES, DL_WEB_SEARCH_TOOL]) {
      expect(namesOf(bindings)).toContain(t)
    }
  })

  it('tutor：只带动作工具 + 系统透出，绝无读工具', () => {
    const bindings = buildDlBindings({ mode: 'tutor', availableToolNames: ALL_TOOLS, webSearchAvailable: true })
    const names = namesOf(bindings)
    for (const t of dlAgentToolNames()) expect(names).toContain(t)
    for (const t of DL_SYSTEM_PASSTHROUGH) expect(names).toContain(t)
    for (const t of [...DL_READ_TOOL_NAMES, DL_WEB_SEARCH_TOOL]) {
      expect(names).not.toContain(t)
    }
  })

  it('verify（内部核验）：只带读工具 + 系统透出，不带任何 dl 写动作（M4-UX2）', () => {
    const bindings = buildDlBindings({ mode: 'verify', availableToolNames: ALL_TOOLS, webSearchAvailable: true })
    const names = namesOf(bindings)
    for (const t of [...DL_READ_TOOL_NAMES, DL_WEB_SEARCH_TOOL, ...DL_SYSTEM_PASSTHROUGH]) {
      expect(names).toContain(t)
    }
    for (const t of dlAgentToolNames()) expect(names).not.toContain(t)
  })

  it('task：动作 + 读工具 + 系统透出 + dl_task_progress 进度工具（M6-3 阶段三）', () => {
    const bindings = buildDlBindings({ mode: 'task', availableToolNames: ALL_TOOLS, webSearchAvailable: false })
    const names = namesOf(bindings)
    for (const t of dlAgentToolNames()) expect(names).toContain(t)
    expect(names).toContain(DL_TASK_PROGRESS_TOOL)
    for (const t of DL_READ_TOOL_NAMES) expect(names).toContain(t)
    for (const t of DL_SYSTEM_PASSTHROUGH) expect(names).toContain(t)
    // 工作流透出（run_workflow/get_workflow_run，仅 task）
    for (const t of DL_TASK_WORKFLOW_TOOLS) expect(names).toContain(t)
    // 进度工具只读级：不带 maxCalls 缺省之外的写语义（有频控即可）
    const prog = bindings.find((b) => b.tool === DL_TASK_PROGRESS_TOOL)
    expect(prog?.maxCalls).toBeGreaterThan(0)
  })

  it('research/tutor 不暴露 dl_task_progress 与工作流透出（task 会话专属）', () => {
    for (const mode of ['research', 'tutor'] as const) {
      const names = namesOf(buildDlBindings({ mode, availableToolNames: ALL_TOOLS, webSearchAvailable: false }))
      expect(names).not.toContain(DL_TASK_PROGRESS_TOOL)
      for (const t of DL_TASK_WORKFLOW_TOOLS) expect(names).not.toContain(t)
    }
  })

  it('dl_save_space_prereqs（主题前置要求）在动作清单里且带频控（2026-09-12）', () => {
    expect(dlAgentToolNames()).toContain('dl_save_space_prereqs')
    const bindings = buildDlBindings({ mode: 'research', availableToolNames: ALL_TOOLS, webSearchAvailable: false })
    const b = bindings.find((x) => x.tool === 'dl_save_space_prereqs')
    expect(b).toBeTruthy()
    expect(b!.maxCalls).toBeGreaterThan(0)
  })

  // ===== 2026-09-13 用户实测「金融理财」起步研究：默认 12 次概念额度装不下"分支+知识点" =====
  it('saveBudget：覆盖概念/关系额度（其余工具不变），不传则用默认频控', () => {
    const def = buildDlBindings({ mode: 'research', availableToolNames: ALL_TOOLS, webSearchAvailable: false })
    expect(def.find((b) => b.tool === 'dl_save_concept')!.maxCalls).toBe(DL_TOOL_MAX_CALLS.dl_save_concept)
    expect(def.find((b) => b.tool === 'dl_save_relation')!.maxCalls).toBe(DL_TOOL_MAX_CALLS.dl_save_relation)

    const big = buildDlBindings({
      mode: 'research',
      availableToolNames: ALL_TOOLS,
      webSearchAvailable: false,
      saveBudget: { concepts: 30, relations: 40 },
    })
    expect(big.find((b) => b.tool === 'dl_save_concept')!.maxCalls).toBe(30)
    expect(big.find((b) => b.tool === 'dl_save_relation')!.maxCalls).toBe(40)
    // 只放宽落库额度：卡片额度与读工具频控不受影响
    expect(big.find((b) => b.tool === 'dl_save_card')!.maxCalls).toBe(DL_TOOL_MAX_CALLS.dl_save_card)
    expect(big.find((b) => b.tool === 'wf_web_extract')!.maxCalls).toBe(DL_READ_TOOL_MAX_CALLS.wf_web_extract)
  })

  it('saveBudget：夹到硬上限（防跑飞）且非法值回退为 1', () => {
    const over = buildDlBindings({
      mode: 'research',
      availableToolNames: ALL_TOOLS,
      webSearchAvailable: false,
      saveBudget: { concepts: 9999, relations: 0 },
    })
    expect(over.find((b) => b.tool === 'dl_save_concept')!.maxCalls).toBe(DL_SAVE_BUDGET_MAX)
    expect(over.find((b) => b.tool === 'dl_save_relation')!.maxCalls).toBe(1)
  })

  it('规划额度常量：起步研究够用（分支目录 + 一批知识点 + 前置边）', () => {
    expect(DL_PLANNING_SAVE_BUDGET.concepts).toBeGreaterThanOrEqual(20)
    expect(DL_PLANNING_SAVE_BUDGET.relations).toBeGreaterThanOrEqual(DL_PLANNING_SAVE_BUDGET.concepts)
    expect(DL_SAVE_BUDGET_MAX).toBeGreaterThanOrEqual(DL_PLANNING_SAVE_BUDGET.relations)
  })

  it('isPlanningSaveRound：起步研究（空空间 research）与补全地图（task）用规划额度，其余不用', () => {
    expect(isPlanningSaveRound({ mode: 'research', isEmptySpace: true })).toBe(true)
    // 已有知识点的普通研究轮（给单个概念出讲义）不需要大额度
    expect(isPlanningSaveRound({ mode: 'research', isEmptySpace: false })).toBe(false)
    expect(isPlanningSaveRound({ mode: 'task', isEmptySpace: false, wantsMapCompletion: true })).toBe(true)
    expect(isPlanningSaveRound({ mode: 'task', isEmptySpace: false, wantsMapCompletion: false })).toBe(false)
    // 答疑/核验永远不是规划轮
    expect(isPlanningSaveRound({ mode: 'tutor', isEmptySpace: true })).toBe(false)
    expect(isPlanningSaveRound({ mode: 'verify', isEmptySpace: true })).toBe(false)
  })

  // ===== 2026-09-13 参数配置化：settings 读到的预算必须真的落到 bindings（宿主路径） =====
  it('宿主路径：settings 里的 agent:budget → 解析 → bindings 额度（不是只解析不生效）', async () => {
    const { budget } = await loadAgentBudget({
      get: async () => ({
        maxCalls: { byTool: { dl_save_concept: 33 }, read: { web_search: 7 } },
        domainLearning: { saveBudget: { concepts: 55, relations: 60 }, maxSaveBudget: 80 },
      }),
    })
    const bindings = buildDlBindings({
      mode: 'research',
      availableToolNames: ALL_TOOLS,
      webSearchAvailable: true,
      saveBudget: budget.domainLearning.saveBudget,
      budgetMax: budget.domainLearning.maxSaveBudget,
      toolMaxCalls: budget.maxCalls.byTool,
      readMaxCalls: budget.maxCalls.read,
    })
    // 规划落库额度覆盖了默认 12；读工具预算按配置生效
    expect(bindings.find((b) => b.tool === 'dl_save_concept')!.maxCalls).toBe(55)
    expect(bindings.find((b) => b.tool === 'dl_save_relation')!.maxCalls).toBe(60)
    expect(bindings.find((b) => b.tool === DL_WEB_SEARCH_TOOL)!.maxCalls).toBe(7)
    // 未配置的工具仍用内置默认（不因接入预算而丢默认）
    expect(bindings.find((b) => b.tool === 'dl_save_card')!.maxCalls).toBe(
      AGENT_BUDGET_DEFAULTS.maxCalls.byTool.dl_save_card,
    )
  })

  // ===== 2026-09-15 用户口径（重点 + 合并 + 不要卡片样式）：工具描述也必须带同一套口径 =====
  it('dl_save_card 工具描述带"重点就是定义/详解/案例 + 区序 + 合并 + 不要卡片"（模型在工具层也看得到）', () => {
    const def = buildDlAgentToolDefs().find((d) => d.name === 'dl_save_card')
    expect(def, '缺 dl_save_card 工具定义').toBeTruthy()
    expect(def!.description).toContain('重点就是定义、详解、案例')
    expect(def!.description).toContain('区序是「定义 → 详解 → 案例 →（实操）→ 辨析与易错 → 自测」')
    expect(def!.description).toContain('并进「详解」')
    expect(def!.description).toContain('并进「实操」')
    expect(def!.description).toContain('不要做成要点卡堆砌')
  })
})
