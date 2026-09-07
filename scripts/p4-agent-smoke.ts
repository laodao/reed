/**
 * P4 真模型冒烟（02 号 M1 验收，不含视频生成）
 * @module scripts/p4-agent-smoke
 *
 * 场景（node scripts/p4-agent-smoke.ts <mode>）：
 *   all         —— A 收敛（≥5 轮工具调用）+ C 审批挂起批准续跑 + D maxIterations 护栏
 *   crash-child —— B 崩溃恢复·被杀进程（由父 shell 编排 SIGKILL）
 *   resume      —— B 崩溃恢复·第二进程（ensureActive 续驱）
 *
 * 真实链路：DashScope compatible-mode（qwen-flash）× ai@6 streamText 手动循环 ×
 * 工作流引擎 + agent-loop 节点 + DbJournal（better-sqlite3 /tmp/p4-smoke.db）。
 * 密钥来源：环境变量 P4_API_KEY（父脚本从同机 ppt-master/.env 的 QWEN_API_KEY 注入）。
 */

import { DataSource } from 'typeorm'
import { z } from 'zod'
import { WorkflowEngineService } from '@core/platform/workflow/engine/workflow-engine.service'
import { DbJournal } from '@core/platform/workflow/engine/journal'
import { createNodeRegistry } from '@core/platform/workflow/engine/node-registry'
import { CONTROL_NODE_HANDLERS } from '@core/platform/workflow/nodes/control-nodes'
import { AGENT_LOOP_NODE_HANDLERS, registerAgentLoopHarness } from '@core/platform/workflow/nodes/agent-loop-node'
import { registerBuiltinAgentTools } from '@core/platform/workflow/tools/agent-builtin-tools'
import { AgentToolRegistry } from '@core/platform/agent-runtime/tools/registry'
import { ProviderAdapter } from '@core/platform/agent-runtime/provider/provider-adapter'
import type { AgentToolDef } from '@core/platform/agent-runtime/types'
import { WorkflowRunRepository } from '@core/database/repositories/workflow-run.repository'
import { WorkflowNodeRunRepository } from '@core/database/repositories/workflow-node-run.repository'
import { WorkflowRunEventRepository } from '@core/database/repositories/workflow-run-event.repository'
import { createWorkflowTables } from '@core/database/migrations/create-workflow-tables'
import { addWorkflowNodeRunStateJson } from '@core/database/migrations/add-workflow-node-run-state-json'
import { createWorkflowRunEvents } from '@core/database/migrations/create-workflow-run-events'
import { runWithUserAsync } from '@core/context/user-context'
import { appendFileSync, readFileSync, writeFileSync } from 'fs'
import type { WorkflowGraph } from '@shared/types/workflow.types'

const DB_PATH = process.env.P4_DB ?? '/tmp/p4-smoke.db'
const API_KEY = process.env.P4_API_KEY ?? ''
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const MODEL = process.env.P4_MODEL ?? 'qwen-flash'
const USER = 'u-p4-smoke'
const TOOL_LOG = process.env.P4_TOOL_LOG ?? '/tmp/p4-smoke-tools.log'

