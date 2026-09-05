/**
 * PresetDigitalHumanService + seed migration · spec（Phase 4 D3，spec 2026-05-09 §3.2 D3 · P-8）
 *
 * 验证：
 *   - migration add-character-binding-preset 加 is_preset 列幂等
 *   - seed migration 插入 12 个预设角色幂等
 *   - service.list 仅返回 user_id IS NULL + source_type='preset_digital' 的行
 *   - filter（gender）生效
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { addCharacterBindingPreset } from '@core/database/migrations/add-character-binding-preset'
import { seedPresetDigitalHumans } from '@core/database/migrations/seed-preset-digital-humans'
import { PresetDigitalHumanService } from '@core/platform/episode-production/assets/services/preset-digital-human.service'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      LwCharacterEntity,
      AssetImageEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('addCharacterBindingPreset migration', () => {
  it('首次运行加 is_preset 列', async () => {
    const ds = await buildDb()
    // synchronize=true 已经基于 entity 建表（含 is_preset 字段，因 entity 加过列以后就有）
    // 这里测幂等：再跑一遍不抛错
    await addCharacterBindingPreset(ds)
    await addCharacterBindingPreset(ds)  // 双跑幂等
    await ds.destroy()
  })
})

describe('seedPresetDigitalHumans migration', () => {
  it('插入 12 个预设角色', async () => {
    const ds = await buildDb()
    await addCharacterBindingPreset(ds)
    await seedPresetDigitalHumans(ds)
    const repo = ds.getRepository(CharacterBindingEntity)
    const all = await repo.find({})
    expect(all.length).toBe(12)
    await ds.destroy()
  })

  it('幂等：双跑不重复', async () => {
    const ds = await buildDb()
    await addCharacterBindingPreset(ds)
    await seedPresetDigitalHumans(ds)
    await seedPresetDigitalHumans(ds)
    const repo = ds.getRepository(CharacterBindingEntity)
    const all = await repo.find({})
    expect(all.length).toBe(12)
    await ds.destroy()
  })

  it('预设 binding 全部 user_id=NULL + project_id=NULL + source_type=preset_digital', async () => {
    const ds = await buildDb()
    await addCharacterBindingPreset(ds)
    await seedPresetDigitalHumans(ds)
    const repo = ds.getRepository(CharacterBindingEntity)
    const all = await repo.find({})
    for (const b of all) {
      expect(b.userId).toBeNull()
      expect(b.projectId).toBeNull()
      expect(b.sourceType).toBe('preset_digital')
    }
    await ds.destroy()
  })
})

describe('PresetDigitalHumanService.list', () => {
  let ds: DataSource
  let svc: PresetDigitalHumanService

  beforeEach(async () => {
    ds = await buildDb()
    await addCharacterBindingPreset(ds)
    await seedPresetDigitalHumans(ds)
    svc = new PresetDigitalHumanService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('返回所有 12 个预设角色', async () => {
    const list = await svc.list()
    expect(list.length).toBe(12)
  })

  it('按 gender 过滤', async () => {
    const males = await svc.list({ gender: '男' })
    const females = await svc.list({ gender: '女' })
    expect(males.length).toBeGreaterThan(0)
    expect(females.length).toBeGreaterThan(0)
    expect(males.length + females.length).toBe(12)
    for (const m of males) expect(m.gender).toBe('男')
    for (const f of females) expect(f.gender).toBe('女')
  })

  it('不返回普通 binding（user 创建的角色）', async () => {
    // 插入一个普通用户角色
    const repo = ds.getRepository(CharacterBindingEntity)
    await repo.save({
      id: 'cb_user',
      userId: 'user1',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '用户角色',
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const list = await svc.list()
    expect(list.length).toBe(12)  // 仍然 12，不含 cb_user
    expect(list.find((b) => b.id === 'cb_user')).toBeUndefined()
  })

  it('按 createdAt 升序排序', async () => {
    const list = await svc.list()
    const created = list.map((b) => Number(b.createdAt))
    const sorted = [...created].sort((a, b) => a - b)
    expect(created).toEqual(sorted)
  })
})

describe('PresetDigitalHumanService.useToProject', () => {
  let ds: DataSource
  let svc: PresetDigitalHumanService

  beforeEach(async () => {
    ds = await buildDb()
    await addCharacterBindingPreset(ds)
    await seedPresetDigitalHumans(ds)
    svc = new PresetDigitalHumanService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('为 preset 创建用户自己的 binding（project_id=target, user_id=current, source_type=standalone, is_preset=0）', async () => {
    const presets = await svc.list()
    const preset = presets[0]
    const result = await svc.useToProject({
      presetId: preset.id,
      targetProjectId: 'p_user',
      userId: 'u1',
    })
    expect(result.bindingId).toMatch(/^cb_/)

    const repo = ds.getRepository(CharacterBindingEntity)
    const newBinding = await repo.findOne({ where: { id: result.bindingId } })
    expect(newBinding).not.toBeNull()
    expect(newBinding!.userId).toBe('u1')
    expect(newBinding!.projectId).toBe('p_user')
    expect(newBinding!.sourceType).toBe('standalone')
    expect(newBinding!.isPreset).toBe(0)
    // 视觉字段保留
    expect(newBinding!.gender).toBe(preset.gender)
    expect(newBinding!.standaloneName).toBe(preset.standaloneName)
  })

  it('拷贝 preset 的 asset_image 行（图磁盘文件共享，行换 assetId）', async () => {
    const presets = await svc.list()
    const preset = presets[0]
    // 给 preset 加一张图
    const imageRepo = ds.getRepository(AssetImageEntity)
    await imageRepo.save({
      id: 'ai_preset_main',
      userId: null,
      assetType: 'character',
      assetId: preset.id,
      category: 'main',
      label: null,
      imagePath: '/shared/preset/main.png',
      isMain: 1,
      sortOrder: 0,
      prompt: 'test prompt',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const result = await svc.useToProject({
      presetId: preset.id,
      targetProjectId: 'p_user',
      userId: 'u1',
    })

    const newImages = await imageRepo.find({
      where: { assetType: 'character', assetId: result.bindingId } as any,
    })
    expect(newImages.length).toBe(1)
    expect(newImages[0].imagePath).toBe('/shared/preset/main.png')  // 共享磁盘文件
    expect(newImages[0].userId).toBe('u1')
    expect(newImages[0].id).not.toBe('ai_preset_main')  // 新行新 id
    expect(newImages[0].prompt).toBe('test prompt')  // 元数据保留
  })

  it('preset 自身不动（其他用户继续可用）', async () => {
    const presets = await svc.list()
    const preset = presets[0]
    await svc.useToProject({
      presetId: preset.id,
      targetProjectId: 'p_user',
      userId: 'u1',
    })

    // preset 仍可被列出
    const stillThere = await svc.list()
    expect(stillThere.length).toBe(12)
    expect(stillThere.find((p) => p.id === preset.id)).toBeDefined()
  })

  it('未找到 preset → 抛错', async () => {
    await expect(
      svc.useToProject({
        presetId: 'nonexistent',
        targetProjectId: 'p_user',
        userId: 'u1',
      }),
    ).rejects.toThrow(/不存在|不存在或已下架/)
  })

  it('overrideName 指定时覆盖 standaloneName', async () => {
    const presets = await svc.list()
    const preset = presets[0]
    const result = await svc.useToProject({
      presetId: preset.id,
      targetProjectId: 'p_user',
      userId: 'u1',
      overrideName: '我的自定义名字',
    })
    const repo = ds.getRepository(CharacterBindingEntity)
    const newBinding = await repo.findOne({ where: { id: result.bindingId } })
    expect(newBinding!.standaloneName).toBe('我的自定义名字')
  })
})
