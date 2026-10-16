/**
 * M3 核心（26 号）：Verifier 四层 / 知识飞轮闸门与装配 / Planner 解析 / TaskService 状态机
 *
 * TaskService 用注入 executor（fake LLM 语义：不真调模型）钉死状态机与失败链；
 * 真模型路径由端到端验收覆盖（26 号 §6）。
 */

import { describe, it, expect } from 'vitest'
import { Verifier, runRuleChecks, parseJudgeResponse } from '@core/platform/agent-runtime/verify/verifier'
import { MemoryFlywheelService, tokenize, overlapRatio } from '@core/platform/agent-runtime/memory/memory-flywheel'
import { parsePlanTree, MAX_TASK_NODES } from '@core/platform/agent-runtime/tasks/planner'
import { AgentTaskService, aggregateScores, MAX_RETRIES } from '@core/platform/agent-runtime/tasks/task-service'
import { AgentTaskRepository, type AgentTaskRow } from '@core/database/repositories/agent-task.repository'
import { AgentMemoryEntryRepository } from '@core/database/repositories/agent-memory-entry.repository'

// ==================== Verifier ====================

describe('Verifier 四层', () => {
  const base = { retryCount: 0 }

  it('① 规则层：requiredFields 缺失 → retry 带反馈', async () => {
    const v = new Verifier()
    const d = await v.verify({
      output: { answer: '' },
      spec: { requiredFields: ['answer', 'sources'] },
      ctx: { goal: 'g' },
      ...base,
    })
    expect(d.action).toBe('retry')
    expect(d.defects.join(';')).toContain('sources')
  })

  it('runRuleChecks：minLength / schema', () => {
    const r1 = runRuleChecks({ output: '短', spec: { minLength: 10 }, ctx: { goal: 'g' }, retryCount: 0 })
    expect(r1.ok).toBe(false)
    const r2 = runRuleChecks({ output: { a: 1 }, spec: { requiredFields: ['a'] }, ctx: { goal: 'g' }, retryCount: 0 })
    expect(r2.ok).toBe(true)
  })

  it('③ LLM 评判：高分过 / 灰区首试 retry / 重试后灰区 human / 低分 fail', async () => {
    const mk = (score: number) => new Verifier({ llmJudge: async () => ({ score, defects: score < 0.8 ? ['不完整'] : [] }) })
    const spec = { requiredFields: [] }
    const hi = await mk(0.9).verify({ output: 'x', spec, ctx: { goal: 'g' }, ...base })
    expect(hi.action).toBe('pass')
    const gray = await mk(0.7).verify({ output: 'x', spec, ctx: { goal: 'g' }, ...base })
    expect(gray.action).toBe('retry')
    const gray2 = await mk(0.7).verify({ output: 'x', spec, ctx: { goal: 'g' }, retryCount: 1 })
    expect(gray2.action).toBe('human')
    const low = await mk(0.3).verify({ output: 'x', spec, ctx: { goal: 'g' }, ...base })
    expect(low.action).toBe('retry') // 首试低分仍给一次反馈重试
    const low2 = await mk(0.3).verify({ output: 'x', spec, ctx: { goal: 'g' }, retryCount: MAX_RETRIES })
    expect(low2.action).toBe('fail')
  })

  it('③ LLM 评判失败降级 → human（不判死任务）', async () => {
    const v = new Verifier({ llmJudge: async () => { throw new Error('model down') } })
    const d = await v.verify({ output: 'x', spec: {}, ctx: { goal: 'g' }, ...base })
    expect(d.action).toBe('human')
  })

  it('parseJudgeResponse：包裹文本中提取 JSON / 不可解析按 0 分', () => {
    expect(parseJudgeResponse('评测结论 {"score": 0.85, "defects": ["a"]} 完')).toEqual({ score: 0.85, defects: ['a'] })
    expect(parseJudgeResponse('no json')).toEqual({ score: 0, defects: ['评判输出不可解析'] })
  })

  it('parseJudgeResponse：截断 JSON 正则兜底读出 score（33 号实测回归）', () => {
    // 截断场景：maxOutputTokens 打断，JSON 无收尾括号
    const truncated = '{"score": 0.75, "defects": ["缺来源", "结论过粗'
    const r = parseJudgeResponse(truncated)
    expect(r.score).toBe(0.75)
    expect(r.defects).toEqual(['缺来源', '结论过粗'])
    // score 值非法 → 兜底仍夹紧到 [0,1]
    expect(parseJudgeResponse('{"score": "abc", "defects": [').score).toBe(0)
  })

  it('aggregateScores：忽略 null 与负分', () => {
    expect(aggregateScores([0.8, null, 0.6, -1])).toBe(0.7)
    expect(aggregateScores([])).toBeNull()
  })
})

