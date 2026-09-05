/**
 * GalleryDerivationService.deriveSingle 多基图 · spec（Phase 2 C9，spec 2026-05-09 §3.2 B6）
 * @module tests/unit/episode-production/assets/gallery-derivation-multi-base
 *
 * 验证派生支持多基图（multi-reference）：
 *   - DeriveSingleInput 加 baseImageIds?: string[]（向后兼容 baseImageId 单值）
 *   - deriveSingle 多基图全部进 referenceImagePaths
 *   - derivedFromImageId 取 baseImageIds[0]（保留单值，向后兼容现有 schema）
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { GalleryDerivationService, type ImageGenerator } from '@core/platform/episode-production/assets/services/gallery-derivation.service'

class MockGen implements ImageGenerator {
  calls: Array<{ prompt: string; negativePrompt?: string; label: string; refs: string[] }> = []
  private counter = 0
  async generate(opts: any): Promise<{ imagePath: string; thumbnailPath: null }> {
    this.counter += 1
    this.calls.push({
      prompt: opts.prompt,
      negativePrompt: opts.negativePrompt,
      label: opts.label,
      refs: opts.referenceImagePaths,
    })
    return { imagePath: `/mock/derive-${this.counter}.jpg`, thumbnailPath: null }
  }
}

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
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedThreeMains(imageSvc: AssetImageService): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < 3; i++) {
    const main = await imageSvc.addImage({
      assetType: 'location',
      assetId: 'lb1',
      category: 'main',
      label: `view-${i}`,
      imagePath: `/mock/main-${i}.jpg`,
      thumbnailPath: null,
      isMain: i === 0 ? 1 : 0,
      prompt: 'main',
      negativePrompt: null,
    })
    ids.push(main.id)
  }
  return ids
}

describe('GalleryDerivationService.deriveSingle 多基图（spec §3.2 B6）', () => {
  let ds: DataSource
  let imageSvc: AssetImageService
  let gen: MockGen
  let svc: GalleryDerivationService

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    gen = new MockGen()
    svc = new GalleryDerivationService(imageSvc, gen, ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('baseImageIds[] 多基图全部进 referenceImagePaths', async () => {
    const ids = await seedThreeMains(imageSvc)
    await svc.deriveSingle({
      assetType: 'location',
      assetId: 'lb1',
      category: 'variant',
      label: '夜晚',
      baseImageIds: [ids[0], ids[1], ids[2]],
    })
    expect(gen.calls).toHaveLength(1)
    expect(gen.calls[0].refs).toEqual(['/mock/main-0.jpg', '/mock/main-1.jpg', '/mock/main-2.jpg'])
  })

  it('baseImageIds 优先级高于 baseImageId（同时传时用 baseImageIds）', async () => {
    const ids = await seedThreeMains(imageSvc)
    await svc.deriveSingle({
      assetType: 'location',
      assetId: 'lb1',
      category: 'variant',
      label: '夜晚',
      baseImageId: ids[0],
      baseImageIds: [ids[1], ids[2]],
    })
    expect(gen.calls[0].refs).toEqual(['/mock/main-1.jpg', '/mock/main-2.jpg'])
  })

  it('derivedFromImageId 落库 = baseImageIds[0]（保留单值兼容现有 schema）', async () => {
    const ids = await seedThreeMains(imageSvc)
    const result = await svc.deriveSingle({
      assetType: 'location',
      assetId: 'lb1',
      category: 'variant',
      label: '夜晚',
      baseImageIds: [ids[1], ids[2]],
    })
    expect(result.derivedFromImageId).toBe(ids[1])
  })

  it('baseImageIds 空数组 → fallback 到默认主图', async () => {
    await seedThreeMains(imageSvc)
    await svc.deriveSingle({
      assetType: 'location',
      assetId: 'lb1',
      category: 'variant',
      label: '夜晚',
      baseImageIds: [],
    })
    // 默认主图 = isMain=1 的（即 main-0）
    expect(gen.calls[0].refs).toEqual(['/mock/main-0.jpg'])
  })

  it('baseImageIds 含不存在的 ID → 抛错（一个非法即拒）', async () => {
    const ids = await seedThreeMains(imageSvc)
    await expect(
      svc.deriveSingle({
        assetType: 'location',
        assetId: 'lb1',
        category: 'variant',
        label: '夜晚',
        baseImageIds: [ids[0], 'ai_not_exist'],
      }),
    ).rejects.toThrow(/不存在/)
  })

  it('baseImageIds 含跨 binding 的图 → 抛错', async () => {
    const ids = await seedThreeMains(imageSvc)
    // 给另一个 binding 加图
    const other = await imageSvc.addImage({
      assetType: 'location',
      assetId: 'lb2',
      category: 'main',
      label: 'other',
      imagePath: '/mock/other.jpg',
      thumbnailPath: null,
      isMain: 1,
      prompt: 'x',
      negativePrompt: null,
    })
    await expect(
      svc.deriveSingle({
        assetType: 'location',
        assetId: 'lb1',
        category: 'variant',
        label: '夜晚',
        baseImageIds: [ids[0], other.id],
      }),
    ).rejects.toThrow(/不属于/)
  })

  it('单值 baseImageId 路径仍工作（向后兼容）', async () => {
    const ids = await seedThreeMains(imageSvc)
    await svc.deriveSingle({
      assetType: 'location',
      assetId: 'lb1',
      category: 'variant',
      label: '夜晚',
      baseImageId: ids[1],
    })
    expect(gen.calls[0].refs).toEqual(['/mock/main-1.jpg'])
  })
})
