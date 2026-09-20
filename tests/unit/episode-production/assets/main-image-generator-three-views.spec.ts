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
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { MainImageGeneratorService } from '@core/platform/episode-production/assets/services/main-image-generator.service'
import type { ImageGenerator } from '@core/platform/episode-production/assets/services/gallery-derivation.service'

interface ImageGenCall {
  prompt: string
  negativePrompt?: string
  label: string
  refs: string[]
  providerConfigId?: string
  modelId?: string
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
      providerConfigId: opts.providerConfigId,
      modelId: opts.modelId,
    })
    return { imagePath: `/mock/view-${this.counter}.jpg`, thumbnailPath: null }
  }
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetImageEntity, CharacterBindingEntity, VideoProjectEntity],
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

  /*
   * F1（2026-09-20 人物一致性修复）：三视图钉项目「画面生成」模型
   * （binding.projectId → project.config.imageModel），与主图同源，
   * 避免自动挑到不同源模型导致 Q版主图 vs 写实视图风格分叉。
   */
  async function seedProjectWithImageModel(): Promise<void> {
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
  }

  it('F1：项目配置了画面模型 → 三次生成全部钉 providerConfigId/modelId', async () => {
    await seedProjectWithImageModel()
    const baseId = await seedMain(imageSvc)
    await svc.generateThreeViews({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '林清',
      baseImageId: baseId,
    })

    expect(gen.calls).toHaveLength(3)
    for (const call of gen.calls) {
      expect(call.providerConfigId).toBe('pc-seedream')
      expect(call.modelId).toBe('seedream-4')
    }
  })

  it('F1：资产无 projectId / 项目未配置画面模型 → 回退自动挑（不传 providerConfigId）', async () => {
    const baseId = await seedMain(imageSvc) // 无 binding 行 → resolveProjectImageModel 返回 null
    await svc.generateThreeViews({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '林清',
      baseImageId: baseId,
    })

    expect(gen.calls).toHaveLength(3)
    for (const call of gen.calls) {
      expect(call.providerConfigId).toBeUndefined()
      expect(call.modelId).toBeUndefined()
    }
  })

  /*
   * F2（2026-09-20 人物一致性修复）：角色三视图 prompt 注入身份保持约束
   * （与派生图路径 appendCharacterIdentityPreservation 同源）。
   */
  it('F2：角色三视图 prompt 带身份保持约束 + 身份 negative', async () => {
    const baseId = await seedMain(imageSvc)
    await svc.generateThreeViews({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '林清',
      baseImageId: baseId,
    })

    for (const call of gen.calls) {
      expect(call.prompt).toContain('保持人物身份（preserve character identity）')
      expect(call.negativePrompt).toContain('different face')
    }
  })
})
