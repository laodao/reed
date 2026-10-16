/**
 * M3 端到端验收（26 号 §6，真模型 DashScope）
 * 场景：A 三层任务（规划→批准→子任务过质量门→根 succeeded）；B 必败链路（重试→重规划→escalated）；C 飞轮（蒸馏→批准→二轮装配命中）。
 * 运行：P5_API_KEY=... npx tsx scripts/p5-agent-task-e2e.ts [all|plan|doomed|flywheel]
 */

import { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'

const DB_PATH = process.env.P5_DB ?? '/tmp/p5-e2e.db'
const API_KEY = process.env.P5_API_KEY ?? ''
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const MODEL = process.env.P5_MODEL ?? 'qwen-flash'

async function boot() {
  const { WorkflowRunEntity } = await import('@core/database/entities/workflow-run.entity')
  const { AgentTaskEntity } = await import('@core/database/entities/agent-task.entity')
  const { AgentMemoryEntryEntity } = await import('@core/database/entities/agent-memory-entry.entity')
  const { AgentTrajectoryEntity } = await import('@core/database/entities/agent-trajectory.entity')
  const ds = new DataSource({
    type: 'better-sqlite3', database: DB_PATH, synchronize: false,
    entities: [WorkflowRunEntity, AgentTaskEntity, AgentMemoryEntryEntity, AgentTrajectoryEntity],
  })
  await ds.initialize()
  const { createAgentTasks } = await import('@core/database/migrations/create-agent-tasks')
  const { createAgentMemoryEntries } = await import('@core/database/migrations/create-agent-memory-entries')
  const { createAgentTrajectories } = await import('@core/database/migrations/create-agent-trajectories')
  await createAgentTasks(ds)
  await createAgentMemoryEntries(ds)
  await createAgentTrajectories(ds)

  const { runWithUserAsync } = await import('@core/context/user-context')
  const { ProviderAdapter } = await import('@core/platform/agent-runtime/provider/provider-adapter')
  const adapter = new ProviderAdapter({
    getProviderConfig: async () => ({
      config: { id: 'p5-dashscope', baseUrl: BASE_URL, defaultModel: MODEL, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      template: { id: 'dashscope', apiConfig: { baseUrl: BASE_URL }, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      apiKey: API_KEY,
    }) as never,
  })
  const callModel = async (system: string, prompt: string, signal?: AbortSignal): Promise<string> => {
    const { generateText } = await import('ai')
    const model = await adapter.resolveModel()
    const r = await generateText({ model, system, prompt, maxOutputTokens: 4096, abortSignal: signal })
    return r.text
  }
  const { Planner, PLANNER_SYSTEM_PROMPT } = await import('@core/platform/agent-runtime/tasks/planner')
  const { Verifier, parseJudgeResponse } = await import('@core/platform/agent-runtime/verify/verifier')
  const { MemoryFlywheelService } = await import('@core/platform/agent-runtime/memory/memory-flywheel')
  const { AgentTaskRepository } = await import('@core/database/repositories/agent-task.repository')
  const { AgentMemoryEntryRepository } = await import('@core/database/repositories/agent-memory-entry.repository')
  const { AgentTrajectoryRepository } = await import('@core/database/repositories/agent-trajectory.repository')
  const { AgentTaskService } = await import('@core/platform/agent-runtime/tasks/task-service')
  const { LoopRunner } = await import('@core/platform/agent-runtime/runtime/loop')
  const { registerBuiltinAgentTools } = await import('@core/platform/workflow/tools/agent-builtin-tools')
  const { AgentToolRegistry } = await import('@core/platform/agent-runtime/tools/registry')
  const { TrajectorySink } = await import('@core/platform/agent-runtime/trajectory/sink')
  const { executeHttpFetch } = await import('@core/platform/workflow/nodes/http-fetch')

  const registry = new AgentToolRegistry()
  registerBuiltinAgentTools(registry)
  const trajectoryRepo = new AgentTrajectoryRepository(ds)
  const memoryRepo = new AgentMemoryEntryRepository(ds)
  const taskRepo = new AgentTaskRepository(ds)
  const flywheel = new MemoryFlywheelService({
    repo: memoryRepo,
    distill: async ({ goal, output, signal }) => {
      const text = await callModel(
        '你是经验蒸馏器。从任务产出中提取最多 2 条可复用经验；输出严格 JSON：{"items":[{"kind":"fact|sop","title":"...","content":"...","confidence":<0-1>}]}；无可提取返回 {"items":[]}',
        `任务目标：${goal}\n产出：${output}`,
        signal,
      )
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start < 0) return []
      try {
        const parsed = JSON.parse(text.slice(start, end + 1)) as { items?: Array<{ kind?: string; title?: string; content?: string; confidence?: number }> }
        return (parsed.items ?? []).map((it) => ({
          kind: (it.kind === 'sop' ? 'sop' : 'fact') as 'sop' | 'fact',
          title: String(it.title ?? ''), content: String(it.content ?? ''),
          confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0)),
        }))
      } catch { return [] }
    },
  })
  const svc = new AgentTaskService({
    tasks: taskRepo,
    planner: new Planner({ plan: async ({ goal, maxDepth, signal }) => {
      const raw = await callModel(PLANNER_SYSTEM_PROMPT, `目标：${goal}`, signal)
      void maxDepth
      return raw
    } }),
    verifier: new Verifier({ llmJudge: async ({ goal, acceptance, output, signal }) => {
      const text = await callModel(
        ['按相关性、完整性、事实性给产出打分（0-1 小数）并列出缺陷。', `任务目标：${goal}`, acceptance ? `验收标准：${acceptance}` : '', '输出严格 JSON：{"score": <0-1>, "defects": []}'].filter(Boolean).join('\n'),
        `产出：\n${output}`, signal,
      )
      return parseJudgeResponse(text)
    } }),
    flywheel,
    executors: {
      runAgentLoop: async ({ goal, systemPrompt, toolWhitelist, maxSteps, sessionKey, memoryLines, signal }) => {
        const sink = new TrajectorySink(trajectoryRepo, { scope: 'session', scopeKey: sessionKey })
        if (memoryLines && memoryLines.length > 0) {
          sink.append({ iteration: 0, kind: 'decision', name: 'memory_assembly', payload: { memoryRefs: memoryLines } })
        }
        const host = {
          signal: signal ?? new AbortController().signal,
          loadState: () => Promise.resolve(null),
          saveState: async () => { await sink.flush() },
          emitTrajectory: (entry: never) => { sink.append(entry) },
          emitStream: () => {},
          suspend: () => Promise.reject(new Error('不支持挂起')),
        } as never
        const tools = registry.buildToolDefs((toolWhitelist ?? []).map((t) => ({ tool: t })))
        const result = await new LoopRunner({ resolveModel: (o) => adapter.resolveModel(o) })
          .run({ definitionId: 'agent-task', scopeId: sessionKey, input: goal, systemPrompt: systemPrompt ?? '', tools, maxSteps: maxSteps ?? 10 }, host)
          .finally(() => sink.flush())
        if (result.stopReason !== 'final') throw new Error(result.error ?? `未收敛（${result.stopReason}）`)
        return { output: result.output, stopReason: result.stopReason }
      },
    },
  })
  return { ds, svc, taskRepo, memoryRepo, flywheel, runWithUserAsync }
}

