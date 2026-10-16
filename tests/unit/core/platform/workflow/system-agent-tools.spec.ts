/**
 * 系统 Agent 工具集单测（28 号 M5 批4）
 * @module tests/unit/core/platform/workflow/system-agent-tools.spec
 *
 * 经真实 AgentToolRegistry 管线驱动（校验/上下文透传/截断同生产）；
 * run_workflow 终态轮询用注入 clock 控制时间，不真等 2s 间隔。
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'
import {
  buildSystemAgentToolDefs,
  extractStartInputs,
  summarizeRun,
  waitForRunTerminal,
  SYSTEM_AGENT_TOOL_NAMES,
  SYSTEM_AGENT_WHITELIST,
  CATALOG_MAX_WORKFLOWS,
} from '@core/platform/workflow/tools/system-agent-tools'
import {
  resetWorkflowRuntimeParams,
  setWorkflowRuntimeParams,
} from '@shared/utils/workflow-runtime-params'
import { TOOL_RESULT_ARRAY_KEEP } from '@core/platform/agent-runtime/tools/registry'
import type { SystemAgentToolsDeps } from '@core/platform/workflow/tools/system-agent-tools'
import type { WorkflowDefinitionRecord } from '@core/database/repositories/workflow-definition.repository'
import type { WorkflowRunRecord, WorkflowNodeRunRecord } from '@core/database/repositories/workflow-run.repository'

// ==================== fake 构造 ====================

function mkDefinition(overrides: Partial<WorkflowDefinitionRecord> = {}): WorkflowDefinitionRecord {
  return {
    id: 'wf-1',
    userId: null,
    name: '每日简报',
    description: '抓取热点生成简报',
    category: null,
    publishedGraph: {
      version: 1,
      nodes: [
        { id: 'n0', type: 'start', config: { inputs: [{ key: 'topic', label: '主题', type: 'string', required: true }] } },
        { id: 'n1', type: 'end', config: {} },
      ],
      edges: [{ id: 'e1', source: 'n0', target: 'n1' }],
    },
    draftGraph: null,
    publishedVersion: 1,
    publishedAt: null,
    triggers: [],
    settings: null,
    nextFireAt: null,
    lastFireAt: null,
    lastRunAt: null,
    shareToken: null,
    shareTokenHash: null,
    templateVersion: 0,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as WorkflowDefinitionRecord
}

function mkRun(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: 'run-1',
    userId: null,
    definitionId: 'wf-1',
    definitionVersion: 1,
    graphSnapshot: null,
    triggerType: 'manual',
    triggerInfo: null,
    startInputs: null,
    status: 'running',
    skipReason: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    timeoutAt: null,
    stats: null,
    cancelRequestedAt: null,
    resumedFromRunId: null,
    taskId: null,
    parentRunId: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function mkNodeRun(overrides: Partial<WorkflowNodeRunRecord> = {}): WorkflowNodeRunRecord {
  return {
    id: 'nr-1',
    userId: null,
    runId: 'run-1',
    nodeId: 'n1',
    nodeType: 'end',
    nodeName: '结束',
    iterationIndex: 0,
    status: 'succeeded',
    input: null,
    output: null,
    error: null,
    retryCount: 0,
    routeTaken: null,
    waitExpiresAt: null,
    review: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    createdAt: null,
    ...overrides,
  }
}

function mkSkill(overrides: Record<string, unknown> = {}) {
  return {
    id: 'skill-1',
    name: '短视频脚本',
    description: '生成短视频口播脚本',
    whenToUse: '要写短视频脚本时',
    category: '内容',
    source: 'builtin',
    dirPath: null,
    inputs: [{ key: 'topic', label: '主题', type: 'string', required: true }],
    outputDesc: undefined,
    systemPrompt: '你是编导',
    body: '请为《{{param.topic}}》写一段口播脚本。',
    references: [{ name: '风格指南', content: '口语化' }],
    modelInvocable: true,
    ...overrides,
  }
}

interface FakeTurnSink {
  turnRefs: Array<{ kind: string; id: string; label: string }>
}

/** 注册工具 + 经 registry.execute 管线调用（context 模拟 loop 的 logContext 注入） */
function setup(overrides: Partial<SystemAgentToolsDeps> = {}) {
  const registry = new AgentToolRegistry()
  const deps: SystemAgentToolsDeps = {
    registry,
    runService: {
      startRun: async () => mkRun(),
      getRunDetail: async () => ({ run: mkRun({ status: 'succeeded' }), nodeRuns: [mkNodeRun()] }),
    },
    definitions: {
      list: async () => ({ items: [mkDefinition()], total: 1 }),
      getById: async () => mkDefinition(),
    },
    tasks: {
      createPlan: async () => ({ id: 'root-1', title: '调研任务', status: 'pending_review' }),
    },
    skills: {
      list: () => [mkSkill() as never],
      resolveSkill: () => mkSkill() as never,
    },
    resolveModel: async () => mkTextModel('好'),
    ...overrides,
  }
  for (const def of buildSystemAgentToolDefs(deps)) registry.register(def, { source: 'builtin' })
  return { registry, deps }
}

