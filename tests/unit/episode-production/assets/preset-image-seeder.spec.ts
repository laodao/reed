/**
 * PresetImageSeederService · spec（Phase 4 D3 follow-up，spec 2026-05-09 §3.2 D3）
 *
 * 验证按需生成 / 幂等 / 批量逻辑（image gen 走 mock 注入）。
 * 不依赖真实 image provider — 实测时由 IPC handler 注入 createGalleryImageGenerator。
 *
 * 注：service 内部 hardcode 调 createGalleryImageGenerator → 测试时只能验证：
 *   - presets 列表 / 已有跳过 / preset binding 不存在错 / 非 preset 错
 * 真实 image gen 调用属于集成测试，不在 unit 层覆盖。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { addCharacterBindingPreset } from '@core/database/migrations/add-character-binding-preset'
import { seedPresetDigitalHumans } from '@core/database/migrations/seed-preset-digital-humans'
import { PresetImageSeederService } from '@core/modules/episode-production/assets/services/preset-image-seeder.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      AssetImageEntity,
      LwCharacterEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('PresetImageSeederService', () => {
  let ds: DataSource
  let svc: PresetImageSeederService

  beforeEach(async () => {
    ds = await buildDb()
    await addCharacterBindingPreset(ds)
    await seedPresetDigitalHumans(ds)
    svc = new PresetImageSeederService(ds)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('listPresets 返回 12 个预设', async () => {
    const list = await svc.listPresets()
    expect(list.length).toBe(12)
    for (const p of list) {
      expect(p.isPreset).toBe(1)
      expect(p.sourceType).toBe('preset_digital')
      expect(p.userId).toBeNull()
    }
  })

  it('ensureMainImageFor: 已有主图 → status=skipped', async () => {
    const presetId = 'preset_male_anchor_25'
    // 预先 seed 一个 isMain=1 行
    const imageRepo = ds.getRepository(AssetImageEntity)
    await imageRepo.save({
      id: 'ai_existing',
      userId: null,
      assetType: 'character',
      assetId: presetId,
      category: 'main',
      label: null,
      imagePath: '/preset/existing.jpg',
      isMain: 1,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const result = await svc.ensureMainImageFor(presetId)
    expect(result.status).toBe('skipped')
    expect(result.imagePath).toBe('/preset/existing.jpg')
  })

  it('ensureMainImageFor: preset 不存在 → status=failed', async () => {
    const result = await svc.ensureMainImageFor('preset_not_exist')
    expect(result.status).toBe('failed')
    expect(result.error).toMatch(/不存在/)
  })

  it('ensureMainImageFor: 普通用户 binding（非 preset）→ status=failed', async () => {
    // 加一个普通用户角色
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb_normal',
      userId: 'user1',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '用户角色',
      voiceConfig: {},
      isPreset: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const result = await svc.ensureMainImageFor('cb_normal')
    expect(result.status).toBe('failed')
    expect(result.error).toMatch(/preset/i)
  })

  it('ensureAllPresetImages: 全部已有 → 全 skipped', async () => {
    // 预先给所有 12 个 preset 加 main
    const presets = await svc.listPresets()
    const imageRepo = ds.getRepository(AssetImageEntity)
    for (const p of presets) {
      await imageRepo.save({
        id: `ai_${p.id}`,
        userId: null,
        assetType: 'character',
        assetId: p.id,
        category: 'main',
        label: null,
        imagePath: `/preset/${p.id}.jpg`,
        isMain: 1,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
    }

    const results = await svc.ensureAllPresetImages()
    expect(results.length).toBe(12)
    for (const r of results) {
      expect(r.status).toBe('skipped')
    }
  })
})
