/**
 * 圣经就绪门（50 号）单测
 * 覆盖：就绪判定（概要空白/角色/故事线三缺项）、报错文案、人物名册硬约束段，
 * 以及 longwriting-ai.service 三个生成入口（大纲 novel/script、章节×2）的门接线。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: {
    lwStoryOverviews: { getByProjectId: vi.fn() },
    lwCharacters: { getByProjectId: vi.fn() },
    lwPlots: { getByProjectId: vi.fn() },
    lwBackgrounds: { getByProjectId: vi.fn() },
    lwProjects: { getById: vi.fn() },
  },
}))

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => db,
}))
vi.mock('@core/interfaces/event.interface', () => ({
  getEventEmitter: () => ({ emit: vi.fn() }),
}))

import { assessBibleReadiness, buildBibleGateError, buildCastRosterConstraint } from '@core/platform/services/longwriting/bible-readiness-gate'
import { getLongWritingAIService } from '@core/platform/services/longwriting-ai.service'

const READY_DB = {
  overview: { title: '大宋女捕', summary: '现代女刑警穿越北宋女捕快，屡破奇案。', estimatedChapters: 10 },
  characters: [
    { name: '苏九龄', rolePosition: 'protagonist' },
    { name: '沈墨', rolePosition: 'antagonist' },
  ],
  plots: [{ title: '残卷暗线', summary: '幕后黑手借现代知识残卷作案' }],
}

describe('assessBibleReadiness', () => {
  it('全缺 → not ready，缺失项按固定顺序', () => {
    const r = assessBibleReadiness({})
    expect(r.ready).toBe(false)
    expect(r.missing).toEqual(['核心故事（故事概要）', '角色', '故事线'])
  })

  it('概要空白字符串视为缺失；角色/故事线就绪', () => {
    const r = assessBibleReadiness({ overview: { summary: '   ' }, characters: [{ name: '苏九龄' }] })
    expect(r.ready).toBe(false)
    expect(r.missing).toEqual(['核心故事（故事概要）', '故事线'])
  })

  it('三类齐备 → ready', () => {
    const r = assessBibleReadiness(READY_DB)
    expect(r.ready).toBe(true)
    expect(r.missing).toEqual([])
  })

  it('空白名角色不算就绪（评审 P1-1：与名册渲染同口径）', () => {
    const r = assessBibleReadiness({
      overview: READY_DB.overview,
      characters: [{ name: '   ' }, { name: '' }] as Array<{ name: string }>,
      plots: READY_DB.plots,
    })
    expect(r.ready).toBe(false)
    expect(r.missing).toEqual(['角色'])
  })

  it('标题摘要全空白的故事线不算就绪（评审 P2-2）', () => {
    const r = assessBibleReadiness({
      overview: READY_DB.overview,
      characters: READY_DB.characters,
      plots: [{ title: '', summary: '   ' }],
    })
    expect(r.ready).toBe(false)
    expect(r.missing).toEqual(['故事线'])
  })

  it('有摘要无标题的故事线算就绪', () => {
    const r = assessBibleReadiness({
      overview: READY_DB.overview,
      characters: READY_DB.characters,
      plots: [{ title: '', summary: '残卷暗线' }],
    })
    expect(r.ready).toBe(true)
  })
})

describe('buildBibleGateError', () => {
  it('就绪 → null', () => {
    expect(buildBibleGateError('大纲', [])).toBeNull()
  })

  it('未就绪 → 文案含用途、全部缺失项与固定流程指引', () => {
    const msg = buildBibleGateError('章节正文', ['核心故事（故事概要）', '故事线'])!
    expect(msg).toContain('章节正文')
    expect(msg).toContain('核心故事（故事概要）')
    expect(msg).toContain('故事线')
    expect(msg).toContain('角色')
    expect(msg).toContain('概要 → 角色 → 故事线 → 大纲 → 正文')
  })
})

describe('buildCastRosterConstraint', () => {
  it('空名册 → 空串', () => {
    expect(buildCastRosterConstraint([])).toBe('')
    expect(buildCastRosterConstraint([{ name: '' }, { name: null }])).toBe('')
  })

  it('有名册 → 含姓名、角色定位与禁止造名约束', () => {
    const s = buildCastRosterConstraint(READY_DB.characters)
    expect(s).toContain('【人物名册·硬约束】')
    expect(s).toContain('苏九龄（主角）')
    expect(s).toContain('沈墨（反派）')
    expect(s).toContain('禁止虚构任何新的人名')
  })

  it('cap 截断：超出部分不进名册且注明总数（评审 P1-2）', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `角色${i + 1}` }))
    const s = buildCastRosterConstraint(many)
    expect(s).toContain('角色20')
    expect(s).not.toContain('角色21')
    expect(s).toContain('名册共 25 人')
  })

  it('名册排序：主角 → 反派 → 配角（评审 P1-2：截断时关键人物必在）', () => {
    const s = buildCastRosterConstraint([
      { name: '配角甲', rolePosition: 'supporting' },
      { name: '反派乙', rolePosition: 'antagonist' },
      { name: '主角丙', rolePosition: 'protagonist' },
    ])
    expect(s.indexOf('主角丙')).toBeLessThan(s.indexOf('反派乙'))
    expect(s.indexOf('反派乙')).toBeLessThan(s.indexOf('配角甲'))
  })
})

describe('LongWritingAIService 圣经就绪门接线', () => {
  const svc = getLongWritingAIService()
  const callSpy = () => vi.spyOn(svc as any, 'callAIStream')

  beforeEach(() => {
    vi.clearAllMocks()
    db.lwStoryOverviews.getByProjectId.mockResolvedValue(null)
    db.lwCharacters.getByProjectId.mockResolvedValue([])
    db.lwPlots.getByProjectId.mockResolvedValue([])
    db.lwBackgrounds.getByProjectId.mockResolvedValue(null)
    db.lwProjects.getById.mockResolvedValue(null)
  })

  it('generateOutlineStory：设定全缺 → 拒绝且不发起 AI 调用', async () => {
    const spy = callSpy()
    const r = await svc.generateOutlineStory('ev-gate-1', 'p1', 'pc1', 'm1', 1)
    expect(r.success).toBe(false)
    expect(String(r.error)).toContain('角色')
    expect(String(r.error)).toContain('故事线')
    expect(String(r.error)).toContain('核心故事')
    expect(spy).not.toHaveBeenCalled()
  })

  it('generateOutlineStory：novel 模式就绪 → 放行且 prompt 注入人物名册硬约束', async () => {
    db.lwStoryOverviews.getByProjectId.mockResolvedValue(READY_DB.overview)
    db.lwCharacters.getByProjectId.mockResolvedValue(READY_DB.characters)
    db.lwPlots.getByProjectId.mockResolvedValue(READY_DB.plots)
    const spy = callSpy().mockResolvedValue(JSON.stringify([
      { name: '第一章 密室', summary: '苏九龄验尸破局', estimatedWords: 2500 },
      { name: '第二章 漕船', summary: '河底疑云', estimatedWords: 2500 },
    ]))
    const r = await svc.generateOutlineStory('ev-gate-2', 'p1', 'pc1', 'm1', 1)
    expect(r.success).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    const prompt = spy.mock.calls[0][1] as string
    expect(prompt).toContain('【人物名册·硬约束】')
    expect(prompt).toContain('苏九龄（主角）')
    expect(prompt).toContain('残卷暗线')
  })

  it('generateOutlineStory：script 模式就绪 → 分集 prompt 同样注入名册约束', async () => {
    db.lwStoryOverviews.getByProjectId.mockResolvedValue(READY_DB.overview)
    db.lwCharacters.getByProjectId.mockResolvedValue(READY_DB.characters)
    db.lwPlots.getByProjectId.mockResolvedValue(READY_DB.plots)
    const spy = callSpy().mockResolvedValue(JSON.stringify([
      { name: '第1集', summary: '开局钩子', hook: '雨夜停职', cliffhanger: '令牌出现', hookType: '悬念钩' },
    ]))
    const r = await svc.generateOutlineStory('ev-gate-3', 'p1', 'pc1', 'm1', 1, { contentTarget: 'script', episodeCount: 10 })
    expect(r.success).toBe(true)
    const prompt = spy.mock.calls[0][1] as string
    expect(prompt).toContain('【人物名册·硬约束】')
    expect(prompt).toContain('禁止虚构任何新的人名')
  })

  it('generateChapter：缺故事线 → 拒绝且不发起 AI 调用', async () => {
    db.lwStoryOverviews.getByProjectId.mockResolvedValue(READY_DB.overview)
    db.lwCharacters.getByProjectId.mockResolvedValue(READY_DB.characters)
    const spy = callSpy()
    const r = await svc.generateChapter('ev-gate-4', 'p1', 'ol1', 2500, 'pc1', 'm1')
    expect(r.success).toBe(false)
    expect(String(r.error)).toContain('故事线')
    expect(spy).not.toHaveBeenCalled()
  })

  it('generateChapterWithContext：缺角色 → 拒绝', async () => {
    db.lwStoryOverviews.getByProjectId.mockResolvedValue(READY_DB.overview)
    db.lwPlots.getByProjectId.mockResolvedValue(READY_DB.plots)
    const spy = callSpy()
    const r = await svc.generateChapterWithContext('ev-gate-5', 'p1', 'ol1', { targetWords: 2500 })
    expect(r.success).toBe(false)
    expect(String(r.error)).toContain('角色')
    expect(spy).not.toHaveBeenCalled()
  })

  it('generateOutlineStory：角色仅有空白名 → 仍拒绝（评审 P1-1）', async () => {
    db.lwStoryOverviews.getByProjectId.mockResolvedValue(READY_DB.overview)
    db.lwCharacters.getByProjectId.mockResolvedValue([{ name: '   ' }])
    db.lwPlots.getByProjectId.mockResolvedValue(READY_DB.plots)
    const spy = callSpy()
    const r = await svc.generateOutlineStory('ev-gate-7', 'p1', 'pc1', 'm1', 1)
    expect(r.success).toBe(false)
    expect(String(r.error)).toContain('角色')
    expect(spy).not.toHaveBeenCalled()
  })

  it('generateChapterPrewrite：设定全缺 → 拒绝（评审 P2-1）', async () => {
    const spy = callSpy()
    const r = await svc.generateChapterPrewrite('ev-gate-6', 'p1', 'ol1', 'pc1', 'm1')
    expect(r.success).toBe(false)
    expect(String(r.error)).toContain('核心故事')
    expect(spy).not.toHaveBeenCalled()
  })

describe('LongWritingAIService 逐章冲突门禁接线（52 号流程闭环）', () => {
  const svc = getLongWritingAIService()
  const callSpy = () => vi.spyOn(svc as any, 'callAIStream')

  beforeEach(() => {
    vi.restoreAllMocks()
    db.lwStoryOverviews.getByProjectId.mockResolvedValue(READY_DB.overview)
    db.lwCharacters.getByProjectId.mockResolvedValue(READY_DB.characters)
    db.lwPlots.getByProjectId.mockResolvedValue(READY_DB.plots)
    db.lwBackgrounds.getByProjectId.mockResolvedValue(null)
    db.lwProjects.getById.mockResolvedValue(null)
  })

  it('已写章节存在未处理疑点 → 拒绝生成且不发起 AI 调用', async () => {
    const { ConsistencyService } = await import('@core/platform/services/longwriting/graph/consistency.service')
    const cs = ConsistencyService.getInstance()
    vi.spyOn(cs, 'chapterNumberOf').mockResolvedValue(2)
    vi.spyOn(cs, 'scanBlockingConflicts').mockResolvedValue([
      { rule: 'R6', severity: 'warning', message: '实体「魏宗简」第 1 章终态，第 2 章恢复', entityName: '魏宗简', chapterNumber: 1 },
    ] as never)
    const spy = callSpy()
    const r = await svc.generateChapterWithContext('ev-cg-1', 'p1', 'ol1', { targetWords: 2500 })
    expect(r.success).toBe(false)
    expect(String(r.error)).toContain('一致性疑点')
    expect(String(r.error)).toContain('AI 解题')
    expect(spy).not.toHaveBeenCalled()
  })

  it('无阻断疑点 → 正常生成（不触发门禁报错）', async () => {
    const { ConsistencyService } = await import('@core/platform/services/longwriting/graph/consistency.service')
    const cs = ConsistencyService.getInstance()
    vi.spyOn(cs, 'chapterNumberOf').mockResolvedValue(2)
    vi.spyOn(cs, 'scanBlockingConflicts').mockResolvedValue([])
    callSpy().mockResolvedValue(JSON.stringify([
      { name: '第一章', summary: 's', estimatedWords: 2500 },
    ]))
    const r = await svc.generateOutlineStory('ev-cg-2', 'p1', 'pc1', 'm1', 1)
    expect(r.success).toBe(true)
  })
})
})
