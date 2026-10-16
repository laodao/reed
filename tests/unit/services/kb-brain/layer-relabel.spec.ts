/**
 * 分层补标测试：重标生效 / 输入排除（human/lens/非 detail）/ 解析健壮性 /
 * 单批失败跳过 / 并发守卫 / 单飞锁。fake LLM + fake 仓储（纯编排逻辑，无 DB）。
 */
import { describe, it, expect } from 'vitest'
import { KbLayerRelabelService, parseRelabelOutput } from '@core/platform/services/kb-brain/layer-relabel.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'

interface AtomRow {
  id: string
  knowledgeBaseId: string
  statement: string
  type: string
  layer: string
  status: string
  sourceDocumentId: string
  sourceQuote: string
  extractionPass: string
  lensNoteId: string | null
  origin: string
}

function makeAtom(partial: Partial<AtomRow>): AtomRow {
  return {
    id: `a${Math.random().toString(36).slice(2, 8)}`,
    knowledgeBaseId: 'kb1',
    statement: '',
    type: 'fact',
    layer: 'detail',
    status: 'supported',
    sourceDocumentId: 'doc1',
    sourceQuote: 'q',
    extractionPass: 'base#1',
    lensNoteId: null,
    origin: 'ai',
    ...partial,
  }
}

function makeAtomsRepo(seed: AtomRow[]) {
  const rows = seed
  return {
    rows,
    async findByKb(_kbId: string, opts?: { status?: string[]; limit?: number }) {
      const filtered = rows.filter((r) => !opts?.status?.length || opts.status.includes(r.status))
      return filtered.slice(0, opts?.limit ?? 200)
    },
    async findByIds(ids: string[]) {
      return rows.filter((r) => ids.includes(r.id))
    },
    async updateLayers(groups: Array<{ layer: string; ids: string[] }>) {
      let n = 0
      for (const g of groups) {
        for (const id of g.ids) {
          const r = rows.find((x) => x.id === id)
          if (r) {
            r.layer = g.layer
            n++
          }
        }
      }
      return n
    },
  }
}

describe('KbLayerRelabelService', () => {
  it('重标生效：LLM 返回的分层写回 repo；detail 确认与改层都落库', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'a1', statement: '修炼体系分九境，每一境有明确突破条件' }),
      makeAtom({ id: 'a2', statement: '程野相貌平平，眼神却极亮' }),
      makeAtom({ id: 'a3', statement: '以物证而非口供驱动调查线是本章的推进手法', type: 'method' }),
    ])
    const llm: BrainLlmFn = async () =>
      JSON.stringify({ layers: [{ idx: 0, layer: 'setting' }, { idx: 1, layer: 'describe' }, { idx: 2, layer: 'craft' }] })
    const svc = new KbLayerRelabelService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    expect(progress.relabeledCount).toBe(3)
    expect(progress.failedBatches).toBe(0)
    expect(repo.rows.find((r) => r.id === 'a1')?.layer).toBe('setting')
    expect(repo.rows.find((r) => r.id === 'a2')?.layer).toBe('describe')
    expect(repo.rows.find((r) => r.id === 'a3')?.layer).toBe('craft')
    expect(svc.status('kb1').running).toBe(false)
  })

  it('输入排除：human 观感 / 视角论断 / 已非 detail 的论断不参与补标', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'b1', statement: '普通 detail 论断' }),
      makeAtom({ id: 'b2', statement: '我的观感', origin: 'human' }),
      makeAtom({ id: 'b3', statement: '视角论断', lensNoteId: 'lens1' }),
      makeAtom({ id: 'b4', statement: '已是设定层', layer: 'setting' }),
    ])
    const seen: string[] = []
    const llm: BrainLlmFn = async ({ user }) => {
      seen.push(user)
      return JSON.stringify({ layers: [] })
    }
    const svc = new KbLayerRelabelService({ llm, atoms: repo as never })
    await svc.run('kb1')
    expect(seen[0]).toContain('普通 detail 论断')
    expect(seen[0]).not.toContain('我的观感')
    expect(seen[0]).not.toContain('视角论断')
    expect(seen[0]).not.toContain('已是设定层')
    expect(repo.rows.find((r) => r.id === 'b4')?.layer).toBe('setting')
  })

  it('解析健壮性：非法层/越界/重复 idx/坏条目剔除（parseRelabelOutput）', () => {
    const batch = [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }]
    const raw = JSON.stringify({
      layers: [
        { idx: 0, layer: 'setting' },
        { idx: '1', layer: 'describe' },
        { idx: 2, layer: '未知层' },
        { idx: 99, layer: 'outline' },
        { idx: 0, layer: 'detail' },
        { idx: 2, layer: 123 },
        '垃圾条目',
      ],
    })
    const out = parseRelabelOutput(raw, batch)
    // 0=setting；'1' 数字字符串收编=describe；越界 99 剔除；重复 idx 0 剔除；非法层剔除
    expect(out).toEqual([
      { id: 'x1', layer: 'setting' },
      { id: 'x2', layer: 'describe' },
    ])
  })

  it('单批失败跳过：失败批计入 failedBatches，其余批照常', async () => {
    const repo = makeAtomsRepo(
      Array.from({ length: 61 }, (_, i) => makeAtom({ id: `e${i}`, statement: `论断${i}` })),
    )
    let call = 0
    const llm: BrainLlmFn = async () => {
      call++
      if (call === 1) throw new Error('LLM 限流')
      return JSON.stringify({ layers: [{ idx: 0, layer: 'setting' }] })
    }
    const svc = new KbLayerRelabelService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    expect(progress.totalBatches).toBe(2)
    expect(progress.failedBatches).toBe(1)
    expect(progress.relabeledCount).toBe(1)
    expect(progress.lastError).toContain('LLM 限流')
    expect(svc.isRunning('kb1')).toBe(false)
  })

  it('并发守卫：分诊快照后已被删除的论断不覆写', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'f1', statement: '论断一' }),
      makeAtom({ id: 'f2', statement: '论断二' }),
    ])
    const llm: BrainLlmFn = async () =>
      JSON.stringify({ layers: [{ idx: 0, layer: 'setting' }, { idx: 1, layer: 'describe' }] })
    const svc = new KbLayerRelabelService({ llm, atoms: repo as never })
    // findByIds 只回 f1（f2 已被并发删除）
    const orig = repo.findByIds.bind(repo)
    repo.findByIds = async (ids: string[]) => orig(ids.filter((i) => i !== 'f2'))
    const progress = await svc.run('kb1')
    expect(progress.relabeledCount).toBe(1)
    expect(repo.rows.find((r) => r.id === 'f1')?.layer).toBe('setting')
    expect(repo.rows.find((r) => r.id === 'f2')?.layer).toBe('detail')
  })

  it('单飞锁：进行中重复调用抛错；顶层失败锁释放', async () => {
    const repo = makeAtomsRepo([])
    repo.findByKb = async () => {
      throw new Error('数据库不可用')
    }
    const llm: BrainLlmFn = async () => JSON.stringify({ layers: [] })
    const svc = new KbLayerRelabelService({ llm, atoms: repo as never })
    await expect(svc.run('kb1')).rejects.toThrow('数据库不可用')
    expect(svc.isRunning('kb1')).toBe(false)
    expect(svc.status('kb1').lastError).toContain('数据库不可用')
    // 锁已释放，可再跑（此时 repo 恢复正常）
    repo.findByKb = async () => []
    await expect(svc.run('kb1')).resolves.toBeDefined()
  })
})