function mkTextModel(text: string): LanguageModel {
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: text },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } } },
        ],
      }),
    }),
  }) as unknown as LanguageModel
}

// ==================== 白名单与纯函数 ====================

describe('系统 Agent 工具集（28 号 M5 批1）', () => {
  it('白名单：系统工具 + 直连只读工具，且不含写/审批工具', () => {
    expect(SYSTEM_AGENT_TOOL_NAMES).toHaveLength(6)
    expect(SYSTEM_AGENT_WHITELIST).toContain('web_search')
    expect(SYSTEM_AGENT_WHITELIST).not.toContain('http_post')
    expect(SYSTEM_AGENT_WHITELIST).not.toContain('code_run')
    expect(SYSTEM_AGENT_WHITELIST).not.toContain('data_table_write')
  })

  it('extractStartInputs：取发布图 start 节点参数；无图返回空', () => {
    const def = mkDefinition()
    expect(extractStartInputs(def)).toEqual([{ key: 'topic', label: '主题', type: 'string', required: true }])
    expect(extractStartInputs(mkDefinition({ publishedGraph: null, draftGraph: null }))).toEqual([])
  })

  it('summarizeRun：节点摘要含 output 切片与错误', () => {
    const s = summarizeRun({
      run: mkRun({ status: 'failed', error: 'boom' }),
      nodeRuns: [
        mkNodeRun({ status: 'failed', error: '节点炸了', output: { long: 'x'.repeat(600) } }),
        mkNodeRun({ id: 'nr-2', nodeId: 'n2', nodeName: '结尾' }),
      ],
    })
    expect(s.status).toBe('failed')
    expect(s.error).toBe('boom')
    const nodes = s.nodes as Array<{ status: string; error?: string; output?: string }>
    expect(nodes[0].error).toBe('节点炸了')
    expect(nodes[0].output).toContain('…[truncated]')
    expect(nodes[1].output).toBeUndefined()
  })
})

// ==================== discover_capabilities ====================

