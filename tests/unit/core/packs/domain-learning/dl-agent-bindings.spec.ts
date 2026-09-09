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
  DL_WEB_SEARCH_TOOL,
  buildDlBindings,
} from '@core/packs/domain-learning/services/dl-agent-bindings'
import { dlAgentToolNames, DL_TASK_PROGRESS_TOOL } from '@core/packs/domain-learning/services/dl-agent-tools'
import { DL_SYSTEM_PASSTHROUGH, DL_TASK_WORKFLOW_TOOLS } from '@core/packs/domain-learning/services/dl-agent.types'
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
})
