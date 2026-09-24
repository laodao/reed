/**
 * 存量垃圾清理测试：分诊归档 / 保守保留 / 单批失败跳过 / 输入排除 / 并发守卫 / 解析健壮性
 * fake LLM + fake 仓储（纯编排逻辑，无 DB）。
 */
import { describe, it, expect } from 'vitest'
import { KbCleanupService } from '@core/platform/services/kb-brain/cleanup.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'

interface AtomRow {
  id: string
  knowledgeBaseId: string
  statement: string
  type: string
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
    async updateStatus(id: string, patch: { status: string }) {
      const r = rows.find((x) => x.id === id)
      if (r) r.status = patch.status
    },
  }
}

describe('KbCleanupService', () => {
  it('分诊归档：LLM 标记的垃圾条目 archived，其余不动', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'a1', statement: '萧鼎在人物诗中创作了题为"无题"的诗' }),
      makeAtom({ id: 'a2', statement: '第一章 青云门' }),
      makeAtom({ id: 'a3', statement: '太极玄清道分三重境界，以太极玄清道为核心修炼法门' }),
    ])
    const llm: BrainLlmFn = async () => JSON.stringify({ junk: [0, 1] })
    const svc = new KbCleanupService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    expect(progress.archivedCount).toBe(2)
    expect(progress.failedBatches).toBe(0)
    expect(repo.rows.find((r) => r.id === 'a1')?.status).toBe('archived')
    expect(repo.rows.find((r) => r.id === 'a2')?.status).toBe('archived')
    expect(repo.rows.find((r) => r.id === 'a3')?.status).toBe('supported')
    expect(svc.status('kb1').running).toBe(false)
  })

  it('保守保留：LLM 判无垃圾 → 池子不动', async () => {
    const repo = makeAtomsRepo([makeAtom({ id: 'b1', statement: '正常论断' })])
    const llm: BrainLlmFn = async () => JSON.stringify({ junk: [] })
    const svc = new KbCleanupService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    expect(progress.archivedCount).toBe(0)
    expect(repo.rows.find((r) => r.id === 'b1')?.status).toBe('supported')
  })

  it('输入排除：human 观感/视角论断/归纳产物不参与分诊', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'c1', statement: '普通论断' }),
      makeAtom({ id: 'c2', statement: '我的观感', origin: 'human' }),
      makeAtom({ id: 'c3', statement: '视角论断', lensNoteId: 'lens1' }),
      makeAtom({ id: 'c4', statement: '归纳产物', extractionPass: 'consolidate#1' }),
    ])
    const seen: string[] = []
    const llm: BrainLlmFn = async ({ user }) => {
      seen.push(user)
      return JSON.stringify({ junk: [] })
    }
    const svc = new KbCleanupService({ llm, atoms: repo as never })
    await svc.run('kb1')
    expect(seen[0]).toContain('普通论断')
    expect(seen[0]).not.toContain('我的观感')
    expect(seen[0]).not.toContain('视角论断')
    expect(seen[0]).not.toContain('归纳产物')
  })

  it('并发守卫：条目状态在分诊后被先行改动 → 不覆写', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'd1', statement: '垃圾一' }),
      makeAtom({ id: 'd2', statement: '垃圾二' }),
    ])
    const origFind = repo.findByKb.bind(repo)
    repo.findByKb = async (...args: never[]) => {
      await origFind(...(args as []))
      repo.rows.find((r) => r.id === 'd2')!.status = 'superseded' // 分诊后被人改
      return repo.rows.filter((r) => ['supported', 'suspected', 'stale'].includes(r.status))
    }
    const llm: BrainLlmFn = async () => JSON.stringify({ junk: [0, 1] })
    const svc = new KbCleanupService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    expect(progress.archivedCount).toBe(1)
    expect(repo.rows.find((r) => r.id === 'd2')?.status).toBe('superseded') // 未被改成 archived
  })

  it('单批失败跳过：失败批计入 failedBatches，lastError 可查', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'e1', statement: '垃圾' }),
      makeAtom({ id: 'e2', statement: '也垃圾' }),
    ])
    const llm: BrainLlmFn = async () => {
      throw new Error('LLM 限流')
    }
    const svc = new KbCleanupService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    expect(progress.failedBatches).toBe(1)
    expect(progress.archivedCount).toBe(0)
    expect(progress.lastError).toContain('LLM 限流')
    expect(svc.isRunning('kb1')).toBe(false)
  })

  it('解析健壮性：越界编号过滤、非数字编号剔除、junk 缺省视为空', async () => {
    const repo = makeAtomsRepo([
      makeAtom({ id: 'f1', statement: '一' }),
      makeAtom({ id: 'f2', statement: '二' }),
      makeAtom({ id: 'f3', statement: '三' }),
    ])
    const llm: BrainLlmFn = async () => JSON.stringify({ junk: [0, '1', 99, 'abc', 2] })
    const svc = new KbCleanupService({ llm, atoms: repo as never })
    const progress = await svc.run('kb1')
    // 0/1/2 有效（'1' 数字字符串收编），99 越界、abc 剔除
    expect(progress.archivedCount).toBe(3)
  })

  it('顶层失败路径：findByKb 炸 → 抛错、锁释放、lastError 可查', async () => {
    const repo = makeAtomsRepo([])
    repo.findByKb = async () => {
      throw new Error('数据库不可用')
    }
    const llm: BrainLlmFn = async () => JSON.stringify({ junk: [] })
    const svc = new KbCleanupService({ llm, atoms: repo as never })
    await expect(svc.run('kb1')).rejects.toThrow('数据库不可用')
    expect(svc.isRunning('kb1')).toBe(false)
    expect(svc.status('kb1').lastError).toContain('数据库不可用')
  })
})
