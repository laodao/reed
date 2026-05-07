/**
 * AssetProjectSummaryService 单测
 * @module tests/unit/episode-production/assets/asset-project-summary.service
 *
 * 重点覆盖 linked_lw binding 的 displayName 投影 — 此前 fallback 直接到 binding.id，
 * 导致 ② 资产盘点页 / 角色编辑页都显示 ID 而非真实角色名。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'
import { AssetProjectSummaryService } from '@core/modules/episode-production/assets/services/asset-project-summary.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      AssetImageEntity,
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      LwCharacterEntity,
      LwLocationEntity,
      LwItemEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('AssetProjectSummaryService.summarizeProject 显示名投影', () => {
  let ds: DataSource
  let svc: AssetProjectSummaryService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new AssetProjectSummaryService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('linked_lw 角色 binding：取 LW 表的真实 name（非 binding.id）', async () => {
    const lwRepo = ds.getRepository(LwCharacterEntity)
    const charRepo = ds.getRepository(CharacterBindingEntity)

    await lwRepo.save({
      id: 'lw_char_1',
      projectId: 'lwp1',
      name: '张三',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    await charRepo.save({
      id: 'cb_x',
      projectId: 'p1',
      sourceType: 'linked_lw',
      longWritingCharacterId: 'lw_char_1',
      // standaloneName / overrideName 都为 null：模拟最常见的"刚绑定未改名"场景
      standaloneName: null,
      overrideName: null,
      voiceConfig: '{}', createdAt: new Date(), updatedAt: new Date(),
    } as any)

    const summary = await svc.summarizeProject('p1')
    expect(summary.characters).toHaveLength(1)
    expect(summary.characters[0].name).toBe('张三')
    expect(summary.characters[0].bindingId).toBe('cb_x')
  })

  it('linked_lw 角色 binding：用户改了 overrideName 时优先用 override', async () => {
    const lwRepo = ds.getRepository(LwCharacterEntity)
    const charRepo = ds.getRepository(CharacterBindingEntity)

    await lwRepo.save({
      id: 'lw_char_2',
      projectId: 'lwp1',
      name: '李四',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await charRepo.save({
      id: 'cb_y',
      projectId: 'p1',
      sourceType: 'linked_lw',
      longWritingCharacterId: 'lw_char_2',
      overrideName: '李四(改)',
      standaloneName: null,
      voiceConfig: '{}', createdAt: new Date(), updatedAt: new Date(),
    } as any)

    const summary = await svc.summarizeProject('p1')
    expect(summary.characters[0].name).toBe('李四(改)')
  })

  it('standalone 角色 binding：用 standaloneName', async () => {
    const charRepo = ds.getRepository(CharacterBindingEntity)
    await charRepo.save({
      id: 'cb_z',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '王五',
      voiceConfig: '{}', createdAt: new Date(), updatedAt: new Date(),
    } as any)

    const summary = await svc.summarizeProject('p1')
    expect(summary.characters[0].name).toBe('王五')
  })

  it('linked_lw + LW 已删除：fallback 到 binding.id（避免崩溃）', async () => {
    const charRepo = ds.getRepository(CharacterBindingEntity)
    await charRepo.save({
      id: 'cb_dangling',
      projectId: 'p1',
      sourceType: 'linked_lw',
      longWritingCharacterId: 'lw_deleted',  // LW 表里没有此 id
      voiceConfig: '{}', createdAt: new Date(), updatedAt: new Date(),
    } as any)

    const summary = await svc.summarizeProject('p1')
    expect(summary.characters[0].name).toBe('cb_dangling')
  })

  it('linked_lw 地点 binding：取 LW location 真实 name', async () => {
    const lwLocRepo = ds.getRepository(LwLocationEntity)
    const locRepo = ds.getRepository(LocationBindingEntity)

    await lwLocRepo.save({
      id: 'lw_loc_1',
      projectId: 'lwp1',
      name: '会议室',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await locRepo.save({
      id: 'lb_x',
      projectId: 'p1',
      sourceType: 'linked_lw',
      longWritingLocationId: 'lw_loc_1',
      locationName: '',  // legacy 非空字段
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const summary = await svc.summarizeProject('p1')
    expect(summary.locations[0].name).toBe('会议室')
  })

  it('linked_lw 物品 binding：取 LW item 真实 name', async () => {
    const lwItemRepo = ds.getRepository(LwItemEntity)
    const itemRepo = ds.getRepository(ItemBindingEntity)

    await lwItemRepo.save({
      id: 'lw_item_1',
      projectId: 'lwp1',
      name: '佩剑',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await itemRepo.save({
      id: 'ib_x',
      projectId: 'p1',
      sourceType: 'linked_lw',
      longWritingItemId: 'lw_item_1',
      itemName: '',  // legacy 非空字段
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const summary = await svc.summarizeProject('p1')
    expect(summary.items[0].name).toBe('佩剑')
  })

  it('多 binding 共享同一 LW：批量预取只查一次（间接通过结果验证）', async () => {
    const lwRepo = ds.getRepository(LwCharacterEntity)
    const charRepo = ds.getRepository(CharacterBindingEntity)

    const now = new Date()
    await lwRepo.save([
      { id: 'lw_a', projectId: 'lwp1', name: '甲', createdAt: now, updatedAt: now } as any,
      { id: 'lw_b', projectId: 'lwp1', name: '乙', createdAt: now, updatedAt: now } as any,
    ])
    await charRepo.save([
      {
        id: 'cb_1',
        projectId: 'p1',
        sourceType: 'linked_lw',
        longWritingCharacterId: 'lw_a',
        voiceConfig: '{}', createdAt: new Date(), updatedAt: new Date(),
      } as any,
      {
        id: 'cb_2',
        projectId: 'p1',
        sourceType: 'linked_lw',
        longWritingCharacterId: 'lw_a',  // 故意复用同一 lwId
        voiceConfig: '{}', createdAt: new Date(), updatedAt: new Date(),
      } as any,
      {
        id: 'cb_3',
        projectId: 'p1',
        sourceType: 'linked_lw',
        longWritingCharacterId: 'lw_b',
        voiceConfig: '{}', createdAt: new Date(), updatedAt: new Date(),
      } as any,
    ])

    const summary = await svc.summarizeProject('p1')
    const names = summary.characters.map((c) => c.name).sort()
    expect(names).toEqual(['乙', '甲', '甲'])
  })
})
