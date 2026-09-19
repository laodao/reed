/**
 * 提取目标提炼（goal-distill）测试
 *
 * map-reduce 编排：章节摘要分批取材 → 素片对回出处 → reduce 成卡 →
 * proposed 入提议箱（同题去重/空素材不出卡/单飞锁）。
 * fake LLM + fake 仓储（纯编排逻辑，无 DB）。
 */
import { describe, it, expect } from 'vitest'
import { KbGoalDistillService, type GoalDistillDeps } from '@core/platform/services/kb-brain/goal-distill.service'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'
import type { KbBrainGoal } from '@core/platform/services/kb-brain/brain-config'

const goal: KbBrainGoal = { id: 'g1', name: '修炼体系', hint: '梳理境界划分与突破条件', enabled: true }

interface NoteRow {
  id: string
  kbId: string
  title: string
  body: string
  status: string
  evidence?: string
}

function makeDeps(
  llm: BrainLlmFn,
  opts: {
    chapters?: Array<{ docId?: string; title: string; summary?: string; content?: string }>
    docs?: Array<{ id: string; name: string }>
    notes?: NoteRow[]
  } = {},
): GoalDistillDeps & { notes: NoteRow[] } {
  const notes = opts.notes ?? []
  const docs = opts.docs ?? [{ id: 'doc1', name: '诛仙' }]
  const chapters = opts.chapters ?? [
    { title: '第一章', summary: '青云门背景，张小凡入草庙村' },
    { title: '第二章', summary: '太极玄清道境界：太极初分' },
  ]
  return {
    llm,
    notes,
    repos: () => ({
      docs: {
        findByKnowledgeBaseId: async () => docs,
      } as never,
      chapters: {
        findByDocument: async (docId: string) =>
          chapters.filter((c) => !c.docId || c.docId === docId).map((c, i) => ({
            id: `${docId}-ch${i}`,
            title: c.title,
            summary: c.summary ?? null,
            content: c.content ?? null,
          })),
      } as never,
      notes: {
        findSimilarTitle: async (_kbId: string, title: string) => notes.filter((n) => n.title === title),
        propose: async (_kbId: string, input: { title: string; description: string; body: string; evidence: string }) => {
          const row: NoteRow = {
            id: `n${notes.length + 1}`,
            kbId: _kbId,
            title: input.title,
            body: input.body,
            status: 'proposed',
            evidence: input.evidence,
          }
          notes.push(row)
          return row as never
        },
      } as never,
    }),
  }
}

