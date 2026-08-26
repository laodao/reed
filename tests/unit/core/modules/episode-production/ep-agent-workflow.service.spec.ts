/**
 * 剧集制作 Agent 单测（纯逻辑优先）
 * 覆盖：决策解析（normalizeEpDecision / extractJsonObject）、状态摘要、依赖规则、下一步建议。
 * 不触达真实数据库/AI —— 只测纯函数与可注入逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock 事件发射器（ep-agent-events 依赖 getEventEmitter）
const emitted: Array<{ channel: string; data: any }> = []
vi.mock('@core/interfaces/event.interface', () => ({
  getEventEmitter: () => ({
    emit: (channel: string, data: any) => emitted.push({ channel, data }),
    emitProgress: () => {},
    emitStatus: () => {},
  }),
}))

// mock 数据源服务（executeQueryDatabase 动态 import；sendMessage 的 listEligible 也要可用）
const datasourceMock = vi.hoisted(() => ({
  getDataSourceService: vi.fn(),
}))
vi.mock('@core/modules/workflow/datasource/datasource.service', () => ({
  getDataSourceService: datasourceMock.getDataSourceService,
  registerDataSourceService: vi.fn(),
}))

import {
  normalizeEpDecision,
  epAgentConversationId,
  EpisodeProductionAgentService,
  detectChoiceForAssetImage,
  detectChoiceForDatabase,
} from '@core/modules/episode-production/agent/ep-agent-workflow.service'
import { extractJsonObject } from '@core/modules/episode-production/agent/ep-agent-actions'
import {
  epStateToSummary,
  checkEpActionDependency,
  buildEpSuggestions,
} from '@core/modules/episode-production/agent/ep-agent-deps'
import type { EpAgentProductionState } from '@core/modules/episode-production/agent/ep-agent.types'

beforeEach(() => {
  emitted.length = 0
  datasourceMock.getDataSourceService.mockReset()
})

// ==================== normalizeEpDecision ====================

describe('normalizeEpDecision 决策解析', () => {
  it('解析合法 JSON：reply + actions', () => {
    const d = normalizeEpDecision(
      '{"reply":"好，我来拆场景","actions":[{"type":"split_scenes","params":{}}]}',
    )
    expect(d.reply).toBe('好，我来拆场景')
    expect(d.actions).toHaveLength(1)
    expect(d.actions![0].type).toBe('split_scenes')
  })

  it('容忍 markdown 代码块包裹', () => {
    const d = normalizeEpDecision('```json\n{"reply":"ok","actions":[]}\n```')
    expect(d.reply).toBe('ok')
    expect(d.actions).toHaveLength(0)
  })

  it('过滤未知动作类型（防止 AI 幻觉）', () => {
    const d = normalizeEpDecision(
      '{"reply":"x","actions":[{"type":"generate_script"},{"type":"hallucinated"},{"type":"delete_entity"}]}',
    )
    expect(d.actions!.map(a => a.type)).toEqual(['generate_script', 'delete_entity'])
  })

  it('非 JSON 输出降级为空 actions / 无 reply', () => {
    const d = normalizeEpDecision('我们聊聊吧')
    expect(d.actions).toHaveLength(0)
    expect(d.reply).toBeUndefined()
  })

  it('限数：一次最多 EP_AGENT_MAX_ACTIONS_PER_TURN 个动作', () => {
    const d = normalizeEpDecision(
      '{"reply":"x","actions":[{"type":"generate_script"},{"type":"split_scenes"},{"type":"generate_storyboards"},{"type":"generate_char_asset"},{"type":"generate_item_asset"}]}',
    )
    expect(d.actions!.length).toBeLessThanOrEqual(3)
  })

  it('多轮确认：解析 choice（actionType/param/choices）', () => {
    const d = normalizeEpDecision(
      '{"reply":"你要给哪个角色生成定妆图？","choice":{"actionType":"generate_char_asset","param":"name","choices":["杜十娘","李甲"],"prompt":"请选择"}}',
    )
    expect(d.choice).toEqual({
      actionType: 'generate_char_asset',
      param: 'name',
      choices: ['杜十娘', '李甲'],
      prompt: '请选择',
    })
  })

  it('choice 缺字段/候选为空时忽略', () => {
    const d1 = normalizeEpDecision('{"reply":"x","choice":{"actionType":"generate_char_asset"}}')
    const d2 = normalizeEpDecision('{"reply":"x","choice":{"actionType":"generate_char_asset","param":"name","choices":[]}}')
    expect(d1.choice).toBeUndefined()
    expect(d2.choice).toBeUndefined()
  })
})

// ==================== extractJsonObject ====================

describe('extractJsonObject 容错解析', () => {
  it('提取纯 JSON 对象', () => {
    const obj = extractJsonObject('{"reply":"ok"}')
    expect(obj?.reply).toBe('ok')
  })

  it('容忍前后杂文与代码块', () => {
    const obj = extractJsonObject('前缀\n```json\n{"a":1}\n```后缀')
    expect(obj?.a).toBe(1)
  })

  it('无对象时返回 null', () => {
    expect(extractJsonObject('没有 JSON')).toBeNull()
  })
})

// ==================== 状态摘要 / 依赖 / 建议 ====================

function makeEmptyState(): EpAgentProductionState {
  return {
    episode: { id: 'ep1', title: null, episodeNumber: null, status: null, hasScript: false, synopsis: null, scriptContent: null },
    scenes: { total: 0, countWithBindings: 0, locations: [] },
    storyboards: { total: 0, scenesCovered: 0, scenesTotal: 0 },
    assets: { characters: { count: 0, names: [] }, locations: { count: 0, names: [] }, items: { count: 0, names: [] } },
  }
}

describe('epStateToSummary 状态摘要', () => {
  it('空剧集：剧本未生成、无场景', () => {
    const s = epStateToSummary(makeEmptyState())
    expect(s).toContain('剧本：未生成')
    expect(s).toContain('场景：共 0 场')
  })

  it('有剧本与场景时会展示梗概前50字', () => {
    const st = makeEmptyState()
    st.episode.hasScript = true
    st.episode.synopsis = '这是一段超过五十个字符的梗概文本，用来测试摘要是否会截断显示前五十个字符。'
    st.scenes.total = 5
    st.scenes.locations = ['茶馆', '码头']
    const s = epStateToSummary(st)
    expect(s).toContain('剧本：已生成')
    expect(s).toContain('场景：共 5 场')
    expect(s).toContain('茶馆')
  })
})

describe('checkEpActionDependency 依赖规则', () => {
  it('split_scenes 无剧本时缺依赖', () => {
    const st = makeEmptyState()
    const dep = checkEpActionDependency('split_scenes', st)
    expect(dep.ok).toBe(false)
    expect(dep.missing).toContain('剧本')
  })

  it('split_scenes 有剧本时通过', () => {
    const st = makeEmptyState()
    st.episode.hasScript = true
    expect(checkEpActionDependency('split_scenes', st).ok).toBe(true)
  })

  it('generate_storyboards 无场景时缺依赖', () => {
    const st = makeEmptyState()
    expect(checkEpActionDependency('generate_storyboards', st).ok).toBe(false)
  })

  it('generate_script 无前置依赖', () => {
    expect(checkEpActionDependency('generate_script', makeEmptyState()).ok).toBe(true)
  })
})

describe('buildEpSuggestions 下一步建议', () => {
  it('空剧集建议先生成剧本', () => {
    const sugs = buildEpSuggestions(makeEmptyState())
    expect(sugs.join()).toContain('生成这集的剧本')
  })

  it('有剧本无场景建议拆分场景', () => {
    const st = makeEmptyState()
    st.episode.hasScript = true
    const sugs = buildEpSuggestions(st)
    expect(sugs.join()).toContain('拆出场景')
  })

  it('有场景无分镜建议生成分镜', () => {
    const st = makeEmptyState()
    st.episode.hasScript = true
    st.scenes.total = 3
    const sugs = buildEpSuggestions(st)
    expect(sugs.join()).toContain('生成分镜')
  })
})

// ==================== conversationId ====================

describe('epAgentConversationId', () => {
  it('约定 ep-agent:${episodeId}', () => {
    expect(epAgentConversationId('ep-123')).toBe('ep-agent:ep-123')
  })
})

// ==================== sendMessage 多轮确认 choice 分支 ====================

describe('sendMessage choice 分支（多轮确认）', () => {
  it('AI 输出 choice 时发出 choice:request、不执行动作、返回 choice', async () => {
    EpisodeProductionAgentService.resetInstance()
    const messages: Array<{ role: string; content: string; timestamp: number; metadata?: string }> = []
    const db = {
      lwDesignMessages: {
        add: async (_conv: string, m: any) => { messages.push(m); return m },
        getByConversationId: async () => messages,
      },
    } as any
    const ai = {
      agentDecide: async () =>
        JSON.stringify({
          reply: '你要给哪个角色生成定妆图？',
          choice: { actionType: 'generate_char_asset', param: 'name', choices: ['杜十娘', '李甲'], prompt: '请选择角色' },
        }),
    } as any

    const svc = EpisodeProductionAgentService.getInstance(db, ai)
    const res = await svc.sendMessage('p1', 'ep1', '为某个角色生成定妆图')

    // 返回 choice（未执行动作）
    expect(res.choice).toEqual({
      actionType: 'generate_char_asset',
      param: 'name',
      choices: ['杜十娘', '李甲'],
      prompt: '请选择角色',
    })
    expect(res.actionSummaries).toHaveLength(0)

    // 发出了 choice:request 事件
    const evt = emitted.find((e) => e.data?.type === 'choice:request')
    expect(evt).toBeTruthy()
    expect(evt!.data.choice.choices).toContain('杜十娘')

    // 持久化了一条 assistant 消息提示选择
    const assistant = messages.filter((m) => m.role === 'assistant')
    expect(assistant.length).toBeGreaterThan(0)
    expect(assistant[0].content).toContain('杜十娘')
  })
})

// ==================== detectChoiceForAssetImage（规则型多轮确认） ====================

describe('detectChoiceForAssetImage 规则检测', () => {
  const state: EpAgentProductionState = {
    episode: { id: 'ep1', hasScript: true },
    scenes: { total: 1, countWithBindings: 1, locations: [] },
    storyboards: { total: 0, scenesCovered: 0, scenesTotal: 1 },
    assets: {
      characters: { count: 2, names: ['杜十娘', '李甲'] },
      locations: { count: 0, names: [] },
      items: { count: 1, names: ['百宝箱'] },
    },
  }

  it('要给角色生成定妆图但未点名 → 构造角色候选 choice', () => {
    const c = detectChoiceForAssetImage('给某个角色生成定妆图', state)
    expect(c).toEqual({ actionType: 'generate_char_asset', param: 'name', choices: ['杜十娘', '李甲'], prompt: '请选择要生成定妆图的角色' })
  })

  it('已点名具体角色 → 返回 null（交回 AI 正常执行）', () => {
    expect(detectChoiceForAssetImage('给杜十娘生成定妆图', state)).toBeNull()
  })

  it('地点意图 → 构造地点候选（无候选返回 null）', () => {
    expect(detectChoiceForAssetImage('给一个地点生成主图', state)).toBeNull() // 无地点候选
  })

  it('非生成图意图 → 返回 null', () => {
    expect(detectChoiceForAssetImage('帮我拆分场景', state)).toBeNull()
  })
})

// ==================== detectChoiceForDatabase（Agent 查询外部数据库） ====================
describe('detectChoiceForDatabase 规则检测', () => {
  const names = ['金融业务库', '客户库']

  it('用户想查外部数据但未点名数据源 → 构造 query_database choice', () => {
    const c = detectChoiceForDatabase('帮我查一下最近订单数据', names)
    expect(c).toEqual({ actionType: 'query_database', param: 'dataSourceId', choices: ['金融业务库', '客户库'], prompt: '请选择要查询的数据源' })
  })

  it('已点名数据源 → 返回 null（交回 AI 执行）', () => {
    expect(detectChoiceForDatabase('查一下金融业务库的订单', names)).toBeNull()
  })

  it('无已配置数据源 → 返回 null（让 AI 建议先配置）', () => {
    expect(detectChoiceForDatabase('查一下订单数据', [])).toBeNull()
  })

  it('纯剧集内部查询不触发（查剧本/查场景）', () => {
    expect(detectChoiceForDatabase('帮我查一下剧本生成情况', names)).toBeNull()
    expect(detectChoiceForDatabase('查一下场景列表', names)).toBeNull()
  })

  it('普通对话不触发', () => {
    expect(detectChoiceForDatabase('你好，帮我看看这个剧本', names)).toBeNull()
  })
})

// ==================== executeQueryDatabase（Agent 查询外部数据库动作） ====================
describe('executeQueryDatabase 动作执行', () => {
  it('参数化 SELECT 执行成功 → ok + 预览数据', async () => {
    const execute = vi.fn().mockResolvedValue({
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'a' }],
      rowCount: 1,
      durationMs: 5,
    })
    datasourceMock.getDataSourceService.mockReturnValue({ execute } as any)
    const { __epAgentTest } = await import('@core/modules/episode-production/agent/ep-agent-actions')
    const ctx = { projectId: 'p1', episodeId: 'ep1', db: {}, ai: {}, emit: () => {} } as any
    const summary = await __epAgentTest.executeQueryDatabase(ctx, {
      type: 'query_database',
      params: { dataSourceId: 'ds_1', sql: 'SELECT * FROM t WHERE id>$1', params: [1] },
    })
    expect(summary.status).toBe('ok')
    expect(summary.message).toContain('返回 1 行')
    expect(execute).toHaveBeenCalledWith('ds_1', 'SELECT * FROM t WHERE id>$1', [1])
    expect(summary.data.rowCount).toBe(1)
  })

  it('缺数据源 → error；缺 SQL → error；非 SELECT → error', async () => {
    const execute = vi.fn().mockResolvedValue({ columns: [], rows: [], rowCount: 0, durationMs: 1 })
    datasourceMock.getDataSourceService.mockReturnValue({ execute } as any)
    const { __epAgentTest } = await import('@core/modules/episode-production/agent/ep-agent-actions')
    const ctx = { projectId: 'p1', episodeId: 'ep1', db: {}, ai: {}, emit: () => {} } as any
    const noDs = await __epAgentTest.executeQueryDatabase(ctx, { type: 'query_database', params: { sql: 'SELECT 1' } })
    expect(noDs.status).toBe('error')
    const noSql = await __epAgentTest.executeQueryDatabase(ctx, { type: 'query_database', params: { dataSourceId: 'ds_1' } })
    expect(noSql.status).toBe('error')
    const dml = await __epAgentTest.executeQueryDatabase(ctx, {
      type: 'query_database',
      params: { dataSourceId: 'ds_1', sql: 'DELETE FROM t' },
    })
    expect(dml.status).toBe('error')
    expect(execute).not.toHaveBeenCalled()
  })

  it('执行抛错 → error 且带回错误信息', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('connection refused'))
    datasourceMock.getDataSourceService.mockReturnValue({ execute } as any)
    const { __epAgentTest } = await import('@core/modules/episode-production/agent/ep-agent-actions')
    const ctx = { projectId: 'p1', episodeId: 'ep1', db: {}, ai: {}, emit: () => {} } as any
    const summary = await __epAgentTest.executeQueryDatabase(ctx, {
      type: 'query_database',
      params: { dataSourceId: 'ds_1', sql: 'SELECT * FROM t' },
    })
    expect(summary.status).toBe('error')
    expect(summary.message).toContain('connection refused')
  })
})
