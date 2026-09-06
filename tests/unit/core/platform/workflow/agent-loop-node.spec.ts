/**
 * agent-loop 节点四件套单元测试（12 号 §5.3 / 01 号 §7 / 02 号 M1.4）
 * @module tests/core/platform/workflow/agent-loop-node.spec
 *
 * 覆盖：validateConfig / 直收敛输出形状 / 工具循环 / 白名单与节点级调用预算 /
 * maxIterations·maxDurationMs 护栏 / 审批挂起（E3 waiting_review + 挂起点落盘 +
 * 循环拆解不空转）/ 批准恢复（同参自动放行·注记注入）/ 驳回恢复 / 改参重发再挂起 /
 * 编辑批准 / 恢复态缺失与损坏 / 崩溃重执行（loadState 续跑）/ 流错误 / 并发重入 /
 * harness 未装配 fail-fast / 四件套一致性（catalog·forms·types）/ 引擎 E3 端到端。
 *
 * LLM 桩：ai/test MockLanguageModelV3（真实 streamText 路径，同 agent-runtime 套件）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import type { LanguageModel } from 'ai'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import type { AgentLoopState } from '@core/platform/agent-runtime/types'
import {
  AGENT_LOOP_NODE_HANDLER,
  registerAgentLoopHarness,
  resetAgentLoopHarness,
  type AgentLoopNodeConfig,
} from '@core/platform/workflow/nodes/agent-loop-node'
import type { WorkflowNodeContext, WorkflowNodeHandler } from '@core/platform/workflow/engine/node-handler'
import { NODE_TYPE_CATALOG_MAP } from '@shared/types/workflow-node-catalog'
import { NODE_CONFIG_FORMS } from '@shared/types/workflow-node-forms'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'
import { toolCallChunks as toolParts, txtChunks as txt, mockUsage } from '../agent-runtime/helpers'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ==================== 桩：ctx / 工具 / 模型 ====================

interface CtxOverrides {
  config?: Partial<AgentLoopNodeConfig>
  preloadedState?: unknown
  runId?: string
}

function mkCtx(over: CtxOverrides = {}): WorkflowNodeContext & { saved: unknown[]; progress: Array<[number, string?]>; logs: Array<{ level: string; msg: string }> } {
  const abort = new AbortController()
  const saved: unknown[] = []
  const progress: Array<[number, string?]> = []
  const logs: Array<{ level: string; msg: string }> = []
  return {
    runId: over.runId ?? 'run_1',
    runKey: 'ag1',
    nodeId: 'ag1',
    nodeType: 'agent-loop',
    iterationIndex: 0,
    config: { task: '查资料写摘要', ...over.config } as Record<string, unknown>,
    startInputs: {},
    triggerInfo: {},
    signal: abort.signal,
    logger: {
      debug: (m: string) => logs.push({ level: 'debug', msg: m }),
      info: (m: string) => logs.push({ level: 'info', msg: m }),
      warn: (m: string) => logs.push({ level: 'warn', msg: m }),
      error: (m: string) => logs.push({ level: 'error', msg: m }),
    },
    emitProgress: (p: number, m?: string) => progress.push([p, m]),
    resolveTemplate: <T>(t: string) => t as T,
    getVariable: () => undefined,
    saveState: async (s: unknown) => {
      saved.push(JSON.parse(JSON.stringify(s)))
    },
    loadState: async () => (saved.length > 0 ? saved[saved.length - 1] : over.preloadedState),
    executionKey: `${over.runId ?? 'run_1'}:ag1:0`,
    saved,
    progress,
    logs,
  } as never
}

/** doStream 延迟 ms 的单步 final 模型 */
function delayedModel(ms: number, text: string): LanguageModel {
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async () => {
      await sleep(ms)
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't' },
            { type: 'text-delta', id: 't', delta: text },
            { type: 'text-end', id: 't' },
            { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: mockUsage },
          ],
        }),
      }
    },
  }) as unknown as LanguageModel
}

/** 可变模型槽：测试中途换模型（挂起→恢复两阶段用同一 harness） */
function modelSlot(initial: LanguageModel): { resolveModel: () => Promise<LanguageModel>; set: (m: LanguageModel) => void } {
  return {
    resolveModel: () => Promise.resolve(initial),
    set: (m) => {
      initial = m
    },
  }
}

// ==================== 内置工具装配 ====================

import { registerBuiltinAgentTools, BUILTIN_AGENT_TOOL_NAMES } from '@core/platform/workflow/tools/agent-builtin-tools'

describe('内置工具（首批白名单）', () => {
  it('注册四件：名称/dangerLevel/审批标记符合 14 号取严推导；jsonSchema 派生通过', () => {
    const r = new AgentToolRegistry()
    registerBuiltinAgentTools(r)
    const specs = Object.fromEntries(r.listSpecs().map((x) => [x.name, x]))
    expect(Object.keys(specs).sort()).toEqual([...BUILTIN_AGENT_TOOL_NAMES].sort())
    expect(specs.http_get.dangerLevel).toBe('read')
    expect(specs.http_get.requiresApproval).toBe(false)
    expect(specs.web_search.dangerLevel).toBe('read')
    expect(specs.code_run.dangerLevel).toBe('exec')
    expect(specs.code_run.requiresApproval).toBe(true) // exec 级取严：默认人工批准
    expect(specs.data_table_query.dangerLevel).toBe('read')
    for (const name of BUILTIN_AGENT_TOOL_NAMES) {
      expect(specs[name].jsonSchema.type).toBe('object') // 加载期派生已通过（否则 register 即抛）
    }
  })
})