describe('discover_capabilities', () => {
  it('目录封顶与总数注记；技能过滤禁调用；工具目录排除系统工具', async () => {
    const many = Array.from({ length: 60 }, (_, i) => mkDefinition({ id: `wf-${i}`, name: `工作流${i}` }))
    const { registry, deps } = setup({
      // fake 尊重 pageSize（与真实 repo 语义一致）
      definitions: { list: async (p) => ({ items: many.slice(0, p.pageSize), total: 60 }) },
      skills: { list: () => [mkSkill(), mkSkill({ id: 's2', modelInvocable: false })] as never[] },
    })
    void deps
    const res = await registry.execute({ toolName: 'discover_capabilities', args: {} })
    expect(res.ok).toBe(true)
    const data = res.data as { workflows: unknown[]; workflowsTotal: number; skills: Array<{ id: string }>; tools: Array<{ name: string }>; taskPlan: string }
    // 目录封顶与管线数组截断对齐（20 项 + _truncated 注记）
    expect(data.workflows).toHaveLength(CATALOG_MAX_WORKFLOWS)
    expect(CATALOG_MAX_WORKFLOWS).toBeLessThanOrEqual(TOOL_RESULT_ARRAY_KEEP)
    expect(data.workflowsTotal).toBe(60)
    expect(data.skills.map((s) => s.id)).toEqual(['skill-1'])
    expect(data.tools.every((t) => !SYSTEM_AGENT_TOOL_NAMES.includes(t.name as never))).toBe(true)
    expect(data.taskPlan).toContain('批准')
  })

  it('工作流条目带 start 参数 schema（agent 填参依据）', async () => {
    const { registry } = setup()
    const res = await registry.execute({ toolName: 'discover_capabilities', args: {} })
    const data = res.data as { workflows: Array<{ id: string; inputs: Array<{ key: string; required: boolean }> }> }
    expect(data.workflows[0].inputs).toEqual([{ key: 'topic', label: '主题', type: 'string', required: true }])
  })

  /**
   * 2026-09-13「参数设置 → 工作流 → 系统工具面」：能力目录条数改读运行时持有者。
   * 注入更小的上限，证明目录长度跟着设置走。
   */
  it('目录条数读「参数设置 → 工作流 → 系统工具面」', async () => {
    const many = Array.from({ length: 60 }, (_, i) => mkDefinition({ id: `wf-${i}`, name: `工作流${i}` }))
    const { registry } = setup({
      definitions: { list: async (p) => ({ items: many.slice(0, p.pageSize), total: 60 }) },
    })
    setWorkflowRuntimeParams({ systemTools: { catalogMaxItems: 3 } })
    try {
      const res = await registry.execute({ toolName: 'discover_capabilities', args: {} })
      const data = res.data as { workflows: unknown[] }
      expect(data.workflows).toHaveLength(3)
    } finally {
      resetWorkflowRuntimeParams()
    }
  })

  it('模块域工具节：只列 catalogPacks 声明的 pack，未声明宿主为空（M6.5 共享注册）', async () => {
    const { registry } = setup()
    // 模拟 EP 包共享注册（pack 命名空间）
    registry.register(
      { name: 'generate_storyboards', description: '生成分镜画面描述', inputSchema: z.object({}), dangerLevel: 'write', execute: async () => ({}) },
      { packId: 'ep-agent' },
    )
    registry.register(
      { name: 'generate_script', description: '生成剧本', inputSchema: z.object({}), dangerLevel: 'write', execute: async () => ({}) },
      { packId: 'ep-agent' },
    )
    // 未声明 catalogPacks 的宿主（如聊天）：模块域节为空（review P3 红线：不诱导必败调用）
    const res0 = await registry.execute({ toolName: 'discover_capabilities', args: {} })
    const data0 = res0.data as { moduleTools: unknown[]; moduleToolsNote: string }
    expect(data0.moduleTools).toEqual([])
    expect(data0.moduleToolsNote).toBe('')
    // 声明了 catalogPacks 的宿主（EP 宿主）：列出该 pack 的工具
    const res = await registry.execute({
      toolName: 'discover_capabilities',
      args: {},
      context: { catalogPacks: ['ep-agent'] },
    })
    const data = res.data as { moduleTools: Array<{ name: string; description: string }>; moduleToolsNote: string }
    expect(data.moduleTools.map((t) => t.name).sort()).toEqual(['pack:ep-agent:generate_script', 'pack:ep-agent:generate_storyboards'])
    expect(data.moduleTools[0].description.length).toBeGreaterThan(0)
    expect(data.moduleToolsNote).toContain('仅在本宿主可用')
  })

  it('keyword 命中扩大到技能英文 id/whenToUse；skillsTotal=匹配数（M3-A）', async () => {
    const { registry } = setup({
      skills: {
        list: () => [
          mkSkill({ id: 'learning-domain-map', name: '领域地图生成', description: '为领域生成学习骨架', whenToUse: '需要建立学习骨架时' }),
          mkSkill({ id: 'short-video-script', name: '短视频脚本', description: '写口播稿', whenToUse: '要写短视频脚本时' }),
        ] as never[],
      },
    })
    // 用英文 id 前缀收窄（历史缺口：只匹配中文 name/description → 0 命中）
    const byId = await registry.execute({ toolName: 'discover_capabilities', args: { keyword: 'learning-domain' } })
    const d1 = byId.data as { skills: Array<{ id: string }>; skillsTotal: number }
    expect(d1.skills.map((s) => s.id)).toEqual(['learning-domain-map'])
    expect(d1.skillsTotal).toBe(1)

    // whenToUse 命中
    const byWtu = await registry.execute({ toolName: 'discover_capabilities', args: { keyword: '学习骨架' } })
    const d2 = byWtu.data as { skills: Array<{ id: string }>; skillsTotal: number }
    expect(d2.skills.map((s) => s.id)).toEqual(['learning-domain-map'])

    // 无关 keyword：skills 空且总数也报 0（不再全量虚高）
    const none = await registry.execute({ toolName: 'discover_capabilities', args: { keyword: '不存在的词xyz' } })
    const d3 = none.data as { skills: unknown[]; skillsTotal: number }
    expect(d3.skills).toHaveLength(0)
    expect(d3.skillsTotal).toBe(0)
  })
})

