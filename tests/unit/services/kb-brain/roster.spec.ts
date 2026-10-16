/**
 * 名册测试（v4：实体整书归并 + 重要性分级）
 *
 * 覆盖：程序聚合（别名互指归并/知识概念→术语/章数统计）、预算分片、
 * 跨片程序合并与疑似簇、定级校准（覆盖率降档/少章封顶）、快照 markdown、
 * buildRoster 全流程（fake LLM + fake 实体池：软合并指令与人审保持）。
 */
import { describe, it, expect } from 'vitest'
import {
  KbRosterService,
  aggregateRosterItems,
  splitRosterParts,
  programMergeGroups,
  calibrateTiers,
  renderRosterMarkdown,
  type CardWithChapter,
  type RosterItem,
} from '@core/platform/services/kb-brain/roster.service'
import type { ReadingCard, RosterTier } from '@core/platform/services/kb-brain/schemas'
import type { BrainLlmFn } from '@core/platform/services/kb-brain/llm'

function novelEntry(ch: number, names: Array<{ name: string; aliases?: string[] }>): CardWithChapter {
  return {
    chapterNo: ch,
    card: {
      v: 1,
      profile: 'novel',
      summary: `第${ch}章`,
      events: [],
      characters: names.map((n) => ({ name: n.name, aliases: n.aliases, facts: [{ t: `${n.name}事实@${ch}`, ch }] })),
      world: [{ domain: '势力', name: '青云门', facts: [{ t: `门规@${ch}`, ch }] }],
      foreshadow: [],
      style: [],
    } as ReadingCard,
  }
}

describe('aggregateRosterItems', () => {
  it('别名与规范名互指的对象程序归并（韩师兄→韩立）', () => {
    const items = aggregateRosterItems([
      novelEntry(1, [{ name: '韩立' }]),
      novelEntry(2, [{ name: '韩师兄', aliases: ['韩立'] }]),
      novelEntry(3, [{ name: '韩立' }]),
    ])
    const han = items.filter((i) => i.name.includes('韩'))
    expect(han.length).toBe(1)
    expect(han[0]!.chapters.sort()).toEqual([1, 2, 3])
  })

  it('知识书概念 → 术语域，定义进事实', () => {
    const items = aggregateRosterItems([
      {
        chapterNo: 1,
        card: {
          v: 1,
          profile: 'knowledge',
          summary: '复利',
          claims: [{ t: '复利靠时间', ch: 1 }],
          concepts: [
            { term: '复利', definition: '利滚利', ch: 1 },
            { term: '72法则', definition: '估算翻倍年限', ch: 1 },
          ],
          methods: [],
          quotes: [],
        } as ReadingCard,
      },
    ])
    expect(items.every((i) => i.domain === 'term')).toBe(true)
    expect(items.length).toBe(2)
    const fuli = items.find((i) => i.name === '复利')
    expect(fuli?.facts[0]).toContain('利滚利')
  })
})

