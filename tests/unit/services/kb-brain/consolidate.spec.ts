/**
 * 论断归纳整理测试：合并全链 / 保守不合并 / 单批失败跳过 / 输入排除规则 / schema 归一
 * fake LLM + fake 仓储（纯编排逻辑，无 DB），与 goal-distill.spec 同款基建。
 */
import { describe, it, expect } from 'vitest'
import { KbConsolidateService } from '@core/platform/services/kb-brain/consolidate.service'
import { validateConsolidateOutput } from '@core/platform/services/kb-brain/schemas'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'

interface AtomRow {
  id: string
  knowledgeBaseId: string
  statement: string
  type: string
  status: string
  certainty: number
  sourceDocumentId: string
  sourceQuote: string
  extractionPass: string
  lensNoteId: string | null
  origin: string
  supersededByAtomId: string | null
}

function makeAtom(partial: Partial<AtomRow>): AtomRow {
  return {
    id: `a${Math.random().toString(36).slice(2, 8)}`,
    knowledgeBaseId: 'kb1',
    statement: '',
    type: 'fact',
    status: 'supported',
    certainty: 0.8,
    sourceDocumentId: 'doc1',
    sourceQuote: 'q',
    extractionPass: 'base#1',
    lensNoteId: null,
    origin: 'ai',
    supersededByAtomId: null,
    ...partial,
  }
}

/** fake 仓储：只实现 consolidate 用到的三个方法 */
function makeAtomsRepo(seed: AtomRow[]) {
  const rows = seed
  let seq = 0
  const llmUsers: string[] = []
  return {
    rows,
    llmUsers,
    async findByKb(_kbId: string, opts?: { status?: string[]; limit?: number }) {
      llmUsers.push('findByKb') // 标记查询发生
      const filtered = rows.filter((r) => !opts?.status?.length || opts.status.includes(r.status))
      return filtered.slice(0, opts?.limit ?? 200)
    },
    async createBatch(inputs: Array<Record<string, unknown>>) {
      const created = inputs.map((inp) =>
        makeAtom({ id: `merged${++seq}`, ...inp } as Partial<AtomRow>),
      )
      rows.push(...created)
      return created
    },
    async findByIds(ids: string[]) {
      return rows.filter((r) => ids.includes(r.id))
    },
    async updateStatus(id: string, patch: { status: string; supersededByAtomId?: string }) {
      const r = rows.find((x) => x.id === id)
      if (r) {
        r.status = patch.status
        r.supersededByAtomId = patch.supersededByAtomId ?? null
      }
    },
  }
}

