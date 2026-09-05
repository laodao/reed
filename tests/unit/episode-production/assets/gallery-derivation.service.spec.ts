/**
 * GalleryDerivationService 单测（P3a Task 3）
 * @module tests/unit/episode-production/assets/gallery-derivation.service
 *
 * 4 个用例覆盖 spec §3.5 派生工作流：
 * - deriveSingle: 用主图作 reference 生成一张派生图
 * - deriveSingle 没有主图时报错（错误信息含"主图"）
 * - deriveBatch: 批量派生多个 label
 * - deriveBatch 跳过已存在的 label
 *
 * 通过 MockImageGenerator 注入 ImageGenerator 抽象接口，
 * 验证派生服务对底层 image API 的编排逻辑，与真实 image.service 解耦。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import {
  GalleryDerivationService,
  type ImageGenerator,
} from '@core/modules/episode-production/assets/services/gallery-derivation.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [VideoProjectEntity, AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

interface GenerateCall {
  referenceImagePaths: string[]
  prompt: string
  negativePrompt?: string
  label: string
}

class MockImageGenerator implements ImageGenerator {
  calls: GenerateCall[] = []
  async generate(opts: GenerateCall): Promise<{
    imagePath: string
    thumbnailPath: string | null
  }> {
    this.calls.push(opts)
    return { imagePath: `/mock/${opts.label}.png`, thumbnailPath: null }
  }
}

describe('GalleryDerivationService', () => {
  let ds: DataSource
  let imageSvc: AssetImageService
  let mockGen: MockImageGenerator
  let derivSvc: GalleryDerivationService

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    mockGen = new MockImageGenerator()
    derivSvc = new GalleryDerivationService(imageSvc, mockGen)

    // 准备主图
    await imageSvc.addImage({
      assetType: 'character',
      assetId: 'cb1',
      category: 'main',
      imagePath: '/main.png',
      isMain: true,
    })
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('deriveSingle: 用主图作 reference 生成一张派生图', async () => {
    const result = await derivSvc.deriveSingle({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      label: '3q_left',
      additionalPrompt: '左 3/4 视角',
    })

    expect(mockGen.calls).toHaveLength(1)
    expect(mockGen.calls[0].referenceImagePaths).toEqual(['/main.png'])
    expect(mockGen.calls[0].label).toBe('3q_left')

    const list = await imageSvc.listByCategory('character', 'cb1', 'view')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      label: '3q_left',
      imagePath: '/mock/3q_left.png',
      derivedFromImageId: expect.any(String),
    })
    expect(result.id).toBe(list[0].id)
  })

  it('deriveSingle 没有主图时报错', async () => {
    // 删掉主图
    const main = await imageSvc.getMainImage('character', 'cb1')
    if (main) await imageSvc.deleteImage(main.id)

    await expect(
      derivSvc.deriveSingle({
        assetType: 'character',
        assetId: 'cb1',
        category: 'view',
        label: '3q_left',
      }),
    ).rejects.toThrow(/主图/)
  })

  it('deriveBatch: 批量派生多个 label', async () => {
    await derivSvc.deriveBatch({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      labels: ['front', '3q_left', '3q_right'],
    })

    expect(mockGen.calls).toHaveLength(3)
    const views = await imageSvc.listByCategory('character', 'cb1', 'view')
    expect(views).toHaveLength(3)
    expect(views.map((v) => v.label).sort()).toEqual([
      '3q_left',
      '3q_right',
      'front',
    ])
  })

  it('deriveBatch 跳过已存在的 label', async () => {
    // 先派生一个 front
    await derivSvc.deriveSingle({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      label: 'front',
    })
    mockGen.calls = []

    // batch 包含 front（已存在）和 3q_left（新）
    await derivSvc.deriveBatch({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      labels: ['front', '3q_left'],
    })

    expect(mockGen.calls).toHaveLength(1) // 只生成新的
    expect(mockGen.calls[0].label).toBe('3q_left')
  })
})
