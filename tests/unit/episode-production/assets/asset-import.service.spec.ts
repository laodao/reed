/**
 * AssetImportService 单测（P3a Task 8）
 * @module tests/unit/episode-production/assets/asset-import.service
 *
 * 3 个用例覆盖 spec §3.11 引用导入：
 * - importFromPortraitVariant: 从立绘变体导入到 character 资产（label fallback 用 angle）
 * - importFromImage: 从 images 表导入到 location 资产（imagePath 取 filePath）
 * - importFromPortraitVariant 找不到 variant 时报错
 *
 * 引用导入只复用 imagePath，不物理复制文件，不算派生（derivedFromImageId 不填）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { PortraitVariantEntity } from '@core/database/entities/portrait-variant.entity'
import { ImageEntity } from '@core/database/entities/image.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { AssetImportService } from '@core/platform/episode-production/assets/services/asset-import.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [VideoProjectEntity, AssetImageEntity, PortraitVariantEntity, ImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('AssetImportService', () => {
  let ds: DataSource
  let imageSvc: AssetImageService
  let importSvc: AssetImportService

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    importSvc = new AssetImportService(ds, imageSvc)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('importFromPortraitVariant: 从立绘变体导入到 character 资产', async () => {
    // 准备立绘变体（angle 字段作为 label fallback 来源）
    const variantRepo = ds.getRepository(PortraitVariantEntity)
    const variant = variantRepo.create({
      id: 'pv1',
      userId: null,
      characterId: 'pc1',
      type: 'standard',
      parentId: null,
      angle: 'front',
      imagePath: '/portraits/pv1.png',
      prompt: 'a girl',
      config: null,
      variantInfo: null,
      createdAt: new Date(),
    })
    await variantRepo.save(variant)

    const result = await importSvc.importFromPortraitVariant({
      variantId: 'pv1',
      targetAssetType: 'character',
      targetAssetId: 'cb1',
      asCategory: 'view',
      asLabel: 'front',
      asMain: false,
    })

    expect(result.imagePath).toBe('/portraits/pv1.png')
    expect(result.category).toBe('view')
    expect(result.label).toBe('front')
    expect(result.derivedFromImageId).toBeNull()

    const list = await imageSvc.listByAsset('character', 'cb1')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      label: 'front',
      imagePath: '/portraits/pv1.png',
      isMain: 0,
      derivedFromImageId: null,
    })
  })

  it('importFromImage: 从 images 表导入到 location 资产（imagePath 取 filePath）', async () => {
    const imgRepo = ds.getRepository(ImageEntity)
    const img = imgRepo.create({
      id: 'img1',
      userId: null,
      dialogId: null,
      messageId: null,
      filePath: '/images/img1.png',
      fileName: 'img1.png',
      fileSize: 1024,
      mimeType: 'image/png',
      width: 512,
      height: 512,
      prompt: 'a forest',
      negativePrompt: null,
      style: null,
      quality: null,
      providerId: null,
      modelId: null,
      generationParams: null,
      seed: null,
      taskId: null,
      status: 'completed',
      errorMessage: null,
      favorite: 0,
      createdAt: new Date(),
    })
    await imgRepo.save(img)

    const result = await importSvc.importFromImage({
      imageId: 'img1',
      targetAssetType: 'location',
      targetAssetId: 'lb1',
      asCategory: 'main',
      asMain: true,
    })

    expect(result.imagePath).toBe('/images/img1.png')
    expect(result.isMain).toBe(1)
    expect(result.category).toBe('main')
    expect(result.prompt).toBe('a forest')
    expect(result.derivedFromImageId).toBeNull()

    const list = await imageSvc.listByAsset('location', 'lb1')
    expect(list).toHaveLength(1)
    expect(list[0].imagePath).toBe('/images/img1.png')
  })

  it('importFromPortraitVariant 找不到 variant 时报错', async () => {
    await expect(
      importSvc.importFromPortraitVariant({
        variantId: 'pv_not_exist',
        targetAssetType: 'character',
        targetAssetId: 'cb1',
        asCategory: 'view',
      }),
    ).rejects.toThrow(/PortraitVariant/)
  })
})
