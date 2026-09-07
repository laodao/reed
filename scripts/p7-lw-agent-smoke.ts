/**
 * M6 冒烟（30 号 G2，真模型 DashScope）：长文 Agent 决策循环跑真模型，
 * 生成器用假实现（快速成功）——验证「真模型决策 → 工具调用 → executeActions
 * → 事件/摘要」链路。场景：A 概要生成（工具调用+落库）；B 依赖 skipped 透出；
 * C 多轮上下文（引用上一轮产出）。
 * 运行：P5_API_KEY=... npx tsx scripts/p7-lw-agent-smoke.ts
 */

const DB_PATH = process.env.P7_DB ?? '/tmp/p7-lw-smoke.db'
const API_KEY = process.env.P5_API_KEY ?? ''
const BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const MODEL = process.env.P7_MODEL ?? 'qwen-flash'

function assert(cond: unknown, label: string): void {
  if (cond) console.log(`  ✅ ${label}`)
  else {
    console.error(`  ❌ ${label}`)
    process.exitCode = 1
  }
}

async function boot() {
  void DB_PATH
  // 依赖注入：假 db（内存态）+ 假生成服务 + 真模型
  const db: any = {
    lwDesignMessages: {
      _rows: [] as Array<{ conversationId: string; role: string; content: string; timestamp: number; metadata?: string }>,
      async add(conversationId: string, msg: any) {
        const row = { conversationId, role: msg.role, content: msg.content, timestamp: msg.timestamp ?? Date.now(), metadata: msg.metadata }
        this._rows.push(row)
        return row
      },
      async getByConversationId(conversationId: string) {
        return (this as any)._rows.filter((r) => r.conversationId === conversationId)
      },
    },
    lwStoryOverviews: {
      _rows: [] as any[],
      async getByProjectId() {
        return (this as any)._rows[0] ?? null
      },
      async update(_id: string, patch: any) {
        Object.assign((this as any)._rows[0] ?? {}, patch)
      },
      async create(record: any) {
        (this as any)._rows.push(record)
        return record
      },
    },
    lwCharacters: { async getByProjectId() { return [] }, async create() { return undefined } },
    lwBackgrounds: { async getByProjectId() { return null }, async create() { return undefined }, async update() { return undefined } },
    lwLocations: { async getByProjectId() { return [] }, async create() { return undefined } },
    lwFactions: { async getByProjectId() { return [] }, async create() { return undefined } },
    lwSkills: { async getByProjectId() { return [] }, async create() { return undefined } },
    lwItems: { async getByProjectId() { return [] }, async create() { return undefined } },
    lwPlots: { async getByProjectId() { return [] }, async batchCreate() { return undefined }, async create() { return undefined } },
    lwOutlines: { async getByProjectId() { return null }, async getTreeByProjectId() { return [] }, async create() { return undefined } },
    lwChapters: { async getByOutlineIds() { return new Map() }, async getByOutlineId() { return null }, async create() { return undefined }, async updateContent() { return undefined }, async createVersion() { return undefined } },
    lwGraphEdges: { async deleteByEntity() { return 0 } },
  }
  const ai = {
    generateStoryOverview: async (_eventId: string, _projectId: string, input: string) => ({
      success: true,
      data: {
        title: `概要（基于：${String(input).slice(0, 12)}）`,
        storyType: '测试',
        coreIdea: '测试核心冲突',
        summary: '测试概要正文。',
        coreConflict: '测试冲突',
        estimatedChapters: 50,
      },
    }),
    cancelAllForProject: () => undefined,
  }

  const { runWithUserAsync } = await import('@core/context/user-context')
  const { ProviderAdapter } = await import('@core/platform/agent-runtime/provider/provider-adapter')
  const { registerAgentLoopHarness } = await import('@core/platform/workflow/nodes/agent-loop-node')
  const { AgentToolRegistry } = await import('@core/platform/agent-runtime/tools/registry')
  const adapter = new ProviderAdapter({
    getProviderConfig: async () => ({
      config: { id: 'p7-dashscope', baseUrl: BASE_URL, defaultModel: MODEL, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      template: { id: 'dashscope', apiConfig: { baseUrl: BASE_URL }, models: [{ id: MODEL, type: 'text', features: ['chat'] }] },
      apiKey: API_KEY,
    }) as never,
  })
  registerAgentLoopHarness({
    registry: new AgentToolRegistry(),
    resolveModel: (o) => adapter.resolveModel(o),
    trajectoryRepo: { appendBatch: async () => undefined, maxSeq: async () => 0 },
  })

  const events: Array<{ channel: string; type: string }> = []
  await registerEventCapture(events)

  const { LwAgentHarnessService } = await import('@core/packs/longwriting/agent-harness/lw-agent-harness.service')
  const svc = LwAgentHarnessService.getInstance(db, ai as never)

  async function turn(content: string) {
    const before = events.length
    const r = await runWithUserAsync('p7-user', () => svc.sendMessage('proj-1', content))
    return { r, newEvents: events.slice(before) }
  }
  return { turn, db, runWithUserAsync }
}

async function registerEventCapture(sink: Array<{ channel: string; type: string }>): Promise<void> {
  const mod = await import('@core/interfaces/event.interface')
  mod.registerEventEmitter(() => ({
    emit: (channel: string, event: any) => sink.push({ channel, type: event?.type ?? '' }),
    emitProgress: () => undefined,
    emitStatus: () => undefined,
  }))
}

async function main() {
  if (!API_KEY) {
    console.error('缺少 P5_API_KEY')
    process.exit(1)
  }
  const ctx = await boot()

  console.log('=== A 概要生成：真模型决策 → generate_overview 工具 ===')
  {
    const { r, newEvents } = await ctx.turn('请为我的修仙小说生成故事概要，主题是凡人流逆袭')
    assert(r.stopReason === 'final', `轮次收敛（stop=${r.stopReason}）`)
    const ok = r.actionSummaries.find((s) => s.type === 'generate_overview' && s.status === 'ok')
    assert(!!ok, 'generate_overview 执行成功')
    assert((ctx.db.lwStoryOverviews._rows.length) >= 1, '概要落库')
    assert(newEvents.some((e) => e.type === 'action:done'), '事件面有 action:done')
    assert(newEvents.some((e) => e.type === 'reply:done'), '事件面有 reply:done')
  }

  console.log('=== B 依赖 skipped：未生成人物时的诚实提示 ===')
  {
    // 强制调用（绕过模型自己的依赖判断），验证 executeActions 的依赖 skipped 透出
    const { r } = await ctx.turn('请立即调用 write_chapter 工具撰写第一章，不要询问，直接执行')
    const s = r.actionSummaries.find((x) => x.type === 'write_chapter')
    assert(!!s && s.status === 'skipped', `write_chapter 依赖 skipped 透出（status=${s?.status}，message=${s?.message?.slice(0, 40)}）`)
  }

  console.log('=== C 多轮上下文：第二轮引用第一轮产出 ===')
  {
    const { r } = await ctx.turn('我刚才让你生成的概要主题是什么？一句话回答')
    assert(r.stopReason === 'final', '轮次收敛')
    assert(/修仙|凡人/.test(r.assistantMessage.content), `回答引用了上一轮产出（${r.assistantMessage.content.slice(0, 40)}）`)
  }

  if (process.exitCode === 1) {
    console.error('\n存在失败断言')
    process.exit(1)
  }
  console.log('\n冒烟通过 ✅')
  process.exit(0)
}

void main()
