import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import {
  GalleryDerivationService,
  type ImageGenerator,
} from '@core/modules/episode-production/assets/services/gallery-derivation.service'

class MockGen implements ImageGenerator {
  calls: any[] = []
  async generate(opts: any) {
    this.calls.push(opts)
    return { imagePath: `/mock/${opts.label}.png`, thumbnailPath: null }
  }
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('GalleryDerivationService · location 派生无人约束', () => {
  let ds: DataSource
  let mockGen: MockGen
  let svc: GalleryDerivationService

  beforeEach(async () => {
    ds = await buildDb()
    const imageSvc = new AssetImageService(ds)
    mockGen = new MockGen()
    svc = new GalleryDerivationService(imageSvc, mockGen)
    await imageSvc.addImage({
      assetType: 'location',
      assetId: 'loc1',
      category: 'main',
      imagePath: '/main.png',
      isMain: true,
    })
    await imageSvc.addImage({
      assetType: 'character',
      assetId: 'ch1',
      category: 'main',
      imagePath: '/main_ch.png',
      isMain: true,
    })
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('location 派生：自动注入无人约束', async () => {
    await svc.deriveSingle({
      assetType: 'location',
      assetId: 'loc1',
      category: 'angle_variant',
      label: 'angle_front',
      additionalPrompt: '茶馆正面',
    })
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(true)
    expect(c.negativePrompt).toBeDefined()
    expect(c.negativePrompt.includes('person')).toBe(true)
  })

  it('location time_variant 派生：同样注入无人约束', async () => {
    await svc.deriveSingle({
      assetType: 'location',
      assetId: 'loc1',
      category: 'time_variant',
      label: 'night',
      additionalPrompt: '夜晚的茶馆',
    })
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(true)
    expect(c.negativePrompt.includes('person')).toBe(true)
  })

  it('character 派生：不注入无人约束', async () => {
    await svc.deriveSingle({
      assetType: 'character',
      assetId: 'ch1',
      category: 'pose',
      label: 'pose_walk',
      additionalPrompt: '少年，行走',
    })
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(false)
  })
})