// ==================== 引擎级 E3 端到端（真实 applyReviewDecision → handler.resume） ====================

import { WorkflowEngineService, type ExecuteRunInput } from '@core/platform/workflow/engine/workflow-engine.service'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import type { WorkflowEngineDeps, WorkflowEventPort, WorkflowRunPort, WorkflowNodeRunPort, EngineNodeRunRow } from '@core/platform/workflow/engine/ports'
import type { WorkflowGraph, WorkflowRunEvent, WorkflowNode } from '@shared/types/workflow.types'
import { runWithUserAsync } from '@core/context/user-context'

class FakeEvents implements WorkflowEventPort {
  emit(_e: WorkflowRunEvent): void {}
}
class FakeRuns implements WorkflowRunPort {
  final: { status?: string; error?: string | null } = {}
  async getById(): Promise<never> { return null as never }
  async patchRun(_id: string, patch: Record<string, unknown>) { Object.assign(this.final, patch) }
}
class FakeNodeRuns implements WorkflowNodeRunPort {
  rows = new Map<string, { status?: string; stateJson?: string | null; output?: unknown; error?: string | null }>()
  async listByRun(): Promise<EngineNodeRunRow[]> { return [] }
  async startNode(n: { nodeId: string; iterationIndex: number }) { this.rows.set(`${n.nodeId}:${n.iterationIndex}`, { status: 'running' }) }
  async patchNode(_r: string, nodeId: string, iterationIndex: number, patch: Record<string, unknown>) {
    const key = `${nodeId}:${iterationIndex}`
    const cur = this.rows.get(key) ?? {}; Object.assign(cur, patch); this.rows.set(key, cur)
  }
}

