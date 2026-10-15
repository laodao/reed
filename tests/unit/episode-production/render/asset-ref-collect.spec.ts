/**
 * collectSegmentAssetRefs / pickRefImage 单测（2026-09-25 一致性修复 Task 2 · A1/V4）
 *
 * in-memory sqlite 验证：
 * - A1：linked_lw 资产的 name/description 经 getEffectiveData 双源投影进 refs 清单
 *   （修复前裸读 binding 表 → 三段式清单出现裸 bindingId、外观摘要为空）
 * - V4：pickRefImage 与 keyframe/reference-image-selector 同口径的 confirmed 闸门
 *   （confirmed=1 池强制、池内主图优先、池空回退 is_main 主图并 warn）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import {
  collectSegmentAssetRefs,
  pickRefImage,
} from '@core/platform/episode-production/render/video/asset-ref-resolver'

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
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedImage(
  ds: DataSource,
  input: {
    id: string
    assetType: 'character' | 'location' | 'item'
    assetId: string
    isMain?: number
    confirmed?: number
    imagePath?: string | null
  },
): Promise<void> {
  await ds.getRepository(AssetImageEntity).save({
    id: input.id,
    assetType: input.assetType,
    assetId: input.assetId,
    category: input.isMain === 1 ? 'main' : 'view',
    label: null,
    imagePath: input.imagePath === undefined ? `/mock/${input.id}.png` : input.imagePath,
    isMain: input.isMain ?? 0,
    confirmed: input.confirmed ?? 0,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

describe('collectSegmentAssetRefs · A1 双源投影', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('linked_lw 角色：name/appearance 来自 lw 投影，不再是裸 bindingId', async () => {
    await ds.getRepository(LwCharacterEntity).save({
      id: 'lwc1',
      projectId: 'lwp1',
      name: '沈云萝',
      appearance: '米色短打劲装，高马尾',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'p1',
      sourceType: 'linked_lw',
      longWritingCharacterId: 'lwc1',
      standaloneName: null,
      standaloneDescription: null,
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await seedImage(ds, { id: 'img1', assetType: 'character', assetId: 'cb1', isMain: 1, confirmed: 1 })

    const refs = await collectSegmentAssetRefs(ds, [
      { characters: [{ characterId: 'cb1' }] },
    ])

    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('character')
    expect(refs[0].bindingId).toBe('cb1')
    expect(refs[0].name).toBe('沈云萝')
    expect(refs[0].name).not.toBe('cb1')
    expect(refs[0].appearance).toContain('米色短打劲装')
    expect(refs[0].imagePath).toBe('/mock/img1.png')
  })

  it('linked_lw + override 覆盖：overrideName 优先于 lw.name', async () => {
    await ds.getRepository(LwCharacterEntity).save({
      id: 'lwc1',
      projectId: 'lwp1',
      name: '沈云萝',
      appearance: '米色短打',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'p1',
      sourceType: 'linked_lw',
      longWritingCharacterId: 'lwc1',
      overrideName: '云萝（少年）',
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await seedImage(ds, { id: 'img1', assetType: 'character', assetId: 'cb1', isMain: 1, confirmed: 1 })

    const refs = await collectSegmentAssetRefs(ds, [
      { characters: [{ characterId: 'cb1' }] },
    ])

    expect(refs[0].name).toBe('云萝（少年）')
  })

  it('standalone 地点：name/description 直读 standalone_*', async () => {
    await ds.getRepository(LocationBindingEntity).save({
      id: 'lb1',
      projectId: 'p1',
      sourceType: 'standalone',
      locationName: '雪麓山庄书房',
      standaloneName: '雪麓山庄书房',
      standaloneDescription: '书案茶盏，北窗竹影',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await seedImage(ds, { id: 'img1', assetType: 'location', assetId: 'lb1', isMain: 1, confirmed: 1 })

    const refs = await collectSegmentAssetRefs(ds, [
      { locationBindingIds: ['lb1'] },
    ])

    expect(refs).toHaveLength(1)
    expect(refs[0].kind).toBe('location')
    expect(refs[0].name).toBe('雪麓山庄书房')
    expect(refs[0].appearance).toBe('书案茶盏，北窗竹影')
  })

  it('binding 不存在：投影失败跳过不阻断', async () => {
    const refs = await collectSegmentAssetRefs(ds, [
      { characters: [{ characterId: 'cb_ghost' }] },
    ])
    expect(refs).toEqual([])
  })
})

describe('pickRefImage · V4 confirmed 闸门', () => {
  it('已确认非主图 vs 未确认主图：confirmed 池强制，已确认非主图胜出', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const picked = pickRefImage(
      [
        { id: 'main_unconfirmed', isMain: 1, confirmed: 0, imagePath: '/a.png' },
        { id: 'view_confirmed', isMain: 0, confirmed: 1, imagePath: '/b.png' },
      ],
      '角色「测试」',
    )
    expect(picked?.id).toBe('view_confirmed')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('confirmed 池内主图优先', () => {
    const picked = pickRefImage(
      [
        { id: 'view_confirmed', isMain: 0, confirmed: 1, imagePath: '/b.png' },
        { id: 'main_confirmed', isMain: 1, confirmed: 1, imagePath: '/a.png' },
      ],
      '角色「测试」',
    )
    expect(picked?.id).toBe('main_confirmed')
  })

  it('confirmed 池空：回退 is_main 主图并 warn（老数据兼容兜底）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const picked = pickRefImage(
      [
        { id: 'main_unconfirmed', isMain: 1, confirmed: 0, imagePath: '/a.png' },
        { id: 'view_unconfirmed', isMain: 0, confirmed: 0, imagePath: '/b.png' },
      ],
      '角色「测试」',
    )
    expect(picked?.id).toBe('main_unconfirmed')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('回退 is_main 主图')
    warn.mockRestore()
  })

  it('confirmed 池空且无主图：返回 null（资产跳过）', () => {
    const picked = pickRefImage(
      [{ id: 'view_unconfirmed', isMain: 0, confirmed: 0, imagePath: '/b.png' }],
      '角色「测试」',
    )
    expect(picked).toBeNull()
  })

  it('无图行不参与挑选', () => {
    const picked = pickRefImage(
      [
        { id: 'no_image', isMain: 1, confirmed: 1, imagePath: null },
        { id: 'view_confirmed', isMain: 0, confirmed: 1, imagePath: '/b.png' },
      ],
      '角色「测试」',
    )
    expect(picked?.id).toBe('view_confirmed')
  })
})
