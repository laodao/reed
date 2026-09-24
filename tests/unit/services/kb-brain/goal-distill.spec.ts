/**
 * 提取目标提炼（goal-distill）测试
 *
 * map-reduce 编排：章节摘要分批取材 → 素片对回出处 → 精读提名章 →
 * reduce 两段式（素材主题分组 → 逐主题各出一张卡）→ proposed 入提议箱。
 * fake LLM 按提示词标记路由（【章节摘要】/【章全文】/【主题分组】/【当前主题】）。
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
  // chapters 仓提外层单例：repos() 每次调用返回新字面量会丢掉测试注入的 findById
  const chaptersRepo = {
    findByDocument: async (docId: string) =>
      chapters.filter((c) => !c.docId || c.docId === docId).map((c, i) => ({
        id: `${docId}-ch${i}`,
        title: c.title,
        summary: c.summary ?? null,
        content: c.content ?? null,
      })),
  }
  return {
    llm,
    notes,
    repos: () => ({
      docs: {
        findByKnowledgeBaseId: async () => docs,
      } as never,
      chapters: chaptersRepo as never,
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

/** LLM fake 路由器：按提示词标记分发；card 响应可由当前主题名动态生成 */
interface LlmRoute {
  summary?: unknown
  closeRead?: unknown
  themes?: unknown
  card?: (themeName: string) => unknown
  onCall?: (user: string) => void
}

function routeLlm(route: LlmRoute): BrainLlmFn {
  return async ({ user }) => {
    route.onCall?.(user)
    if (user.includes('【章节摘要】')) return JSON.stringify(route.summary ?? { fragments: [] })
    if (user.includes('【章全文】')) return JSON.stringify(route.closeRead ?? { fragments: [] })
    if (user.includes('【主题分组】')) return JSON.stringify(route.themes ?? { themes: [] })
    if (user.includes('【当前主题】')) {
      const m = /【当前主题】(.+)/.exec(user)
      const themeName = (m?.[1] ?? '').trim()
      return JSON.stringify(route.card ? route.card(themeName) : { title: `卡-${themeName}`, description: 'd', body: `b-${themeName}` })
    }
    return JSON.stringify({ fragments: [] })
  }
}

