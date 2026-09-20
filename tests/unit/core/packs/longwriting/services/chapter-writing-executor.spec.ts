/**
 * 故事性检查单测（用户要求 2026-09-20：每章除一致性检查外增加故事性检查）
 * parseStoryQualityCheck 纯函数直测：正常 JSON / markdown 包裹 / 截断 / 字段缺失 / 脏字段过滤。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  db: {} as any,
  resolveModelCalls: [] as unknown[],
}))

vi.mock('@core/database/database-manager.interface', () => ({ getCoreDatabaseManager: () => h.db }))
vi.mock('@core/utils/logger', () => ({ createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }) }))
vi.mock('ai', () => ({ generateText: vi.fn(async () => ({ text: '' })) }))
vi.mock('@core/platform/services/longwriting-ai.service', () => ({ LongWritingAIService: { getInstance: () => ({}) } }))
vi.mock('@core/packs/longwriting/story-room/room-state', () => ({ getRoomState: vi.fn(async () => ({ ledger: [] })) }))
vi.mock('@core/packs/longwriting/story-room/room-ledger', () => ({ ledgerSnapshotText: () => '' }))
vi.mock('@core/platform/workflow/nodes/agent-loop-node', () => ({
  getAgentLoopHarness: () => ({
    resolveModel: async (o: unknown) => {
      h.resolveModelCalls.push(o)
      return { __resolved: o }
    },
  }),
}))
vi.mock('@core/platform/services/longwriting/graph/consistency.service', () => ({
  ConsistencyService: { getInstance: () => ({ scanContradictions: async () => [] }) },
}))
vi.mock('@core/platform/services/longwriting/conflict-gate', () => ({
  acknowledgeConflict: vi.fn(),
  isAcknowledgedConflict: () => false,
  listResolutions: vi.fn(async () => []),
}))

import { parseStoryQualityCheck, runStoryQualityCheck } from '@core/packs/longwriting/services/chapter-writing-executor'
import { generateText } from 'ai'

const OK_VERDICT = JSON.stringify({
  attractive: true,
  verdict: 'ok',
  hooks: [],
  highlights: [],
  reasons: [],
  suggestions: [],
})

beforeEach(() => {
  h.db = {}
  h.resolveModelCalls.length = 0
  ;(generateText as unknown as ReturnType<typeof vi.fn>).mockClear()
  ;(generateText as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ text: OK_VERDICT })
})

describe('runStoryQualityCheck（§1 审读模型口径统一）', () => {
  it('审读调用携带项目 chapters stage 模型（resolveModel 入参与 generateText 的 model 一致）', async () => {
    h.db = {
      lwProjectModelConfigs: {
        getByProjectAndStage: async () => ({ providerConfigId: 'pc_ds', modelId: 'deepseek-v4.1-flash' }),
      },
      lwOutlines: { getByProjectId: async () => [{ id: 'o1', summary: '概要' }] },
    }
    const r = await runStoryQualityCheck('p1', 'o1', '正文内容')
    expect(r.ran).toBe(true)
    expect(h.resolveModelCalls[0]).toEqual({ providerConfigId: 'pc_ds', modelId: 'deepseek-v4.1-flash' })
    const firstCall = (generateText as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as { model: unknown }
    expect(firstCall.model).toEqual({ __resolved: { providerConfigId: 'pc_ds', modelId: 'deepseek-v4.1-flash' } })
  })

  it('stage 未配置时回退应用默认（resolveModel 入参为空对象）', async () => {
    h.db = { lwOutlines: { getByProjectId: async () => [{ id: 'o1', summary: '概要' }] } }
    const r = await runStoryQualityCheck('p1', 'o1', '正文内容')
    expect(r.ran).toBe(true)
    expect(h.resolveModelCalls[0]).toEqual({})
  })
})

describe('parseStoryQualityCheck', () => {
  it('解析完整结论：钩子/爽点/吸引度/依据/建议', () => {
    const raw = JSON.stringify({
      attractive: true,
      verdict: '开局钩子扎实，爽点明确，吸引人。',
      hooks: [{ where: '不到万不得已，不要打开', what: '封条铁盒悬念，勾住读者对盒中物的好奇' }],
      highlights: [{ where: '铜钱正卡进两块石板的缝里', what: '巧劲擒贼立威爽点' }],
      reasons: ['开篇三问层层递进', '阳光开局与雨夜案发形成色调反转'],
      suggestions: [],
    })
    const r = parseStoryQualityCheck(raw)
    expect(r.ran).toBe(true)
    expect(r.attractive).toBe(true)
    expect(r.verdict).toContain('吸引人')
    expect(r.hooks).toHaveLength(1)
    expect(r.hooks[0].where).toContain('不要打开')
    expect(r.highlights).toHaveLength(1)
    expect(r.reasons).toHaveLength(2)
    expect(r.suggestions).toHaveLength(0)
    expect(r.error).toBeUndefined()
  })

  it('容忍 markdown 代码块包裹的 JSON', () => {
    const raw = '好的，以下是评估结果：\n```json\n{"attractive":false,"verdict":"缺爽点","hooks":[],"highlights":[],"reasons":["节奏平"],"suggestions":["在章尾加卡点"]}\n```\n以上。'
    const r = parseStoryQualityCheck(raw)
    expect(r.ran).toBe(true)
    expect(r.attractive).toBe(false)
    expect(r.suggestions).toEqual(['在章尾加卡点'])
  })

  it('截断/无 JSON 时降级为 ran=false 并带原因，不编造结论', () => {
    for (const raw of ['', '模型没有输出 JSON', '{"attractive":true,"hooks":[', '[]']) {
      const r = parseStoryQualityCheck(raw)
      expect(r.ran).toBe(false)
      expect(r.error).toBeTruthy()
      expect(r.hooks).toEqual([])
    }
  })

  it('字段缺失/类型不对时回退默认值，脏项被过滤', () => {
    const raw = JSON.stringify({
      hooks: [{ where: 123, what: '有效钩子' }, { what: '   ' }, '脏数据', { where: 'a', what: 'b' }],
      reasons: ['有效', 42, null],
      attractive: 'yes',
    })
    const r = parseStoryQualityCheck(raw)
    expect(r.ran).toBe(true)
    expect(r.attractive).toBeUndefined()
    expect(r.verdict).toBeUndefined()
    expect(r.hooks).toEqual([{ where: '', what: '有效钩子' }, { where: 'a', what: 'b' }])
    expect(r.reasons).toEqual(['有效'])
    expect(r.highlights).toEqual([])
    expect(r.suggestions).toEqual([])
  })
})