describe('KbGoalDistillService', () => {
  it('map-reduce 全链：素材片段 → proposed 卡（标题/正文/证据）', async () => {
    const calls: string[] = []
    const llm: BrainLlmFn = async ({ user }) => {
      calls.push(user)
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({
          fragments: [
            { chapter: '《诛仙》#1 第一章', info: '草庙村惨案是全书起点事件', note: '核心冲突源头' },
            { chapter: '《诛仙》#2 第二章', info: '太极玄清道分三重境界', note: '体系主干' },
          ],
        })
      }
      return JSON.stringify({
        title: '修炼体系：《诛仙》境界三层递进',
        description: '需要设计修真世界力量体系时使用。',
        body: '## 境界\n- 太极玄清道分三重 [《诛仙》#2 第二章]',
      })
    }
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(true)
    expect(out.fragments).toBe(2)
    expect(out.cardTitle).toBe('修炼体系：《诛仙》境界三层递进')
    expect(deps.notes).toHaveLength(1)
    expect(deps.notes[0].status).toBe('proposed')
    expect(deps.notes[0].body).toContain('太极玄清道')
    // reduce 输入必须带出处标签（防幻觉根）
    const reduceCall = calls[calls.length - 1]
    expect(reduceCall).toContain('《诛仙》#1 第一章')
  })

  it('map 返回空素材 → 不出卡（proposed=false）', async () => {
    const llm: BrainLlmFn = async () => JSON.stringify({ fragments: [] })
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(false)
    expect(out.fragments).toBe(0)
    expect(deps.notes).toHaveLength(0)
  })

  it('同题已有非归档卡 → 跳过不重复生成', async () => {
    const llm: BrainLlmFn = async ({ user }) => {
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({ fragments: [{ chapter: '《诛仙》#1 第一章', info: 'x', note: '' }] })
      }
      return JSON.stringify({ title: '同题卡', description: 'd', body: 'b' })
    }
    const deps = makeDeps(llm, { notes: [{ id: 'n0', kbId: 'kb1', title: '同题卡', body: '', status: 'published' }] })
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.skippedDuplicate).toBe(true)
    expect(out.proposed).toBe(false)
    expect(deps.notes).toHaveLength(1)
  })

  it('reduce 输出缺 body → 重试 1 次仍失败 → 抛错（响亮失败）', async () => {
    let calls = 0
    const llm: BrainLlmFn = async ({ user }) => {
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({ fragments: [{ chapter: '《诛仙》#1 第一章', info: 'x', note: '' }] })
      }
      calls++
      return JSON.stringify({ title: 't' }) // 永远缺 body
    }
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    await expect(svc.runGoal('kb1', goal)).rejects.toThrow(/经验卡生成失败/)
    expect(calls).toBe(2)
  })

  it('无章节 → 抛错提示（文档未处理）', async () => {
    const llm: BrainLlmFn = async () => JSON.stringify({ fragments: [] })
    const deps = makeDeps(llm, { chapters: [] })
    const svc = new KbGoalDistillService(deps)
    await expect(svc.runGoal('kb1', goal)).rejects.toThrow(/没有可取材的章节/)
  })

  it('单飞锁：进行中重复调用抛错', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const llm: BrainLlmFn = async ({ user }) => {
      if (user.includes('【章节摘要】')) {
        await gate
        return JSON.stringify({ fragments: [{ chapter: '《诛仙》#1 第一章', info: 'x', note: '' }] })
      }
      return JSON.stringify({ title: 't', description: 'd', body: 'b' })
    }
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const p = svc.runGoal('kb1', goal)
    await expect(svc.runGoal('kb1', goal)).rejects.toThrow(/进行中/)
    release()
    await p
    // 完成后锁释放
    await expect(svc.runGoal('kb1', goal)).resolves.toBeDefined()
  })

  it('map 单批 LLM 失败 → 跳过该批继续，其余批次素材保留', async () => {
    let mapCalls = 0
    const llm: BrainLlmFn = async ({ user }) => {
      if (user.includes('【章节摘要】')) {
        mapCalls++
        if (mapCalls === 1) throw new Error('provider 超时')
        return JSON.stringify({ fragments: [{ chapter: '《诛仙》#1 第一章', info: '第二批素材', note: '' }] })
      }
      return JSON.stringify({ title: 't', description: 'd', body: 'b' })
    }
    // 25 章 → 3 批（12/12/1）：批 1 失败，批 2/3 正常
    const chapters = Array.from({ length: 25 }, (_, i) => ({ title: `第${i + 1}章`, summary: `摘要${i + 1}` }))
    const deps = makeDeps(llm, { chapters })
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.batches).toBe(3)
    expect(out.proposed).toBe(true)
    expect(out.fragments).toBeGreaterThanOrEqual(1)
  })

  it('模型只回 #N 标题（无书名）→ 双向匹配到对应章', async () => {
    const llm: BrainLlmFn = async ({ user }) => {
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({ fragments: [{ chapter: '#2 第二章', info: '境界信息', note: '' }] })
      }
      return JSON.stringify({ title: 't', description: 'd', body: 'b' })
    }
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(true)
    const evidence = JSON.parse(deps.notes[0].evidence ?? '[]') as Array<{ quote: string }>
    expect(evidence[0].quote).toBe('《诛仙》#2 第二章')
  })

  it('章节标签对不回取材清单 → 兜底用本批首个标签（防编章）', async () => {
    const llm: BrainLlmFn = async ({ user }) => {
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({
          fragments: [{ chapter: '《不存在的书》#99 幻觉章', info: '真实信息', note: '' }],
        })
      }
      return JSON.stringify({ title: 't', description: 'd', body: 'b' })
    }
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(true)
    const evidence = JSON.parse(deps.notes[0].evidence ?? '[]') as Array<{ quote: string }>
    expect(evidence[0].quote).toBe('《诛仙》#1 第一章')
  })
})
