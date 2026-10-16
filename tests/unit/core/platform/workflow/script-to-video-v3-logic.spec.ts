/**
 * script-to-video-v3 图内代码逻辑测试（直接执行 JSON 里的真实 code 节点源码）
 * @module tests/unit/core/platform/workflow/script-to-video-v3-logic
 * @description 图结构断言只能证明"接线对"，证明不了"逻辑对"。这里用与引擎同一套 vm 沙箱
 *              （runCodeInSandbox）执行 JSON 中的 code 节点源码，验证：
 *              - matItem：visualShot 输出 → 素材卡片（来源/相关性/出处/片段路径齐全）
 *              - boardMerge：卡片 → 摘要含来源·相关性·出处（授权留痕可读）
 *              - segPlan：真实视频直用 / 图片运镜 / H3 待生成 三分支；无任何素材即报错
 *              - segments：H3 结果按 cardIndex 回填；缺段报错而不是产出错位成片
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { runCodeInSandbox } from '@core/platform/workflow/nodes/code-nodes'

const doc = JSON.parse(
  readFileSync(join(process.cwd(), 'src/core/database/migrations/builtin-apps/script-to-video-v3.json'), 'utf-8')
) as { graph: { nodes: Array<{ id: string; type: string; config: { code?: string } }> } }
const codeOf = (id: string): string => {
  const n = doc.graph.nodes.find(x => x.id === id)
  if (!n?.config?.code) throw new Error('no code node ' + id)
  return n.config.code
}
const run = (id: string, inputs: Record<string, unknown>): any =>
  runCodeInSandbox(codeOf(id), inputs, 5000)

const shot = (over: Record<string, unknown> = {}) => ({
  _origIndex: 0,
  concept: '进出口外贸',
  subject: '龙门吊与集装箱',
  setting: '集装箱码头堆场',
  visual: '繁忙集装箱码头，龙门吊吊装集装箱，货轮靠泊',
  imagery: '港口集装箱码头',
  caption: '外贸进出口超预期',
  duration: 6,
  searchQuery: 'container port terminal',
  ...over,
})

describe('matItem：镜头画面 → 素材卡片', () => {
  it('真实视频素材卡片：带 clipPath、来源与出处', () => {
    const card = run('matItem', {
      item: shot(),
      visual: {
        source: 'stock-video',
        clipPath: 'C:/data/stock-media/pexels/video/pexels_video_11801939.mp4',
        clipUrl: 'local-video://stock-media/pexels/video/pexels_video_11801939.mp4',
        imagePath: '',
        imageUrl: '',
        relevance: 82,
        attempts: 0,
        provider: 'pexels',
        stockId: '11801939',
        pageUrl: 'https://www.pexels.com/video/11801939/',
        author: 'Mike Hongkong',
        license: 'pexels',
        searchQuery: 'container port terminal',
        note: '真实视频素材采用',
      },
    })
    expect(card.mode).toBe('imagery')
    expect(card.source).toBe('stock-video')
    expect(card.clipPath).toContain('pexels_video_11801939.mp4')
    expect(card.relevance).toBe(82)
    expect(card.stockId).toBe('11801939')
    expect(card.pageUrl).toContain('pexels.com')
    expect(card.caption).toBe('外贸进出口超预期')
    expect(card.duration).toBe(6)
    expect(card.mode).toBe('imagery')
  })

  it('生成兜底卡片：imagePath + attempts；缺失字段不产生 undefined 噪音', () => {
    const card = run('matItem', {
      item: shot({ duration: 0 }),
      visual: { source: 'generated', imagePath: 'C:/data/images/2026/09/17/a.png', imageUrl: 'local-image://images/a.png', relevance: 71, attempts: 2 },
    })
    expect(card.source).toBe('generated')
    expect(card.imagePath).toContain('a.png')
    expect(card.relevance).toBe(71)
    expect(card.attempts).toBe(2)
    expect(card.duration).toBe(5) // 缺时长回落 5s
    expect(card.clipPath).toBe('')
    expect(card.pageUrl).toBe('')
  })

  it('兼容引擎再包一层 {result} 的形态', () => {
    const card = run('matItem', {
      item: shot(),
      visual: { result: { source: 'stock-image', imagePath: 'C:/x.jpg', relevance: 66 } },
    })
    expect(card.source).toBe('stock-image')
    expect(card.imagePath).toBe('C:/x.jpg')
  })
})

describe('boardMerge：摘要留痕可读', () => {
  const cards = [
    run('matItem', {
      item: shot(),
      visual: { source: 'stock-video', clipPath: 'C:/v1.mp4', relevance: 85, stockId: '11801939', pageUrl: 'https://www.pexels.com/video/11801939/', author: 'Mike', searchQuery: 'container port terminal' },
    }),
    run('matItem', {
      item: shot({ _origIndex: 1, caption: '产业指数回升' }),
      visual: { source: 'generated', imagePath: 'C:/i2.png', relevance: 63, attempts: 2, note: '真实素材未命中' },
    }),
  ]

  it('按镜头顺序聚合并标 cardIndex；摘要含来源/相关性/出处/检索词', () => {
    const out = run('boardMerge', { a: cards, b: [], mode: 'imagery' })
    expect(out.cards).toHaveLength(2)
    expect(out.cards[0].cardIndex).toBe(0)
    expect(out.cards[1].cardIndex).toBe(1)
    expect(out.cards[0]._origIndex).toBeUndefined()
    expect(out.summary).toContain('镜头1')
    expect(out.summary).toContain('真实视频')
    expect(out.summary).toContain('相关性 85')
    expect(out.summary).toContain('https://www.pexels.com/video/11801939/')
    expect(out.summary).toContain('检索词 container port terminal')
    expect(out.summary).toContain('AI生成')
    expect(out.summary).toContain('供给说明')
  })

  it('imagery 与 asset 两组结果按 _origIndex 归并排序', () => {
    const stock = run('matItem', { item: shot({ _origIndex: 1 }), visual: { source: 'generated', imagePath: 'C:/b.png' } })
    const base = { _origIndex: 0, mode: 'asset', source: 'asset:asset_1', caption: '自有素材镜', duration: 4, imagePath: 'C:/a.jpg' }
    const out = run('boardMerge', { a: [stock], b: [base], mode: 'asset' })
    expect(out.cards.map((c: any) => c.caption)).toEqual(['自有素材镜', '外贸进出口超预期'])
    expect(out.summary).toContain('自有素材')
  })
})

describe('segPlan：片段来源规划', () => {
  const cardOf = (over: Record<string, unknown>): Record<string, unknown> => ({
    cardIndex: 0, caption: 'c', duration: 6, source: 'generated', imagePath: '', clipPath: '', ...over,
  })

  it('真实视频直用（即使 clipSource=h3 也优先用真实片段）', () => {
    const out = run('segPlan', { cards: [cardOf({ clipPath: 'C:/real.mp4', source: 'stock-video' })], clipSource: 'h3' })
    expect(out.segments).toHaveLength(1)
    expect(out.segments[0]).toMatchObject({ kind: 'video', source: 'C:/real.mp4', origin: 'stock-video' })
    expect(out.h3List).toHaveLength(0)
  })

  it('auto：无真实视频时用图片 + 缓慢运镜（相邻镜头运镜不同）', () => {
    const out = run('segPlan', {
      cards: [
        cardOf({ cardIndex: 0, imagePath: 'C:/a.jpg', source: 'stock-image' }),
        cardOf({ cardIndex: 1, imagePath: 'C:/b.jpg', source: 'generated' }),
      ],
      clipSource: 'auto',
    })
    expect(out.h3Count).toBe(0)
    expect(out.segments[0]).toMatchObject({ kind: 'image', source: 'C:/a.jpg', motion: 'zoom-in' })
    expect(out.segments[1].motion).toBe('pan-right')
    expect(out.segments[1].motion).not.toBe(out.segments[0].motion)
  })

  it('h3：无真实视频的镜头进入 H3 待生成列表，segment 标 pending', () => {
    const out = run('segPlan', { cards: [cardOf({ imagePath: 'C:/a.jpg' })], clipSource: 'h3', videoProviderConfigId: 'pc_comfy' })
    expect(out.h3Count).toBe(1)
    expect(out.h3List[0].imagePath).toBe('C:/a.jpg')
    expect(out.segments[0]).toMatchObject({ kind: 'video', pending: true, origin: 'h3' })
  })

  it('h3 模式缺少视频 Provider 时明确报错（运行期把关，不静默降级）', () => {
    expect(() => run('segPlan', { cards: [cardOf({ imagePath: 'C:/a.jpg' })], clipSource: 'h3', videoProviderConfigId: '' })).toThrow(
      /未配置「视频 Provider」/,
    )
  })

  it('既无真实片段也无图的镜头直接报错（不静默产出缺口成片）', () => {
    expect(() => run('segPlan', { cards: [cardOf({})], clipSource: 'auto' })).toThrow(/没有任何画面素材/)
  })

  it('素材板为空时报错', () => {
    expect(() => run('segPlan', { cards: [], clipSource: 'auto' })).toThrow(/素材板为空/)
  })
})

describe('segments：片段装配', () => {
  const plan = {
    segments: [
      { cardIndex: 0, kind: 'video', source: 'C:/real.mp4', duration: 6, caption: '真实段' },
      { cardIndex: 2, kind: 'video', source: '', duration: 5, caption: 'H3段', pending: true },
      { cardIndex: 1, kind: 'image', source: 'C:/a.jpg', duration: 4, caption: '图片段', motion: 'zoom-in' },
    ],
    h3List: [{ cardIndex: 2, imagePath: 'C:/h3-src.jpg' }],
  }

  it('H3 结果按 cardIndex 回填，其余段原样保留', () => {
    const out = run('segments', {
      segments: plan.segments,
      h3List: plan.h3List,
      results: [{ videoPath: 'C:/h3-out.mp4' }],
    })
    expect(out.count).toBe(3)
    const byCaption = new Map(out.segments.map((s: any) => [s.caption, s]))
    expect(byCaption.get('H3段')).toMatchObject({ kind: 'video', source: 'C:/h3-out.mp4' })
    expect(byCaption.get('真实段')).toMatchObject({ source: 'C:/real.mp4' })
    expect(byCaption.get('图片段')).toMatchObject({ kind: 'image', motion: 'zoom-in' })
  })

  it('auto 模式（无 H3 结果）也能装配，且视频段不含量化字段', () => {
    const out = run('segments', {
      segments: plan.segments.filter((s: any) => !s.pending),
      h3List: [],
      results: [],
    })
    expect(out.count).toBe(2)
    for (const s of out.segments) {
      expect(s.motion).toBeTruthy()
    }
  })

  it('H3 结果缺失时明确报错（不产出少一段的成片）', () => {
    expect(() => run('segments', { segments: plan.segments, h3List: plan.h3List, results: [] })).toThrow(/片段素材缺失/)
  })

  it('片段规划为空时报错', () => {
    expect(() => run('segments', { segments: [], h3List: [], results: [] })).toThrow(/片段规划结果为空/)
  })

  it('兼容引擎把 loop 结果包一层 {result} 的形态', () => {
    const out = run('segments', {
      segments: plan.segments,
      h3List: plan.h3List,
      results: [{ result: { videoPath: 'C:/h3-out.mp4' } }],
    })
    expect(out.segments.find((s: any) => s.caption === 'H3段').source).toBe('C:/h3-out.mp4')
  })
})