describe('splitRosterParts / programMergeGroups / calibrateTiers', () => {
  const items: RosterItem[] = Array.from({ length: 30 }, (_, i) => ({
    ref: i,
    domain: i % 2 === 0 ? 'character' : 'term',
    name: `对象${i}`,
    aliases: [],
    chapters: [i + 1],
    facts: ['事实'.repeat(20)],
  }))

  it('分片：预算内装尽量多，超出切分', () => {
    const parts = splitRosterParts(items, 2000)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.flat().sort((a, b) => a - b)).toEqual(items.map((i) => i.ref))
  })

  it('程序合并：跨分片同名归并；近名进疑似簇', () => {
    const a: RosterItem = { ref: 0, domain: 'character', name: '韩立', aliases: [], chapters: [1], facts: [] }
    const b: RosterItem = { ref: 1, domain: 'character', name: '韩立', aliases: [], chapters: [2], facts: [] }
    const c: RosterItem = { ref: 2, domain: 'character', name: '韩立子', aliases: [], chapters: [3], facts: [] }
    const { groups, candidates } = programMergeGroups([a, b, c], [])
    const hanGroup = groups.find((g) => g.includes(0))
    expect(hanGroup).toContain(1) // 精确同名归并
    expect(candidates.length).toBe(1) // 韩立子 与 韩立 成疑似簇
    expect(candidates[0]!.length).toBe(3)
  })

  it('定级校准：主角覆盖率不足降 major；少章封顶 minor；术语分域归档', () => {
    const items2: RosterItem[] = [
      { ref: 0, domain: 'character', name: '路人甲', aliases: [], chapters: [1], facts: [] },
      { ref: 1, domain: 'character', name: '冒牌主角', aliases: [], chapters: Array.from({ length: 5 }, (_, i) => i + 1), facts: [] },
      { ref: 2, domain: 'term', name: '某概念', aliases: [], chapters: [1], facts: [] },
    ]
    const decisions = {
      tierByRef: new Map<number, RosterTier>([
        [0, 'protagonist'],
        [1, 'protagonist'],
        [2, 'protagonist'],
      ]),
      reasonByRef: new Map<number, string>(),
    }
    const out = calibrateTiers(items2, decisions, 20)
    expect(out.get(0)!.tier).toBe('major') // 1 章 → 覆盖率 5%<30% 降 major（短书下限自适应不再叠加封顶）
    expect(out.get(1)!.tier).toBe('major') // 5/20=25% < 30% → 降 major
    expect(out.get(2)!.tier).toBe('supporting') // 术语域不认 protagonist，按规则兜底
  })
})

describe('renderRosterMarkdown / buildRoster', () => {
  it('markdown 含两域表格与人审说明', () => {
    const md = renderRosterMarkdown({
      v: 1,
      status: 'auto',
      totalItems: 2,
      truncated: false,
      characters: [
        {
          entityId: 'e1',
          domain: 'character',
          name: '韩立',
          aliases: ['韩师兄'],
          tier: 'protagonist',
          tierReason: '全程在场',
          mentionChapters: 9,
          firstChapter: 1,
          lastChapter: 9,
          sampleFacts: ['入青云门'],
        },
      ],
      terms: [
        {
          entityId: 'e2',
          domain: 'term',
          name: '青云门',
          aliases: [],
          tier: 'core',
          category: '势力',
          tierReason: '核心势力',
          mentionChapters: 9,
          firstChapter: 1,
          lastChapter: 9,
          sampleFacts: ['门规森严'],
        },
      ],
    })
    expect(md).toContain('接受=采纳当前分级')
    expect(md).toContain('韩立')
    expect(md).toContain('青云门')
  })

  it('buildRoster 全流程：分片裁决 → 实体对齐 → 快照（fake LLM + fake 实体池）', async () => {
    const createdEntities: Array<{ id: string; name: string }> = []
    const merges: Array<{ fromId: string; toId: string }> = []
    let seq = 0
    const fakeEntities = {
      async upsertMention(_kbId: string, input: { name: string }) {
        const found = createdEntities.find((e) => e.name === input.name)
        if (found) return found
        const ent = { id: `ent-${++seq}`, name: input.name }
        createdEntities.push(ent)
        return ent
      },
      async merge(fromId: string, toId: string) {
        merges.push({ fromId, toId })
      },
    } as never
    const llm = (async (req: { system: string }) => {
      if (req.system.includes('名册员')) {
        return JSON.stringify({
          groups: [],
          tiers: [{ ref: 0, tier: 'protagonist', reason: '全程在场' }],
          categories: [{ ref: 1, category: '势力' }],
        })
      }
      return JSON.stringify({ groups: [] })
    }) as BrainLlmFn
    const svc = new KbRosterService({ llm, entities: fakeEntities })
    const { snapshot, entityMerges } = await svc.buildRoster(
      'kb-x',
      [novelEntry(1, [{ name: '韩立' }]), novelEntry(2, [{ name: '韩立' }])],
      2
    )
    expect(snapshot.characters.length).toBe(1)
    expect(snapshot.characters[0]!.tier).toBe('protagonist')
    expect(snapshot.terms[0]!.category).toBe('势力')
    expect(snapshot.terms[0]!.mentionChapters).toBe(2)
    expect(createdEntities.length).toBe(2) // 韩立 + 青云门
    expect(entityMerges).toEqual(merges)
  })
})
