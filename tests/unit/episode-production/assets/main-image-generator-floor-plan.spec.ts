/**
 * MainImageGeneratorService · 地点层级引用 + 平面布局图先行 + 资产图守设定（2026-09-21 B3/C2/F）
 * @module tests/unit/episode-production/assets/main-image-generator-floor-plan
 *
 * 覆盖：
 * - C2 根地点：无平面图时先生成 floor_plan（T2I 无参考图）再生成主图（平面图作单 ref），
 *   验证两次调用顺序与 prompt 内容；已有平面图时直接用、不重复生成
 * - B3 子区域：引用父级 confirmed 主图（无 confirmed 放宽 is_main）；不生成平面图；
 *   调用方显式传 referenceImagePath 时不注入
 * - C2 容错：平面图生成失败不阻断主图（warn 后退回无参考图流程）
 * - F1 设定锚点缺失补全：character 年龄/性别缺失时追加「人物设定锚点」，已含不重复
 * - F2 古风硬约束：storyEra 命中古风 → prompt/negative 追加严禁现代元素；现代年代不追加
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { MainImageGeneratorService } from '@core/platform/episode-production/assets/services/main-image-generator.service'
import type { ImageGenerator } from '@core/platform/episode-production/assets/services/gallery-derivation.service'
import {
  LOCATION_FLOOR_PLAN_SUFFIX,
  LOCATION_FLOOR_PLAN_REFERENCE_SUFFIX,
  LOCATION_PARENT_REFERENCE_SUFFIX,
} from '@core/platform/episode-production/assets/prompts/location-constraints'
import { ANCIENT_ERA_CONSTRAINT_SUFFIX } from '@core/platform/episode-production/assets/prompts/asset-identity-prompt'

interface Call {
  prompt: string
  negativePrompt?: string
  label: string
  referenceImagePaths: string[]
}

class MockGen implements ImageGenerator {
  calls: Call[] = []
  /** 设为 true 时第一次调用抛错（模拟平面图生成失败） */
  failFirst = false
  private counter = 0
  async generate(opts: Call): Promise<{ imagePath: string; thumbnailPath: string | null }> {
    if (this.failFirst && this.calls.length === 0) {
      this.calls.push(opts)
      throw new Error('mock 平面图生成失败')
    }
    this.counter += 1
    this.calls.push(opts)
    return { imagePath: `/mock/${opts.label}-${this.counter}.png`, thumbnailPath: null }
  }
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      AssetImageEntity,
      LocationBindingEntity,
      CharacterBindingEntity,
      VideoProjectEntity,
      VideoEpisodeEntity,
      LwLocationEntity,
      LwCharacterEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedLocation(
  ds: DataSource,
  id: string,
  fields: Partial<LocationBindingEntity> = {},
): Promise<void> {
  await ds.getRepository(LocationBindingEntity).save({
    id,
    projectId: 'p1',
    locationName: id,
    standaloneName: id,
    sourceType: 'standalone',
    generateImages: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...fields,
  } as any)
}

async function seedImage(
  ds: DataSource,
  fields: Partial<AssetImageEntity> & { id: string },
): Promise<void> {
  await ds.getRepository(AssetImageEntity).save({
    userId: null,
    assetType: 'location',
    assetId: 'lb_parent',
    category: 'main',
    label: null,
    imagePath: `/img/${fields.id}.png`,
    isMain: 0,
    confirmed: 0,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...fields,
  } as any)
}

