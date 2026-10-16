/**
 * 知识包服务层测试（v2 P2）：意图路由/场面推断/写中与写前取材/预算收口/出处完整性/
 * 库品类匹配/kb_brain_query v2 工具（空包回退平铺）/写作工具主路回退。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbNoteRepository, type KbNoteRecord } from '@core/database/repositories/kb-note.repository'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import {
  KbBrainPackService,
  routeIntent,
  inferSceneType,
  renderPack,
  PACK_CHAR_BUDGET,
} from '@core/platform/services/kb-brain/brain-pack.service'
import { buildKbBrainQueryToolDef } from '@core/platform/services/kb-brain/kb-brain-tools'
import { buildWritingBrainTool } from '@core/platform/services/kb-brain/writing-brain-tool'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

describe('意图路由与场面推断（纯函数）', () => {
  it('写前/写中路由', () => {
    expect(routeIntent('给新书搭修真世界观大纲')).toBe('outline')
    expect(routeIntent('开书前先梳理设定集与第一卷规划')).toBe('outline')
    expect(routeIntent('写主角第一次宗门大比的场面')).toBe('scene')
    expect(routeIntent('帮我把这段写完')).toBe('scene') // 缺省写中：生成途中最高频
  })

  it('场面类型推断（关键词首命中；判不出 undefined）', () => {
    expect(inferSceneType('主角突破金丹期，引来雷劫')).toBe('breakthrough')
    expect(inferSceneType('两人当场交手，斗法三十回合')).toBe('battle')
    expect(inferSceneType('长老把脉试探弟子真实修为')).toBe('probe')
    expect(inferSceneType('拍卖会上交易一株灵草')).toBe('deal')
    expect(inferSceneType('这一章没什么特别的')).toBeUndefined()
  })

  it('打包预算收口：超预算整段丢弃并注记，不截半段', () => {
    const big = 'x'.repeat(PACK_CHAR_BUDGET) // 单段超预算 → 被丢
    const small = 'y'.repeat(50)
    const pack = renderPack('【头】', [
      { title: '小段', lines: [small] },
      { title: '巨段', lines: [big] },
    ])
    expect(pack).toContain('小段')
    expect(pack).not.toContain('巨段')
    expect(pack).toContain('另有 1 个分段因篇幅未收录')
  })
})

describe('KbBrainPackService 取材与打包', () => {
  let ds: DataSource
  let notes: KbNoteRepository
  let kbs: KnowledgeBaseRepository
  let pack: KbBrainPackService

  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities).filter((v) => typeof v === 'function') as EntityCtor[],
      synchronize: false,
      logging: false,
    })
    await ds.initialize()
    await createKbBrainTestTables(ds)
    notes = new KbNoteRepository(ds)
    kbs = new KnowledgeBaseRepository(ds)
    // 修真库（genre 命中用）+ 科普库
    await insertTestKb(ds, {
      id: 'kb-xiuzhen',
      brainConfig: '{"enabled":true,"profile":{"contentType":"novel","genre":"修真"}}',
    })
    await insertTestKb(ds, {
      id: 'kb-kepu',
      brainConfig: '{"enabled":true,"profile":{"contentType":"knowledge","genre":"科普/编程"}}',
    })
    await seedCards()
    pack = new KbBrainPackService({
      repos: () => ({ notes, kbs }),
      searchAtoms: async () => [{ content: '结丹需三转淬炼（出处必带）', documentName: '凡人修仙传', quote: '三转' }],
    })
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  async function publishNote(kbId: string, input: Partial<KbNoteRecord> & { title: string; type: KbNoteRecord['type'] }) {
    const n = await notes.propose(kbId, {
      title: input.title,
      description: input.description ?? 'd',
      body: input.body ?? '',
      type: input.type,
      patternSkeleton: input.patternSkeleton,
      patternInstances: input.patternInstances,
      evidence: input.evidence,
      tags: input.tags,
    })
    return notes.publish(n.id)
  }

  async function seedCards() {
    await publishNote('kb-xiuzhen', {
      title: '「师长核查弟子隐瞒」场面套路',
      type: 'plot-pattern',
      description: '写师徒信任危机时用',
      patternSkeleton: JSON.stringify(['埋反常细节', '设局试探', '揭穿或化解', '裂痕成为支点']),
      patternInstances: JSON.stringify(Array.from({ length: 14 }, (_, i) => ({ eventId: `e${i}` }))),
      tags: '["smelt","scene:probe"]',
    })
    await publishNote('kb-xiuzhen', {
      title: '「无代价突破」反面注意',
      type: 'plot-pattern',
      description: '突破必须带代价',
      patternInstances: '[]',
      tags: '["smelt","scene:breakthrough"]',
    })
    await publishNote('kb-xiuzhen', {
      title: '案例：试探场面的信息差控制',
      type: 'craft-case',
      description: '拆解',
      evidence: JSON.stringify([{ eventId: 'e1', quote: '李长老扣住他的手腕，眉头渐渐锁紧' }]),
      tags: '["smelt","scene:probe"]',
    })
    await publishNote('kb-xiuzhen', {
      title: '期待感=间隔×代价',
      type: 'principle',
      description: '升级体系的节流阀原理',
      tags: '["smelt"]',
    })
    await publishNote('kb-xiuzhen', {
      title: '品类认知：修真师徒叙事',
      type: 'genre-insight',
      description: '读者心理地图',
      body: '## 读者期待\n- 境界体系清晰\n## 爽点\n- 突破兑现期待\n## 雷点\n- 无代价连续突破',
      tags: '["smelt"]',
    })
    await publishNote('kb-xiuzhen', { title: '设定体系：灵石经济', type: 'setting-pattern', description: '资源体系参考' })
    await publishNote('kb-xiuzhen', { title: '《凡人》设定索引', type: 'setting-index', description: '书级档案' })
    await publishNote('kb-xiuzhen', { title: '《凡人》全书大纲', type: 'book-outline', description: '书级档案' })
  }

  it('写中取材：sceneType 命中 → 套路卡（骨架+频率）+ 案例原文 + 原理 + 设定论断（带出处）', async () => {
    const out = await pack.buildPack({ task: '写长老把脉试探弟子修为的场面' })
    expect(out.ok).toBe(true)
    expect(out.mode).toBe('scene')
    expect(out.sceneType).toBe('probe')
    expect(out.kbId).toBe('kb-xiuzhen') // 任务含「修真」→ genre 匹配
    expect(out.pack).toContain('师长核查弟子隐瞒')
    expect(out.pack).toContain('埋反常细节 → 设局试探')
    expect(out.pack).toContain('14 实例')
    expect(out.pack).toContain('李长老扣住他的手腕')
    expect(out.pack).toContain('期待感=间隔×代价')
    expect(out.pack).toContain('（出处：凡人修仙传）')
  })

  it('写前搭骨架：品类认知 + 设定体系 + 套路菜单 + 代表作档案', async () => {
    const out = await pack.buildPack({ task: '给修真新书搭世界观大纲' })
    expect(out.mode).toBe('outline')
    expect(out.pack).toContain('品类认知')
    expect(out.pack).toContain('境界体系清晰')
    expect(out.pack).toContain('设定体系：灵石经济')
    expect(out.pack).toContain('套路菜单')
    expect(out.pack).toContain('《凡人》全书大纲')
  })

  it('库品类匹配：任务含「编程」→ 选科普库（修真库的卡不出现）', async () => {
    const out = await pack.buildPack({ task: '写一篇编程入门教程的讲解场面' })
    expect(out.kbId).toBe('kb-kepu')
    expect(out.pack).not.toContain('师长核查弟子隐瞒')
  })

  it('无匹配仍回落第一个启用库；空 task 报错不抛', async () => {
    const out = await pack.buildPack({ task: '随便写点什么' })
    expect(out.ok).toBe(true) // 无 genre 命中 → 回落首个启用库
    await expect(pack.buildPack({ task: '  ' })).resolves.toMatchObject({ ok: false })
  })
})

describe('kb_brain_query v2 工具', () => {
  it('主路：返回知识包（mode/sceneType/pack）', async () => {
    const def = buildKbBrainQueryToolDef({
      pack: async () => ({ ok: true, kbId: 'k1', mode: 'scene', sceneType: 'probe', pack: '【写作知识包】套路…' }),
    })
    const out = (await def.execute!({ task: '写试探场面' }, {} as never)) as { ok: boolean; data: { mode: string; pack: string } }
    expect(out.ok).toBe(true)
    expect(out.data.mode).toBe('scene')
    expect(out.data.pack).toContain('套路')
  })

  it('空包回退：平铺检索命中（flat 模式 + hits）', async () => {
    const def = buildKbBrainQueryToolDef({
      pack: async () => ({ ok: false, mode: 'scene', pack: '', error: '没有启用库' }),
      fallbackSearch: async () => ({
        success: true,
        data: [{ kind: 'note', documentName: '卡', content: '套路内容' }],
      }),
    })
    const out = (await def.execute!({ task: 'x' }, {} as never)) as { ok: boolean; data: { mode: string; hits: unknown[] } }
    expect(out.data.mode).toBe('flat')
    expect(out.data.hits).toHaveLength(1)
  })

  it('空 task 报错', async () => {
    const def = buildKbBrainQueryToolDef({ pack: async () => ({ ok: true, mode: 'scene', pack: '' }) })
    const out = (await def.execute!({ task: '' }, {} as never)) as { ok: boolean }
    expect(out.ok).toBe(false)
  })
})

describe('writing-brain-tool v2 主路/回退', () => {
  it('知识包主路：直接返回 pack 文本', async () => {
    const t = buildWritingBrainTool({
      listEnabledKbs: async () => [{ id: 'k1' }],
      pack: async () => ({ ok: true, pack: '【写作知识包·场面取材（probe）】…' }),
      search: async () => {
        throw new Error('不应走到回退')
      },
    })
    const res = (await t.execute!({ query: '写把脉试探场面' }, {} as never)) as string
    expect(res).toContain('写作知识包')
    expect(res).toContain('probe')
  })

  it('主路失败 → 平铺检索回退（原行为保留）', async () => {
    const t = buildWritingBrainTool({
      listEnabledKbs: async () => [{ id: 'k1' }],
      pack: async () => ({ ok: false, pack: '' }),
      search: async () => ({ success: true, data: [{ kind: 'note', documentName: '卡', content: '命中' }] }),
    })
    const res = (await t.execute!({ query: 'q' }, {} as never)) as string
    expect(res).toContain('命中')
  })
})