// ==================== run_workflow / get_workflow_run ====================

describe('run_workflow', () => {
  it('终态轮询：running → succeeded 返回摘要，引用进 turnRefs', async () => {
    let calls = 0
    const { registry } = setup({
      runService: {
        startRun: async () => mkRun({ id: 'run-9', status: 'running' }),
        getRunDetail: async () => {
          calls++
          return { run: mkRun({ id: 'run-9', status: calls >= 2 ? 'succeeded' : 'running' }), nodeRuns: [mkNodeRun({ runId: 'run-9' })] }
        },
      },
    })
    const turn: FakeTurnSink = { turnRefs: [] }
    const res = await registry.execute({ toolName: 'run_workflow', args: { definitionId: 'wf-1', inputs: { topic: 'AI' } }, context: { turnRefs: turn.turnRefs } })
    expect(res.ok).toBe(true)
    const data = res.data as { runId: string; status: string }
    expect(data.runId).toBe('run-9')
    expect(data.status).toBe('succeeded')
    expect(turn.turnRefs).toEqual([{ kind: 'workflow_run', id: 'run-9', label: '工作流运行 run-9' }])
  }, 15_000)

  it('互斥 skipped = 结构化失败', async () => {
    const { registry } = setup({
      runService: {
        startRun: async () => mkRun({ status: 'skipped', skipReason: '已有在途运行' }),
        getRunDetail: async () => null,
      },
    })
    const res = await registry.execute({ toolName: 'run_workflow', args: { definitionId: 'wf-1' } })
    expect(res.ok).toBe(false)
    expect((res.error as { message: string }).message).toContain('互斥跳过')
  })

  it('运行失败终态 → 结构化失败并携带节点摘要', async () => {
    const { registry } = setup({
      runService: {
        startRun: async () => mkRun({ id: 'run-f', status: 'running' }),
        getRunDetail: async () => ({ run: mkRun({ id: 'run-f', status: 'failed', error: 'LLM 超时' }), nodeRuns: [mkNodeRun({ runId: 'run-f', status: 'failed', error: 'LLM 超时' })] }),
      },
    })
    const res = await registry.execute({ toolName: 'run_workflow', args: { definitionId: 'wf-1' } })
    expect(res.ok).toBe(false)
    expect((res.error as { message: string }).message).toContain('failed')
    expect((res.error as { message: string }).message).toContain('LLM 超时')
  })

  it('waiting_review 即时返回（不空等人工审核）', async () => {
    let detailCalls = 0
    const { registry } = setup({
      runService: {
        startRun: async () => mkRun({ id: 'run-w', status: 'running' }),
        getRunDetail: async () => {
          detailCalls++
          return { run: mkRun({ id: 'run-w', status: 'waiting_review' }), nodeRuns: [] }
        },
      },
    })
    const res = await registry.execute({ toolName: 'run_workflow', args: { definitionId: 'wf-1' } })
    expect(detailCalls).toBe(1)
    const data = res.data as { status: string; note: string }
    expect(data.status).toBe('waiting_review')
    expect(data.note).toContain('人工审核')
  })

  it('等待超时：返回 ok + 当前状态与查询指引（clock 注入，一次真实轮询间隔 ~2s）', async () => {
    let clockCalls = 0
    const { registry } = setup({
      clock: () => {
        clockCalls++
        return clockCalls <= 2 ? 0 : Number.MAX_SAFE_INTEGER
      },
      runService: {
        startRun: async () => mkRun({ status: 'running' }),
        getRunDetail: async () => ({ run: mkRun({ status: 'running' }), nodeRuns: [] }),
      },
    })
    const res = await registry.execute({ toolName: 'run_workflow', args: { definitionId: 'wf-1' } })
    expect(res.ok).toBe(true)
    const data = res.data as { status: string; note: string }
    expect(data.note).toContain('仍在运行')
  }, 15_000)
})