describe('引擎级 E3：run 挂起 → resumeReview 批准 → 从挂起轮续跑收敛', () => {
  it('start → agent-loop(危险工具挂起) → 审核批准 → run succeeded', async () => {
    const runs = new FakeRuns()
    const nodeRuns = new FakeNodeRuns()
    const engine = new WorkflowEngineService(
      { runs, nodeRuns, events: new FakeEvents(), journal: null } as unknown as WorkflowEngineDeps,
      createNodeRegistry([...CONTROL_NODE_HANDLERS, AGENT_LOOP_NODE_HANDLER] as never),
    )
    const graph = {
      nodes: [
        { id: 's1', type: 'start', config: {}, position: { x: 0, y: 0 } },
        { id: 'ag1', type: 'agent-loop', config: { task: '整理资料', toolWhitelist: ['danger_tool'] }, position: { x: 0, y: 0 } },
        { id: 'e1', type: 'end', config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e0', sourceNodeId: 's1', targetNodeId: 'ag1', kind: 'normal' },
        { id: 'e1', sourceNodeId: 'ag1', targetNodeId: 'e1', kind: 'normal' },
      ],
    } as unknown as WorkflowGraph
    const input: ExecuteRunInput = { runId: 'run_e2e', userId: 'u1', definitionId: 'd1', graph, startInputs: {} }

    // 第一阶段：危险工具 → 挂起
    slot.set(stepsModel([
      () => toolParts('c1', 'danger_tool', { q: '删除临时文件' }),
      () => txt('不应到达'),
    ]))
    const s1 = await runWithUserAsync('u1', async () => {
      const st = await engine.execute(input)
      await sleep(60)
      return st
    })
    expect(s1).toBe('waiting_review')
    expect(dangerExecuted).toEqual([])

    // 第二阶段：批准 → 重发同调用自动放行 → 收敛
    slot.set(stepsModel([
      () => toolParts('c2', 'danger_tool', { q: '删除临时文件' }),
      () => txt('批准后整理完成'),
    ]))
    await runWithUserAsync('u1', async () => {
      expect(await engine.resumeReview('run_e2e', 'ag1', { decision: 'approve' })).toBe(true)
      await sleep(120)
    })
    expect(runs.final.status).toBe('succeeded')
    expect(dangerExecuted).toEqual([{ q: '删除临时文件' }])
    const row = nodeRuns.rows.get('ag1:0')
    const output = row?.output as { answer?: string } | undefined
    expect(output?.answer).toBe('批准后整理完成')
    void (null as unknown as WorkflowNode)
  })

  it('编辑批准端到端：引擎 editableFields 白名单放行 → grant 以编辑版入参执行（P1-1）', async () => {
    const runs = new FakeRuns()
    const nodeRuns = new FakeNodeRuns()
    const engine = new WorkflowEngineService(
      { runs, nodeRuns, events: new FakeEvents(), journal: null } as unknown as WorkflowEngineDeps,
      createNodeRegistry([...CONTROL_NODE_HANDLERS, AGENT_LOOP_NODE_HANDLER] as never),
    )
    const graph = {
      nodes: [
        { id: 's1', type: 'start', config: {}, position: { x: 0, y: 0 } },
        {
          id: 'ag1', type: 'agent-loop', position: { x: 0, y: 0 },
          // editableFields 必须声明——引擎 applyReviewDecision 以此过滤 editedValues
          config: {
            task: '整理资料', toolWhitelist: ['danger_tool'],
            editableFields: [{ key: 'input', label: '工具入参', type: 'json' }],
          },
        },
        { id: 'e1', type: 'end', config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e0', sourceNodeId: 's1', targetNodeId: 'ag1', kind: 'normal' },
        { id: 'e1', sourceNodeId: 'ag1', targetNodeId: 'e1', kind: 'normal' },
      ],
    } as unknown as WorkflowGraph
    const input: ExecuteRunInput = { runId: 'run_edit', userId: 'u1', definitionId: 'd1', graph, startInputs: {} }

    slot.set(stepsModel([
      () => toolParts('c1', 'danger_tool', { q: '原始危险参数' }),
      () => txt('不应到达'),
    ]))
    const s1 = await runWithUserAsync('u1', async () => {
      const st = await engine.execute(input)
      await sleep(60)
      return st
    })
    expect(s1).toBe('waiting_review')

    slot.set(stepsModel([
      () => toolParts('c2', 'danger_tool', { q: '原始危险参数' }),
      () => txt('按编辑版执行完成'),
    ]))
    await runWithUserAsync('u1', async () => {
      expect(
        await engine.resumeReview('run_edit', 'ag1', {
          decision: 'approve_with_changes',
          editedValues: { input: { q: '审核员改的安全参数' } },
        }),
      ).toBe(true)
      await sleep(120)
    })
    expect(runs.final.status).toBe('succeeded')
    expect(dangerExecuted).toEqual([{ q: '审核员改的安全参数' }]) // 编辑值未被引擎滤空
  })

  it('resume 续跑 config 模板解析：systemPrompt 的 {{start.topic}} 不再裸奔（P1-3）', async () => {
    const runs = new FakeRuns()
    const nodeRuns = new FakeNodeRuns()
    const engine = new WorkflowEngineService(
      { runs, nodeRuns, events: new FakeEvents(), journal: null } as unknown as WorkflowEngineDeps,
      createNodeRegistry([...CONTROL_NODE_HANDLERS, AGENT_LOOP_NODE_HANDLER] as never),
    )
    const graph = {
      nodes: [
        { id: 's1', type: 'start', config: {}, position: { x: 0, y: 0 } },
        {
          id: 'ag1', type: 'agent-loop', position: { x: 0, y: 0 },
          config: { task: '写{{start.topic}}摘要', systemPrompt: '你是{{start.topic}}研究员', toolWhitelist: ['danger_tool'] },
        },
        { id: 'e1', type: 'end', config: {}, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e0', sourceNodeId: 's1', targetNodeId: 'ag1', kind: 'normal' },
        { id: 'e1', sourceNodeId: 'ag1', targetNodeId: 'e1', kind: 'normal' },
      ],
    } as unknown as WorkflowGraph
    const input: ExecuteRunInput = { runId: 'run_tpl', userId: 'u1', definitionId: 'd1', graph, startInputs: { topic: '量子计算' } }

    const prompts: unknown[][] = []
    slot.set(captureModel(prompts, [
      () => toolParts('c1', 'danger_tool', { q: 'x' }),
      () => txt('不应到达'),
    ]))
    const s1 = await runWithUserAsync('u1', async () => {
      const st = await engine.execute(input)
      await sleep(60)
      return st
    })
    expect(s1).toBe('waiting_review')
    expect(JSON.stringify(prompts[0])).toContain('量子计算研究员') // 挂起前已解析

    prompts.length = 0
    slot.set(captureModel(prompts, [
      () => toolParts('c2', 'danger_tool', { q: 'x' }),
      () => txt('解析正确完成'),
    ]))
    await runWithUserAsync('u1', async () => {
      expect(await engine.resumeReview('run_tpl', 'ag1', { decision: 'approve' })).toBe(true)
      await sleep(120)
    })
    expect(runs.final.status).toBe('succeeded')
    const phase2 = JSON.stringify(prompts)
    expect(phase2).toContain('量子计算研究员') // 恢复段同样解析
    expect(phase2).not.toContain('{{start.topic}}')
  })
})

// ==================== harness 装配 ====================

let registry: AgentToolRegistry
let echoExecuted: Array<unknown>
let dangerExecuted: Array<unknown>
let slot: ReturnType<typeof modelSlot>

function mkTool(over: Partial<AgentToolDef> & { name: string; sink?: Array<unknown> }): AgentToolDef {
  const sink = over.sink ?? echoExecuted
  return {
    description: '测试工具',
    inputSchema: z.object({ q: z.string() }),
    execute: async (input: unknown) => {
      sink.push(input)
      return { echo: input }
    },
    ...over,
  } as AgentToolDef
}

beforeEach(() => {
  registry = new AgentToolRegistry()
  echoExecuted = []
  dangerExecuted = []
  registry.register(mkTool({ name: 'echo_tool', sink: echoExecuted }))
  registry.register(
    mkTool({ name: 'danger_tool', sink: dangerExecuted, requiresApproval: true, description: '危险操作' }),
  )
  slot = modelSlot(delayedModel(0, 'placeholder'))
  registerAgentLoopHarness({ registry, resolveModel: () => slot.resolveModel() as never })
})

afterEach(() => {
  resetAgentLoopHarness()
})

// ==================== validateConfig ====================

describe('validateConfig', () => {
  const v = (c: Partial<AgentLoopNodeConfig>) => AGENT_LOOP_NODE_HANDLER.validateConfig(c as never)

  it('task 空 → 报错；护栏数值边界校验', () => {
    expect(v({ task: '' })).toEqual(['任务目标不能为空'])
    expect(v({ task: 'x', maxIterations: 0 }).join()).toContain('maxIterations')
    expect(v({ task: 'x', maxIterations: 501 }).join()).toContain('maxIterations')
    expect(v({ task: 'x', maxToolCalls: 0 }).join()).toContain('maxToolCalls')
    expect(v({ task: 'x', maxDurationMs: -1 }).join()).toContain('maxDurationMs')
    expect(v({ task: 'x', toolWhitelist: ['a', 'a'] }).join()).toContain('重复')
    expect(v({ task: 'x', toolWhitelist: ['a', ''] }).join()).toContain('空工具名')
    expect(v({ task: 'x' })).toEqual([])
  })
})

// ==================== 执行：收敛 / 工具循环 / 护栏 ====================

describe('execute', () => {
  it('直收敛：一步 final → succeeded，输出五字段 + 初始态落盘', async () => {
    slot.set(singleStepModel(txt('最终答案')))
    const ctx = mkCtx({})
    const r = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(r).toMatchObject({
      status: 'succeeded',
      output: {
        answer: '最终答案',
        iterations: 0,
        stopReason: 'final',
        usage: { promptTokens: 10, completionTokens: 5, toolCalls: 0 },
      },
    })
    const out = (r as { output: Record<string, unknown> }).output
    expect(out.trajectoriesSummary).toMatchObject({ entries: expect.any(Number), byKind: { decision: 1, final: 1 } })
    // 首步前初始态 + final 收敛态
    expect(ctx.saved.length).toBe(2)
    expect((ctx.saved[1] as AgentLoopState).converged).toBe(true)
  })

  it('工具循环：白名单内工具执行两轮后收敛；trajectory 计数进输出', async () => {
    slot.set(stepsModel([
      () => toolParts('c1', 'echo_tool', { q: '一' }),
      () => toolParts('c2', 'echo_tool', { q: '二' }),
      () => txt('查完了'),
    ]))
    const ctx = mkCtx({ config: { toolWhitelist: ['echo_tool'] } })
    const r = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(r.status).toBe('succeeded')
    expect(echoExecuted).toEqual([{ q: '一' }, { q: '二' }])
    const out = (r as { output: Record<string, unknown> }).output
    expect((out.trajectoriesSummary as { toolCalls: Record<string, number> }).toolCalls).toEqual({ echo_tool: 2 })
    expect(out.usage).toMatchObject({ toolCalls: 2 })
  })

  it('节点级 maxToolCalls 预算：第二次调用回填 LIMIT_EXCEEDED，模型直接作答仍 succeeded', async () => {
    slot.set(stepsModel([
      () => toolParts('c1', 'echo_tool', { q: '一' }),
      () => toolParts('c2', 'echo_tool', { q: '二' }),
      () => txt('额度没了直接答'),
    ]))
    const ctx = mkCtx({ config: { toolWhitelist: ['echo_tool'], maxToolCalls: 1 } })
    const r = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(r.status).toBe('succeeded')
    expect((r as { output: { answer: string } }).output.answer).toBe('额度没了直接答')
    expect(echoExecuted).toEqual([{ q: '一' }]) // 预算只放行第一次
  })

  it('maxIterations 护栏：不收敛 → failed 干净终止并给原因（retryable=false）', async () => {
    slot.set(stepsModel([
      () => toolParts('c1', 'echo_tool', { q: 'a' }),
      () => toolParts('c2', 'echo_tool', { q: 'b' }),
    ]))
    const ctx = mkCtx({ config: { toolWhitelist: ['echo_tool'], maxIterations: 2 } })
    const r = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(r).toMatchObject({ status: 'failed', retryable: false })
    expect((r as { error: string }).error).toContain('最大迭代上限')
    expect((r as { error: string }).error).toContain('2')
  })

  it('maxDurationMs 护栏：步执行中超时 → aborted → failed 时长护栏（非"已取消"）', async () => {
    slot.set(delayedModel(120, '慢慢答'))
    const ctx = mkCtx({ config: { maxDurationMs: 25 } })
    const r = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(r.status).toBe('failed')
    expect((r as { error: string }).error).toContain('时长护栏')
  })

  it('模型流 error：failed 且 retryable=true（瞬时故障可重试，重试将从落盘步续跑）', async () => {
    slot.set(new MockLanguageModelV3({
      provider: 'test',
      modelId: 'mock',
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't' },
            { type: 'text-delta', id: 't', delta: '半截' },
            { type: 'text-end', id: 't' },
            { type: 'error', error: new Error('provider 500') },
          ],
        }),
      }),
    }) as unknown as LanguageModel)
    const r = await AGENT_LOOP_NODE_HANDLER.execute(mkCtx({}))
    expect(r).toMatchObject({ status: 'failed', retryable: true })
    expect((r as { error: string }).error).toContain('provider 500')
  })

  it('崩溃重执行：loadState 预载中盘状态 → 从既有 messages 续跑不重放任务', async () => {
    const prompts: unknown[][] = []
    slot.set(captureModel(prompts, [() => txt('续跑答案')]))
    const midState: AgentLoopState = {
      version: 1,
      task: { definitionId: 'workflow:agent-loop', scopeId: 'run_1:ag1:0', input: '查资料写摘要', maxSteps: 20, toolNames: ['echo_tool'] },
      messages: [
        { role: 'user', content: '查资料写摘要' },
        { role: 'assistant', content: [{ type: 'text', text: '已查一轮' }] },
      ],
      iteration: 1,
      usage: { promptTokens: 3, completionTokens: 2, toolCalls: 1 },
      startedAtMs: Date.now(),
      converged: false,
      stagnantRounds: 0,
    }
    const ctx = mkCtx({ preloadedState: midState })
    const r = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(r.status).toBe('succeeded')
    // 第二次模型调用的 prompt 含中盘历史（未从零重放）
    expect(JSON.stringify(prompts)).toContain('已查一轮')
  })

  it('并发重入：同 handler 两路 execute 互不串扰（无共享可变执行态）', async () => {
    // 按模型偏好路由各路 mock（providerConfigId 区分），交错完成互不串扰
    const models: Record<string, LanguageModel> = {
      pA: stepsModel([() => toolParts('c1', 'echo_tool', { q: 'A' }), () => txt('A 完成')]),
      pB: stepsModel([() => toolParts('c2', 'echo_tool', { q: 'B' }), () => txt('B 完成')]),
    }
    registerAgentLoopHarness({
      registry,
      resolveModel: (opts?: { providerConfigId?: string }) => Promise.resolve(models[opts?.providerConfigId ?? ''] ?? models.pA),
    })
    const ctxA = mkCtx({ runId: 'runA', config: { toolWhitelist: ['echo_tool'], providerConfigId: 'pA' } })
    const ctxB = mkCtx({ runId: 'runB', config: { toolWhitelist: ['echo_tool'], providerConfigId: 'pB' } })
    const [a, b] = await Promise.all([AGENT_LOOP_NODE_HANDLER.execute(ctxA), AGENT_LOOP_NODE_HANDLER.execute(ctxB)])
    expect((a as { output: { answer: string } }).output.answer).toBe('A 完成')
    expect((b as { output: { answer: string } }).output.answer).toBe('B 完成')
    expect(echoExecuted).toEqual([{ q: 'A' }, { q: 'B' }])
  })

  it('harness 未装配：fail-fast 抛错（装配失败可排障，不静默）', async () => {
    resetAgentLoopHarness()
    await expect(AGENT_LOOP_NODE_HANDLER.execute(mkCtx({}))).rejects.toThrow('agent-loop harness 未装配')
  })
})