describe('KbConsolidateService', () => {
  it('合并全链：3 条同主题碎片 → 1 条综合论断 + 成员 superseded', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'a1', statement: '天琊剑是诛仙中的主要法宝' }),
      makeAtom({ id: 'a2', statement: '合欢铃是诛仙中的主要法宝' }),
      makeAtom({ id: 'a3', statement: '诛仙古剑是诛仙中的主要法宝' }),
      makeAtom({ id: 'a4', statement: '张小凡的烧火棍来历不凡', type: 'fact' }),
    ])
    const llm: BrainLlmFn = async () =>
      JSON.stringify({
        groups: [{ idx: [0, 1, 2], statement: '诛仙中的主要法宝包括天琊剑、合欢铃、诛仙古剑', type: 'fact' }],
      })
    const svc = new KbConsolidateService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    expect(progress.mergedGroups).toBe(1)
    expect(progress.supersededAtoms).toBe(3)
    expect(progress.failedBatches).toBe(0)
    const merged = repo.rows.find((r) => r.id.startsWith('merged'))
    expect(merged?.statement).toBe('诛仙中的主要法宝包括天琊剑、合欢铃、诛仙古剑')
    expect(merged?.extractionPass).toBe('consolidate#1')
    for (const id of ['a1', 'a2', 'a3']) {
      const m = repo.rows.find((r) => r.id === id)
      expect(m?.status).toBe('superseded')
      expect(m?.supersededByAtomId).toBe(merged?.id)
    }
    // 未入组的 a4 不动
    expect(repo.rows.find((r) => r.id === 'a4')?.status).toBe('supported')
    expect(svc.status('kb1').running).toBe(false)
  })

  it('保守不合并：模型输出空 groups → 池子无变化', async () => {
    const repo = makeAtomsRepo([makeAtom({ id: 'b1', statement: '独立论断' })])
    const llm: BrainLlmFn = async () => JSON.stringify({ groups: [] })
    const svc = new KbConsolidateService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    expect(progress.mergedGroups).toBe(0)
    expect(repo.rows.find((r) => r.id === 'b1')?.status).toBe('supported')
  })

  it('单批失败跳过：第一批炸、第二批照常处理', async () => {
    // BATCH_SIZE=120：122 条种子构造两批（第二批 2 条，可容纳一个合法合并组）
    const seed = Array.from({ length: 122 }, (_, i) => makeAtom({ id: `c${i}`, statement: `论断${i}` }))
    const repo = makeAtomsRepo(seed)
    let call = 0
    const llm: BrainLlmFn = async () => {
      call += 1
      if (call === 1) throw new Error('LLM 超时')
      return JSON.stringify({ groups: [{ idx: [0, 1], statement: '第二批合并论断', type: 'fact' }] })
    }
    const svc = new KbConsolidateService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    expect(progress.totalBatches).toBe(2)
    expect(progress.failedBatches).toBe(1)
    expect(progress.processedBatches).toBe(2)
    expect(progress.mergedGroups).toBe(1)
    expect(progress.lastError).toContain('LLM 超时')
    // 第二批的合并真实落库
    expect(repo.rows.some((r) => r.statement === '第二批合并论断')).toBe(true)
  })

  it('输入排除：consolidate 产物 / human / 视角论断不参与归纳', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'd1', statement: '普通论断' }),
      makeAtom({ id: 'd2', statement: '已归纳产物', extractionPass: 'consolidate#1' }),
      makeAtom({ id: 'd3', statement: '我的观感', origin: 'human' }),
      makeAtom({ id: 'd4', statement: '视角论断', lensNoteId: 'lens1' }),
    ])
    const seen: string[] = []
    const llm: BrainLlmFn = async ({ user }) => {
      seen.push(user)
      return JSON.stringify({ groups: [] })
    }
    const svc = new KbConsolidateService({ llm, atoms: repo as never })
    await svc.run('kb1')
    expect(seen[0]).toContain('普通论断')
    expect(seen[0]).not.toContain('已归纳产物')
    expect(seen[0]).not.toContain('我的观感')
    expect(seen[0]).not.toContain('视角论断')
  })

  it('单飞锁：进行中重复 run 抛错', async () => {
    const repo = makeAtomsRepo([makeAtom({ id: 'e1', statement: 'x' })])
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const llm: BrainLlmFn = async () => {
      await gate
      return JSON.stringify({ groups: [] })
    }
    const svc = new KbConsolidateService({ llm, atoms: repo as never })
    const p = svc.run('kb1')
    await new Promise((r) => setTimeout(r, 10))
    await expect(svc.run('kb1')).rejects.toThrow('论断归纳进行中')
    release()
    await p
  })

  it('顶层失败路径：findByKb 炸 → run 抛错、锁释放、lastError 可查', async () => {
    const repo = makeAtomsRepo([])
    repo.findByKb = async () => {
      throw new Error('数据库不可用')
    }
    const llm: BrainLlmFn = async () => JSON.stringify({ groups: [] })
    const svc = new KbConsolidateService({ llm, atoms: repo as never })
    await expect(svc.run('kb1')).rejects.toThrow('数据库不可用')
    expect(svc.isRunning('kb1')).toBe(false)
    expect(svc.status('kb1').lastError).toContain('数据库不可用')
    expect(svc.status('kb1').running).toBe(false)
  })

  it('并发守卫：成员状态被先行改动（非 working set）→ 整组跳过不覆写', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'f1', statement: '碎片一' }),
      makeAtom({ id: 'f2', statement: '碎片二' }),
    ])
    const llm: BrainLlmFn = async () =>
      JSON.stringify({ groups: [{ idx: [0, 1], statement: '合并论断', type: 'fact' }] })
    const svc = new KbConsolidateService({ llm, atoms: repo as never })
    // 模拟裁决先行：findByKb 快照后，f2 被外部 superseded
    const origFind = repo.findByKb.bind(repo)
    repo.findByKb = async (...args: never[]) => {
      await origFind(...(args as []))
      // 首次快照后才污染：直接改状态，findByIds 会重查到
      repo.rows.find((r) => r.id === 'f2')!.status = 'superseded'
      return repo.rows.filter((r) => ['supported', 'suspected'].includes(r.status))
    }
    const progress = await svc.run('kb1')
    expect(progress.mergedGroups).toBe(0)
    expect(progress.supersededAtoms).toBe(0)
    // 无新论断产生
    expect(repo.rows.some((r) => r.statement === '合并论断')).toBe(false)
  })
})

describe('validateConsolidateOutput（schema 归一）', () => {
  it('越界编号过滤、单成员组丢弃、近义命名 merges 归一', () => {
    const out = validateConsolidateOutput(
      {
        merges: [
          { idx: [0, 1, 99], statement: '越界成员被剔除后仍≥2', type: 'fact' },
          { idx: [2], statement: '单成员组', type: 'fact' },
          { idx: [3, '4'], statement: '数字字符串编号收编', type: 'insight' },
          { idx: [], statement: '空组', type: 'fact' },
          '垃圾条目',
        ],
      },
      { count: 5 },
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ idx: [0, 1], statement: '越界成员被剔除后仍≥2', type: 'fact' })
    expect(out[1]).toEqual({ idx: [3, 4], statement: '数字字符串编号收编', type: 'insight' })
  })

  it('type 非法归 fact、statement 缺失剔除', () => {
    const out = validateConsolidateOutput(
      {
        groups: [
          { idx: [0, 1], statement: 'ok', type: 'poem' },
          { idx: [1, 2], statement: '   ', type: 'fact' },
        ],
      },
      { count: 3 },
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.type).toBe('fact')
  })

  it('跨组 idx 重叠：同一编号只归先到组，后组剔重后不足 2 丢弃', () => {
    const out = validateConsolidateOutput(
      {
        groups: [
          { idx: [0, 1, 2], statement: '先到组', type: 'fact' },
          { idx: [1, 2, 3], statement: '重叠组（1/2 已被占用，剩 3 单成员）', type: 'fact' },
          { idx: [3, 4], statement: '后到组（3 空出后仍合法）', type: 'fact' },
        ],
      },
      { count: 5 },
    )
    expect(out).toHaveLength(2)
    expect(out[0]!.idx).toEqual([0, 1, 2])
    expect(out[1]!.idx).toEqual([3, 4])
  })
})
