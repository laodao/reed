/**
 * 章法五步全流程回归测试（§5，2026-09-20）
 * mock AI/存储/图谱，验证 runChapterWritingMethod 的确定性编排：
 * 步骤序列（design→review→confirm→gate→write→save→post-check→story-check）、
 * stage 模型口径（§1）、产物回执、以及两条反向用例（已有正文拒写 / 自检不过停）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  db: {} as any,
  resolveModelCalls: [] as unknown[],
}))

vi.mock('@core/database/database-manager.interface', () => ({ getCoreDatabaseManager: () => h.db }))
vi.mock('@core/utils/logger', () => ({ createLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }) }))
vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@core/packs/longwriting/story-room/room-state', () => ({
  getRoomState: vi.fn(async () => ({ ledger: [{ kind: 'tone', title: '基调', points: [], status: 'confirmed', sourceTurn: 1, updatedAt: 1 }] })),
}))
vi.mock('@core/packs/longwriting/story-room/room-ledger', () => ({ ledgerSnapshotText: () => '【共识】测试基调' }))
vi.mock('@core/platform/workflow/nodes/agent-loop-node', () => ({
  getAgentLoopHarness: () => ({
    resolveModel: async (o: unknown) => {
      h.resolveModelCalls.push(o)
      return { __resolved: o ?? {} }
    },
  }),
}))
vi.mock('@core/platform/services/longwriting/conflict-gate', () => ({
  acknowledgeConflict: vi.fn(),
  isAcknowledgedConflict: () => false,
  listResolutions: vi.fn(async () => []),
}))
vi.mock('@core/platform/services/longwriting/graph/consistency.service', () => ({
  ConsistencyService: { getInstance: () => ({ scanContradictions: vi.fn(async () => []) }) },
}))

/** AI 服务脚本化：设计卡/正文/门禁三段可按用例覆写 */
const h2 = vi.hoisted(() => ({
  aiScript: {
    card: {
      success: true,
      data: { card: { chapters: [] }, markdown: '# 设计卡', review: { ok: true, issues: [] } },
    } as any,
    chapter: { success: true, data: { content: '雪麓山庄的晨钟撞到第三下。第1章正文。' } } as any,
    gate: '' as string | null,
  },
  svc: {
    getChapter: vi.fn(async () => null),
    applyChapterCard: vi.fn(async () => ({})),
    confirmPrewrite: vi.fn(async () => undefined),
    saveChapter: vi.fn(async (outlineId: string, content: string) => ({ id: 'chapter_mock_1', outlineId, content })),
  },
  graphProcess: vi.fn(async () => ({ newEntitiesNote: '测试实体入册' })),
  generateTextTexts: [] as string[],
  generateChapterArgs: [] as unknown[],
  generateChapterCardArgs: [] as unknown[],
}))

vi.mock('@core/platform/services/longwriting-ai.service', () => ({
  LongWritingAIService: {
    getInstance: () => ({
      generateChapterCard: vi.fn(async (...args: unknown[]) => {
        h2.generateChapterCardArgs = args
        return h2.aiScript.card
      }),
      generateChapter: vi.fn(async (...args: unknown[]) => {
        h2.generateChapterArgs = args
        return h2.aiScript.chapter
      }),
      checkChapterConflictGate: vi.fn(async () => h2.aiScript.gate),
    }),
  },
}))
vi.mock('@core/packs/longwriting/services/longwriting.service', () => ({
  LongWritingService: { getInstance: () => h2.svc },
}))
vi.mock('@core/platform/services/longwriting/graph/chapter-graph.processor', () => ({
  ChapterGraphProcessor: class {
    process = h2.graphProcess
  },
}))

import { runChapterWritingMethod, parseStoryQualityCheck } from '@core/packs/longwriting/services/chapter-writing-executor'
import { generateText } from 'ai'

const STORY_CHECK_OK = JSON.stringify({
  attractive: true,
  verdict: '吸引人',
  hooks: [{ where: '章尾', what: '丧钟' }],
  highlights: [],
  reasons: ['节奏紧凑'],
  suggestions: [],
})

