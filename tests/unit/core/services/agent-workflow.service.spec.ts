/**
 * AgentWorkflowService 单测（fake db/ai 注入）
 * 覆盖：决策解析（normalizeDecision）、生产状态/依赖/建议（agent-deps）、
 *      动作执行（去重落库/依赖 skipped/失败隔离）、sendMessage 编排（纯对话/动作轮/降级）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock 事件发射器（捕获 emit 事件供断言）
const emitted: Array<{ channel: string; data: any }> = []
vi.mock('@core/interfaces/event.interface', () => ({
  getEventEmitter: () => ({
    emit: (channel: string, data: any) => emitted.push({ channel, data }),
    emitProgress: () => {},
    emitStatus: () => {},
  }),
}))

import { AgentWorkflowService, normalizeDecision, agentConversationId } from '@core/services/longwriting/agent/agent-workflow.service'
import { computeProductionState, checkActionDependency, buildSuggestions } from '@core/services/longwriting/agent/agent-deps'
import { executeActions } from '@core/services/longwriting/agent/agent-actions'

// ==================== fake db ====================

function makeFakeDb(over: Record<string, unknown> = {}) {
  const characters: any[] = []
  const plots: any[] = []
  const outlines: any[] = []
  const chaptersMap = new Map<string, any>()
  const designMessages: any[] = []
  let overview: any = null

  return {
    lwStoryOverviews: {
      getByProjectId: vi.fn(async () => overview),
      update: vi.fn(async (id: string, data: any) => {
        overview = { id, ...(overview || {}), ...data }
        return overview
      }),
    },
    lwCharacters: {
      getByProjectId: vi.fn(async () => [...characters]),
      create: vi.fn(async (data: any) => {
        const c = { id: `c${characters.length + 1}`, ...data }
        characters.push(c)
        return c
      }),
      getById: vi.fn(async (id: string) => characters.find(c => c.id === id) || null),
      delete: vi.fn(async (id: string) => {
        const i = characters.findIndex(c => c.id === id)
        if (i === -1) return false
        characters.splice(i, 1)
        return true
      }),
      update: vi.fn(async (id: string, patch: any) => {
        const c = characters.find(x => x.id === id)
        if (!c) return null
        Object.assign(c, patch)
        return c
      }),
    },
    lwPlots: {
      getByProjectId: vi.fn(async () => [...plots]),
      batchCreate: vi.fn(async (_pid: string, list: any[]) => {
        const created = list.map((p, i) => ({ id: `p${plots.length + i + 1}`, ...p }))
        plots.push(...created)
        return created
      }),
      getById: vi.fn(async (id: string) => plots.find(p => p.id === id) || null),
      delete: vi.fn(async (id: string) => {
        const i = plots.findIndex(p => p.id === id)
        if (i === -1) return false
        plots.splice(i, 1)
        return true
      }),
      update: vi.fn(async (id: string, patch: any) => {
        const p = plots.find(x => x.id === id)
        if (!p) return null
        Object.assign(p, patch)
        return p
      }),
    },
    lwOutlines: {
      getTreeByProjectId: vi.fn(async () => [...outlines]),
      getById: vi.fn(async (id: string) => outlines.find(o => o.id === id) || null),
      create: vi.fn(async (data: any) => {
        const o = { id: `o${outlines.length + 1}`, status: 'pending', orderIndex: outlines.length, ...data }
        outlines.push(o)
        return o
      }),
      delete: vi.fn(async (id: string) => {
        const i = outlines.findIndex(o => o.id === id)
        if (i === -1) return false
        outlines.splice(i, 1)
        return true
      }),
      update: vi.fn(async (id: string, patch: any) => {
        const o = outlines.find(x => x.id === id)
        if (!o) return null
        Object.assign(o, patch)
        return o
      }),
    },
    lwChapters: {
      getByOutlineIds: vi.fn(async (ids: string[]) => {
        const m = new Map<string, any>()
        for (const id of ids) if (chaptersMap.has(id)) m.set(id, chaptersMap.get(id))
        return m
      }),
      getByOutlineId: vi.fn(async (id: string) => chaptersMap.get(id) || null),
      create: vi.fn(async (outlineId: string, content: string) => {
        const ch = { id: `ch${chaptersMap.size + 1}`, outlineId, content }
        chaptersMap.set(outlineId, ch)
        return ch
      }),
      updateContent: vi.fn(async (id: string, content: string) => {
        const ch = [...chaptersMap.values()].find(x => x.id === id)
        if (ch) ch.content = content
        return ch
      }),
      createVersion: vi.fn(async () => ({})),
    },
    lwBackgrounds: {
      getByProjectId: vi.fn(async () => null),
      create: vi.fn(async (pid: string) => ({ id: 'bg1', projectId: pid, eraDescription: '' })),
      update: vi.fn(async (id: string, data: any) => ({ id, ...data })),
    },
    lwLocations: { getByProjectId: vi.fn(async () => []), create: vi.fn(async (d: any) => ({ id: 'l1', ...d })) },
    lwFactions: { getByProjectId: vi.fn(async () => []), create: vi.fn(async (d: any) => ({ id: 'f1', ...d })) },
    lwSkills: { getByProjectId: vi.fn(async () => []), create: vi.fn(async (d: any) => ({ id: 's1', ...d })) },
    lwItems: { getByProjectId: vi.fn(async () => []), create: vi.fn(async (d: any) => ({ id: 'i1', ...d })) },
    lwGraphEdges: { deleteByEntity: vi.fn(async () => 0) },
    lwDesignMessages: {
      add: vi.fn(async (convId: string, msg: any) => {
        const m = { conversationId: convId, ...msg }
        designMessages.push(m)
        return m
      }),
      getByConversationId: vi.fn(async (convId: string) => designMessages.filter(m => m.conversationId === convId)),
    },
    ...over,
  }
}

// ==================== fake ai ====================

function makeFakeAi(over: Record<string, unknown> = {}) {
  return {
    agentDecide: vi.fn(async () => '{"reply":"好的","actions":[]}'),
    agentSummarize: vi.fn(async () => '好的，已完成。'),
    generateCharacters: vi.fn(async () => ({ success: true, data: [{ name: '张三', rolePosition: 'protagonist' }] })),
    generatePlots: vi.fn(async () => ({ success: true, data: [{ title: '拜师学艺', summary: '张三拜入青云宗' }] })),
    generateOutlineStory: vi.fn(async () => ({
      success: true,
      data: [{ name: '第一卷', chapters: [{ name: '第一章', sections: [{ name: '第一节' }] }] }],
    })),
    generateChapter: vi.fn(async () => ({ success: true, data: { content: '这是章节正文。'.repeat(20) } })),
    generateStoryOverview: vi.fn(async () => ({
      success: true,
      data: { title: '青云志', storyType: 'xianxia', summary: '少年修仙', coreConflict: '正邪之争', estimatedChapters: 30 },
    })),
    generateSkillsItems: vi.fn(async () => ({ success: true, data: { skills: [], items: [] } })),
    generateLocations: vi.fn(async () => ({ success: true, data: [] })),
    generateFactions: vi.fn(async () => ({ success: true, data: [] })),
    polishBackground: vi.fn(async () => ({ success: true, data: { content: '时代背景描述' } })),
    cancelGeneration: vi.fn(),
    cancelAllForProject: vi.fn(() => 1),
    ...over,
  }
}

// ==================== 测试 ====================

describe('normalizeDecision 决策解析', () => {
  it('解析纯 JSON', () => {
    const d = normalizeDecision('{"reply":"好","actions":[{"type":"generate_characters","params":{"requirements":"加个反派"}}]}')
    expect(d.reply).toBe('好')
    expect(d.actions).toHaveLength(1)
    expect(d.actions![0].type).toBe('generate_characters')
  })

  it('容忍 markdown 代码块包裹', () => {
    const d = normalizeDecision('```json\n{"reply":"ok","actions":[]}\n```')
    expect(d.reply).toBe('ok')
    expect(d.actions).toEqual([])
  })

  it('过滤未知动作类型并限制最多 3 个', () => {
    const raw = JSON.stringify({
      reply: 'x',
      actions: [
        { type: 'generate_characters' },
        { type: 'nonsense_action', params: {} },
        { type: 'generate_plots' },
        { type: 'generate_world' },
        { type: 'write_chapter' },
      ],
    })
    const d = normalizeDecision(raw)
    expect(d.actions!.map(a => a.type)).toEqual(['generate_characters', 'generate_plots', 'generate_world'])
  })

  it('非 JSON 输入 → actions 为空（降级纯对话）', () => {
    const d = normalizeDecision('好的，我们聊聊吧')
    expect(d.actions).toEqual([])
  })
})

describe('agent-deps 生产状态/依赖/建议', () => {
  it('computeProductionState 统计实体与未写章节', async () => {
    const db = makeFakeDb()
    await db.lwStoryOverviews.update('ov1', { title: 'T', coreIdea: 'idea' })
    await db.lwCharacters.create({ projectId: 'p1', name: '张三' })
    await db.lwCharacters.create({ projectId: 'p1', name: '李四' })
    await db.lwPlots.batchCreate('p1', [{ title: '故事线A' }])
    await db.lwOutlines.create({ projectId: 'p1', name: '第一章', nodeType: 'chapter' })
    await db.lwOutlines.create({ projectId: 'p1', name: '第二章', nodeType: 'chapter' })
    await db.lwChapters.create('o1', '正文')

    const s = await computeProductionState(db, 'p1')
    expect(s.overview.exists).toBe(true)
    expect(s.characters.count).toBe(2)
    expect(s.characters.names).toEqual(['张三', '李四'])
    expect(s.plots.count).toBe(1)
    expect(s.outline.total).toBe(2)
    expect(s.outline.written).toBe(1)
    expect(s.outline.unwrittenLeaves).toBe(1)
    expect(s.outline.nextUnwritten?.name).toBe('第二章')
    expect(s.chapters.written).toBe(1)
  })

  it('依赖检查：缺故事概要及时 generate_characters 不通过', () => {
    const noOverview = {
      overview: { exists: false }, characters: { count: 0, names: [] },
      world: { background: false, locations: 0, factions: 0, skills: 0, items: 0 },
      plots: { count: 0, titles: [] },
      outline: { total: 0, written: 0, unwrittenLeaves: 0 }, chapters: { written: 0, totalWords: 0 },
    } as any
    expect(checkActionDependency('generate_characters', noOverview).ok).toBe(false)
    expect(checkActionDependency('generate_overview', noOverview).ok).toBe(true)

    const withOverview = { ...noOverview, overview: { exists: true, coreIdea: 'x' } }
    expect(checkActionDependency('generate_characters', withOverview).ok).toBe(true)
  })

  it('buildSuggestions 按缺什么给 chips', () => {
    const s: any = {
      overview: { exists: true, coreIdea: 'x' }, characters: { count: 0, names: [] },
      world: { background: false, locations: 0, factions: 0, skills: 0, items: 0 },
      plots: { count: 0, titles: [] },
      outline: { total: 0, written: 0, unwrittenLeaves: 0 }, chapters: { written: 0, totalWords: 0 },
    }
    const chips = buildSuggestions(s)
    expect(chips[0]).toContain('角色')
    expect(chips.length).toBeLessThanOrEqual(3)
  })
})

describe('executeActions 动作执行', () => {
  it('generate_characters 按名称去重，只入库新增', async () => {
    const db = makeFakeDb()
    await db.lwStoryOverviews.update('ov1', { coreIdea: '修仙故事' })
    await db.lwCharacters.create({ projectId: 'p1', name: '张三' }) // 已存在

    const ai = makeFakeAi({
      generateCharacters: vi.fn(async () => ({
        success: true,
        data: [
          { name: '张三', rolePosition: 'protagonist' },   // 重复 → 不入库
          { name: '苏婉儿', rolePosition: 'supporting' },  // 新增
        ],
      })),
    })

    const summaries = await executeActions(
      { projectId: 'p1', db, ai, emit: () => {} },
      [{ type: 'generate_characters', params: { requirements: '加个女二号' } }],
      { overview: { exists: true, coreIdea: 'x' } } as any,
    )
    expect(summaries[0].status).toBe('ok')
    expect(summaries[0].message).toContain('苏婉儿')
    expect(summaries[0].changed).toContain('characters')
    const all = await db.lwCharacters.getByProjectId('p1')
    expect(all.map((c: any) => c.name)).toEqual(['张三', '苏婉儿'])
  })

  it('依赖不满足 → skipped（不调用生成方法）', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi()
    const summaries = await executeActions(
      { projectId: 'p1', db, ai, emit: () => {} },
      [{ type: 'generate_characters' }],
      { overview: { exists: false } } as any,
    )
    expect(summaries[0].status).toBe('skipped')
    expect(ai.generateCharacters).not.toHaveBeenCalled()
  })

  it('generate_outline 已有大纲 → skipped（不重复堆积）', async () => {
    const db = makeFakeDb()
    await db.lwOutlines.create({ projectId: 'p1', name: '已有卷', nodeType: 'volume' })
    const ai = makeFakeAi()
    const summaries = await executeActions(
      { projectId: 'p1', db, ai, emit: () => {} },
      [{ type: 'generate_outline' }],
      { overview: { exists: true } } as any,
    )
    expect(summaries[0].status).toBe('skipped')
    expect(ai.generateOutlineStory).not.toHaveBeenCalled()
  })

  it('单个动作失败不阻断后续动作', async () => {
    const db = makeFakeDb()
    await db.lwStoryOverviews.update('ov1', { coreIdea: 'x' })
    const ai = makeFakeAi({
      generateCharacters: vi.fn(async () => ({ success: false, error: 'AI 超时' })),
      generatePlots: vi.fn(async () => ({ success: true, data: [{ title: '新故事线' }] })),
    })
    const summaries = await executeActions(
      { projectId: 'p1', db, ai, emit: () => {} },
      [{ type: 'generate_characters' }, { type: 'generate_plots' }],
      { overview: { exists: true, coreIdea: 'x' } } as any,
    )
    expect(summaries[0].status).toBe('error')
    expect(summaries[1].status).toBe('ok')
  })
})

describe('AgentWorkflowService.sendMessage 编排', () => {
  beforeEach(() => {
    emitted.length = 0
    AgentWorkflowService.resetInstance()
  })

  it('纯对话轮次（无动作）：存消息、总结、建议', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi()
    const svc = AgentWorkflowService.getInstance(db, ai)

    const result = await svc.sendMessage('p1', '这本书大概写多少章合适？')
    expect(ai.agentDecide).toHaveBeenCalledTimes(1)
    expect(ai.agentSummarize).toHaveBeenCalledTimes(1)
    expect(result.assistantMessage.content).toBe('好的，已完成。')
    expect(result.actionSummaries).toEqual([])
    expect(Array.isArray(result.suggestions)).toBe(true)

    // 历史持久化：user + assistant
    const history = await db.lwDesignMessages.getByConversationId(agentConversationId('p1'))
    expect(history).toHaveLength(2)
    expect(history[0].role).toBe('user')
    expect(history[1].role).toBe('assistant')
    expect(history[1].metadata).toContain('"actions"')
  })

  it('动作轮次：决策 → 执行（落库）→ 总结收到执行摘要', async () => {
    const db = makeFakeDb()
    await db.lwStoryOverviews.update('ov1', { coreIdea: '修仙故事' })
    const ai = makeFakeAi({
      agentDecide: vi.fn(async () =>
        JSON.stringify({ reply: '好的，我来设计人物。', actions: [{ type: 'generate_characters', params: { requirements: '主角' } }] }),
      ),
      agentSummarize: vi.fn(async () => '已生成主角张三。'),
    })

    const svc = AgentWorkflowService.getInstance(db, ai)
    const result = await svc.sendMessage('p1', '帮我设计主角')

    // 执行摘要进了总结上下文（agentSummarize 收到包含"新增人物"的 userPrompt）
    const sumArg = ai.agentSummarize.mock.calls[0][1] as { userPrompt: string }
    expect(sumArg.userPrompt).toContain('张三')
    expect(result.actionSummaries[0].status).toBe('ok')
    const chars = await db.lwCharacters.getByProjectId('p1')
    expect(chars.map((c: any) => c.name)).toContain('张三')
  })

  it('决策失败 → 降级纯对话，不抛错', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({ agentDecide: vi.fn(async () => { throw new Error('网络错误') }) })
    const svc = AgentWorkflowService.getInstance(db, ai)
    const result = await svc.sendMessage('p1', '你好')
    expect(result.actionSummaries).toEqual([])
    expect(ai.agentSummarize).toHaveBeenCalledTimes(1)
  })

  it('总结失败 → 兜底回复 + error 事件', async () => {
    const db = makeFakeDb()
    const ai = makeFakeAi({ agentSummarize: vi.fn(async () => { throw new Error('超时') }) })
    const svc = AgentWorkflowService.getInstance(db, ai)
    const result = await svc.sendMessage('p1', '你好')
    expect(result.assistantMessage.content).toContain('抱歉')
    expect(emitted.some(e => e.data?.type === 'error')).toBe(true)
  })

  it('cancel 中断当前轮总结', async () => {
    const db = makeFakeDb()
    let resolveSummarize: (v: string) => void = () => {}
    const ai = makeFakeAi({
      agentSummarize: vi.fn(
        () => new Promise<string>(res => { resolveSummarize = res }),
      ),
    })
    const svc = AgentWorkflowService.getInstance(db, ai)
    const pending = svc.sendMessage('p1', '你好')
    // 等 reply:start 事件发出（此时 activeSummaryEventIds 已登记）
    await vi.waitFor(() => {
      expect(emitted.some(e => e.data?.type === 'reply:start')).toBe(true)
    })
    svc.cancel('p1')
    // 评审 #43：打断按项目全量取消（决策/动作/总结统一）
    expect(ai.cancelAllForProject).toHaveBeenCalledWith('p1')
    resolveSummarize('已取消')
    await pending
  })

  it('并发 sendMessage：第二轮被拒，不覆盖 eventId（评审#42）', async () => {
    const db = makeFakeDb()
    let resolveSummarize!: (v: string) => void
    const ai = makeFakeAi({
      agentSummarize: vi.fn(
        () => new Promise<string>(res => { resolveSummarize = res }),
      ),
    })
    const svc = AgentWorkflowService.getInstance(db, ai)
    const first = svc.sendMessage('p1', '第一轮')
    // 第一轮未完成时发起第二轮 → 拒绝
    await expect(svc.sendMessage('p1', '第二轮')).rejects.toThrow('上一轮对话仍在处理中')
    // 等第一轮走到总结阶段再放行
    await vi.waitFor(() => {
      expect(ai.agentSummarize).toHaveBeenCalled()
    })
    resolveSummarize('完成')
    await first
    // 完成后互斥释放，可再次发起（第三轮同样走到总结并放行）
    const third = svc.sendMessage('p1', '第三轮')
    await vi.waitFor(() => {
      expect(ai.agentSummarize).toHaveBeenCalledTimes(2)
    })
    resolveSummarize('完成')
    const second = await third
    expect(second).toBeTruthy()
  })
})
