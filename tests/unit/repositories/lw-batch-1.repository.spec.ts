/**
 * LW 批次 1：lw-background / lw-faction / lw-map / lw-skill / lw-skill-character /
 *            lw-item / lw-location
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwBackgroundRepository } from '@core/database/repositories/lw-background.repository'
import { LwFactionRepository } from '@core/database/repositories/lw-faction.repository'
import { LwMapRepository } from '@core/database/repositories/lw-map.repository'
import { LwSkillRepository } from '@core/database/repositories/lw-skill.repository'
import { LwSkillCharacterRepository } from '@core/database/repositories/lw-skill-character.repository'
import { LwItemRepository } from '@core/database/repositories/lw-item.repository'
import { LwLocationRepository } from '@core/database/repositories/lw-location.repository'

describe.each(getTestDialects())('LW Batch 1 [%s]', dialect => {
  let tds: TestDataSource
  let backgrounds: LwBackgroundRepository
  let factions: LwFactionRepository
  let maps: LwMapRepository
  let skills: LwSkillRepository
  let skillChars: LwSkillCharacterRepository
  let items: LwItemRepository
  let locations: LwLocationRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    backgrounds = new LwBackgroundRepository(tds.ds)
    factions = new LwFactionRepository(tds.ds)
    maps = new LwMapRepository(tds.ds)
    skills = new LwSkillRepository(tds.ds)
    skillChars = new LwSkillCharacterRepository(tds.ds)
    items = new LwItemRepository(tds.ds)
    locations = new LwLocationRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ Background ============

  it('Background: create 默认 + update', async () => {
    const b = await backgrounds.create('p1')
    expect(b.eraType).toBe('ancient')
    expect(b.eraDescription).toBe('')

    const updated = await backgrounds.update(b.id, {
      eraType: 'modern' as any,
      eraDescription: '现代社会',
    })
    expect(updated!.eraType).toBe('modern')
  })

  it('Background: getByProjectId + delete', async () => {
    await backgrounds.create('p1')
    const got = await backgrounds.getByProjectId('p1')
    expect(got).toBeTruthy()
    await backgrounds.delete(got!.id)
    expect(await backgrounds.getByProjectId('p1')).toBeNull()
  })

  // ============ Faction ============

  it('Faction: create + getByProjectId 排序 + getByProjectIdAndType', async () => {
    await factions.create({
      projectId: 'p1', factionType: 'country' as any, name: 'A',
      description: 'A 国', sortOrder: 2,
    })
    await factions.create({
      projectId: 'p1', factionType: 'country' as any, name: 'B',
      description: 'B 国', sortOrder: 1,
    })
    await factions.create({
      projectId: 'p1', factionType: 'sect' as any, name: 'C',
      description: 'C 派', sortOrder: 0,
    })
    const all = await factions.getByProjectId('p1')
    expect(all.map(f => f.name)).toEqual(['C', 'B', 'A'])
    expect((await factions.getByProjectIdAndType('p1', 'country' as any)).length).toBe(2)
  })

  it('Faction: updateSortOrder 事务', async () => {
    const a = await factions.create({
      projectId: 'p1', factionType: 'country' as any, name: 'A',
      description: '', sortOrder: 0,
    })
    const b = await factions.create({
      projectId: 'p1', factionType: 'country' as any, name: 'B',
      description: '', sortOrder: 0,
    })
    await factions.updateSortOrder([
      { id: a.id, order: 5 },
      { id: b.id, order: 3 },
    ])
    expect((await factions.getById(a.id))!.sortOrder).toBe(5)
    expect((await factions.getById(b.id))!.sortOrder).toBe(3)
  })

  // ============ Map ============

  it('Map: create + updateImagePath + updateAIGeneratedData JSON', async () => {
    const m = await maps.create({
      projectId: 'p1', name: '九州', orientation: 'east' as any,
    })
    expect(m.orientation).toBe('east')

    await maps.updateImagePath(m.id, '/img.png')
    await maps.updateAIGeneratedData(m.id, { regions: [{ id: 'r1' }] } as any)
    const got = await maps.getById(m.id)
    expect(got!.imagePath).toBe('/img.png')
    expect(got!.aiGeneratedData).toEqual({ regions: [{ id: 'r1' }] })
  })

  // ============ Skill + SkillCharacter ============

  it('Skill: create 同时写 character_ids JSON 和 lw_skill_characters 关联', async () => {
    const s = await skills.create({
      projectId: 'p1',
      name: '火球术',
      type: 'magic' as any,
      level: 'medium' as any,
      description: '',
      system: '',
      characterIds: ['c1', 'c2'],
    })
    expect(s.characterIds).toEqual(['c1', 'c2'])

    const cids = await skillChars.getCharacterIdsBySkillId(s.id)
    expect(cids.sort()).toEqual(['c1', 'c2'])
  })

  it('Skill: update 替换 characterIds 也更新关联表', async () => {
    const s = await skills.create({
      projectId: 'p1', name: 'X', type: 'magic' as any, level: 'medium' as any,
      description: '', system: '', characterIds: ['c1'],
    })
    await skills.update(s.id, { characterIds: ['c2', 'c3'] } as any)
    const cids = await skillChars.getCharacterIdsBySkillId(s.id)
    expect(cids.sort()).toEqual(['c2', 'c3'])
  })

  it('Skill: getSkillsByCharacterId + getCharacterIdsBySkillIds', async () => {
    const s1 = await skills.create({
      projectId: 'p1', name: 'A', type: 'magic' as any, level: 'medium' as any,
      description: '', system: '', characterIds: ['c1', 'c2'],
    })
    const s2 = await skills.create({
      projectId: 'p1', name: 'B', type: 'magic' as any, level: 'medium' as any,
      description: '', system: '', characterIds: ['c2'],
    })
    expect((await skills.getSkillsByCharacterId('c1')).length).toBe(1)
    expect((await skills.getSkillsByCharacterId('c2')).length).toBe(2)

    const map = await skills.getCharacterIdsBySkillIds([s1.id, s2.id])
    expect(map.get(s1.id)!.sort()).toEqual(['c1', 'c2'])
    expect(map.get(s2.id)!).toEqual(['c2'])
  })

  it('Skill: delete 级联清关联表', async () => {
    const s = await skills.create({
      projectId: 'p1', name: 'X', type: 'magic' as any, level: 'medium' as any,
      description: '', system: '', characterIds: ['c1'],
    })
    await skills.delete(s.id)
    expect((await skillChars.getCharacterIdsBySkillId(s.id)).length).toBe(0)
  })

  // ============ Item ============

  it('Item: create + 默认 importance/sourceType', async () => {
    const i = await items.create({
      projectId: 'p1',
      name: 'Sword',
      type: 'weapon' as any,
      level: 'medium' as any,
      description: '',
    })
    expect(i.importance).toBe('secondary')
    expect(i.sourceType).toBe('longwriting')
  })

  it('Item: getBySourceEpisodeId 过滤', async () => {
    await items.create({
      projectId: 'p1', name: 'X', type: 'weapon' as any, level: 'medium' as any,
      description: '', sourceEpisodeId: 'e1',
    })
    await items.create({
      projectId: 'p1', name: 'Y', type: 'weapon' as any, level: 'medium' as any,
      description: '',
    })
    expect((await items.getBySourceEpisodeId('e1')).length).toBe(1)
  })

  // ============ Location ============

  it('Location: create + getTemporaryByProjectId 过滤 entityImportance=temporary', async () => {
    await locations.create({
      projectId: 'p1', name: '主城', type: 'city' as any,
      importance: 'high' as any, description: '',
    })
    await locations.create({
      projectId: 'p1', name: '客栈', type: 'building' as any,
      importance: 'low' as any, description: '',
      entityImportance: 'temporary' as any,
    })

    const tmp = await locations.getTemporaryByProjectId('p1')
    expect(tmp).toHaveLength(1)
    expect(tmp[0].name).toBe('客栈')
  })

  it('Location: update + delete', async () => {
    const l = await locations.create({
      projectId: 'p1', name: 'X', type: 'city' as any,
      importance: 'high' as any, description: '',
    })
    await locations.update(l.id, { name: 'Y', mapId: 'm1' } as any)
    const got = await locations.getById(l.id)
    expect(got!.name).toBe('Y')
    expect(got!.mapId).toBe('m1')

    await locations.delete(l.id)
    expect(await locations.getById(l.id)).toBeNull()
  })
})