describe('get_workflow_run', () => {
  it('运行不存在 → 结构化错误；存在 → 摘要', async () => {
    const { registry } = setup({
      runService: {
        startRun: async () => mkRun(),
        getRunDetail: async (runId: string) => (runId === 'ghost' ? null : { run: mkRun({ runId }), nodeRuns: [mkNodeRun()] }),
      },
    })
    const miss = await registry.execute({ toolName: 'get_workflow_run', args: { runId: 'ghost' } })
    expect(miss.ok).toBe(false)
    expect((miss.error as { message: string }).message).toContain('不存在')
    const hit = await registry.execute({ toolName: 'get_workflow_run', args: { runId: 'run-1' } })
    expect(hit.ok).toBe(true)
    expect((hit.data as { runId: string }).runId).toBe('run-1')
  })
})

// ==================== invoke_skill / create_task_plan ====================

describe('invoke_skill', () => {
  it('渲染 {{param}} + references，模型产出回传，引用进 turnRefs', async () => {
    let capturedPrompt = ''
    const model = new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({ stream: simulateReadableStream({ chunks: [] }) }),
      // invoke_skill 走 generateText（doGenerate）
      doGenerate: async (opts: { prompt?: unknown }) => {
        capturedPrompt = JSON.stringify(opts.prompt)
        return {
          content: [{ type: 'text', text: '这是脚本内容' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, noCache: 1 }, totalTokens: { total: 2, noCache: 2 } },
          warnings: [],
        }
      },
    }) as unknown as LanguageModel
    const { registry } = setup({ resolveModel: async () => model })
    const turn: FakeTurnSink = { turnRefs: [] }
    const res = await registry.execute({ toolName: 'invoke_skill', args: { skillId: 'skill-1', params: { topic: '咖啡' } }, context: { turnRefs: turn.turnRefs } })
    expect(res.ok).toBe(true)
    const data = res.data as { skillId: string; content: string }
    expect(data.content).toBe('这是脚本内容')
    expect(capturedPrompt).toContain('《咖啡》')
    expect(capturedPrompt).toContain('风格指南')
    expect(turn.turnRefs).toEqual([{ kind: 'skill', id: 'skill-1', label: '短视频脚本' }])
  })

  it('技能不存在 → 结构化错误', async () => {
    const { registry } = setup({
      skills: { list: () => [], resolveSkill: () => null },
    })
    const res = await registry.execute({ toolName: 'invoke_skill', args: { skillId: 'nope' } })
    expect(res.ok).toBe(false)
    expect((res.error as { message: string }).message).toContain('不存在')
  })

  it('缺必填参数/错误键名 → 结构化失败并列出可用参数（M3-A：不再静默空渲染）', async () => {
    const { registry } = setup()
    const miss = await registry.execute({ toolName: 'invoke_skill', args: { skillId: 'skill-1' } })
    expect(miss.ok).toBe(false)
    expect((miss.error as { message: string }).message).toContain('缺少必填参数')
    expect((miss.error as { message: string }).message).toContain('topic')

    const wrongKey = await registry.execute({
      toolName: 'invoke_skill',
      args: { skillId: 'skill-1', params: { domain: '短视频' } },
    })
    expect(wrongKey.ok).toBe(false)
    expect((wrongKey.error as { message: string }).message).toContain('topic')
  })
})

