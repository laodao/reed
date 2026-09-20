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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import * as dbModule from '@core/database/database-manager.interface'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import {
  GalleryDerivationService,
  type ImageGenerator,
} from '@core/platform/episode-production/assets/services/gallery-derivation.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [VideoProjectEntity, AssetImageEntity, CharacterBindingEntity],
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
  providerConfigId?: string
  modelId?: string
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
    vi.restoreAllMocks()
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

  /*
   * F1（2026-09-20 人物一致性修复）：派生图钉项目「画面生成」模型
   * （binding.projectId → project.config.imageModel），与主图 / 三视图同源；
   * 解析不到 → 不传 providerConfigId/modelId，回退 imageGen 自动挑。
   */
  it('F1：项目配置了画面模型 → deriveSingle 钉 providerConfigId/modelId', async () => {
    await ds.getRepository(VideoProjectEntity).save({
      id: 'vp1',
      name: '测试项目',
      status: 'draft',
      config: { imageModel: { providerConfigId: 'pc-seedream', modelId: 'seedream-4' } },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<VideoProjectEntity>)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'vp1',
      voiceConfig: {},
      sourceType: 'standalone',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<CharacterBindingEntity>)

    const svcWithDs = new GalleryDerivationService(imageSvc, mockGen, ds)
    await svcWithDs.deriveSingle({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      label: '3q_left',
    })

    expect(mockGen.calls).toHaveLength(1)
    expect(mockGen.calls[0].providerConfigId).toBe('pc-seedream')
    expect(mockGen.calls[0].modelId).toBe('seedream-4')
  })

  it('F1：无 ds / 资产无项目画面模型 → 回退自动挑（不传 providerConfigId）', async () => {
    // beforeEach 的 derivSvc 未注入 ds → resolveProjectImageModel 直接返回 null
    await derivSvc.deriveSingle({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      label: '3q_left',
    })

    expect(mockGen.calls).toHaveLength(1)
    expect(mockGen.calls[0].providerConfigId).toBeUndefined()
    expect(mockGen.calls[0].modelId).toBeUndefined()
  })

  /*
   * F1b（2026-09-21）：钉住的项目画面模型不支持参考图（comfyui/krea2 maxReferenceImages=0）
   * → 派生回退到同 provider 下支持参考图的 flux-kontext；若钉的是支持参考图的模型则不动。
   */
  it('F1b：钉住 krea2（不支持参考图）→ 回退同 provider 的 flux-kontext', async () => {
    await ds.getRepository(VideoProjectEntity).save({
      id: 'vp1',
      name: '测试项目',
      status: 'draft',
      config: { imageModel: { providerConfigId: 'pc-comfy', modelId: 'krea2' } },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<VideoProjectEntity>)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'vp1',
      voiceConfig: {},
      sourceType: 'standalone',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<CharacterBindingEntity>)
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: {
        getEnabled: vi.fn(async () => [{
          id: 'pc-comfy',
          templateId: 'comfyui',
          isEnabled: true,
          models: [
            { id: 'h3', name: 'MiniMax-H3 图生视频', type: 'video' },
            { id: 'krea2', name: 'Krea2 文生图', type: 'image' },
            { id: 'flux-kontext', name: 'Flux Kontext 参考图生图', type: 'image' },
          ],
        }]),
      },
    } as any)

    const svcWithDs = new GalleryDerivationService(imageSvc, mockGen, ds)
    await svcWithDs.deriveSingle({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      label: '3q_left',
    })

    expect(mockGen.calls).toHaveLength(1)
    expect(mockGen.calls[0].providerConfigId).toBe('pc-comfy')
    expect(mockGen.calls[0].modelId).toBe('flux-kontext')
  })

  it('F1b：钉住的模型支持参考图（seedream-4 maxRef=14）→ 保持不动', async () => {
    await ds.getRepository(VideoProjectEntity).save({
      id: 'vp1',
      name: '测试项目',
      status: 'draft',
      config: { imageModel: { providerConfigId: 'pc-volc', modelId: 'doubao-seedream-4-5' } },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<VideoProjectEntity>)
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'vp1',
      voiceConfig: {},
      sourceType: 'standalone',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<CharacterBindingEntity>)
    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      providerConfigs: {
        getEnabled: vi.fn(async () => [{
          id: 'pc-volc',
          templateId: 'volcengine',
          isEnabled: true,
          models: [
            { id: 'doubao-seedream-4-5', name: 'Doubao-Seedream-4.5', type: 'image' },
          ],
        }]),
      },
    } as any)

    const svcWithDs = new GalleryDerivationService(imageSvc, mockGen, ds)
    await svcWithDs.deriveSingle({
      assetType: 'character',
      assetId: 'cb1',
      category: 'view',
      label: '3q_left',
    })

    expect(mockGen.calls).toHaveLength(1)
    expect(mockGen.calls[0].modelId).toBe('doubao-seedream-4-5')
  })
})