// ==================== 审批挂起与恢复（E3） ====================

describe('审批挂起与恢复（E3）', () => {
  async function suspendFirstRound(): Promise<{ ctx: ReturnType<typeof mkCtx>; result: Awaited<ReturnType<WorkflowNodeHandler['execute']>> }> {
    slot.set(stepsModel([
      () => toolParts('c1', 'danger_tool', { q: '删库' }),
      () => txt('不应到达'),
    ]))
    const ctx = mkCtx({ config: { toolWhitelist: ['danger_tool'] } })
    const result = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    return { ctx, result }
  }

  it('挂起：danger 工具 → waiting_review；挂起点落盘；循环拆解后不后台空转', async () => {
    const { ctx, result } = await suspendFirstRound()
    expect(result).toMatchObject({ status: 'waiting_review' })
    const payload = (result as { payload: Record<string, unknown> }).payload
    expect(payload).toMatchObject({ kind: 'tool_approval', tool: 'danger_tool', input: { q: '删库' } })
    // 挂起点已持久化（首步前初始态 saveState 使首轮挂起也可恢复）
    const suspendedState = ctx.saved.find((s) => (s as AgentLoopState).suspended)
    expect(suspendedState).toBeTruthy()
    expect((suspendedState as AgentLoopState).suspended?.requestPayload).toMatchObject({ tool: 'danger_tool' })
    expect(dangerExecuted).toEqual([])
    // 拆解（弃置式）：ai@6 吊住循环 promise（探针实证不再 settle），状态冻结在
    // 挂起点（无 stopReason、无新 saveState），绝无后台空转/危险工具执行
    const countAfterSuspend = ctx.saved.length
    await sleep(80)
    const last = ctx.saved[ctx.saved.length - 1] as AgentLoopState
    expect(last.suspended).toBeTruthy() // 挂起点信息保留（恢复路径依据）
    expect(last.stopReason).toBeUndefined() // 冻结而非 aborted 收场
    expect(ctx.saved.length).toBe(countAfterSuspend)
    expect(dangerExecuted).toEqual([])
  })

  it('挂起状态落库失败：转结构化拒绝（模型改路收敛），节点不卡死', async () => {
    const ctx = mkCtx({ config: { toolWhitelist: ['danger_tool'] } })
    // 挂起写盘失败（如超 512KB 上限）：suspended 写入时抛错
    const origSave = ctx.saveState.bind(ctx)
    ctx.saveState = async (st: unknown) => {
      if ((st as AgentLoopState).suspended) throw new Error('state 超过 512KB 上限')
      return origSave(st)
    }
    const prompts: unknown[][] = []
    slot.set(captureModel(prompts, [
      () => toolParts('c1', 'danger_tool', { q: '删库' }),
      () => txt('审批不可用，我直接给答案'),
    ]))
    const r = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(r.status).toBe('succeeded') // 不卡 running：拒绝回流 → 模型改路
    expect((r as { output: { answer: string } }).output.answer).toBe('审批不可用，我直接给答案')
    expect(dangerExecuted).toEqual([])
    expect(ctx.logs.some((l) => l.level === 'error' && l.msg.includes('挂起状态落库失败'))).toBe(true)
    // P2-2 回归：真实原因（持久化故障）达模型——不再伪装成泛化"用户拒绝"
    const step2 = JSON.stringify(prompts[1] ?? [])
    expect(step2).toContain('挂起状态落库失败')
    expect(step2).toContain('512KB')
  })

  it('批准恢复：模型重发同调用 → 一次性授权自动放行 → 工具执行 → 收敛', async () => {
    const { ctx, result } = await suspendFirstRound()
    expect(result.status).toBe('waiting_review')
    await sleep(50) // 等拆解完成（终态 state 为 engine 将回传的最近 saveState 态）

    const prompts: unknown[][] = []
    slot.set(captureModel(prompts, [
      () => toolParts('c2', 'danger_tool', { q: '删库' }), // 模型重发同一调用
      () => txt('批准后完成'),
    ]))
    const reviewState = ctx.saved[ctx.saved.length - 1]
    const r = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx,
      { decision: 'approve', decidedAt: new Date().toISOString() },
      reviewState,
    )
    expect(r.status).toBe('succeeded')
    expect((r as { output: { answer: string } }).output.answer).toBe('批准后完成')
    expect(dangerExecuted).toEqual([{ q: '删库' }]) // 授权放行且只执行一次
    // 注记注入（恢复后模型可读"人工已确认"）
    expect(JSON.stringify(prompts)).toContain('人工已确认')
  })

  it('驳回恢复：干净终止 human_rejected（12 号 §7-8）→ failed 不可重试，模型不再被调用', async () => {
    const { ctx, result } = await suspendFirstRound()
    expect(result.status).toBe('waiting_review')
    await sleep(50)
    const prompts: unknown[][] = []
    slot.set(captureModel(prompts, [() => txt('不应被调用')]))
    const r = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx,
      { decision: 'reject', comment: '太危险', decidedAt: new Date().toISOString() },
      ctx.saved[ctx.saved.length - 1],
    )
    expect(r).toMatchObject({ status: 'failed', retryable: false })
    expect((r as { error: string }).error).toContain('人工驳回')
    expect(dangerExecuted).toEqual([])
    expect(prompts).toEqual([]) // 不进入下一轮——防固执模型与审核人 ping-pong
  })

  it('批准后模型改参重发：授权不匹配 → 再次挂起（多轮人机交互）', async () => {
    const { ctx, result } = await suspendFirstRound()
    expect(result.status).toBe('waiting_review')
    await sleep(50)
    slot.set(stepsModel([
      () => toolParts('c2', 'danger_tool', { q: '换了个更危险的参数' }),
      () => txt('不应到达'),
    ]))
    const r = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx,
      { decision: 'approve', decidedAt: new Date().toISOString() },
      ctx.saved[ctx.saved.length - 1],
    )
    expect(r.status).toBe('waiting_review')
    expect(dangerExecuted).toEqual([]) // 改参调用未经新批准不执行
  })

  it('编辑批准（approve_with_changes）：审核人改参 → 授权以编辑版入参执行', async () => {
    const { ctx, result } = await suspendFirstRound()
    expect(result.status).toBe('waiting_review')
    await sleep(50)
    slot.set(stepsModel([
      () => toolParts('c2', 'danger_tool', { q: '原参数' }), // 模型仍发原参
      () => txt('按编辑版执行完成'),
    ]))
    const r = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx,
      {
        decision: 'approve_with_changes',
        editedValues: { input: { q: '审核员改过的参数' } },
        decidedAt: new Date().toISOString(),
      },
      ctx.saved[ctx.saved.length - 1],
    )
    expect(r.status).toBe('succeeded')
    expect(dangerExecuted).toEqual([{ q: '审核员改过的参数' }]) // 编辑版覆盖模型入参
  })

  it('timeout_approve 同 approve；timeout_reject 同 reject（引擎超时策略映射）', async () => {
    const { ctx } = await suspendFirstRound()
    await sleep(50)
    slot.set(stepsModel([() => toolParts('c2', 'danger_tool', { q: '删库' }), () => txt('超时视为批准后完成')]))
    const r = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx,
      { decision: 'timeout_approve', decidedAt: new Date().toISOString() },
      ctx.saved[ctx.saved.length - 1],
    )
    expect(r.status).toBe('succeeded')
    expect(dangerExecuted).toEqual([{ q: '删库' }])
  })

  it('maxToolCalls 跨挂起-恢复累计：预算不随续段重置（12 号 §6.4-2）', async () => {
    slot.set(stepsModel([
      () => toolParts('c1', 'echo_tool', { q: '先查' }),
      () => toolParts('c2', 'danger_tool', { q: '删库' }),
      () => txt('不应到达'),
    ]))
    const ctx = mkCtx({ config: { toolWhitelist: ['echo_tool', 'danger_tool'], maxToolCalls: 1 } })
    const suspended = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(suspended.status).toBe('waiting_review')
    await sleep(50)

    // 批准恢复：模型重发 danger——预算已被 echo 用尽 → LIMIT_EXCEEDED 回填 → 模型直接作答
    slot.set(stepsModel([
      () => toolParts('c3', 'danger_tool', { q: '删库' }),
      () => txt('额度已用完，直接给结论'),
    ]))
    const r = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx,
      { decision: 'approve', decidedAt: new Date().toISOString() },
      ctx.saved[ctx.saved.length - 1],
    )
    expect(r.status).toBe('succeeded')
    expect(echoExecuted).toEqual([{ q: '先查' }])
    expect(dangerExecuted).toEqual([]) // 批算尽：人工批准也放不进硬上限
  })

  it('maxDurationMs 恢复段只给剩余净时长：已耗尽 → 立即护栏失败，不再调模型', async () => {
    const prompts: unknown[][] = []
    slot.set(captureModel(prompts, [() => txt('不应被调用')]))
    const state: AgentLoopState = {
      version: 1,
      task: { definitionId: 'workflow:agent-loop', scopeId: 'run_1:ag1:0', input: '查资料', maxSteps: 20, toolNames: ['echo_tool'] },
      messages: [{ role: 'user', content: '查资料' }],
      iteration: 0,
      usage: { promptTokens: 0, completionTokens: 0, toolCalls: 0 },
      startedAtMs: Date.now() - 10_000,
      converged: false,
      stagnantRounds: 0,
      suspended: { requestPayload: { kind: 'tool_approval', tool: 'danger_tool', input: {} }, suspendedAt: new Date().toISOString(), waitMs: 0 },
    }
    const ctx = mkCtx({ config: { maxDurationMs: 1000 } })
    const r = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx, { decision: 'approve', decidedAt: new Date().toISOString() }, state,
    )
    expect(r).toMatchObject({ status: 'failed', retryable: false })
    expect((r as { error: string }).error).toContain('净时长已耗尽')
    expect(prompts).toEqual([])
  })

  it('状态持久化超限（512KB 类失败）：failed 且 retryable=false（重试必再撞上限，不烧钱）', async () => {
    slot.set(stepsModel([
      () => toolParts('c1', 'echo_tool', { q: 'x' }),
      () => txt('不应到达'),
    ]))
    const ctx = mkCtx({ config: { toolWhitelist: ['echo_tool'] } })
    // 初始态写盘成功、步末写盘超限（模拟引擎 state_json 字节上限）
    let calls = 0
    ctx.saveState = async (st: unknown) => {
      calls++
      if (calls > 1) throw new Error('节点状态超限（ag1: 600000 > 524288 字符）——请缩减状态体量或改存引用')
      ctx.saved.push(JSON.parse(JSON.stringify(st)))
    }
    const r = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(r).toMatchObject({ status: 'failed', retryable: false })
    expect((r as { error: string }).error).toContain('节点状态超限')
    expect((r as { error: string }).error).toContain('迭代历史过大')
  })

  it('多轮挂起净时长护栏：等待窗不计入（12 号 §6.2 waitMs 累计回归）', async () => {
    // 第一次挂起
    slot.set(stepsModel([
      () => toolParts('c1', 'danger_tool', { q: '一' }),
      () => txt('不应到达'),
    ]))
    const ctx = mkCtx({ config: { toolWhitelist: ['danger_tool'], maxDurationMs: 60_000 } })
    const s1 = await AGENT_LOOP_NODE_HANDLER.execute(ctx)
    expect(s1.status).toBe('waiting_review')
    await sleep(120) // 人工等待窗 120ms >> maxDurationMs 与否无关——只应被累计扣除

    // 批准 → 重发同调用放行 → 模型再发不同参 → 第二次挂起
    slot.set(stepsModel([
      () => toolParts('c2', 'danger_tool', { q: '一' }),
      () => toolParts('c3', 'danger_tool', { q: '二' }),
      () => txt('不应到达'),
    ]))
    const s2 = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx, { decision: 'approve', decidedAt: new Date().toISOString() }, ctx.saved[ctx.saved.length - 1],
    )
    expect(s2.status).toBe('waiting_review')
    await sleep(120) // 第二次等待
    const st = ctx.saved[ctx.saved.length - 1] as AgentLoopState
    expect(st.suspended).toBeTruthy()
    expect((st.accumulatedWaitMs ?? 0)).toBeGreaterThanOrEqual(100) // 两次等待已累计

    // 第二次批准恢复：净时长 = 总时长 - 累计等待 ≈ 毫秒级，不得误判"已耗尽"
    slot.set(stepsModel([
      () => toolParts('c4', 'danger_tool', { q: '二' }),
      () => txt('两轮批准后完成'),
    ]))
    const r = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx, { decision: 'approve', decidedAt: new Date().toISOString() }, ctx.saved[ctx.saved.length - 1],
    )
    expect(r.status).toBe('succeeded')
    expect((r as { output: { answer: string } }).output.answer).toBe('两轮批准后完成')
  })

  it('恢复态缺失 / 损坏：failed 不可重试（契约：容忍缺失但明确失败）', async () => {
    const ctx = mkCtx({})
    const r1 = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx, { decision: 'approve', decidedAt: new Date().toISOString() }, undefined,
    )
    expect(r1).toMatchObject({ status: 'failed', retryable: false })
    const r2 = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx, { decision: 'approve', decidedAt: new Date().toISOString() }, { version: 9 },
    )
    expect(r2).toMatchObject({ status: 'failed', retryable: false })
    const r3 = await AGENT_LOOP_NODE_HANDLER.resume(
      ctx, { decision: 'approve', decidedAt: new Date().toISOString() },
      { version: 1, task: null, messages: 'oops' } as never,
    )
    expect(r3).toMatchObject({ status: 'failed', retryable: false })
  })
})

