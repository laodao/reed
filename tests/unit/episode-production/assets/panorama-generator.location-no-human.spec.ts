import { describe, it, expect } from 'vitest'
import {
  PanoramaGeneratorService,
  type PanoramaImageGenerator,
} from '@core/modules/episode-production/assets/services/panorama-generator.service'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

class MockPan implements PanoramaImageGenerator {
  calls: any[] = []
  async generate(opts: any) {
    this.calls.push(opts)
    return { imagePath: '/mock/pano.png', thumbnailPath: null }
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

describe('PanoramaGeneratorService · 无人约束', () => {
  it('360 全景：自动注入无人约束（panorama 永远走 location 域）', async () => {
    const ds = await buildDb()
    const imageSvc = new AssetImageService(ds)
    const mockPan = new MockPan()
    const svc = new PanoramaGeneratorService(imageSvc, mockPan)

    const entity = await svc.generateFor({
      locationBindingId: 'loc1',
      stylePrompt: '茶馆 古风 工笔国风',
    })

    expect(mockPan.calls).toHaveLength(1)
    const c = mockPan.calls[0]
    expect(c.prompt.includes('no people')).toBe(true)
    expect(c.negativePrompt).toBeDefined()
    expect(c.negativePrompt.includes('person')).toBe(true)
    // 写库一致性
    expect(entity.prompt).toBe(c.prompt)
    expect(entity.negativePrompt ?? null).toBe(c.negativePrompt ?? null)

    await ds.destroy()
  })
})