// ==================== 知识飞轮 ====================

describe('知识飞轮', () => {
  function buildFlywheel(entries: Array<{ id: string; kind: 'fact'; content: Record<string, unknown>; status: string; confidence?: number }>) {
    const rows = entries.map((e) => ({ ...e, useCount: 0, successCount: 0 }))
    const repo = {
      async create(i: { id: string; kind: string; content: Record<string, unknown>; status: string; confidence?: number | null }) {
        rows.push({ id: i.id, kind: i.kind as 'fact', content: i.content, status: i.status, useCount: 0, successCount: 0 })
        return rows[rows.length - 1] as never
      },
      async getById(id: string) { return (rows.find((r) => r.id === id) as never) ?? null },
      async listActive() { return rows.filter((r) => r.status === 'active') as never },
      async listByStatus(status: string) { return rows.filter((r) => r.status === status) as never },
      async patch(id: string, p: Record<string, unknown>) {
        const r = rows.find((x) => x.id === id)
        if (r) Object.assign(r, p)
      },
      async archiveStaleBefore() { return 0 },
    } as never as AgentMemoryEntryRepository
    return { repo, rows }
  }

  it('tokenize/overlapRatio：CJK 2-gram 与英文词', () => {
    expect(overlapRatio(tokenize('工作流引擎调度'), tokenize('工作流引擎调度'))).toBe(1)
    expect(overlapRatio(tokenize('工作流引擎调度'), tokenize('完全不同的领域知识'))).toBeLessThan(0.3)
    expect(overlapRatio(tokenize('hello world'), tokenize('hello world'))).toBe(1)
  })

  it('闸门：置信度不足丢弃 / 重复丢弃 / 通过后 pending_review 待人工批准', async () => {
    const { repo, rows } = buildFlywheel([
      { id: 'm1', kind: 'fact', content: { title: 't', content: '采集新闻用 wf_web_extract 提取正文' }, status: 'active', confidence: 0.9 },
    ])
    const fw = new MemoryFlywheelService({
      repo: repo as never as AgentMemoryEntryRepository,
      distill: async () => [
        { kind: 'sop', title: '低置信', content: 'x', confidence: 0.5 },
        { kind: 'sop', title: '重复', content: '采集新闻用 wf_web_extract 提取正文内容', confidence: 0.9 },
        { kind: 'sop', title: '新经验', content: '翻译长文先分段再逐段 wf_translate', confidence: 0.95 },
      ],
    })
    const saved = await fw.distillFromTask({ goal: 'g', outputText: '...' })
    expect(saved).toBe(1)
    const pending = rows.filter((r) => r.status === 'pending_review')
    expect(pending).toHaveLength(1)
    expect(pending[0].content).toMatchObject({ title: '新经验' })
  })

  it('人工批准前不装配；批准后 assemble 命中并报告结果回写', async () => {
    const { repo, rows } = buildFlywheel([
      { id: 'm1', kind: 'fact', content: { title: 't', content: '新闻采集先用 wf_web_extract' }, status: 'active', confidence: 0.9 },
    ])
    const fw = new MemoryFlywheelService({ repo })
    // pending 不进装配
    await repo.create({ id: 'm2', kind: 'fact', content: { title: 't2', content: '报告写作先列大纲' }, status: 'pending_review' })
    expect(await fw.assemble('报告 写作')).toHaveLength(0)
    await fw.approve('m2')
    // ≥2 词相关才入选（L1 相关度门槛，六扇门复盘：单词 2-gram 碰撞不再放行）
    const hits = await fw.assemble('如何写报告？写作大纲怎么安排')
    expect(hits.map((h) => h.id)).toContain('m2')
    await fw.reportTaskOutcome(['m2'], true)
    const m2 = rows.find((r) => r.id === 'm2') as unknown as { useCount: number; successCount: number }
    expect(m2.useCount).toBe(1)
    expect(m2.successCount).toBe(1)
  })

  it('归档拒绝 / 状态不符拒批', async () => {
    const { repo } = buildFlywheel([{ id: 'm1', kind: 'fact', content: { title: 't', content: 'x' }, status: 'active' }])
    const fw = new MemoryFlywheelService({ repo })
    await expect(fw.approve('m1')).rejects.toThrow('不可批准')
    await fw.archive('m1')
    expect((await repo.getById('m1'))?.status).toBe('archived')
  })
})

// ==================== Planner 解析 ====================