describe('KbGoalDistillService', () => {
  it('map-reduce 全链：素材 → 主题分组 → 出卡 → proposed（出处标签进卡片调用）', async () => {
    const cardCalls: string[] = []
    const llm = routeLlm({
      summary: {
        fragments: [
          { chapter: '《诛仙》#1 第一章', info: '草庙村惨案是全书起点事件', note: '核心冲突源头' },
          { chapter: '《诛仙》#2 第二章', info: '太极玄清道分三重境界', note: '体系主干' },
        ],
      },
      themes: { themes: [{ name: '境界体系', idx: [0, 1] }] },
      card: () => ({
        title: '修炼体系：《诛仙》境界三层递进',
        description: '需要设计修真世界力量体系时使用。',
        body: '## 境界\n- 太极玄清道分三重 [《诛仙》#2 第二章]',
      }),
      onCall: (u) => {
        if (u.includes('【当前主题】')) cardCalls.push(u)
      },
    })
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(true)
    expect(out.fragments).toBe(2)
    expect(out.cards).toBe(1)
    expect(out.cardTitle).toBe('修炼体系：《诛仙》境界三层递进')
    expect(deps.notes).toHaveLength(1)
    expect(deps.notes[0].status).toBe('proposed')
    expect(deps.notes[0].body).toContain('太极玄清道')
    // 出卡调用必须带出处标签与主题名（防幻觉根）
    expect(cardCalls).toHaveLength(1)
    expect(cardCalls[0]).toContain('《诛仙》#1 第一章')
    expect(cardCalls[0]).toContain('【当前主题】境界体系')
  })

  it('reduce 两段式：素材分 N 个主题 → 逐主题出 N 张卡（素材驱动，无硬性 3 张上限）', async () => {
    const llm = routeLlm({
      summary: {
        fragments: [
          { chapter: '第一章', info: 'i1', note: 'n1' },
          { chapter: '第二章', info: 'i2', note: 'n2' },
          { chapter: '第三章', info: 'i3', note: 'n3' },
          { chapter: '第四章', info: 'i4', note: 'n4' },
        ],
      },
      themes: {
        themes: [
          { name: '甲', idx: [0, 1] },
          { name: '乙', idx: [1, 2] },
          { name: '丙', idx: [2, 3] },
          { name: '丁', idx: [0, 3] },
        ],
      },
    })
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(true)
    expect(out.cards).toBe(4)
    expect(deps.notes.map((n) => n.title)).toEqual(['卡-甲', '卡-乙', '卡-丙', '卡-丁'])
  })

  it('主题清洗：越界/单成员组剔除，重复编号收编', async () => {
    const llm = routeLlm({
      summary: {
        fragments: [
          { chapter: '第一章', info: 'i1', note: '' },
          { chapter: '第二章', info: 'i2', note: '' },
          { chapter: '第三章', info: 'i3', note: '' },
        ],
      },
      themes: {
        themes: [
          { name: '有效组', idx: [0, 1, 1] },
          { name: '越界组', idx: [0, 99] },
          { name: '单成员组', idx: [2] },
          { name: '垃圾条目', idx: 'not-array' },
        ],
      },
    })
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.cards).toBe(1)
    expect(deps.notes.map((n) => n.title)).toEqual(['卡-有效组'])
  })

  it('部分主题出卡失败 → 跳过失败主题，其余照常入箱（不废全场）', async () => {
    let cardCalls = 0
    const llm: BrainLlmFn = async ({ user }) => {
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({
          fragments: [
            { chapter: '第一章', info: 'i1', note: '' },
            { chapter: '第二章', info: 'i2', note: '' },
          ],
        })
      }
      if (user.includes('【主题分组】')) {
        return JSON.stringify({
          themes: [
            { name: '会失败的主题', idx: [0, 1] },
            { name: '会成功的主题', idx: [0, 1] },
          ],
        })
      }
      if (user.includes('【当前主题】')) {
        cardCalls++
        const m = /【当前主题】(.+)/.exec(user)
        if ((m?.[1] ?? '').trim() === '会失败的主题') return JSON.stringify({ title: 't' }) // 永远缺 body
        return JSON.stringify({ title: '成功卡', description: 'd', body: 'b' })
      }
      return JSON.stringify({ fragments: [] })
    }
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(cardCalls).toBe(3) // 失败主题重试 1 次 + 成功主题 1 次
    expect(out.cards).toBe(1)
    expect(out.proposed).toBe(true)
    expect(deps.notes.map((n) => n.title)).toEqual(['成功卡'])
  })

  it('主题数超上限 → 裁到 8 组；重名主题加序号后缀不互相吞卡', async () => {
    const themes = Array.from({ length: 10 }, (_, i) => ({
      name: i < 2 ? '重名' : `主题${i}`,
      idx: [0, 1] as number[],
    }))
    const llm = routeLlm({
      summary: {
        fragments: [
          { chapter: '第一章', info: 'i1', note: '' },
          { chapter: '第二章', info: 'i2', note: '' },
        ],
      },
      themes: { themes },
    })
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.cards).toBe(8) // MAX_THEMES_PER_GOAL 裁剪
    const titles = deps.notes.map((n) => n.title)
    expect(titles).toContain('卡-重名')
    expect(titles).toContain('卡-重名#2') // 重名后缀：两卡都不被同题去重吞掉
  })

  it('部分去重：2 主题 1 卡同题 → cards=1、proposed=true、skippedDuplicate=false', async () => {
    const llm = routeLlm({
      summary: {
        fragments: [
          { chapter: '第一章', info: 'i1', note: '' },
          { chapter: '第二章', info: 'i2', note: '' },
        ],
      },
      themes: {
        themes: [
          { name: '甲', idx: [0, 1] },
          { name: '乙', idx: [0, 1] },
        ],
      },
      card: (themeName) => ({ title: themeName === '甲' ? '已存在卡' : '新卡', description: 'd', body: 'b' }),
    })
    const deps = makeDeps(llm, { notes: [{ id: 'n0', kbId: 'kb1', title: '已存在卡', body: '', status: 'published' }] })
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.cards).toBe(1)
    expect(out.proposed).toBe(true)
    expect(out.skippedDuplicate).toBe(false)
    expect(deps.notes.map((n) => n.title)).toContain('新卡')
  })

  it('map 返回空素材 → 不出卡（proposed=false）', async () => {
    const llm = routeLlm({ summary: { fragments: [] } })
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(false)
    expect(out.fragments).toBe(0)
    expect(deps.notes).toHaveLength(0)
  })

  it('同题已有非归档卡 → 跳过不重复生成', async () => {
    const llm = routeLlm({
      summary: {
        fragments: [
          { chapter: '第一章', info: 'x', note: '' },
          { chapter: '第二章', info: 'y', note: '' },
        ],
      },
      themes: { themes: [{ name: '甲', idx: [0, 1] }] },
      card: () => ({ title: '同题卡', description: 'd', body: 'b' }),
    })
    const deps = makeDeps(llm, { notes: [{ id: 'n0', kbId: 'kb1', title: '同题卡', body: '', status: 'published' }] })
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.skippedDuplicate).toBe(true)
    expect(out.proposed).toBe(false)
    expect(deps.notes).toHaveLength(1)
  })

  it('出卡缺 body → 该主题重试 1 次仍失败 → 全部主题失败时抛错（响亮失败）', async () => {
    let cardCalls = 0
    const llm: BrainLlmFn = async ({ user }) => {
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({
          fragments: [
            { chapter: '第一章', info: 'x', note: '' },
            { chapter: '第二章', info: 'y', note: '' },
          ],
        })
      }
      if (user.includes('【主题分组】')) {
        return JSON.stringify({ themes: [{ name: '甲', idx: [0, 1] }] })
      }
      cardCalls++
      return JSON.stringify({ title: 't' }) // 永远缺 body
    }
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    await expect(svc.runGoal('kb1', goal)).rejects.toThrow(/经验卡生成失败/)
    expect(cardCalls).toBe(2) // 同一主题重试 1 次
  })

  it('无章节 → 抛错提示（文档未处理）', async () => {
    const llm = routeLlm({})
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
        return JSON.stringify({
          fragments: [
            { chapter: '第一章', info: 'x', note: '' },
            { chapter: '第二章', info: 'y', note: '' },
          ],
        })
      }
      if (user.includes('【主题分组】')) return JSON.stringify({ themes: [{ name: '甲', idx: [0, 1] }] })
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
        return JSON.stringify({
          fragments: [
            { chapter: '《诛仙》#1 第一章', info: '第二批素材1', note: '' },
            { chapter: '《诛仙》#2 第二章', info: '第二批素材2', note: '' },
          ],
        })
      }
      if (user.includes('【主题分组】')) return JSON.stringify({ themes: [{ name: '甲', idx: [0, 1] }] })
      return JSON.stringify({ title: 't', description: 'd', body: 'b' })
    }
    // 25 章 → 3 批（12/12/1）：批 1 失败，批 2/3 正常
    const chapters = Array.from({ length: 25 }, (_, i) => ({ title: `第${i + 1}章`, summary: `摘要${i + 1}` }))
    const deps = makeDeps(llm, { chapters })
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.batches).toBe(3)
    expect(out.proposed).toBe(true)
    expect(out.fragments).toBeGreaterThanOrEqual(2)
  })

  it('模型只回 #N 标题（无书名）→ 双向匹配到对应章', async () => {
    const llm = routeLlm({
      summary: {
        fragments: [
          { chapter: '#2 第二章', info: '境界信息', note: '' },
          { chapter: '第一章', info: 'i2', note: '' },
        ],
      },
      themes: { themes: [{ name: '甲', idx: [0, 1] }] },
    })
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(true)
    const evidence = JSON.parse(deps.notes[0].evidence ?? '[]') as Array<{ quote: string }>
    expect(evidence[0].quote).toBe('《诛仙》#2 第二章')
  })

  it('章节标签对不回取材清单 → 兜底用本批首个标签（防编章）', async () => {
    const llm = routeLlm({
      summary: {
        fragments: [
          { chapter: '《不存在的书》#99 幻觉章', info: '真实信息', note: '' },
          { chapter: '第一章', info: 'i2', note: '' },
        ],
      },
      themes: { themes: [{ name: '甲', idx: [0, 1] }] },
    })
    const deps = makeDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(true)
    const evidence = JSON.parse(deps.notes[0].evidence ?? '[]') as Array<{ quote: string }>
    expect(evidence[0].quote).toBe('《诛仙》#1 第一章')
  })
})

