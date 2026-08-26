/**
 * MainImageGeneratorService 单测（P3c follow-up #64 主图生成入口）
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { MainImageGeneratorService } from '@core/modules/episode-production/assets/services/main-image-generator.service'
import type { ImageGenerator } from '@core/modules/episode-production/assets/services/gallery-derivation.service'

interface ImageGenCall {
  prompt: string
  negativePrompt?: string
  label: string
  refs: string[]
}

class MockGen implements ImageGenerator {
  calls: ImageGenCall[] = []
  private counter = 0
  async generate(opts: any): Promise<{ imagePath: string; thumbnailPath: null }> {
    this.counter += 1
    this.calls.push({
      prompt: opts.prompt,
      negativePrompt: opts.negativePrompt,
      label: opts.label,
      refs: opts.referenceImagePaths,
    })
    return { imagePath: `/mock/main-${this.counter}.jpg`, thumbnailPath: null }
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

describe('MainImageGeneratorService', () => {
  let ds: DataSource
  let imageSvc: AssetImageService
  let gen: MockGen
  let svc: MainImageGeneratorService

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    gen = new MockGen()
    svc = new MainImageGeneratorService(imageSvc, gen, ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('generateMain: 调 imageGen 生成 + 落 isMain=1 行', async () => {
    const result = await svc.generateMain({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '林清，摄影师，年轻男性',
    })
    expect(result.assetType).toBe('character')
    expect(result.assetId).toBe('cb1')
    expect(result.category).toBe('main')
    expect(result.isMain).toBe(1)
    expect(result.imagePath).toBe('/mock/main-1.jpg')

    expect(gen.calls).toHaveLength(1)
    expect(gen.calls[0].prompt).toContain('林清')
    expect(gen.calls[0].label).toBe('main')
    expect(gen.calls[0].refs).toEqual([])

    const main = await imageSvc.getMainImage('character', 'cb1')
    expect(main?.id).toBe(result.id)
  })

  it('generateMain: 重复生成时旧主图降级 isMain=0，新主图为唯一 isMain=1', async () => {
    const first = await svc.generateMain({
      assetType: 'character',
      assetId: 'cb1',
      prompt: 'a',
    })
    const second = await svc.generateMain({
      assetType: 'character',
      assetId: 'cb1',
      prompt: 'b',
    })

    const all = await imageSvc.listByAsset('character', 'cb1')
    expect(all).toHaveLength(2)
    const mains = all.filter((i) => i.isMain === 1)
    expect(mains).toHaveLength(1)
    expect(mains[0].id).toBe(second.id)
    // 第一张降级
    const old = all.find((i) => i.id === first.id)
    expect(old?.isMain).toBe(0)
  })

  it('generateMain: 空 prompt 抛错', async () => {
    await expect(
      svc.generateMain({
        assetType: 'character',
        assetId: 'cb1',
        prompt: '   ',
      }),
    ).rejects.toThrow(/prompt/)
    expect(gen.calls).toHaveLength(0)
  })

  it('generateMain: 不影响其他资产的主图', async () => {
    await svc.generateMain({
      assetType: 'character',
      assetId: 'cb1',
      prompt: 'a',
    })
    await svc.generateMain({
      assetType: 'character',
      assetId: 'cb2',
      prompt: 'b',
    })

    const cb1Main = await imageSvc.getMainImage('character', 'cb1')
    const cb2Main = await imageSvc.getMainImage('character', 'cb2')
    expect(cb1Main).toBeTruthy()
    expect(cb2Main).toBeTruthy()
    expect(cb1Main?.id).not.toBe(cb2Main?.id)
  })

  it('generateMain: 复用 savePrompt 创建的占位行（无孤儿行）', async () => {
    // 用户先在图集提示词框编辑 → savePrompt 创建 imagePath='' 的占位行
    const placeholder = await imageSvc.savePrompt({
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      label: null,
      prompt: '用户编辑的提示词',
    })
    expect(placeholder.imagePath).toBe('')
    expect(placeholder.isMain).toBe(0)

    const result = await svc.generateMain({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '系统拼接的提示词',
    })
    // 复用占位行 id（回填真实图信息），而不是 INSERT 新行
    expect(result.id).toBe(placeholder.id)
    expect(result.imagePath).toBe('/mock/main-1.jpg')
    expect(result.isMain).toBe(1)
    expect(result.prompt).toContain('系统拼接的提示词')

    const all = await imageSvc.listByAsset('character', 'cb1')
    expect(all).toHaveLength(1)
  })
})
