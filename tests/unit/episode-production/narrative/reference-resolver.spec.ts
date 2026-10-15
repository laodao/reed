/**
 * ReferenceResolver 单测（P4-T2）
 * @module tests/unit/episode-production/narrative/reference-resolver
 *
 * 覆盖：
 * - resolveCharacter / resolveLocation / resolveItem 单点解析
 * - 不存在的 binding 返回 null
 * - 主图不存在时 mainImage = null（不报错）
 * - 主图存在时正确返回 AssetImageEntity
 * - resolveBatch 顺序保持 + 自动去重 + 混合类型
 * - resolveBatch 中部分 binding 解析失败仍返回 found=false 占位
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'
import { ReferenceResolver } from '@core/platform/episode-production/narrative/reference-resolver'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      AssetImageEntity,
      LwCharacterEntity,
      LwLocationEntity,
      LwItemEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedCharacter(
  ds: DataSource,
  id: string,
  name: string,
): Promise<void> {
  await ds.getRepository(CharacterBindingEntity).save({
    id,
    projectId: 'p1',
    longWritingCharacterId: null,
    sourceType: 'standalone',
    voiceConfig: {},
    standaloneName: name,
    standaloneDescription: `${name}的描述`,
    voiceId: `voice_${id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

async function seedLocation(
  ds: DataSource,
  id: string,
  name: string,
): Promise<void> {
  await ds.getRepository(LocationBindingEntity).save({
    id,
    projectId: 'p1',
    longWritingLocationId: null,
    sourceType: 'standalone',
    locationName: name,
    standaloneName: name,
    standaloneDescription: `${name}的描述`,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

async function seedItem(
  ds: DataSource,
  id: string,
  name: string,
): Promise<void> {
  await ds.getRepository(ItemBindingEntity).save({
    id,
    projectId: 'p1',
    longWritingItemId: null,
    sourceType: 'standalone',
    itemName: name,
    standaloneName: name,
    standaloneDescription: `${name}的描述`,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

async function seedMainImage(
  ds: DataSource,
  assetType: 'character' | 'location' | 'item',
  assetId: string,
  imagePath = `/tmp/${assetId}.png`,
): Promise<void> {
  await ds.getRepository(AssetImageEntity).save({
    id: `ai_${assetId}`,
    userId: null,
    assetType,
    assetId,
    category: 'main',
    imagePath,
    isMain: 1,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

describe('ReferenceResolver', () => {
  let ds: DataSource
  let resolver: ReferenceResolver

  beforeEach(async () => {
    ds = await buildDb()
    resolver = new ReferenceResolver(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('resolveCharacter: 解析 standalone + 主图', async () => {
    await seedCharacter(ds, 'cb1', '张三')
    await seedMainImage(ds, 'character', 'cb1')

    const r = await resolver.resolveCharacter('cb1')
    expect(r).not.toBeNull()
    expect(r!.kind).toBe('character')
    expect(r!.bindingId).toBe('cb1')
    expect(r!.effective.name).toBe('张三')
    expect(r!.effective.source).toBe('standalone')
    expect(r!.mainImage?.imagePath).toBe('/tmp/cb1.png')
  })

  it('resolveCharacter: binding 不存在返回 null', async () => {
    const r = await resolver.resolveCharacter('cb_missing')
    expect(r).toBeNull()
  })

  it('resolveCharacter: binding 存在但主图未生成 → mainImage = null', async () => {
    await seedCharacter(ds, 'cb2', '李四')
    const r = await resolver.resolveCharacter('cb2')
    expect(r).not.toBeNull()
    expect(r!.effective.name).toBe('李四')
    expect(r!.mainImage).toBeNull()
  })

  it('resolveLocation: 解析 standalone + 主图', async () => {
    await seedLocation(ds, 'lb1', '茶馆')
    await seedMainImage(ds, 'location', 'lb1')

    const r = await resolver.resolveLocation('lb1')
    expect(r).not.toBeNull()
    expect(r!.kind).toBe('location')
    expect(r!.effective.name).toBe('茶馆')
    expect(r!.mainImage?.imagePath).toBe('/tmp/lb1.png')
  })

  it('resolveLocation: 不存在返回 null', async () => {
    const r = await resolver.resolveLocation('lb_missing')
    expect(r).toBeNull()
  })

  it('resolveItem: 解析 standalone + 主图', async () => {
    await seedItem(ds, 'ib1', '茶壶')
    await seedMainImage(ds, 'item', 'ib1')

    const r = await resolver.resolveItem('ib1')
    expect(r).not.toBeNull()
    expect(r!.kind).toBe('item')
    expect(r!.effective.name).toBe('茶壶')
    expect(r!.mainImage?.imagePath).toBe('/tmp/ib1.png')
  })

  it('resolveItem: 不存在返回 null', async () => {
    const r = await resolver.resolveItem('ib_missing')
    expect(r).toBeNull()
  })

  it('resolveBatch: 混合类型 + 顺序保持 + 部分失败', async () => {
    await seedCharacter(ds, 'cb1', '张三')
    await seedLocation(ds, 'lb1', '茶馆')
    await seedItem(ds, 'ib1', '茶壶')
    await seedMainImage(ds, 'character', 'cb1')
    // lb1 / ib1 都没有主图

    const refs = [
      { kind: 'character' as const, bindingId: 'cb1' },
      { kind: 'location' as const, bindingId: 'lb1' },
      { kind: 'item' as const, bindingId: 'ib1' },
      { kind: 'character' as const, bindingId: 'cb_missing' },
    ]
    const result = await resolver.resolveBatch(refs)

    expect(result).toHaveLength(4)
    expect(result[0].found).toBe(true)
    expect(result[0].kind).toBe('character')
    expect((result[0] as any).effective.name).toBe('张三')
    expect((result[0] as any).mainImage?.imagePath).toBe('/tmp/cb1.png')

    expect(result[1].found).toBe(true)
    expect(result[1].kind).toBe('location')
    expect((result[1] as any).effective.name).toBe('茶馆')
    expect((result[1] as any).mainImage).toBeNull()

    expect(result[2].found).toBe(true)
    expect(result[2].kind).toBe('item')
    expect((result[2] as any).effective.name).toBe('茶壶')

    expect(result[3].found).toBe(false)
    expect(result[3].kind).toBe('character')
    expect(result[3].bindingId).toBe('cb_missing')
  })

  it('resolveBatch: 重复入参自动去重，但顺序仍按入参', async () => {
    await seedCharacter(ds, 'cb1', '张三')
    await seedMainImage(ds, 'character', 'cb1')

    const refs = [
      { kind: 'character' as const, bindingId: 'cb1' },
      { kind: 'character' as const, bindingId: 'cb1' },
      { kind: 'character' as const, bindingId: 'cb1' },
    ]
    const result = await resolver.resolveBatch(refs)
    expect(result).toHaveLength(3)
    // 三项都解析成功 + 同样的内容
    for (const r of result) {
      expect(r.found).toBe(true)
      expect((r as any).effective.name).toBe('张三')
    }
  })

  it('linked_lw 模式：投影 lw 字段 + override', async () => {
    await ds.getRepository(LwCharacterEntity).save({
      id: 'lwc1',
      projectId: 'lwp1',
      name: '阿强',
      appearance: '高大魁梧',
      importance: 'main',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb_linked',
      projectId: 'p1',
      longWritingCharacterId: 'lwc1',
      sourceType: 'linked_lw',
      voiceConfig: {},
      overrideOutfit: '黑色风衣',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const r = await resolver.resolveCharacter('cb_linked')
    expect(r!.effective.source).toBe('linked_lw')
    expect(r!.effective.name).toBe('阿强') // 来自 lw
    expect(r!.effective.appearance).toBe('高大魁梧') // 来自 lw
    expect(r!.effective.outfit).toBe('黑色风衣') // 来自 override
  })
})
