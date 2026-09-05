/**
 * CharacterAssetService.setReferenceSet / getEffectiveReferenceImages · spec
 * @module tests/unit/episode-production/assets/character-asset-reference-set
 *
 * spec 2026-05-09 ep-redesign §3.2 D1 · P-9 角色形象组（multi-reference）
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { CharacterAssetService } from '@core/platform/episode-production/assets/services/character-asset.service'

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

async function seedCharacter(ds: DataSource, id = 'cb1'): Promise<void> {
  const repo = ds.getRepository(CharacterBindingEntity)
  await repo.save({
    id,
    projectId: 'p1',
    sourceType: 'standalone',
    standaloneName: '李白',
    standaloneDescription: '诗人',
    voiceConfig: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

async function seedImage(
  ds: DataSource,
  input: { id: string; assetId: string; category: string; isMain?: number; label?: string },
): Promise<void> {
  const repo = ds.getRepository(AssetImageEntity)
  await repo.save({
    id: input.id,
    assetType: 'character',
    assetId: input.assetId,
    category: input.category,
    label: input.label ?? null,
    imagePath: `/mock/${input.id}.jpg`,
    isMain: input.isMain ?? 0,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

describe('CharacterAssetService · 形象组', () => {
  let ds: DataSource
  let svc: CharacterAssetService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new CharacterAssetService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  describe('setReferenceSet', () => {
    it('设置正常 imageIds → 写入 referenceSetImageIds JSON', async () => {
      await seedCharacter(ds)
      await seedImage(ds, { id: 'img_main', assetId: 'cb1', category: 'main', isMain: 1 })
      await seedImage(ds, { id: 'img_view1', assetId: 'cb1', category: 'view', label: 'front' })

      const updated = await svc.setReferenceSet('cb1', ['img_main', 'img_view1'])
      expect(updated?.referenceSetImageIds).toBe(JSON.stringify(['img_main', 'img_view1']))
    })

    it('空数组 → 重置为 NULL（默认策略）', async () => {
      await seedCharacter(ds)
      await seedImage(ds, { id: 'img_main', assetId: 'cb1', category: 'main', isMain: 1 })
      await svc.setReferenceSet('cb1', ['img_main'])
      const reset = await svc.setReferenceSet('cb1', [])
      expect(reset?.referenceSetImageIds).toBeNull()
    })

    it('imageId 不存在 → 抛错', async () => {
      await seedCharacter(ds)
      await expect(
        svc.setReferenceSet('cb1', ['ai_not_exist']),
      ).rejects.toThrow(/不存在/)
    })

    it('imageId 跨 binding → 抛错', async () => {
      await seedCharacter(ds, 'cb1')
      await seedCharacter(ds, 'cb2')
      await seedImage(ds, { id: 'img_other', assetId: 'cb2', category: 'main', isMain: 1 })
      await expect(
        svc.setReferenceSet('cb1', ['img_other']),
      ).rejects.toThrow(/不属于/)
    })

    it('binding 不存在 → 抛错', async () => {
      await expect(
        svc.setReferenceSet('cb_not_exist', []),
      ).rejects.toThrow(/不存在/)
    })
  })

  describe('getEffectiveReferenceImages', () => {
    it('binding 标记了形象组 → 按标记顺序返回路径', async () => {
      await seedCharacter(ds)
      await seedImage(ds, { id: 'img_main', assetId: 'cb1', category: 'main', isMain: 1 })
      await seedImage(ds, { id: 'img_view1', assetId: 'cb1', category: 'view', label: 'front' })
      await seedImage(ds, { id: 'img_view2', assetId: 'cb1', category: 'view', label: '3q_left' })
      await svc.setReferenceSet('cb1', ['img_main', 'img_view2'])

      const paths = await svc.getEffectiveReferenceImages('cb1')
      expect(paths).toEqual(['/mock/img_main.jpg', '/mock/img_view2.jpg'])
    })

    it('binding 未标记 → fallback 到 main + 所有 view', async () => {
      await seedCharacter(ds)
      await seedImage(ds, { id: 'img_main', assetId: 'cb1', category: 'main', isMain: 1 })
      await seedImage(ds, { id: 'img_view1', assetId: 'cb1', category: 'view', label: 'front' })
      await seedImage(ds, { id: 'img_expr', assetId: 'cb1', category: 'expression', label: 'smile' })

      const paths = await svc.getEffectiveReferenceImages('cb1')
      expect(paths).toContain('/mock/img_main.jpg')
      expect(paths).toContain('/mock/img_view1.jpg')
      expect(paths).not.toContain('/mock/img_expr.jpg')  // expression 不在默认策略
    })

    it('标记的图被删 → 过滤；都被删 → 落到默认策略', async () => {
      await seedCharacter(ds)
      await seedImage(ds, { id: 'img_main', assetId: 'cb1', category: 'main', isMain: 1 })
      await seedImage(ds, { id: 'img_view1', assetId: 'cb1', category: 'view', label: 'front' })
      await svc.setReferenceSet('cb1', ['img_view1'])
      // 删 img_view1
      await ds.getRepository(AssetImageEntity).delete('img_view1')

      const paths = await svc.getEffectiveReferenceImages('cb1')
      // fallback 到默认（main）
      expect(paths).toEqual(['/mock/img_main.jpg'])
    })

    it('binding 不存在 → 返回 []', async () => {
      const paths = await svc.getEffectiveReferenceImages('cb_not_exist')
      expect(paths).toEqual([])
    })

    it('完全无图 → 返回 []', async () => {
      await seedCharacter(ds)
      const paths = await svc.getEffectiveReferenceImages('cb1')
      expect(paths).toEqual([])
    })
  })
})