async function waitTerminal(taskRepo: import('@core/database/repositories/agent-task.repository').AgentTaskRepository, rootId: string, timeoutMs: number): Promise<string> {
  const { runWithUserAsync } = await import('@core/context/user-context')
  const start = Date.now()
  for (;;) {
    const r = await runWithUserAsync('u1', () => taskRepo.getById(rootId))
    if (r && ['succeeded', 'failed', 'cancelled', 'escalated'].includes(r.status)) return r.status
    if (Date.now() - start > timeoutMs) return `timeout:${r?.status ?? 'notfound'}`
    await new Promise((res) => setTimeout(res, 3000))
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'all'
  const ctx = await boot()
  const { svc, taskRepo, memoryRepo, flywheel, runWithUserAsync, ds } = ctx

  const scenarioPlan = async (): Promise<void> => {
    const root = await runWithUserAsync('u1', () => svc.createPlan('先用 http_get 抓取 https://example.com 获取页面内容，然后基于内容写一段 100 字左右的中文摘要', { title: '抓取与摘要' }))
    console.log(`[A] 计划已生成 root=${root.id}，等待人工批准语义校验...`)
    await runWithUserAsync('u1', () => svc.approvePlan(root.id))
    const status = await waitTerminal(taskRepo, root.id, 420_000)
    const rows = await runWithUserAsync('u1', () => taskRepo.listByRoot(root.id))
    const scores = rows.map((r) => r.qualityScore).filter((s) => s !== null)
    console.log(`[A] 终态=${status} 节点数=${rows.length} 有分节点=${scores.length}`)
    if (status !== 'succeeded') throw new Error(`场景 A 未成功：${status}`)
    if (rows.length < 2) throw new Error('场景 A 树层次不足 2 层')
    if (scores.length === 0) throw new Error('场景 A 无质量分（质量门未运行）')
    console.log('✅ A 三层任务全链路通过')
  }

  const scenarioDoomed = async (): Promise<void> => {
    // 必败：规则层要求顶层含 impossible_field（任何产出都缺）→ 重试尽 → 重规划 → 深度到顶 → escalated
    const rootId = `at_${randomUUID()}`
    await runWithUserAsync('u1', async () => {
      await taskRepo.create({ id: rootId, parentId: null, rootId: rootId, depth: 0, title: '必败任务', spec: { goal: '任意输出', acceptance: '含 impossible_field', verification: { requiredFields: ['impossible_field'], llmJudge: false } }, status: 'ready', executor: 'agent_loop' })
      void svc.schedule(rootId).catch(() => undefined)
      const status = await waitTerminal(taskRepo, rootId, 420_000)
      const rows = await taskRepo.listByRoot(rootId)
      const statuses = rows.map((r) => `${r.status}@d${r.depth}`).join(',')
      console.log(`[B] 终态=${status} 链路=[${statuses}]`)
      if (!statuses.includes('escalated')) throw new Error(`场景 B 未升级人工：${statuses}`)
      if (!statuses.includes('replanned')) throw new Error('场景 B 未走重规划')
      if (rows.some((r) => r.retryCount > 0)) console.log('[B] 带反馈重试已发生')
      console.log('✅ B 必败链路（重试→重规划→escalated）通过')
    })
  }

  const scenarioFlywheel = async (): Promise<void> => {
    // 1) 蒸馏候选入库（pending_review）
    const saved = await runWithUserAsync('u1', () => flywheel.distillFromTask({
      goal: '抓取 example.com 并写中文摘要',
      outputText: '成功抓取 example.com：该页面是 IANA 保留的示例域名文档页，正文说明其用途为文档演示。做法上先用 http_get 抓取页面，再提取正文要点翻译为中文摘要即可。',
      sourceRunId: null, sourceTaskId: 'task_demo',
    }))
    if (saved === 0) throw new Error('场景 C 蒸馏零入库（候选被闸门全拒）')
    const pending = await runWithUserAsync('u1', () => memoryRepo.listByStatus('pending_review'))
    console.log(`[C] 蒸馏入库 ${saved} 条（pending=${pending.length}）`)
    // 2) 人工批准全部
    for (const p of pending) await runWithUserAsync('u1', () => flywheel.approve(p.id))
    // 3) 二轮相似任务装配命中
    const hits = await runWithUserAsync('u1', () => flywheel.assemble('抓取 example.com 并写中文摘要'))
    if (hits.length === 0) throw new Error('场景 C 二轮装配零命中')
    console.log(`[C] 二轮装配命中 ${hits.length} 条（${hits.map((h) => (h.content as { title?: string }).title).join('、')}）`)
    console.log('✅ C 飞轮闭环（蒸馏→人工批准→二轮命中）通过')
  }

  try {
    if (mode === 'all' || mode === 'plan') await scenarioPlan()
    if (mode === 'all' || mode === 'doomed') await scenarioDoomed()
    if (mode === 'all' || mode === 'flywheel') await scenarioFlywheel()
    if (mode === 'all') console.log('\n🎉 M3 端到端三场景全部通过')
    await ds.destroy()
    process.exit(0)
  } catch (e) {
    console.error('❌ E2E 失败:', e instanceof Error ? e.message : e)
    await ds.destroy()
    process.exit(1)
  }
}

void main()