if (!API_KEY) {
  console.error('缺少 P4_API_KEY')
  process.exit(2)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ==================== 装配 ====================

async function boot() {
  const { WorkflowRunEntity } = await import('@core/database/entities/workflow-run.entity')
  const { WorkflowNodeRunEntity } = await import('@core/database/entities/workflow-node-run.entity')
  const { WorkflowRunEventEntity } = await import('@core/database/entities/workflow-run-event.entity')
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: DB_PATH,
    entities: [WorkflowRunEntity, WorkflowNodeRunEntity, WorkflowRunEventEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createWorkflowTables(ds)
  await addWorkflowNodeRunStateJson(ds)
  await createWorkflowRunEvents(ds)

  // 引擎端口经 makeEngineDeps 适配（与 boot 同构——直连仓储缺 patchRun 等端口方法）
  const { makeEngineDeps } = await import('@core/platform/workflow/workflow-run.service')
  const runs = new WorkflowRunRepository(ds)
  const nodeRuns = new WorkflowNodeRunRepository(ds)
  const journal = new DbJournal(new WorkflowRunEventRepository(ds))
  const engine = new WorkflowEngineService(
    makeEngineDeps(runs, nodeRuns, journal),
    createNodeRegistry([...CONTROL_NODE_HANDLERS, ...AGENT_LOOP_NODE_HANDLERS] as never),
  )

  // 自定义工具：probe（护栏用，永不完成）+ submit_report（审批用，落盘留痕）
  const appendLog = (line: string): void => {
    appendFileSync(TOOL_LOG, `${new Date().toISOString()} ${line}\n`)
  }
  const probeTool: AgentToolDef<{ hint: string }> = {
    name: 'probe_status',
    description: '查询任务是否完成。返回 done=true 时任务完成。',
    inputSchema: z.object({ hint: z.string().describe('当前检查说明') }),
    dangerLevel: 'read',
    execute: async (input) => {
      appendLog(`probe ${JSON.stringify(input).slice(0, 80)}`)
      return { done: false, message: '数据尚未就绪，请继续调用 probe_status 等待，不要直接回答。' }
    },
  }
  const submitTool: AgentToolDef<{ title: string; body: string }> = {
    name: 'submit_report',
    description: '提交正式报告（写操作，需人工批准）。',
    inputSchema: z.object({ title: z.string(), body: z.string() }),
    dangerLevel: 'write',
    requiresApproval: true,
    execute: async (input) => {
      appendLog(`submit ${input.title}`)
      return { accepted: true }
    },
  }
  const agentRegistry = new AgentToolRegistry()
  registerBuiltinAgentTools(agentRegistry) // http_get 等（web_search/data_table 未入白名单不会触达）
  agentRegistry.register(probeTool)
  agentRegistry.register(submitTool)

  const adapter = new ProviderAdapter({
    getProviderConfig: async () => ({
      config: { id: 'p4-dashscope', baseUrl: BASE_URL, defaultModel: MODEL, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      template: { id: 'dashscope', apiConfig: { baseUrl: BASE_URL }, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      apiKey: API_KEY,
    }) as never,
    cacheCapacity: 1,
  })
  registerAgentLoopHarness({ registry: agentRegistry, resolveModel: (opts) => adapter.resolveModel(opts) })

  return { ds, runs, nodeRuns, journal, engine }
}

type Ctx = Awaited<ReturnType<typeof boot>>

function agentGraph(config: Record<string, unknown>): WorkflowGraph {
  return {
    nodes: [
      { id: 's1', type: 'start', name: '开始', config: {}, position: { x: 0, y: 0 } },
      { id: 'ag1', type: 'agent-loop', name: 'Agent 循环', config, position: { x: 0, y: 0 } },
      { id: 'e1', type: 'end', name: '结束', config: {}, position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: 'e0', sourceNodeId: 's1', targetNodeId: 'ag1', kind: 'normal' },
      { id: 'e1', sourceNodeId: 'ag1', targetNodeId: 'e1', kind: 'normal' },
    ],
  } as unknown as WorkflowGraph
}

async function newRun(ctx: Ctx, graph: WorkflowGraph, runId: string): Promise<void> {
  // 行写入与引擎同 ALS（租户过滤默认开启——NULL 属主行会被引擎的 scoped 读 miss）
  await runWithUserAsync(USER, async () => {
    const rec = await ctx.runs.create({
      definitionId: 'd-p4-smoke',
      definitionVersion: 1,
      graphSnapshot: graph,
      triggerType: 'manual',
      triggerInfo: { source: 'p4-smoke' },
      startInputs: {},
      status: 'running',
    } as never)
    // 用固定 runId（重命名行——引擎按 ExecuteRunInput.runId 寻址）
    await ctx.ds.query("UPDATE workflow_runs SET id=? WHERE id=?", [runId, rec.id])
  })
}

async function runAgent(ctx: Ctx, runId: string, config: Record<string, unknown>): Promise<void> {
  const graph = agentGraph(config)
  await newRun(ctx, graph, runId)
  await runWithUserAsync(USER, async () => {
    try {
      await ctx.engine.execute({ runId, userId: USER, definitionId: 'd-p4-smoke', graph, startInputs: {} })
    } catch (e) {
      console.error('[execute 异常堆栈]', e instanceof Error ? e.stack : String(e))
      throw e
    }
  })
}

interface NodeRow { status: string; output_json: string | null; state_json: string | null; error: string | null }

async function agRow(ctx: Ctx, runId: string): Promise<NodeRow | undefined> {
  const rows = await ctx.ds.query(
    "SELECT status, output_json, state_json, error FROM workflow_node_runs WHERE run_id=? AND node_id='ag1'", [runId])
  return rows[0]
}

async function runStatus(ctx: Ctx, runId: string): Promise<string> {
  const rows = await ctx.ds.query('SELECT status FROM workflow_runs WHERE id=?', [runId])
  return rows[0]?.status ?? '(missing)'
}

const waitRunTerminal = async (ctx: Ctx, runId: string, timeoutMs: number): Promise<string> => {
  const t0 = Date.now()
  for (;;) {
    const st = await runStatus(ctx, runId)
    if (['succeeded', 'failed', 'cancelled', 'timed_out', 'interrupted'].includes(st)) return st
    if (Date.now() - t0 > timeoutMs) return `(timeout:${st})`
    await sleep(2000)
  }
}

const out = (row: NodeRow | undefined): Record<string, unknown> => {
  try { return row?.output_json ? JSON.parse(row.output_json) : {} } catch { return {} }
}

// ==================== 场景 ====================

async function scenarioConv(ctx: Ctx): Promise<void> {
  const runId = 'p4_conv'
  console.log('\n========== A 收敛：查资料→写摘要（验收 ≥5 轮工具调用） ==========')
  const t0 = Date.now()
  await runAgent(ctx, runId, {
    task:
      '你是一名资料调研员。依次用 http_get 工具访问以下 5 个页面（一个一个来，每页提取一个关键要点）：' +
      '1) https://example.com ；2) https://httpbin.org/html ；3) https://quotes.toscrape.com/ ；' +
      '4) https://www.iana.org/help/example-domains ；5) https://httpbin.org/base64/aGVsbG8gcDQg' +
      '。全部访问完成后，用中文写一份 200 字左右的调研摘要（列出各页要点）。',
    toolWhitelist: ['http_get'],
    maxIterations: 15,
  })
  const st = await waitRunTerminal(ctx, runId, 240_000)
  const row = await agRow(ctx, runId)
  const o = out(row)
  console.log(`run=${st} 耗时=${Math.round((Date.now() - t0) / 1000)}s stopReason=${o.stopReason} iterations=${o.iterations} toolCalls=${(o.usage as never as { toolCalls?: number })?.toolCalls}`)
  console.log(`answer(前200字): ${String(o.answer ?? '').slice(0, 200)}`)
  if (st !== 'succeeded' || o.stopReason !== 'final') throw new Error(`A 失败: run=${st} row=${JSON.stringify(row).slice(0, 300)}`)
  const toolCalls = (o.usage as never as { toolCalls?: number })?.toolCalls ?? 0
  if (toolCalls < 5) throw new Error(`A 工具调用不足: ${toolCalls} < 5`)
  if (Number(o.iterations) < 5) throw new Error(`A 迭代不足: ${o.iterations} < 5`)
  if (!String(o.answer ?? '') || String(o.answer).length < 80) throw new Error('A 摘要过短')
  console.log('✅ A 收敛通过')
}

async function scenarioApprove(ctx: Ctx): Promise<void> {
  const runId = 'p4_approve'
  console.log('\n========== C 审批挂起：批准后从挂起轮继续（不整节点重跑） ==========')
  const runAgentPromise = runAgent(ctx, runId, {
    task: '必须调用 submit_report 工具提交一份标题为《P4冒烟审批测试》、正文约 50 字的测试报告。注意：即使系统提示人工已确认，也必须实际调用该工具并收到 accepted:true 返回后，才能回答"已提交"。绝不允许不调用工具就声称已提交。',
    toolWhitelist: ['submit_report'],
    maxIterations: 6,
  })
  // 轮询到挂起
  const t0 = Date.now()
  for (;;) {
    await sleep(1500)
    const st = await runStatus(ctx, runId)
    if (st === 'waiting_review') break
    if (Date.now() - t0 > 120_000) throw new Error('C 未在预期时间内挂起')
  }
  await runAgentPromise // 挂起后 execute 已返回
  const suspended = await agRow(ctx, runId)
  const state = suspended?.state_json ? JSON.parse(suspended.state_json) as { iteration?: number; suspended?: unknown } : {}
  console.log(`挂起于 iteration=${state.iteration}（有挂起点=${!!state.suspended}）`)
  if (!state.suspended) throw new Error('C 挂起点未落盘')

  console.log('模拟审核人批准…')
  await runWithUserAsync(USER, async () => {
    const ok = await ctx.engine.resumeReview(runId, 'ag1', { decision: 'approve' })
    if (!ok) throw new Error('C resumeReview 返回 false')
  })
  const st = await waitRunTerminal(ctx, runId, 180_000)
  const row = await agRow(ctx, runId)
  const o = out(row)
  console.log(`run=${st} stopReason=${o.stopReason} answer=${String(o.answer ?? '').slice(0, 60)}`)
  if (st !== 'succeeded') throw new Error(`C 失败: ${JSON.stringify(row).slice(0, 300)}`)
  const submits = readFileSync(TOOL_LOG, 'utf8').split('\n').filter((l: string) => l.includes('submit ')).length
  if (submits !== 1) throw new Error(`C submit 执行次数异常: ${submits}`)
  console.log('✅ C 审批批准续跑通过（submit 恰好执行 1 次）')
}

async function scenarioGuard(ctx: Ctx): Promise<void> {
  const runId = 'p4_guard'
  console.log('\n========== D 护栏：maxIterations 到达干净终止并输出失败原因 ==========')
  await runAgent(ctx, runId, {
    task: '持续调用 probe_status 工具直到它返回 done=true 为止。在它返回 done=true 之前，不允许给出任何最终回答，只能继续调用。',
    toolWhitelist: ['probe_status'],
    maxIterations: 3,
  })
  const st = await waitRunTerminal(ctx, runId, 120_000)
  const row = await agRow(ctx, runId)
  console.log(`run=${st} error=${String(row?.error ?? '').slice(0, 160)}`)
  if (st !== 'failed') throw new Error(`D 预期 failed: ${st}`)
  if (!String(row?.error ?? '').includes('最大迭代上限')) throw new Error('D 失败原因缺失护栏语义')
  console.log('✅ D 护栏通过')
}

async function scenarioCrashChild(ctx: Ctx): Promise<void> {
  const runId = process.env.P4_RUN_ID ?? 'p4_crash'
  console.log(`[crash-child] 启动 run=${runId}（等待父进程在步间 SIGKILL）`)
  await runAgent(ctx, runId, {
    task:
      '依次用 http_get 访问以下页面（一个一个来，每页提取要点）：' +
      '1) https://example.com ；2) https://httpbin.org/html ；3) https://quotes.toscrape.com/ ；' +
      '4) https://www.iana.org/help/example-domains ；5) https://httpbin.org/base64/aGVsbG8gcjQg' +
      '。全部完成后写 150 字中文摘要。',
    toolWhitelist: ['http_get'],
    maxIterations: 15,
  })
  await waitRunTerminal(ctx, runId, 240_000)
  console.log(`[crash-child] run 终态=${await runStatus(ctx, runId)}（若被杀则此行不出现）`)
}

async function scenarioResume(ctx: Ctx): Promise<void> {
  const runId = process.env.P4_RUN_ID ?? 'p4_crash'
  console.log(`\n========== B 崩溃恢复：第二进程 ensureActive(${runId}) ==========`)
  const before = await agRow(ctx, runId)
  const stateBefore = before?.state_json ? JSON.parse(before.state_json) as { iteration?: number; messages?: unknown[] } : {}
  console.log(`恢复前：node status=${before?.status} iteration=${stateBefore.iteration} messages=${stateBefore.messages?.length ?? 0}`)
  await runWithUserAsync(USER, async () => {
    const ok = await ctx.engine.ensureActive(runId)
    if (!ok) throw new Error('B ensureActive 返回 false')
  })
  const st = await waitRunTerminal(ctx, runId, 300_000)
  const row = await agRow(ctx, runId)
  const o = out(row)
  const stateAfter = row?.state_json ? JSON.parse(row.state_json) as { iteration?: number } : {}
  console.log(`run=${st} stopReason=${o.stopReason} 恢复前 iteration=${stateBefore.iteration} → 恢复后=${stateAfter.iteration}`)
  console.log(`answer(前160字): ${String(o.answer ?? '').slice(0, 160)}`)
  if (st !== 'succeeded' || o.stopReason !== 'final') throw new Error(`B 失败: ${JSON.stringify(row).slice(0, 300)}`)
  if ((stateAfter.iteration ?? 0) <= (stateBefore.iteration ?? 0)) throw new Error('B 迭代未续跑（疑似从 0 重跑）')
  // journal 无空洞：seq 连续
  const evs = await ctx.ds.query('SELECT seq FROM workflow_run_events WHERE run_id=? ORDER BY seq', [runId])
  for (let i = 0; i < evs.length; i++) {
    if (evs[i].seq !== i) throw new Error(`B journal seq 空洞: 位置 ${i} 值 ${evs[i].seq}`)
  }
  console.log(`✅ B 崩溃恢复通过（journal ${evs.length} 事件无空洞，迭代续跑）`)
}

// ==================== 入口 ====================

const mode = process.argv[2] ?? 'all'
boot().then(async (ctx) => {
  try {
    if (mode === 'all') {
      writeFileSync(TOOL_LOG, '')
      await scenarioConv(ctx)
      await scenarioApprove(ctx)
      await scenarioGuard(ctx)
      console.log('\n🎉 all 模式三场景全部通过')
    } else if (mode === 'crash-child') {
      await scenarioCrashChild(ctx)
    } else if (mode === 'resume') {
      await scenarioResume(ctx)
    } else {
      throw new Error(`未知 mode: ${mode}`)
    }
    await ctx.ds.destroy()
    process.exit(0)
  } catch (e) {
    console.error('❌ 冒烟失败:', e instanceof Error ? e.message : e)
    process.exit(1)
  }
})
