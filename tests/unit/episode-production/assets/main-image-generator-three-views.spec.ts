/**
 * MainImageGeneratorService.generateThreeViews · spec（Phase 2 C6，spec 2026-05-09 §3.2 B3）
 * @module tests/unit/episode-production/assets/main-image-generator-three-views
 *
 * 验证角色一键多角度参考图（character bible：正/3q左/3q右）。
 *
 * 设计：
 *   - 串行调 imageGen 3 次（每次不同 view prompt + 同一 baseImage 作 reference 保一致性）
 *   - 落 3 个 asset_image 行 category='view' label='front'/'3q_left'/'3q_right'
 *   - derivedFromImageId 都指向 baseImage
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { MainImageGeneratorService } from '@core/platform/episode-production/assets/services/main-image-generator.service'
import type { ImageGenerator } from '@core/platform/episode-production/assets/services/gallery-derivation.service'

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
    return { imagePath: `/mock/view-${this.counter}.jpg`, thumbnailPath: null }
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

async function seedMain(imageSvc: AssetImageService): Promise<string> {
  const main = await imageSvc.addImage({
    assetType: 'character',
    assetId: 'cb1',
    category: 'main',
    label: null,
    imagePath: '/mock/main.jpg',
    thumbnailPath: null,
    isMain: 1,
    prompt: 'main prompt',
    negativePrompt: null,
  })
  return main.id
}

describe('MainImageGeneratorService.generateThreeViews', () => {
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

  it('生成 3 张 view 图（front / 3q_left / 3q_right）', async () => {
    const baseId = await seedMain(imageSvc)
    const result = await svc.generateThreeViews({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '林清，摄影师，年轻男性',
      baseImageId: baseId,
    })

    expect(result).toHaveLength(3)
    expect(result.map((r) => r.label)).toEqual(['front', '3q_left', '3q_right'])
    for (const r of result) {
      expect(r.category).toBe('view')
      expect(r.assetType).toBe('character')
      expect(r.assetId).toBe('cb1')
      expect(r.isMain).toBe(0)
      expect(r.derivedFromImageId).toBe(baseId)
    }
  })

  it('调 imageGen 3 次，每次 prompt 不同（含视角语义）+ 同一 base ref', async () => {
    const baseId = await seedMain(imageSvc)
    await svc.generateThreeViews({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '林清',
      baseImageId: baseId,
    })

    expect(gen.calls).toHaveLength(3)
    expect(gen.calls[0].prompt).toMatch(/正面|front/i)
    expect(gen.calls[1].prompt).toMatch(/3q_left|3\/4 左|three.quarter left|left/i)
    expect(gen.calls[2].prompt).toMatch(/3q_right|3\/4 右|three.quarter right|right/i)
    // 同一 base 作 reference 保一致性
    for (const call of gen.calls) {
      expect(call.refs).toEqual(['/mock/main.jpg'])
    }
  })

  it('每张图的 label 字段 = front / 3q_left / 3q_right（精确）', async () => {
    const baseId = await seedMain(imageSvc)
    await svc.generateThreeViews({
      assetType: 'character',
      assetId: 'cb1',
      prompt: 'x',
      baseImageId: baseId,
    })

    expect(gen.calls.map((c) => c.label)).toEqual(['front', '3q_left', '3q_right'])
  })

  it('未传 baseImageId → 自动用 isMain=1 的主图', async () => {
    await seedMain(imageSvc)
    const result = await svc.generateThreeViews({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '林清',
    })

    expect(result).toHaveLength(3)
    // refs 应指向 main 图
    for (const call of gen.calls) {
      expect(call.refs).toEqual(['/mock/main.jpg'])
    }
  })

  it('无主图 + 无 baseImageId → 抛错', async () => {
    await expect(
      svc.generateThreeViews({
        assetType: 'character',
        assetId: 'cb_no_main',
        prompt: '林清',
      }),
    ).rejects.toThrow(/主图|base/i)
  })

  it('空 prompt → 抛错', async () => {
    const baseId = await seedMain(imageSvc)
    await expect(
      svc.generateThreeViews({
        assetType: 'character',
        assetId: 'cb1',
        prompt: '',
        baseImageId: baseId,
      }),
    ).rejects.toThrow(/prompt/i)
  })

  it('落库的 prompt 字段 = 实际给 imageGen 的 prompt（含视角片段）', async () => {
    const baseId = await seedMain(imageSvc)
    const result = await svc.generateThreeViews({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '林清',
      baseImageId: baseId,
    })

    expect(result[0].prompt).toMatch(/正面|front/i)
    expect(result[1].prompt).toMatch(/3q_left|3\/4 左|three.quarter left|left/i)
    expect(result[2].prompt).toMatch(/3q_right|3\/4 右|three.quarter right|right/i)
  })
})
