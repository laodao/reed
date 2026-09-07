/**
 * M5 端到端验收（28 号 §6，真模型 DashScope）
 * 场景：A 直连工具（http_get 查证）；B 工作流（目录→run_workflow→终态汇报）；
 *       C 技能（invoke_skill 渲染参数真模型生成）；D 任务树（create_task_plan 待批准）；
 *       E 澄清（信息不足反问，不调写工具）；F 多轮记忆（会话持久化跨轮）。
 * 运行：P5_API_KEY=... npx tsx scripts/p6-system-agent-e2e.ts [all|tool|workflow|skill|plan|clarify|memory]
 */

import { DataSource } from 'typeorm'

const DB_PATH = process.env.P6_DB ?? '/tmp/p6-e2e.db'
const API_KEY = process.env.P5_API_KEY ?? process.env.P6_API_KEY ?? ''
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const MODEL = process.env.P6_MODEL ?? 'qwen-flash'

interface TurnResult {
  success: boolean
  stopReason?: string
  error?: string
  toolCalls: Array<{ name: string; ok: boolean }>
  refs: Array<{ kind: string; id: string; label: string }>
}

async function boot() {
  const [
    { WorkflowRunEntity }, { AgentSessionEntity }, { AgentTrajectoryEntity },
  ] = await Promise.all([
    import('@core/database/entities/workflow-run.entity'),
    import('@core/database/entities/agent-session.entity'),
    import('@core/database/entities/agent-trajectory.entity'),
  ])
  const ds = new DataSource({
    type: 'better-sqlite3', database: DB_PATH, synchronize: false,
    entities: [WorkflowRunEntity, AgentSessionEntity, AgentTrajectoryEntity],
  })
  await ds.initialize()
  const { createAgentTables } = await import('@core/database/migrations/create-agent-tables')
  const { createAgentTrajectories } = await import('@core/database/migrations/create-agent-trajectories')
  await createAgentTables(ds)
  await createAgentTrajectories(ds)

  const { runWithUserAsync } = await import('@core/context/user-context')
  const { ProviderAdapter } = await import('@core/platform/agent-runtime/provider/provider-adapter')
  const adapter = new ProviderAdapter({
    getProviderConfig: async () => ({
      config: { id: 'p6-dashscope', baseUrl: BASE_URL, defaultModel: MODEL, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      template: { id: 'dashscope', apiConfig: { baseUrl: BASE_URL }, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      apiKey: API_KEY,
    }) as never,
  })

  const { registerBuiltinAgentTools } = await import('@core/platform/workflow/tools/agent-builtin-tools')
  const { registerSystemAgentTools } = await import('@core/platform/workflow/tools/system-agent-tools')
  const { AgentToolRegistry } = await import('@core/platform/agent-runtime/tools/registry')
  const registry = new AgentToolRegistry()
  registerBuiltinAgentTools(registry)

  // —— 能力面（工作流/任务树用受控 fake 语义；工具逻辑与真实实现同源） ——
  const wfRuns: Array<{ id: string; status: string }> = []
  const runService = {
    startRun: async (input: { definitionId: string }) => {
      if (input.definitionId !== 'wf-daily') throw new Error('定义不存在')
      const id = `run-${wfRuns.length + 1}`
      wfRuns.push({ id, status: 'running' })
      return { id, status: 'running', skipReason: null }
    },
    getRunDetail: async (runId: string) => {
      const run = wfRuns.find((r) => r.id === runId)
      if (!run) return null
      if (run.status === 'running') run.status = 'succeeded' // 模拟引擎推进
      return {
        run: { id: run.id, status: run.status, error: null },
        nodeRuns: [{ nodeName: '生成简报', nodeType: 'ai', status: 'succeeded', output: { content: '（简报正文摘要）' }, error: null }],
      }
    },
  }
  const plans: Array<{ id: string; status: string; title: string }> = []
  const tasks = {
    createPlan: async (goal: string) => {
      const id = `root-${plans.length + 1}`
      plans.push({ id, status: 'pending_review', title: goal.slice(0, 20) })
      return { id, status: 'pending_review', title: goal.slice(0, 20) }
    },
  }
  const skills = {
    list: () => [{ id: 'skill-script', name: '短视频脚本', description: '生成口播脚本', modelInvocable: true, inputs: [{ key: 'topic', label: '主题', type: 'string', required: true }] }],
    resolveSkill: (id: string) => (id === 'skill-script' ? {
      id, name: '短视频脚本', description: '', body: '请为主题《{{param.topic}}》写一段 30 秒口播脚本。', systemPrompt: '你是短视频编导。', references: [], modelInvocable: true, inputs: [],
    } : null),
  }

  // —— 能力目录：预置一个「每日简报」工作流定义（仅目录展示用，不进引擎） ——
  const dailyDef = {
    id: 'wf-daily',
    name: '每日简报',
    description: '抓热点生成简报',
    publishedGraph: {
      version: 1 as const,
      nodes: [
        { id: 's', type: 'start', config: { inputs: [{ key: 'topic', label: '主题', type: 'string', required: false }] } },
        { id: 'e', type: 'end', config: {} },
      ],
      edges: [] as unknown[],
    },
    draftGraph: null,
  }
  registerSystemAgentTools({
    registry,
    runService: runService as never,
    definitions: { list: async () => ({ items: [dailyDef], total: 1 }) } as never,
    tasks: tasks as never,
    skills: skills as never,
    resolveModel: (o) => adapter.resolveModel(o),
  })

  const { runAgentChatTurn, SYSTEM_AGENT_CHAT_PROMPT } = await import('@core/packs/chat/services/system-agent/system-agent.service')
  const { DbAgentSessionStore } = await import('@core/platform/agent-runtime/memory/session-store')
  const { AgentTrajectoryRepository } = await import('@core/database/repositories/agent-trajectory.repository')
  const sessions = new DbAgentSessionStore({ dataSource: ds })
  const trajectoryRepo = new AgentTrajectoryRepository(ds)

  async function turn(dialogId: string, content: string): Promise<{ result: TurnResult; events: Array<{ type: string; toolName?: string; ok?: boolean }>; content: string }> {
    const events: Array<{ type: string; toolName?: string; ok?: boolean }> = []
    const messageRows: Array<{ id: string; content: string; metadata?: { agent?: TurnResult } }> = []
    const messages = {
      create: async (m: { role: string; content: string }) => {
        const row = { id: `m-${messageRows.length + 1}`, content: m.content }
        messageRows.push(row)
        return row
      },
      updateContent: async (id: string, content: string) => {
        const r = messageRows.find((x) => x.id === id)
        if (r) r.content = content
      },
      updateMetadata: async (id: string, metadata: never) => {
        const r = messageRows.find((x) => x.id === id)
        if (r) (r as { metadata?: unknown }).metadata = metadata
      },
      updateTokensUsed: async () => undefined,
    }
    const result = await runWithUserAsync('e2e-user', () =>
      runAgentChatTurn(
        {
          messages: messages as never,
          sessions: sessions as never,
          trajectoryPort: trajectoryRepo,
          registry,
          resolveModel: (o) => adapter.resolveModel(o),
          emit: (e: { type: string; toolName?: string; ok?: boolean }) => events.push({ type: e.type, toolName: e.toolName, ok: e.ok }),
        },
        {
          dialogId,
          content,
          systemPrompt: SYSTEM_AGENT_CHAT_PROMPT,
          modelPreference: { modelId: MODEL },
          signal: new AbortController().signal,
          userMessageId: 'u1',
        },
      ),
    )
    // runAgentChatTurn 只 create 一条消息：AI 占位（用户消息由宿主层落库）
    const aiRow = messageRows[0]
    return { result: result as TurnResult, events, content: aiRow?.content ?? '' }
  }

  return { ds, turn, wfRuns, plans }
}

function assert(cond: unknown, label: string): void {
  if (cond) {
    console.log(`  ✅ ${label}`)
  } else {
    console.error(`  ❌ ${label}`)
    process.exitCode = 1
  }
}

// ==================== 场景 ====================

async function scenarioDirectTool(ctx: Awaited<ReturnType<typeof boot>>): Promise<void> {
  console.log('\n=== A 直连工具：http_get 查证页面标题 ===')
  const { result, content } = await ctx.turn('dlg-a', '用 http_get 获取 https://example.com 的页面内容，告诉我页面标题是什么。')
  assert(result.success, `轮次成功（stop=${result.stopReason}）`)
  assert(result.toolCalls.some((t) => t.name === 'http_get' && t.ok), 'http_get 被调用且成功')
  assert(/example/i.test(content), `回答含页面信息（内容前 80 字：${content.slice(0, 80).replace(/\n/g, ' ')}）`)
}

async function scenarioWorkflow(ctx: Awaited<ReturnType<typeof boot>>): Promise<void> {
  console.log('\n=== B 工作流：目录发现 → run_workflow → 终态汇报 ===')
  const { result, content, events } = await ctx.turn('dlg-b', '帮我运行「每日简报」工作流，主题用"AI 进展"。')
  assert(result.success, `轮次成功（stop=${result.stopReason}）`)
  assert(result.toolCalls.some((t) => t.name === 'discover_capabilities'), '先查了能力目录')
  assert(result.toolCalls.some((t) => t.name === 'run_workflow' && t.ok), 'run_workflow 成功')
  assert(result.refs.some((r) => r.kind === 'workflow_run'), '引用含工作流运行')
  assert(/成功|完成|简报/.test(content), `汇报含结果（前 60 字：${content.slice(0, 60).replace(/\n/g, ' ')}）`)
  assert(events.some((e) => e.type === 'tool-start' && e.toolName === 'run_workflow'), '流事件有 tool-start(run_workflow)')
}

async function scenarioSkill(ctx: Awaited<ReturnType<typeof boot>>): Promise<void> {
  console.log('\n=== C 技能：invoke_skill 渲染参数生成 ===')
  const { result, content } = await ctx.turn('dlg-c', '用「短视频脚本」技能，给主题"手冲咖啡"写一段口播脚本。')
  assert(result.success, `轮次成功（stop=${result.stopReason}）`)
  assert(result.toolCalls.some((t) => t.name === 'invoke_skill' && t.ok), 'invoke_skill 成功')
  assert(result.refs.some((r) => r.kind === 'skill'), '引用含技能')
  assert(/咖啡|脚本|镜头|口播/i.test(content), `产出含脚本内容（前 80 字：${content.slice(0, 80).replace(/\n/g, ' ')}）`)
}

async function scenarioTaskPlan(ctx: Awaited<ReturnType<typeof boot>>): Promise<void> {
  console.log('\n=== D 任务树：create_task_plan 创建待批准计划 ===')
  const { result, content } = await ctx.turn('dlg-d', '这是一个复杂的多步目标：调研三个主流向量数据库并产出对比报告。请创建任务树。')
  assert(result.success, `轮次成功（stop=${result.stopReason}）`)
  assert(result.toolCalls.some((t) => t.name === 'create_task_plan' && t.ok), 'create_task_plan 成功')
  assert(result.refs.some((r) => r.kind === 'task_tree'), '引用含任务树')
  assert(ctx.plans.length > 0 && ctx.plans[0].status === 'pending_review', '计划处于待批准（闸门未豁免）')
  assert(/批准|任务树/.test(content), `告知了批准入口（前 80 字：${content.slice(0, 80).replace(/\n/g, ' ')}）`)
}

async function scenarioClarify(ctx: Awaited<ReturnType<typeof boot>>): Promise<void> {
  console.log('\n=== E 澄清：信息不足 → 反问而非乱执行 ===')
  const { result, content } = await ctx.turn('dlg-e', '帮我运行那个工作流。')
  assert(result.success, `轮次成功（stop=${result.stopReason}）`)
  const writeCalls = result.toolCalls.filter((t) => ['run_workflow', 'create_task_plan'].includes(t.name))
  assert(writeCalls.length === 0, '未盲目调用写工具')
  assert(/[?？]|哪个|什么|告诉/.test(content), `反问澄清（前 80 字：${content.slice(0, 80).replace(/\n/g, ' ')}）`)
}

async function scenarioMemory(ctx: Awaited<ReturnType<typeof boot>>): Promise<void> {
  console.log('\n=== F 多轮记忆：会话持久化跨轮 ===')
  const t1 = await ctx.turn('dlg-f', '请记住：我们团队的暗号是"菠萝披萨"。回复"已记住"即可。')
  assert(t1.result.success, '第一轮成功')
  const t2 = await ctx.turn('dlg-f', '我们团队的暗号是什么？')
  assert(t2.result.success, '第二轮成功')
  assert(/菠萝披萨/.test(t2.content), `第二轮答出暗号（前 60 字：${t2.content.slice(0, 60).replace(/\n/g, ' ')}）`)
}

async function main() {
  if (!API_KEY) {
    console.error('缺少 P5_API_KEY/P6_API_KEY（DashScope）')
    process.exit(1)
  }
  const only = process.argv[2] ?? 'all'
  const ctx = await boot()
  const scenarii: Array<[string, (c: typeof ctx) => Promise<void>]> = [
    ['tool', scenarioDirectTool],
    ['workflow', scenarioWorkflow],
    ['skill', scenarioSkill],
    ['plan', scenarioTaskPlan],
    ['clarify', scenarioClarify],
    ['memory', scenarioMemory],
  ]
  for (const [name, fn] of scenarii) {
    if (only === 'all' || only === name) await fn(ctx)
  }
  await ctx.ds.destroy()
  if (process.exitCode === 1) {
    console.error('\n存在失败断言')
    process.exit(1)
  }
  console.log('\n全部场景通过 ✅')
}

void main()
