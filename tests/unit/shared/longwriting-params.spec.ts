/**
 * 「长文写作」参数测试（登记表 + 持有者 + 解析 + 读取点接线）
 * @module tests/unit/shared/longwriting-params
 *
 * 背景（参数设置第十批）：长文写作把一批"改不动"的数写死在代码里——
 * 章节生成主链的窗口 32_768 / 输出上限 8192 / 章节与段落目标字数 / 上章结尾注入 550 /
 * 记忆注入 10 与 5 条；故事研讨室的历史 40 条、单条截断（用户 600 / 主编 4000 分级，六扇门复盘）、
 * 摘要阈值 20 与批量 10、前情提要 6000、主编步数 24、账本 60、单次卡片 6、大纲叶子 30。
 *
 * 这里覆盖：两个 settings 键的归属与解析、默认值 = 改造前常量、夹取与非法值保留、
 * 跨字段护栏（batch ≤ threshold），以及**读取点真的读了持有者**（`compactLedger` 容量、
 * 整理器列出的大纲叶子数）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  longwritingParams,
  longwritingParamsFromSettings,
  resetLongwritingParams,
  setLongwritingParams,
} from '@shared/utils/longwriting-params'
import { LONGWRITING_DEFAULTS, LONGWRITING_LIMITS } from '@shared/types/longwriting-params.types'
import { getModuleParams } from '@shared/constants/module-params'
import { moduleParamSettingsKeys, resolveModuleParams } from '@shared/utils/module-params'
import { SETTINGS_KEYS } from '@shared/constants/settings-keys'
import { compactLedger } from '@core/packs/longwriting/story-room/room-ledger'
import { StoryRoomDistillerService } from '@core/packs/longwriting/story-room/room-distiller'
import { LongWritingAIService } from '@core/platform/services/longwriting-ai.service'

const DEF = getModuleParams('longwriting')!

beforeEach(() => resetLongwritingParams())
afterEach(() => resetLongwritingParams())

describe('登记表：一个 Tab 覆盖 longwriting:writing + longwriting:storyRoom', () => {
  it('Tab 名 / 模块标识 / 归属键', () => {
    expect(DEF.key).toBe('longwriting')
    expect(DEF.name).toBe('长文写作')
    expect(moduleParamSettingsKeys(DEF).sort()).toEqual(
      [SETTINGS_KEYS.longwritingWriting, SETTINGS_KEYS.longwritingStoryRoom].sort(),
    )
  })

  it('默认值 = 改造前写死的常量（逐个数钉住，防止悄悄漂移）', () => {
    const r = resolveModuleParams(DEF, {})
    // 组 writing（longwriting:writing）
    expect(r.values['windowTokens']).toBe(32_768)
    expect(r.values['maxOutputTokens']).toBe(8_192)
    expect(r.values['chapterTargetWords']).toBe(3_000)
    expect(r.values['sectionTargetWords']).toBe(500)
    expect(r.values['previousChapterEndingChars']).toBe(550)
    expect(r.values['normalMemoryLimit']).toBe(10)
    expect(r.values['minorMemoryLimit']).toBe(5)
    // 组 storyRoom（longwriting:storyRoom）
    expect(r.values['historyLimit']).toBe(40)
    expect(r.values['historyUserMaxChars']).toBe(600)
    expect(r.values['historyAssistantMaxChars']).toBe(4_000)
    expect(r.values['summaryThresholdTurns']).toBe(20)
    expect(r.values['summaryBatchTurns']).toBe(10)
    expect(r.values['maxSummaryChars']).toBe(6_000)
    expect(r.values['editorMaxSteps']).toBe(24)
    expect(r.values['ledgerCap']).toBe(60)
    expect(r.values['maxCardsPerDistill']).toBe(6)
    expect(r.values['outlineLeafLimit']).toBe(30)
    // 与 types 里的常量一致（登记表不另抄一份数值）
    expect(r.values['windowTokens']).toBe(LONGWRITING_DEFAULTS.writing.windowTokens)
    expect(r.values['ledgerCap']).toBe(LONGWRITING_DEFAULTS.storyRoom.ledgerCap)
  })

  it('两个分组的参数分别落在各自的键上；hint 必填', () => {
    const entries = resolveModuleParams(DEF, {}).groups.flatMap((g) => g.entries)
    const key = (path: string) => entries.find((e) => e.valueKey === path)?.settingsKey
    expect(key('windowTokens')).toBe(SETTINGS_KEYS.longwritingWriting)
    expect(key('previousChapterEndingChars')).toBe(SETTINGS_KEYS.longwritingWriting)
    expect(key('historyLimit')).toBe(SETTINGS_KEYS.longwritingStoryRoom)
    expect(key('ledgerCap')).toBe(SETTINGS_KEYS.longwritingStoryRoom)
    for (const e of entries) expect(e.hint.trim().length, `${e.valueKey} 缺 hint`).toBeGreaterThan(0)
  })

  it('默认值不超过硬上限（逐字段）', () => {
    for (const group of ['writing', 'storyRoom'] as const) {
      const d = LONGWRITING_DEFAULTS[group] as unknown as Record<string, number>
      const l = LONGWRITING_LIMITS[group] as unknown as Record<string, number>
      for (const k of Object.keys(d)) {
        expect(d[k], `${group}.${k}`).toBeGreaterThan(0)
        expect(d[k], `${group}.${k}`).toBeLessThanOrEqual(l[k])
      }
    }
  })
})

describe('持有者与从 settings 解析', () => {
  it('不注入时 = 内置默认；覆盖生效、超限夹取、非法值保留', () => {
    expect(longwritingParams()).toEqual(LONGWRITING_DEFAULTS)

    setLongwritingParams({ writing: { chapterTargetWords: 6_000, maxOutputTokens: 16_384 } })
    expect(longwritingParams().writing.chapterTargetWords).toBe(6_000)
    expect(longwritingParams().writing.maxOutputTokens).toBe(16_384)
    expect(longwritingParams().writing.windowTokens).toBe(LONGWRITING_DEFAULTS.writing.windowTokens)

    // 超上限 → 夹到上限；非法（负数/NaN/字符串）→ 保留当前值
    setLongwritingParams({
      writing: { windowTokens: 9_999_999, maxOutputTokens: -1, chapterTargetWords: Number.NaN },
    })
    expect(longwritingParams().writing.windowTokens).toBe(LONGWRITING_LIMITS.writing.windowTokens)
    expect(longwritingParams().writing.maxOutputTokens).toBe(16_384) // 保留上一次的合法值
    expect(longwritingParams().writing.chapterTargetWords).toBe(6_000)

    resetLongwritingParams()
    expect(longwritingParams()).toEqual(LONGWRITING_DEFAULTS)
  })

  it('从两个键解析：覆盖生效、超限夹取、未设字段回落默认', () => {
    const parsed = longwritingParamsFromSettings({
      [SETTINGS_KEYS.longwritingWriting]: { windowTokens: 65_536, chapterTargetWords: 8_000 },
      [SETTINGS_KEYS.longwritingStoryRoom]: { historyLimit: 9_999, ledgerCap: 200 },
    })
    expect(parsed.writing.windowTokens).toBe(65_536)
    expect(parsed.writing.chapterTargetWords).toBe(8_000)
    expect(parsed.writing.maxOutputTokens).toBe(LONGWRITING_DEFAULTS.writing.maxOutputTokens)
    expect(parsed.storyRoom.historyLimit).toBe(LONGWRITING_LIMITS.storyRoom.historyLimit)
    expect(parsed.storyRoom.ledgerCap).toBe(200)
    expect(parsed.storyRoom.maxCardsPerDistill).toBe(LONGWRITING_DEFAULTS.storyRoom.maxCardsPerDistill)
  })

  it('空载荷/脏载荷都回落内置默认（配置坏了不能让功能跑不起来）', () => {
    for (const raw of [null, undefined, 42, 'x', []]) {
      const parsed = longwritingParamsFromSettings({ [SETTINGS_KEYS.longwritingWriting]: raw })
      expect(parsed.writing).toEqual(LONGWRITING_DEFAULTS.writing)
    }
  })
})

describe('跨字段一致性护栏：summaryBatchTurns ≤ summaryThresholdTurns', () => {
  it('配错时把 batch 收到 threshold，并给出一条说明（不静默）', () => {
    const r = resolveModuleParams(DEF, {
      [SETTINGS_KEYS.longwritingStoryRoom]: { summaryThresholdTurns: 12, summaryBatchTurns: 40 },
    })
    expect(r.values['summaryBatchTurns']).toBe(12)
    expect(r.values['summaryThresholdTurns']).toBe(12)
    expect(r.notes.some((n) => n.includes('单次压缩轮数收到触发轮数'))).toBe(true)
    // 还原到宿主读的结构快照也要是修正后的值（设置页显示 = 实际生效）
    expect((r.trees[SETTINGS_KEYS.longwritingStoryRoom] as Record<string, unknown>).summaryBatchTurns).toBe(12)
  })

  it('合法配置不动、不给说明', () => {
    const r = resolveModuleParams(DEF, {
      [SETTINGS_KEYS.longwritingStoryRoom]: { summaryThresholdTurns: 30, summaryBatchTurns: 6 },
    })
    expect(r.values['summaryBatchTurns']).toBe(6)
    expect(r.notes).toEqual([])
  })

  it('解析进持有者时同样被护栏修正', () => {
    const parsed = longwritingParamsFromSettings({
      [SETTINGS_KEYS.longwritingStoryRoom]: { summaryThresholdTurns: 8, summaryBatchTurns: 40 },
    })
    expect(parsed.storyRoom.summaryBatchTurns).toBe(8)
  })

  it('持有者直接注入（不经 settings）也走同一护栏', () => {
    setLongwritingParams({ storyRoom: { summaryThresholdTurns: 8, summaryBatchTurns: 40 } })
    expect(longwritingParams().storyRoom.summaryBatchTurns).toBe(8)
    expect(longwritingParams().storyRoom.summaryThresholdTurns).toBe(8)
  })
})

describe('读取点接线（真实行为改变）', () => {
  const mkLedger = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `e${i}`,
      kind: 'premise',
      title: `共识${i}`,
      points: [],
      status: 'tentative',
      sourceTurn: i + 1,
      updatedAt: 1,
    }) as never)

  it('账本容量：compactLedger 的缺省上限跟着「共识账本容量」走', () => {
    // 默认 60：100 条 tentative 压到 60
    expect(compactLedger(mkLedger(100))).toHaveLength(60)

    setLongwritingParams({ storyRoom: { ledgerCap: 8 } })
    expect(compactLedger(mkLedger(100))).toHaveLength(8)
    // 显式传 cap 的调用方（单测/特殊场景）不受影响
    expect(compactLedger(mkLedger(100), 3)).toHaveLength(3)

    // 超上限的注入被夹到硬上限 400
    setLongwritingParams({ storyRoom: { ledgerCap: 99_999 } })
    expect(compactLedger(mkLedger(500))).toHaveLength(LONGWRITING_LIMITS.storyRoom.ledgerCap)
  })

  it('大纲叶子节点上限：整理器列给模型的大纲条数跟着参数走', async () => {
    const leaves = Array.from({ length: 50 }, (_, i) => ({
      id: `n${i}`,
      name: `第${i + 1}章`,
      nodeType: 'chapter',
    }))
    const db = { lwOutlines: { getTreeByProjectId: async () => leaves } }
    const svc = new StoryRoomDistillerService(db)
    const state = { contentTarget: 'novel', turnNo: 1, pendingCards: [], ledger: [], summary: '', summarizedTurn: 0, phase: 'outline', cardSeq: 0 }
    // scopeContext 是私有方法：这里做白盒调用，只为证明读取点连到了持有者
    const scope = svc as unknown as {
      scopeContext(m: unknown, projectId: string, scope: string, st: unknown): Promise<string>
    }
    const count = async () =>
      (await scope.scopeContext(db, 'p1', 'chapter', state))
        .split('\n')
        .filter((l) => l.includes('- id=')).length

    expect(await count()).toBe(30) // 默认 30
    setLongwritingParams({ storyRoom: { outlineLeafLimit: 5 } })
    expect(await count()).toBe(5)
    setLongwritingParams({ storyRoom: { outlineLeafLimit: 300 } })
    expect(await count()).toBe(50) // 上限内按实际条数
  })

  it('上章结尾注入字数：extractEndingContentByParagraph 的缺省值跟着参数走', () => {
    // 单例只做纯计算（不碰数据库/Provider），可低成本驱动
    const ai = LongWritingAIService.getInstance() as unknown as {
      extractEndingContentByParagraph(content: string, targetChars?: number): string
    }
    // 60 段 × 110 个汉字
    const para = '这是一段结尾正文内容。'.repeat(10)
    const content = Array.from({ length: 60 }, (_, i) => `${para}${i}`).join('\n')
    const chinese = (t: string) => (t.match(/[\u4e00-\u9fa5]/g) || []).length

    // 默认 550 字：按段落截到 500~600 之间
    const dflt = chinese(ai.extractEndingContentByParagraph(content))
    expect(dflt).toBeGreaterThanOrEqual(500)
    expect(dflt).toBeLessThanOrEqual(650)

    setLongwritingParams({ writing: { previousChapterEndingChars: 2_000 } })
    const bigger = chinese(ai.extractEndingContentByParagraph(content))
    expect(bigger).toBeGreaterThan(dflt)
    expect(bigger).toBeGreaterThanOrEqual(1_900)

    // 超上限的注入被夹到硬上限 5000：仍按 5000 截取（若没夹取会因"目标 > 全文长度"直接返回全文）
    setLongwritingParams({ writing: { previousChapterEndingChars: 99_999 } })
    const clamped = chinese(ai.extractEndingContentByParagraph(content))
    expect(clamped).toBeGreaterThan(bigger)
    expect(clamped).toBeLessThan(chinese(content))
    expect(clamped).toBeGreaterThanOrEqual(4_900)
  })
})