describe('Planner 解析', () => {
  it('合法树 / 非 JSON / 缺 goal', () => {
    const tree = parsePlanTree('前言 {"title":"根","spec":{"goal":"总目标"},"children":[{"title":"叶","spec":{"goal":"g1","acceptance":"a"}}]} 后记')
    expect(tree.title).toBe('根')
    expect(tree.children).toHaveLength(1)
    expect(() => parsePlanTree('no json')).toThrow('JSON')
    // 缺 spec.goal 容错回落标题（真模型输出容错——E2E 实证）不再抛错
    expect(parsePlanTree('{"title":"兜底标题"}').spec.goal).toBe('兜底标题')
  })

  it('节点数上限（宽树先于深度触发）', () => {
    const leaves = Array.from({ length: 21 }, (_, i) => `{"title":"L${i}","spec":{"goal":"g"}}`).join(',')
    expect(() => parsePlanTree(`{"title":"根","spec":{"goal":"g"},"children":[${leaves}]}`)).toThrow('节点数超过')
    void MAX_TASK_NODES
  })
})

// ==================== TaskService 状态机 ====================

describe('AgentTaskService 状态机（注入 executor，fake LLM 语义）', () => {
  /** 等待节点到终态/verifying（approvePlan/verifyDecide 后台启泵——W2 语义） */
  async function waitSettled(repo: AgentTaskRepository, id: string, timeout = 3000): Promise<AgentTaskRow | null> {
    const start = Date.now()
    for (;;) {
      const r = await repo.getById(id)
      if (r && ['succeeded', 'failed', 'cancelled', 'escalated', 'verifying', 'replanned'].includes(r.status)) return r
      if (Date.now() - start > timeout) return r
      await new Promise((res) => setTimeout(res, 20))
    }
  }

  interface FakeRow {
    id: string; parentId: string | null; rootId: string; depth: number; title: string
    spec: Record<string, unknown>; status: string; executor: string; runId: string | null
    qualityScore: number | null; result: Record<string, unknown> | null; retryCount: number
    error: string | null; budget: Record<string, unknown> | null; createdAt: Date; updatedAt: Date
  }

  function buildRepo(seed: FakeRow[]) {
    const rows = seed
    return {
      async create(i: { id: string; parentId: string | null; rootId: string; depth: number; title: string; spec: Record<string, unknown>; status: string; executor: string }) {
        const row: FakeRow = { ...i, runId: null, qualityScore: null, result: null, retryCount: 0, error: null, budget: null, createdAt: new Date(), updatedAt: new Date() }
        rows.push(row)
        return row as never
      },
      async getById(id: string) { return (rows.find((r) => r.id === id) as never) ?? null },
      async listByRoot(rootId: string) { return rows.filter((r) => r.rootId === rootId) as never },
      async listByStatus(status: string) { return rows.filter((r) => r.status === status) as never },
      async patch(id: string, p: Record<string, unknown>) {
        const r = rows.find((x) => x.id === id)
        if (r) Object.assign(r, p)
      },
      async patchFromStatus(id: string, fromStatuses: string[], p: Record<string, unknown>) {
        const r = rows.find((x) => x.id === id)
        if (r && fromStatuses.includes(r.status)) { Object.assign(r, p); return true }
        return false
      },
    } as never as AgentTaskRepository
  }

  function buildService(rows: FakeRow[], executorOutput: (() => string) | string) {
    const repo = buildRepo(rows)
    const outputs: string[] = []
    let callIdx = 0
    const svc = new AgentTaskService({
      tasks: repo,
      planner: {
        planTree: async (goal: string) => ({
          title: '重规划',
          spec: { goal: 'sub ' + goal.slice(0, 20) },
          executor: 'agent_loop',
          children: [{ title: '子1', spec: { goal: 'smaller', acceptance: 'a' }, executor: 'agent_loop' }],
        }),
      } as never,
      verifier: new Verifier({
        llmJudge: async () => {
          const out = typeof executorOutput === 'function' ? executorOutput() : executorOutput
          void out
          return { score: 0.9, defects: [] }
        },
      }),
      executors: {
        runAgentLoop: async ({ goal }) => {
          outputs.push(goal)
          const v = typeof executorOutput === 'function' ? (executorOutput as () => string)() : executorOutput
          void callIdx
          callIdx++
          return { output: `产出:${goal.slice(0, 6)}|${v}`, stopReason: 'final' }
        },
      },
    })
    return { svc, repo, outputs }
  }

  function seed(rows: FakeRow[], id: string, over: Partial<FakeRow> = {}): void {
    rows.push({
      id, parentId: null, rootId: id, depth: 0, title: '根',
      spec: { goal: '根目标', acceptance: 'a' }, status: 'pending_review', executor: 'agent_loop',
      runId: null, qualityScore: null, result: null, retryCount: 0, error: null, budget: null, createdAt: new Date(), updatedAt: new Date(),
      ...over,
    })
  }

  it('整树批准 → 叶子执行 → 质量门通过 → 根 succeeded', async () => {
    const rows: FakeRow[] = []
    seed(rows, 'root1')
    seed(rows, 'leaf1', { parentId: 'root1', rootId: 'root1', depth: 1, title: '叶' })
    const { svc, repo } = buildService(rows, '好产出')
    await svc.approvePlan('root1') // 后台启泵（W2 语义）
    await waitSettled(repo, 'root1')
    const root = await repo.getById('root1')
    const leaf = await repo.getById('leaf1')
    expect(root?.status).toBe('succeeded')
    expect(leaf?.status).toBe('succeeded')
    expect(leaf?.qualityScore).toBeCloseTo(0.9)
    expect(root?.qualityScore).not.toBeNull() // 聚合分
  })

  it('重规划成功路径（review T2 钉测）：子任务全 succeeded → replanned 节点聚合 → 根终态', async () => {
    const rows: FakeRow[] = []
    seed(rows, 'root4', { status: 'ready' })
    seed(rows, 'leaf4', { parentId: 'root4', rootId: 'root4', depth: 1, title: '失败叶', status: 'replanned', retryCount: 2, error: '曾失败' })
    seed(rows, 'sub4', { parentId: 'leaf4', rootId: 'root4', depth: 2, title: '重规划子', status: 'ready' })
    const { svc, repo } = buildService(rows, '重规划后的好产出')
    await svc.schedule('root4')
    // 泵：先跑 sub4（succeeded）→ leaf4 replanned 聚合（子全终态）→ 根聚合
    const leaf = await waitSettled(repo, 'leaf4')
    expect(leaf?.status).toBe('succeeded')
    const root = await waitSettled(repo, 'root4')
    expect(root?.status).toBe('succeeded')
    expect(root?.qualityScore).not.toBeNull()
  })

  it('灰区挂起待人 → verifyDecide(approve) → succeeded；reject → 重规划子树', async () => {
    const rows: FakeRow[] = []
    seed(rows, 'root2', { status: 'ready' })
    // 灰区挂起的叶子（质量门 human 分流的落库形态）
    seed(rows, 'leaf2', { parentId: 'root2', rootId: 'root2', depth: 1, title: '叶', status: 'verifying', retryCount: 2 })
    const { svc, repo } = buildService(rows, 'x')
    await svc.verifyDecide('leaf2', 'approve', '人工认可')
    expect((await repo.getById('leaf2'))?.status).toBe('succeeded')
    expect((await waitSettled(repo, 'root2'))?.status).toBe('succeeded')
  })

  it('叶子失败（重试尽）→ 重规划链逐层分解 → 深度到顶 escalated（26 号失败链）', async () => {
    const rows: FakeRow[] = []
    seed(rows, 'root3')
    seed(rows, 'leaf3', { parentId: 'root3', rootId: 'root3', depth: 1, title: '叶', status: 'ready', retryCount: MAX_RETRIES })
    const { repo } = buildService(rows, 'x')
    // 覆盖 verifier 为持续低分（模拟怎么改都过不了验收的必败子任务）
    const svc2 = new AgentTaskService({
      tasks: repo,
      planner: {
        planTree: async () => ({
          title: '重规划',
          spec: { goal: '更小目标', acceptance: 'a' },
          executor: 'agent_loop',
          children: [{ title: '子1', spec: { goal: 'smaller', acceptance: 'a' }, executor: 'agent_loop' }],
        }),
      } as never,
      verifier: new Verifier({ llmJudge: async () => ({ score: 0.1, defects: ['质量差'] }) }),
      executors: { runAgentLoop: async () => ({ output: '烂产出', stopReason: 'final' }) },
    })
    await svc2.schedule('root3')
    // 失败链：leaf3(depth1) replanned → 子(depth2) replanned → 孙(depth3) escalated
    //（深度条件 depth < MAX_TASK_DEPTH-1=3 到顶）
    const all = await repo.listByRoot('root3')
    expect(all.find((r) => r.id === 'leaf3')?.status).toBe('replanned')
    const depth2 = all.find((r) => r.depth === 2)
    expect(depth2?.status).toBe('replanned')
    const depth3 = all.filter((r) => r.depth === 3)
    expect(depth3.length).toBeGreaterThan(0)
    expect(depth3.every((r) => r.status === 'escalated')).toBe(true)
  })
})
