import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { MainImageGeneratorService } from '@core/modules/episode-production/assets/services/main-image-generator.service'
import type { ImageGenerator } from '@core/modules/episode-production/assets/services/gallery-derivation.service'

interface Call {
  prompt: string
  negativePrompt?: string
  label: string
  referenceImagePaths: string[]
}

class MockGen implements ImageGenerator {
  calls: Call[] = []
  async generate(opts: Call): Promise<{ imagePath: string; thumbnailPath: string | null }> {
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

describe('MainImageGeneratorService · location 无人自动注入', () => {
  let ds: DataSource
  let mockGen: MockGen
  let svc: MainImageGeneratorService

  beforeEach(async () => {
    ds = await buildDb()
    mockGen = new MockGen()
    svc = new MainImageGeneratorService(new AssetImageService(ds), mockGen, ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('location 主图：prompt 自动追加无人约束、negative 自动合并', async () => {
    await svc.generateMain({
      assetType: 'location',
      assetId: 'loc1',
      prompt: '古风茶馆',
    })
    expect(mockGen.calls).toHaveLength(1)
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(true)
    expect(c.prompt.includes('古风茶馆')).toBe(true)
    expect(c.negativePrompt).toBeDefined()
    expect(c.negativePrompt!.includes('person')).toBe(true)
  })

  it('character 主图：不注入无人约束', async () => {
    await svc.generateMain({
      assetType: 'character',
      assetId: 'ch1',
      prompt: '少年，蓝衫',
    })
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(false)
  })

  it('item 主图：不注入无人约束', async () => {
    await svc.generateMain({
      assetType: 'item',
      assetId: 'it1',
      prompt: '青铜剑',
    })
    const c = mockGen.calls[0]
    expect(c.prompt.includes('no people')).toBe(false)
  })

  it('location 已含无人约束的 prompt：不重复追加', async () => {
    const { LOCATION_NO_HUMAN_SUFFIX } = await import(
      '@core/modules/episode-production/assets/prompts/location-constraints'
    )
    await svc.generateMain({
      assetType: 'location',
      assetId: 'loc2',
      prompt: `古风茶馆，${LOCATION_NO_HUMAN_SUFFIX}`,
    })
    const c = mockGen.calls[0]
    const occurrences = c.prompt.split(LOCATION_NO_HUMAN_SUFFIX).length - 1
    expect(occurrences).toBe(1)
  })
})