describe('shortBookName', () => {
  it('真机文件名 → 短书名', async () => {
    const { shortBookName } = await import('@core/platform/services/kb-brain/goal-distill.service')
    expect(shortBookName('凡人修仙传 (忘语) (z-library.sk, 1lib.sk, z-lib.sk).epub')).toBe('凡人修仙传')
    expect(shortBookName('辰东-《完美世界》（校对版全本） (辰东) (z-library.sk).epub')).toBe('《完美世界》')
    expect(shortBookName('诛仙 (萧鼎) (z-library.sk, 1lib.sk, z-lib.sk).epub')).toBe('诛仙')
    expect(shortBookName('斗破苍穹.epub')).toBe('斗破苍穹')
    expect(shortBookName('无扩展名文档')).toBe('无扩展名文档')
  })
})

describe('KbGoalDistillService 精读阶段', () => {
  function makeChapterDeps(llm: BrainLlmFn, notes: NoteRow[] = []) {
    const deps = makeDeps(llm, {
      notes,
      chapters: [
        { docId: 'doc1', title: '第一章', summary: '主角进入遗迹' },
        { docId: 'doc1', title: '第二章', summary: '大战爆发' },
      ],
    })
    // 给 findById 注入全文（makeDeps 的 fake 只有 findByDocument）
    const repos = (deps.repos as () => { chapters: { findById?: unknown } })()
    ;(repos.chapters as { findById: (id: string) => Promise<{ content: string } | null> }).findById = async (id: string) => {
      // findByDocument 生成 id 规则：${docId}-ch${index}——第一章是 doc1-ch0
      if (id === 'doc1-ch0') return { content: '【第一章全文】他推开石门，符文在墙上亮起，三重考验依次降临：心、力、道。'.repeat(3) }
      return null
    }
    return deps
  }

  it('提名章触发精读：全文进入提示词、素材带【精读】前缀并入卡片素材', async () => {
    const calls: string[] = []
    const llm: BrainLlmFn = async ({ user }) => {
      calls.push(user)
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({
          fragments: [{ chapter: '《诛仙》#1 第一章', info: '主角进入遗迹', note: '' }],
          nominations: [{ chapter: '《诛仙》#1 第一章', reason: '遗迹考验是核心场面', score: 5 }],
        })
      }
      if (user.includes('【章全文】')) {
        return JSON.stringify({
          fragments: [{ chapter: '《诛仙》#1 第一章', info: '三重考验结构：心、力、道', note: '经典试炼设计' }],
        })
      }
      if (user.includes('【主题分组】')) {
        return JSON.stringify({ themes: [{ name: '试炼设计', idx: [0, 1] }] })
      }
      return JSON.stringify({ title: '试炼设计经验', description: 'd', body: 'b' })
    }
    const deps = makeChapterDeps(llm)
    const svc = new KbGoalDistillService(deps)
    const out = await svc.runGoal('kb1', goal)
    expect(out.proposed).toBe(true)
    expect(out.fragments).toBe(2) // 1 摘要 + 1 精读
    const closeCall = calls.find((c) => c.includes('【章全文】'))
    expect(closeCall).toContain('三重考验依次降临')
    const cardCall = calls.find((c) => c.includes('【当前主题】'))
    expect(cardCall).toContain('【精读】')
    expect(deps.notes[0].evidence).toContain('【精读】')
  })

  it('无提名 → 不触发精读调用（向后兼容旧流程）', async () => {
    const calls: string[] = []
    const llm: BrainLlmFn = async ({ user }) => {
      calls.push(user)
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({
          fragments: [
            { chapter: '第一章', info: 'x', note: '' },
            { chapter: '第二章', info: 'y', note: '' },
          ],
        })
      }
      if (user.includes('【主题分组】')) return JSON.stringify({ themes: [{ name: '甲', idx: [0, 1] }] })
      return JSON.stringify({ title: 't', description: 'd', body: 'b' })
    }
    const deps = makeChapterDeps(llm)
    const svc = new KbGoalDistillService(deps)
    await svc.runGoal('kb1', goal)
    expect(calls.filter((c) => c.includes('【章全文】'))).toHaveLength(0)
  })

  it('提名标签对不回取材清单 → 丢弃（防编章）', async () => {
    let closeCalls = 0
    const llm: BrainLlmFn = async ({ user }) => {
      if (user.includes('【章节摘要】')) {
        return JSON.stringify({
          fragments: [],
          nominations: [{ chapter: '《幻觉之书》#99', reason: 'r', score: 5 }],
        })
      }
      if (user.includes('【章全文】')) closeCalls++
      return JSON.stringify({ title: 't', description: 'd', body: 'b' })
    }
    const deps = makeChapterDeps(llm)
    const svc = new KbGoalDistillService(deps)
    // 素材为空 → 不出卡（fragments 空在精读前就 return）
    const out = await svc.runGoal('kb1', goal)
    expect(closeCalls).toBe(0)
    expect(out.proposed).toBe(false)
  })
})
