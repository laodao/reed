/**
 * 章级结构化阅读卡测试（v4 整书漏斗地基层）
 *
 * 覆盖：三画像 schema 校验（novel/knowledge/history）、章号硬校验（越界整卡拒收）、
 * 归一裁剪（超限域封顶）、解析链回喂重试、序列化/解析/指纹往返。
 */
import { describe, it, expect } from 'vitest'
import {
  KbReadingCardService,
  serializeCard,
  parseCard,
  cardHash,
} from '@core/platform/services/kb-brain/reading-card.service'
import { validateReadingCardOutput } from '@core/platform/services/kb-brain/schemas'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'

const novelCard = {
  v: 1,
  profile: 'novel',
  summary: '程野入门，立誓复仇。',
  events: ['程野拜入青云门'],
  characters: [{ name: '程野', facts: [{ t: '已入青云门', ch: 3 }], endState: '留在门中' }],
  world: [{ domain: '势力', name: '青云门', facts: [{ t: '门规森严', ch: 3 }] }],
  foreshadow: [{ label: '古钟之谜', action: 'plant', t: '古钟异响', ch: 3 }],
  style: [{ t: '以景写情', why: '克制' }],
}

describe('validateReadingCardOutput', () => {
  it('novel 卡合法通过，ch 一致', () => {
    const card = validateReadingCardOutput(novelCard, { ch: 3 })
    expect(card.profile).toBe('novel')
    expect(card.summary).toContain('程野')
  })

  it('章号越界整卡拒收（防跨章编造）', () => {
    const bad = JSON.parse(JSON.stringify(novelCard)) as typeof novelCard
    ;(bad.characters[0]!.facts[0] as { ch: number }).ch = 9
    expect(() => validateReadingCardOutput(bad, { ch: 3 })).toThrow(/章号越界/)
  })

  it('未知 profile / 缺 summary 拒收', () => {
    expect(() => validateReadingCardOutput({ v: 1, profile: 'poem', summary: 'x' }, { ch: 1 })).toThrow()
    expect(() => validateReadingCardOutput({ v: 1, profile: 'novel' }, { ch: 1 })).toThrow()
  })

  it('归一裁剪：characters 超 12 封顶、空条目剔除', () => {
    const many = {
      v: 1,
      profile: 'novel',
      summary: 's',
      characters: Array.from({ length: 15 }, (_, i) => ({ name: `人${i}`, facts: [{ t: `事实${i}`, ch: 1 }] })),
      world: [],
      foreshadow: [{ label: '', action: 'plant', t: '空标签', ch: 1 }],
    }
    const card = validateReadingCardOutput(many, { ch: 1 }) as { characters: unknown[]; foreshadow: unknown[] }
    expect(card.characters.length).toBe(12)
    expect(card.foreshadow.length).toBe(0) // 空 label 被裁剪为空数组后不满足…（保留判定：≤6 条）
  })

  it('knowledge 卡合法（论点/概念/方法/金句）', () => {
    const kc = {
      v: 1,
      profile: 'knowledge',
      summary: '本章讲复利。',
      claims: [{ t: '复利靠时间', ch: 2, evidence: ['72 法则'], kind: '主张' }],
      concepts: [{ term: '复利', definition: '利滚利', ch: 2 }],
      methods: [{ name: '72 法则', steps: ['用 72 除以收益率'], ch: 2 }],
      quotes: [{ t: '时间是复利的朋友', ch: 2 }],
    }
    expect(validateReadingCardOutput(kc, { ch: 2 }).profile).toBe('knowledge')
  })

  it('history 卡合法（时序事件/人物/制度/引文）', () => {
    const hc = {
      v: 1,
      profile: 'history',
      summary: '变法始末。',
      events: [{ t: '前 356 年变法开始', ch: 1 }],
      characters: [{ name: '商鞅', facts: [{ t: '主持变法', ch: 1 }] }],
      world: [{ domain: '制度', name: '什伍连坐', facts: [{ t: '五家为伍', ch: 1 }] }],
      quotes: [{ t: '治世不一道', ch: 1 }],
    }
    expect(validateReadingCardOutput(hc, { ch: 1 }).profile).toBe('history')
  })
})

describe('KbReadingCardService.produceCard（解析链回喂重试）', () => {
  const input = {
    bookName: '测试书',
    chapterNo: 3,
    total: 10,
    chapterTitle: '第3章',
    content: '正文',
    contentType: 'novel',
  }

  it('首次合法直接通过', async () => {
    const llm = (async () => JSON.stringify(novelCard)) as BrainLlmFn
    const card = await new KbReadingCardService({ llm }).produceCard(input)
    expect(card.summary).toContain('程野')
  })

  it('首次非法回喂重试后通过', async () => {
    let calls = 0
    const llm = (async (req: { user: string }) => {
      calls++
      if (calls === 1) return '{"v":1,"profile":"novel"}'
      expect(req.user).toContain('上次输出不合法')
      return JSON.stringify(novelCard)
    }) as BrainLlmFn
    const card = await new KbReadingCardService({ llm }).produceCard(input)
    expect(card.profile).toBe('novel')
    expect(calls).toBe(2)
  })

  it('两次均失败抛错（台账失败留痕由编排器处理）', async () => {
    const llm = (async () => 'not json') as BrainLlmFn
    await expect(new KbReadingCardService({ llm }).produceCard(input)).rejects.toThrow(/两次尝试均失败/)
  })
})

describe('序列化/解析/指纹', () => {
  it('serialize→parse 往返一致；坏输入解析为 null', () => {
    const card = validateReadingCardOutput(novelCard, { ch: 3 })
    const raw = serializeCard(card)
    expect(parseCard(raw)?.summary).toBe(card.summary)
    expect(parseCard('not json')).toBeNull()
    expect(parseCard(null)).toBeNull()
    expect(parseCard('{"noSummary":1}')).toBeNull()
  })

  it('cardHash 稳定且对内容敏感', () => {
    const card = validateReadingCardOutput(novelCard, { ch: 3 })
    expect(cardHash(card)).toBe(cardHash(serializeCard(card)))
    const other = { ...card, summary: '改过的梗概' }
    expect(cardHash(card)).not.toBe(cardHash(other as typeof card))
  })
})
