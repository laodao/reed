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
import { PresetDigitalHumanService } from '@core/modules/episode-production/assets/services/preset-digital-human.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      CharacterBindingEntity,
      LocationBindingEntity,
      ItemBindingEntity,
      LwCharacterEntity,
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