describe('MainImageGeneratorService · 平面图先行 / 父级引用 / 守设定', () => {
  let ds: DataSource
  let gen: MockGen
  let svc: MainImageGeneratorService

  beforeEach(async () => {
    ds = await buildDb()
    gen = new MockGen()
    svc = new MainImageGeneratorService(new AssetImageService(ds), gen, ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('C2 根地点：先生成平面图（无 ref），再生成主图（平面图作单 ref）', async () => {
    await seedLocation(ds, 'lb_root')
    const main = await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_root',
      prompt: '雪麓山庄，依山而建的建筑群',
    })

    expect(gen.calls).toHaveLength(2)
    // 第一次：平面图，T2I 无参考图
    const plan = gen.calls[0]
    expect(plan.label).toBe('layout')
    expect(plan.referenceImagePaths).toEqual([])
    expect(plan.prompt).toContain('俯视正交平面布局图')
    expect(plan.prompt).toContain('雪麓山庄')
    // 第二次：主图，以平面图作参考 + 布局还原约束
    const mainCall = gen.calls[1]
    expect(mainCall.label).toBe('main')
    expect(mainCall.referenceImagePaths).toEqual(['/mock/layout-1.png'])
    expect(mainCall.prompt).toContain(LOCATION_FLOOR_PLAN_REFERENCE_SUFFIX)

    // 落库：floor_plan 行 + main 行
    const images = await ds.getRepository(AssetImageEntity).find({
      where: { assetType: 'location', assetId: 'lb_root' },
    })
    const floorPlan = images.find((i) => i.category === 'floor_plan')
    expect(floorPlan).toBeTruthy()
    expect(floorPlan!.label).toBe('layout')
    expect(floorPlan!.isMain).toBe(0)
    expect(floorPlan!.prompt).toContain(LOCATION_FLOOR_PLAN_SUFFIX)
    expect(main.isMain).toBe(1)
    expect(main.category).toBe('main')
  })

  it('C2 根地点已有平面图：不重复生成，直接作参考', async () => {
    await seedLocation(ds, 'lb_root')
    await seedImage(ds, {
      id: 'ai_plan',
      assetId: 'lb_root',
      category: 'floor_plan',
      label: 'layout',
      imagePath: '/img/existing-plan.png',
    })
    await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_root',
      prompt: '雪麓山庄',
    })
    expect(gen.calls).toHaveLength(1)
    expect(gen.calls[0].label).toBe('main')
    expect(gen.calls[0].referenceImagePaths).toEqual(['/img/existing-plan.png'])
  })

  it('B3 子区域：引用父级 confirmed 主图，不生成平面图', async () => {
    await seedLocation(ds, 'lb_parent')
    await seedLocation(ds, 'lb_child', { parentId: 'lb_parent' })
    await seedImage(ds, {
      id: 'ai_pmain',
      assetId: 'lb_parent',
      isMain: 1,
      confirmed: 1,
      imagePath: '/img/parent-main.png',
    })

    await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_child',
      prompt: '雪麓山庄闺房，精致的内室',
    })

    expect(gen.calls).toHaveLength(1)
    const c = gen.calls[0]
    expect(c.label).toBe('main')
    expect(c.referenceImagePaths).toEqual(['/img/parent-main.png'])
    expect(c.prompt).toContain(LOCATION_PARENT_REFERENCE_SUFFIX)
    // 不落平面图
    const plans = await ds.getRepository(AssetImageEntity).find({
      where: { assetType: 'location', assetId: 'lb_child', category: 'floor_plan' },
    })
    expect(plans).toHaveLength(0)
  })

  it('B3 子区域：父级无 confirmed 图时放宽到 is_main=1 主图', async () => {
    await seedLocation(ds, 'lb_parent')
    await seedLocation(ds, 'lb_child', { parentId: 'lb_parent' })
    await seedImage(ds, {
      id: 'ai_pmain',
      assetId: 'lb_parent',
      isMain: 1,
      confirmed: 0,
      imagePath: '/img/parent-legacy-main.png',
    })
    await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_child',
      prompt: '雪麓山庄闺房',
    })
    expect(gen.calls[0].referenceImagePaths).toEqual(['/img/parent-legacy-main.png'])
  })

  it('B3 子区域：父级无主图 → 回退无参考图流程', async () => {
    await seedLocation(ds, 'lb_parent')
    await seedLocation(ds, 'lb_child', { parentId: 'lb_parent' })
    await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_child',
      prompt: '雪麓山庄闺房',
    })
    expect(gen.calls).toHaveLength(1)
    expect(gen.calls[0].referenceImagePaths).toEqual([])
  })

  it('B3/C2：调用方显式传 referenceImagePath 时不注入父级 / 平面图', async () => {
    await seedLocation(ds, 'lb_parent')
    await seedLocation(ds, 'lb_child', { parentId: 'lb_parent' })
    await seedImage(ds, {
      id: 'ai_pmain',
      assetId: 'lb_parent',
      isMain: 1,
      confirmed: 1,
      imagePath: '/img/parent-main.png',
    })
    await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_child',
      prompt: '雪麓山庄闺房',
      referenceImagePath: '/img/user-ref.png',
    })
    expect(gen.calls).toHaveLength(1)
    expect(gen.calls[0].referenceImagePaths).toEqual(['/img/user-ref.png'])
    expect(gen.calls[0].prompt).not.toContain(LOCATION_PARENT_REFERENCE_SUFFIX)
  })

  it('C2 容错：平面图生成失败不阻断主图（回退无参考图）', async () => {
    await seedLocation(ds, 'lb_root')
    gen.failFirst = true
    const main = await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_root',
      prompt: '雪麓山庄',
    })
    // 平面图调用（失败）+ 主图调用（成功，无 ref）
    expect(gen.calls).toHaveLength(2)
    expect(gen.calls[1].label).toBe('main')
    expect(gen.calls[1].referenceImagePaths).toEqual([])
    expect(main.isMain).toBe(1)
    // 平面图未落库
    const plans = await ds.getRepository(AssetImageEntity).find({
      where: { assetType: 'location', assetId: 'lb_root', category: 'floor_plan' },
    })
    expect(plans).toHaveLength(0)
  })

  it('F1 character：prompt 缺失年龄/性别时追加人物设定锚点；已含不重复', async () => {
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb1',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '玄清掌门',
      standaloneDescription: '雪麓山庄掌门',
      gender: 'male',
      age: 50,
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    // 缺失 → 补全
    await svc.generateMain({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '玄清掌门，仙风道骨',
    })
    const c1 = gen.calls[0]
    expect(c1.prompt).toContain('人物设定锚点')
    expect(c1.prompt).toContain('性别：男')
    expect(c1.prompt).toContain('年龄：50岁')

    // 已含 → 不重复追加锚点段
    gen.calls = []
    await svc.generateMain({
      assetType: 'character',
      assetId: 'cb1',
      prompt: '玄清掌门，50岁男性，仙风道骨',
    })
    expect(gen.calls[0].prompt).not.toContain('人物设定锚点')
  })

  it('F1 location：缺失规模/类型时追加地点设定锚点', async () => {
    await seedLocation(ds, 'lb_root', {
      locationType: 'exterior',
      scale: '巨大',
      parentId: 'lb_missing_parent', // 父级不存在 → 无参考图注入，聚焦 prompt 断言
    })
    await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_root',
      prompt: '演武场，开阔的习武场地',
    })
    const c = gen.calls[0]
    expect(c.prompt).toContain('地点设定锚点')
    expect(c.prompt).toContain('类型：exterior')
    expect(c.prompt).toContain('规模：巨大')
  })

  it('F2 古风：storyEra 含"宋" → prompt/negative 追加严禁现代元素；现代都市不追加', async () => {
    await seedLocation(ds, 'lb_root', { parentId: 'lb_x' }) // 父级不存在 → 单次调用
    await ds.getRepository(VideoEpisodeEntity).save({
      id: 'ep1',
      projectId: 'p1',
      episodeNumber: 1,
      title: '第一集',
      storyEra: '宋朝武侠',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_root',
      prompt: '演武场',
    })
    const ancient = gen.calls[0]
    expect(ancient.prompt).toContain(ANCIENT_ERA_CONSTRAINT_SUFFIX)
    expect(ancient.negativePrompt).toContain('modern buildings')

    // 现代年代不追加
    gen.calls = []
    await ds.getRepository(VideoEpisodeEntity).update('ep1', { storyEra: '现代都市' })
    await svc.generateMain({
      assetType: 'location',
      assetId: 'lb_root',
      prompt: '演武场',
    })
    expect(gen.calls[0].prompt).not.toContain(ANCIENT_ERA_CONSTRAINT_SUFFIX)
  })
})