const OUTLINES = [
  { id: 'vol1', project_id: 'p1', node_type: 'volume', name: '卷一', parent_id: null, level: 0, order_index: 1 },
  { id: 'o1', project_id: 'p1', node_type: 'chapter', name: '第1章·测试', parent_id: 'vol1', level: 1, order_index: 1, summary: '测试概要' },
]

function fakeDb(): void {
  h.db = {
    lwProjectModelConfigs: {
      getByProjectAndStage: async () => ({ providerConfigId: 'pc_ds', modelId: 'deepseek-v4.1-flash' }),
    },
    lwOutlines: {
      getByProjectId: async () => OUTLINES,
      getById: async (id: string) => OUTLINES.find((o) => o.id === id) ?? null,
    },
    lwCharacters: { getByProjectId: async () => [{ name: '沈云萝' }] },
    lwChapters: { getByOutlineId: async () => null },
  }
}

beforeEach(() => {
  fakeDb()
  h.resolveModelCalls.length = 0
  h2.aiScript = {
    card: { success: true, data: { card: { chapters: [] }, markdown: '# 设计卡', review: { ok: true, issues: [] } } },
    chapter: { success: true, data: { content: '雪麓山庄的晨钟撞到第三下。第1章正文。' } },
    gate: '',
  }
  h2.svc.getChapter.mockClear().mockResolvedValue(null)
  h2.svc.applyChapterCard.mockClear().mockResolvedValue({})
  h2.svc.confirmPrewrite.mockClear().mockResolvedValue(undefined)
  h2.svc.saveChapter.mockClear().mockImplementation(async (outlineId: string, content: string) => ({ id: 'chapter_mock_1', outlineId, content }))
  h2.graphProcess.mockClear().mockResolvedValue({ newEntitiesNote: '测试实体入册' })
  h2.generateChapterArgs = []
  h2.generateChapterCardArgs = []
  // 顺序：①写后一致性审读 {"issues":[]} ②故事性检查 OK_VERDICT（R10 无拍不调 LLM）
  ;(generateText as unknown as ReturnType<typeof vi.fn>)
    .mockClear()
    .mockResolvedValueOnce({ text: '{"issues":[]}' })
    .mockResolvedValueOnce({ text: STORY_CHECK_OK })
})

