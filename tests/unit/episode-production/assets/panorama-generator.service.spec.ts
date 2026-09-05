/**
 * PanoramaGeneratorService 单测（P3c Task 2）
 * @module tests/unit/episode-production/assets/panorama-generator.service
 *
 * 4 个用例覆盖 spec §4.5.10 step 1 全景生成 / 上传：
 * - generateFor: AI 生成 360 全景，prompt 自动加 equirectangular 后缀，写入 asset_image
 * - uploadFor: 用户上传现成全景图，不调 generator
 * - listForLocation: 列出某地点的全部 panorama_360
 * - deletePanorama: 删除一张 panorama
 *
 * 通过 MockPanoramaGen 注入 PanoramaImageGenerator 抽象接口，
 * 验证 service 对底层 image API 的编排逻辑，与真实 image.service 解耦。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import {
  PanoramaGeneratorService,
  type PanoramaImageGenerator,
} from '@core/platform/episode-production/assets/services/panorama-generator.service'

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

interface PanoGenerateCall {
  prompt: string
  negativePrompt?: string
  aspectRatio: '2:1'
}

class MockPanoramaGen implements PanoramaImageGenerator {
  calls: PanoGenerateCall[] = []
  private counter = 0
  async generate(opts: PanoGenerateCall): Promise<{
    imagePath: string
    thumbnailPath: string | null
  }> {
    this.calls.push(opts)
    this.counter += 1
    return {
      imagePath: `/mock/pano-${this.counter}.jpg`,
      thumbnailPath: null,
    }
  }
}

describe('PanoramaGeneratorService', () => {
  let ds: DataSource
  let imageSvc: AssetImageService
  let gen: MockPanoramaGen
  let svc: PanoramaGeneratorService

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    gen = new MockPanoramaGen()
    svc = new PanoramaGeneratorService(imageSvc, gen)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('generateFor: AI 生成 360 全景 + 写入 asset_image', async () => {
    const result = await svc.generateFor({
      locationBindingId: 'lb1',
      stylePrompt: '茶馆 古风 工笔国风',
    })

    // 调 image generator
    expect(gen.calls).toHaveLength(1)
    expect(gen.calls[0].prompt).toMatch(/equirectangular/i)
    expect(gen.calls[0].prompt).toMatch(/茶馆/)
    expect(gen.calls[0].aspectRatio).toBe('2:1')

    // 写入 asset_image
    const list = await imageSvc.listByCategory(
      'location',
      'lb1',
      'panorama_360',
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      assetType: 'location',
      assetId: 'lb1',
      category: 'panorama_360',
      isMain: 0,
    })
    expect(result.id).toBe(list[0].id)
  })

  it('uploadFor: 用户上传现成 360 图', async () => {
    const result = await svc.uploadFor({
      locationBindingId: 'lb1',
      imagePath: '/uploaded/my-pano.jpg',
    })

    expect(gen.calls).toHaveLength(0) // 不调 generator
    const list = await imageSvc.listByCategory(
      'location',
      'lb1',
      'panorama_360',
    )
    expect(list).toHaveLength(1)
    expect(list[0].imagePath).toBe('/uploaded/my-pano.jpg')
    expect(result.id).toBe(list[0].id)
  })

  it('listForLocation: 列出某地点的全部 panorama_360', async () => {
    await svc.uploadFor({ locationBindingId: 'lb1', imagePath: '/p1.jpg' })
    await svc.uploadFor({ locationBindingId: 'lb1', imagePath: '/p2.jpg' })
    const list = await svc.listForLocation('lb1')
    expect(list).toHaveLength(2)
  })

  it('deletePanorama: 删除一张 panorama', async () => {
    const r = await svc.uploadFor({
      locationBindingId: 'lb1',
      imagePath: '/p.jpg',
    })
    await svc.deletePanorama(r.id)
    const list = await svc.listForLocation('lb1')
    expect(list).toHaveLength(0)
  })
})