describe('create_task_plan', () => {
  it('创建成功返回待批准提示，引用进 turnRefs；子系统未装配结构化报错', async () => {
    const { registry } = setup()
    const turn: FakeTurnSink = { turnRefs: [] }
    const res = await registry.execute({ toolName: 'create_task_plan', args: { goal: '调研 X 产出报告' }, context: { turnRefs: turn.turnRefs } })
    expect(res.ok).toBe(true)
    const data = res.data as { rootId: string; status: string; hint: string }
    expect(data.rootId).toBe('root-1')
    expect(data.status).toBe('pending_review')
    expect(data.hint).toContain('批准')
    expect(turn.turnRefs[0].kind).toBe('task_tree')

    // 子系统未装配：结构化失败
    const registry2 = new AgentToolRegistry()
    for (const def of buildSystemAgentToolDefs({ tasks: null, registry: registry2, runService: { startRun: async () => mkRun(), getRunDetail: async () => null }, definitions: { list: async () => ({ items: [], total: 0 }) }, skills: { list: () => [], resolveSkill: () => null }, resolveModel: async () => mkTextModel('x') })) {
      registry2.register(def, { source: 'builtin' })
    }
    const res2 = await registry2.execute({ toolName: 'create_task_plan', args: { goal: 'g' } })
    expect(res2.ok).toBe(false)
  })

  it('runtimeContext.memoryScope → createPlan scope 透传（37 号：L2/L3 记忆产生渠道）', async () => {
    const captured: Array<Record<string, unknown> | undefined> = []
    const { registry } = setup({
      tasks: {
        createPlan: async (_goal: string, opts: { scope?: { bizModule?: string; projectId?: string } } = {}) => {
          captured.push(opts.scope)
          return { id: 'root-2', title: 'EP 制作计划', status: 'pending_review' }
        },
      },
    } as never)
    // EP 宿主形态：runtimeContext.memoryScope 注入（loop 并入 logContext）
    await registry.execute({
      toolName: 'create_task_plan',
      args: { goal: '生成第二集剧本' },
      context: { turnRefs: [], memoryScope: { bizModule: 'episode-production', projectId: 'vp1' } },
    })
    expect(captured[0]).toEqual({ bizModule: 'episode-production', projectId: 'vp1' })

    // 聊天宿主形态：无 memoryScope → 不传 scope（用户级 L1）
    await registry.execute({ toolName: 'create_task_plan', args: { goal: '通用调研' }, context: { turnRefs: [] } })
    expect(captured[1]).toBeUndefined()
  })
})

// ==================== waitForRunTerminal（纯函数直测） ====================

describe('waitForRunTerminal', () => {
  it('终态立即返回详情', async () => {
    const deps = { runService: { startRun: async () => mkRun(), getRunDetail: async () => ({ run: mkRun({ status: 'failed' }), nodeRuns: [] }) } }
    const r = await waitForRunTerminal(deps, 'run-1')
    expect('run' in r && r.run.status === 'failed').toBe(true)
  })

  it('deadline 已过 → 超时注记（不进入轮询体）', async () => {
    let calls = 0
    const deps = {
      clock: () => {
        calls++
        // 第 1 次算 deadline=180000；第 2 次（while 检查）已超 deadline → 不入循环体
        return calls === 1 ? 0 : Number.MAX_SAFE_INTEGER
      },
      runService: { startRun: async () => mkRun(), getRunDetail: async () => ({ run: mkRun(), nodeRuns: [] }) },
    }
    const r = await waitForRunTerminal(deps, 'run-1')
    expect(calls).toBe(2)
    expect('note' in r).toBe(true)
  })

  it('abort 信号 → 即刻返回当前状态', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const deps = { runService: { startRun: async () => mkRun(), getRunDetail: async () => ({ run: mkRun({ status: 'running' }), nodeRuns: [] }) } }
    const r = await waitForRunTerminal(deps, 'run-1', ctrl.signal)
    expect('status' in r && r.status === 'running').toBe(true)
  })
})