describe('章法全流程回归（§5）', () => {
  it('正向：五步确定性编排 + 故事性检查 + stage 模型口径', async () => {
    const steps: string[] = []
    const outcome = await runChapterWritingMethod({
      projectId: 'p1',
      outlineId: 'o1',
      onProgress: (p) => steps.push(p.step),
    })

    expect(outcome.ok).toBe(true)
    // 步骤序列完整（8 步）
    expect(steps).toEqual(['design', 'review', 'confirm', 'gate', 'write', 'save', 'post-check', 'story-check'])
    // 产物
    expect(outcome.data?.chapterId).toBe('chapter_mock_1')
    expect(outcome.data?.wordCount).toBeGreaterThan(0)
    expect(outcome.data?.postCheck?.passed).toBe(true)
    expect(outcome.data?.storyCheck?.ran).toBe(true)
    expect(outcome.data?.storyCheck?.attractive).toBe(true)
    // 存储：设计卡确认与正文保存各一次
    expect(h2.svc.applyChapterCard).toHaveBeenCalledWith('p1', 'o1', expect.anything(), '# 设计卡')
    expect(h2.svc.confirmPrewrite).toHaveBeenCalledWith('o1')
    expect(h2.svc.saveChapter).toHaveBeenCalledWith('o1', expect.stringContaining('第1章正文'))
    // §1 回归：审读走项目 chapters stage 模型
    expect(h.resolveModelCalls[0]).toEqual({ providerConfigId: 'pc_ds', modelId: 'deepseek-v4.1-flash' })
  })

  it('反向：已有正文且未 overwrite → 拒写且不产 LLM 调用', async () => {
    h2.svc.getChapter.mockResolvedValue({ content: '已有正文' })
    const outcome = await runChapterWritingMethod({ projectId: 'p1', outlineId: 'o1' })
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('已有正文')
    expect(h.resolveModelCalls).toHaveLength(0)
  })

  it('§B 反向：大纲节点不存在 → 人话错误且不发 LLM 调用', async () => {
    h.db.lwOutlines.getById = async () => null
    const outcome = await runChapterWritingMethod({ projectId: 'p1', outlineId: 'o1' })
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('已被删除')
    expect(h.resolveModelCalls).toHaveLength(0)
  })

  it('反向：设计卡自检不过 → needsReview + 不落正文', async () => {
    h2.aiScript.card = {
      success: true,
      data: { card: {}, markdown: '# 卡', review: { ok: false, issues: ['出场角色与圣经冲突'] } },
    }
    const outcome = await runChapterWritingMethod({ projectId: 'p1', outlineId: 'o1' })
    expect(outcome.ok).toBe(false)
    expect(outcome.needsReview).toContain('出场角色与圣经冲突')
    expect(h2.svc.saveChapter).not.toHaveBeenCalled()
  })

  it('反向：AI 生成失败 → 原样透传错误', async () => {
    h2.aiScript.chapter = { success: false, error: '生成超时' }
    const outcome = await runChapterWritingMethod({ projectId: 'p1', outlineId: 'o1' })
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('生成超时')
  })

  it('parseStoryQualityCheck 纯函数仍在位（防回归引用）', () => {
    expect(parseStoryQualityCheck('{"attractive":true,"verdict":"ok","hooks":[],"highlights":[],"reasons":[],"suggestions":[]}').ran).toBe(true)
  })

  it('W1.1/W1.2 参数贯通：targetWords/style/extraPrompt/eventId 逐层到达 AI 调用', async () => {
    const outcome = await runChapterWritingMethod({
      projectId: 'p1',
      outlineId: 'o1',
      targetWords: 5000,
      style: 'light',
      extraPrompt: '多写雪景',
      eventId: 'lw-o1-42',
    })
    expect(outcome.ok).toBe(true)
    // 设计卡流以 eventId 为前缀（真取消锚点）
    expect(h2.generateChapterCardArgs[0]).toBe('lw-o1-42-card')
    // 正文调用签名：(eventId, projectId, outlineId, targetWords, providerConfigId, modelId, style, extraPrompt, options)
    expect(h2.generateChapterArgs[0]).toBe('lw-o1-42-write')
    expect(h2.generateChapterArgs[1]).toBe('p1')
    expect(h2.generateChapterArgs[2]).toBe('o1')
    expect(h2.generateChapterArgs[3]).toBe(5000)
    expect(h2.generateChapterArgs[4]).toBe('pc_ds')
    expect(h2.generateChapterArgs[5]).toBe('deepseek-v4.1-flash')
    expect(h2.generateChapterArgs[6]).toBe('light')
    // 附加要求 = 共识账本（前置，优先级更高） + 用户附加要求
    const extra = String(h2.generateChapterArgs[7])
    expect(extra).toContain('【作者已拍板的共识与修正')
    expect(extra).toContain('多写雪景')
    expect(extra.indexOf('【作者已拍板的共识与修正')).toBeLessThan(extra.indexOf('多写雪景'))
  })

  it('W1.1 回归：不传生成参数时 targetWords/style/extraPrompt 为 undefined（回退大纲预估链）', async () => {
    await runChapterWritingMethod({ projectId: 'p1', outlineId: 'o1' })
    expect(h2.generateChapterArgs[3]).toBeUndefined()
    expect(h2.generateChapterArgs[6]).toBeUndefined()
    // 无用户附加要求时仅共识账本
    expect(String(h2.generateChapterArgs[7])).toContain('【作者已拍板的共识与修正')
  })
})