// ==================== 四件套一致性 ====================

describe('四件套一致性（catalog / types / forms / handler）', () => {
  it('catalog 条目与 handler 元数据一致（type/controlKind/cancellable/outputSchema）', () => {
    const catalog = NODE_TYPE_CATALOG_MAP['agent-loop']
    expect(catalog).toBeTruthy()
    expect(AGENT_LOOP_NODE_HANDLER.type).toBe('agent-loop')
    expect(AGENT_LOOP_NODE_HANDLER.controlKind).toBe(catalog.controlKind)
    expect(AGENT_LOOP_NODE_HANDLER.cancellable).toBe(catalog.cancellable)
    const handlerKeys = AGENT_LOOP_NODE_HANDLER.outputSchema.map((f) => `${f.key}:${f.type}`).sort()
    const catalogKeys = catalog.outputSchema.map((f) => `${f.key}:${f.type}`).sort()
    expect(handlerKeys).toEqual(catalogKeys)
    expect(AGENT_LOOP_NODE_HANDLER.resume).toBeTruthy() // E3 契约位
  })

  it('类型三处齐备：union（WORKFLOW_NODE_TYPES）+ forms 声明 + catalog 默认配置', () => {
    expect(WORKFLOW_NODE_TYPES['agent-loop']).toBe('agent-loop')
    const forms = NODE_CONFIG_FORMS['agent-loop']
    expect(forms.map((f) => f.key)).toEqual(
      expect.arrayContaining(['task', 'systemPrompt', 'toolWhitelist', 'providerConfigId', 'maxIterations', 'maxToolCalls', 'maxDurationMs']),
    )
    expect(NODE_TYPE_CATALOG_MAP['agent-loop'].defaultConfig).toMatchObject({ task: '' })
    expect(NODE_TYPE_CATALOG_MAP['agent-loop'].requiredConfigKeys).toEqual(['task'])
  })
})

// ==================== 模型桩辅助 ====================

/** 多步模型：每次 doStream 消费一个 chunk 工厂（helpers 风格本地版，避免与 capture 耦合） */
function stepsModel(stepFactories: Array<() => Array<Record<string, unknown>>>): LanguageModel {
  let i = 0
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async () => ({
      stream: simulateReadableStream({ chunks: stepFactories[Math.min(i++, stepFactories.length - 1)]() }),
    }),
  }) as unknown as LanguageModel
}

/** 单步 final 模型 */
function singleStepModel(chunks: Array<Record<string, unknown>>): LanguageModel {
  return stepsModel([() => chunks])
}

/** 带 prompt 捕获的多步模型 */
function captureModel(prompts: unknown[][], stepFactories: Array<() => Array<Record<string, unknown>>>): LanguageModel {
  let i = 0
  return new MockLanguageModelV3({
    provider: 'test',
    modelId: 'mock',
    doStream: async (opts: { prompt?: unknown }) => {
      prompts.push(structuredClone(opts.prompt ?? []))
      return {
        stream: simulateReadableStream({ chunks: stepFactories[Math.min(i++, stepFactories.length - 1)]() }),
      }
    },
  }) as unknown as LanguageModel
}
