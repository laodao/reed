/**
 * 设计文档服务集成测试（2026-09-16 结构化设定方案 M1）
 * 真实体 + 真仓储 + 内存 SQLite：校验拦截 → 草稿 → 确认分解落库 → 幂等重跑。
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { DataSource } from 'typeorm'
import {
  LwCharacterEntity,
  LwLocationEntity,
  LwItemEntity,
  LwFactionEntity,
  LwForeshadowEntity,
  LwEventEntity,
  LwOutlineEntity,
  LwOutlineCharacterEntity,
  LwOutlineLocationEntity,
  LwOutlineItemEntity,
  LwStoryOverviewEntity,
  LwDesignDocumentEntity,
} from '@core/database/entities'
import { LwCharacterRepository } from '@core/database/repositories/lw-character.repository'
import { LwLocationRepository } from '@core/database/repositories/lw-location.repository'
import { LwItemRepository } from '@core/database/repositories/lw-item.repository'
import { LwFactionRepository } from '@core/database/repositories/lw-faction.repository'
import { LwForeshadowRepository } from '@core/database/repositories/lw-foreshadow.repository'
import { LwEventRepository } from '@core/database/repositories/lw-event.repository'
import { LwOutlineRepository } from '@core/database/repositories/lw-outline.repository'
import { LwStoryOverviewRepository } from '@core/database/repositories/lw-story-overview.repository'
import { LwDesignDocumentRepository } from '@core/database/repositories/lw-design-document.repository'
import {
  saveDesignDraft,
  confirmDesignDoc,
  persistSpineDoc,
  persistVolumeDesignDoc,
} from '@core/platform/services/longwriting/design/design-document.service'
import type { SpineDoc, VolumeDesignDoc } from '@shared/contracts/longwriting-design'

const PROJECT = 'proj_test'

let ds: DataSource
let db: Record<string, any>

const spine: SpineDoc = {
  core: { premise: '小捕快查身世', theme: '公道与血仇', ending: '真相大白' },
  main_lines: [{ id: 'p_main_1', title: '身世主线', stages: ['发现', '追查', '对决'] }],
  core_cast: ['c_chengye'],
  volumes: [{ id: 'v1', title: '初入汴京', chapter_range: { from: 1, to: 20 }, focus: '查案' }],
}

const volume: VolumeDesignDoc = {
  volume: 'v1',
  cast: [
    { id: 'c_chengye', kind: 'character', name: '程野', importance: 'core' },
    { id: 'c_suwantang', kind: 'character', name: '苏晚棠', aliases: ['苏掌柜'] },
    { id: 'l_dujiang', kind: 'location', name: '渡江城' },
  ],
  threads: [
    {
      id: 'hl_01',
      name: '苏晚棠的真实身份',
      involves: ['c_suwantang', 'c_chengye'],
      plant: 3,
      develop: [6, 9],
      payoff: 15,
      constraint: '15 章前任何角色不得明言',
    },
  ],
  grid: [
    { ch: 3, beats: ['程野初见苏晚棠'], present: ['c_chengye', 'c_suwantang'], location: 'l_dujiang', line_actions: [{ line: 'hl_01', act: 'plant' }] },
    { ch: 6, beats: ['苏晚棠欲言又止'] },
  ],
  events: [{ id: 'ev_reveal_15', chapter: 15, story_time: '永昌三十一年冬', desc: '身份揭穿', participants: ['c_chengye', 'c_suwantang'] }],
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      LwCharacterEntity,
      LwLocationEntity,
      LwItemEntity,
      LwFactionEntity,
      LwForeshadowEntity,
      LwEventEntity,
      LwOutlineEntity,
      LwOutlineCharacterEntity,
      LwOutlineLocationEntity,
      LwOutlineItemEntity,
      LwStoryOverviewEntity,
      LwDesignDocumentEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  db = {
    lwCharacters: new LwCharacterRepository(ds),
    lwLocations: new LwLocationRepository(ds),
    lwItems: new LwItemRepository(ds),
    lwFactions: new LwFactionRepository(ds),
    lwForeshadows: new LwForeshadowRepository(ds),
    lwEvents: new LwEventRepository(ds),
    lwOutlines: new LwOutlineRepository(ds),
    lwStoryOverviews: new LwStoryOverviewRepository(ds),
    lwDesignDocuments: new LwDesignDocumentRepository(ds),
  }
})

describe('spine 分解落库', () => {
  it('概要 upsert + 卷目录节点（design_status=coarse）+ idMap', async () => {
    const r = await persistSpineDoc(db, PROJECT, spine)
    expect(r.ok).toBe(true)

    const overview = await db.lwStoryOverviews.getByProjectId(PROJECT)
    expect(overview?.coreIdea).toBe('小捕快查身世')
    expect(overview?.summary).toBe('真相大白')

    const volumes = (await db.lwOutlines.getByProjectId(PROJECT)).filter((o: any) => o.nodeType === 'volume')
    expect(volumes).toHaveLength(1)
    expect(volumes[0].name).toBe('初入汴京')
    expect(volumes[0].designStatus).toBe('coarse')
    expect(r.idMap?.v1).toBe(volumes[0].id)
  })
})

describe('卷设计分解落库', () => {
  it('cast/threads/events/grid 全链路 + 卷 detailed', async () => {
    const r = await persistVolumeDesignDoc(db, PROJECT, volume, { spine })
    expect(r.ok).toBe(true)

    // cast
    const chars = await db.lwCharacters.getByProjectId(PROJECT)
    const names = chars.map((c: any) => c.name).sort()
    expect(names).toEqual(['程野', '苏晚棠'])
    const su = chars.find((c: any) => c.name === '苏晚棠')
    expect(su.aliases).toContain('苏掌柜')
    const locs = await db.lwLocations.getByProjectId(PROJECT)
    expect(locs.map((l: any) => l.name)).toContain('渡江城')

    // threads → 伏笔 + 关联列（involves 解析为真实 db id）
    const fbs = await db.lwForeshadows.getByProjectId(PROJECT)
    expect(fbs).toHaveLength(1)
    const fb = fbs[0]
    expect(fb.plantedChapter).toBe(3)
    expect(fb.payoffChapter).toBe(15)
    expect(fb.developChapters).toEqual([6, 9])
    expect(fb.content).toContain('15 章前任何角色不得明言')
    expect(fb.involves?.map((i: any) => i.id).sort()).toEqual([su.id, chars.find((c: any) => c.name === '程野').id].sort())

    // events → planned
    const evRows = await ds.getRepository(LwEventEntity).find()
    expect(evRows).toHaveLength(1)
    expect(evRows[0].state).toBe('planned')
    expect(evRows[0].chapterNumber).toBe(15)

    // grid → 卷下章节点 + involved 绑定
    const volNode = (await db.lwOutlines.getByProjectId(PROJECT)).find((o: any) => o.name === '初入汴京')
    expect(volNode.designStatus).toBe('detailed')
    const children = await db.lwOutlines.getChildren(volNode.id)
    expect(children.map((c: any) => c.name)).toEqual(['第3章 程野初见苏晚棠', '第6章 苏晚棠欲言又止'])
    const ch3 = children.find((c: any) => c.name.startsWith('第3章'))
    expect(ch3.involvedCharacters).toContain(chars.find((c: any) => c.name === '程野').id)
    expect(ch3.involvedLocations).toContain(locs.find((l: any) => l.name === '渡江城').id)

    // idMap 覆盖 cast/thread/event/章
    expect(r.idMap?.c_chengye).toBeTruthy()
    expect(r.idMap?.hl_01).toBe(fb.id)
    expect(r.idMap?.ev_reveal_15).toBeTruthy()
    expect(r.idMap?.ch_3).toBe(ch3.id)
  })

  it('幂等重跑：同名 cast 不重复建、章节点不重复挂', async () => {
    const charCountBefore = (await db.lwCharacters.getByProjectId(PROJECT)).length
    const volNode = (await db.lwOutlines.getByProjectId(PROJECT)).find((o: any) => o.name === '初入汴京')
    const childCountBefore = (await db.lwOutlines.getChildren(volNode.id)).length

    const r = await persistVolumeDesignDoc(db, PROJECT, volume, { spine })
    expect(r.ok).toBe(true)
    expect((await db.lwCharacters.getByProjectId(PROJECT)).length).toBe(charCountBefore)
    expect((await db.lwOutlines.getChildren(volNode.id)).length).toBe(childCountBefore)
  })
})

describe('草稿保存与确认闭环', () => {
  it('校验失败响亮返回错误清单（不落草稿）', async () => {
    const bad = { ...volume, cast: [{ ...volume.cast[0], id: 'l_chengye' }] }
    const r = await saveDesignDraft(db, 'proj_other', { kind: 'volume', title: '坏卷', doc: bad })
    expect(r.ok).toBe(false)
    expect(r.errors?.some((e) => e.path === '/cast/0/id')).toBe(true)
    expect(await db.lwDesignDocuments.listByProject('proj_other')).toHaveLength(0)
  })

  it('spine 草稿→确认后，卷草稿获得 spine 上下文；确认→落库+idMap；重复确认被拒', async () => {
    const pid = 'proj_flow'
    // 真实流程：先保存并确认 spine（为后续卷设计提供卷标题/章界上下文）
    const spineSaved = await saveDesignDraft(db, pid, { kind: 'spine', title: '总纲', doc: spine })
    expect(spineSaved.ok).toBe(true)
    const spineConfirmed = await confirmDesignDoc(db, pid, spineSaved.docId!)
    expect(spineConfirmed.ok).toBe(true)
    expect(spineConfirmed.idMap?.v1).toBeTruthy()

    const saved = await saveDesignDraft(db, pid, { kind: 'volume', title: '第一卷', doc: volume })
    expect(saved.ok).toBe(true)
    expect(saved.docId).toBeTruthy()

    // 同卷重存 = 版本+1 而非新草稿
    const saved2 = await saveDesignDraft(db, pid, { kind: 'volume', title: '第一卷', doc: volume })
    expect(saved2.docId).toBe(saved.docId)
    expect(saved2.version).toBe((saved.version ?? 1) + 1)

    const r = await confirmDesignDoc(db, pid, saved.docId!)
    expect(r.ok).toBe(true)

    const row = await db.lwDesignDocuments.getById(saved.docId!)
    expect(row?.status).toBe('confirmed')
    expect(row?.idMap?.c_chengye).toBeTruthy()

    // 卷节点复用 spine 建的同名卷（而非另建「卷 v1」）
    const volumes = (await db.lwOutlines.getByProjectId(pid)).filter((o: any) => o.nodeType === 'volume')
    expect(volumes).toHaveLength(1)
    expect(r.idMap?.v1).toBe(spineConfirmed.idMap?.v1)

    const again = await confirmDesignDoc(db, pid, saved.docId!)
    expect(again.ok).toBe(false)
  })

  it('确认前重验：草稿保存后契约被破坏则拒绝落库', async () => {
    const pid = 'proj_gate'
    const spineSaved = await saveDesignDraft(db, pid, { kind: 'spine', title: '总纲', doc: spine })
    await confirmDesignDoc(db, pid, spineSaved.docId!)
    const saved = await saveDesignDraft(db, pid, { kind: 'volume', title: '第一卷', doc: volume })
    // 直接改库模拟草稿被破坏（卷指向 spine 未声明的 v9）
    const broken = { ...volume, volume: 'v9' }
    await db.lwDesignDocuments.updateDraftJson(saved.docId!, broken)
    const r = await confirmDesignDoc(db, pid, saved.docId!)
    expect(r.ok).toBe(false)
    expect(r.errors?.some((e) => e.code === 'unresolved_ref')).toBe(true)
  })
})
