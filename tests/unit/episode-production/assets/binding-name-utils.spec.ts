/**
 * binding-name-utils 单测（2026-09-21 资产绑定去重归一）
 * @module tests/unit/episode-production/assets/binding-name-utils
 *
 * 覆盖：
 * - normalizeBindingName：trim / 全角空格 / 书名号引号 / 大小写 / 空白剔除
 * - findCharacterBindingByName：standalone/override/alias 匹配、多命中取最早
 * - findLocationBindingByName：location_name 双轨列、前缀归一（"雪麓山庄书房"→"书房"）、
 *   防误并（"白鹿城门口" 不并 "白鹿城"、剩余 <2 字不匹配）
 * - findItemBindingByName：item_name 匹配
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import {
  normalizeBindingName,
  findCharacterBindingByName,
  findLocationBindingByName,
  findItemBindingByName,
  inferLocationParentBinding,
} from '@core/platform/episode-production/assets/services/binding-name-utils'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [CharacterBindingEntity, LocationBindingEntity, ItemBindingEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('normalizeBindingName', () => {
  it('trim + 全角空格 + 书名号/引号 + 大小写', () => {
    expect(normalizeBindingName('  沈云萝 ')).toBe('沈云萝')
    expect(normalizeBindingName('沈　云萝')).toBe('沈云萝')
    expect(normalizeBindingName('《秦越》')).toBe('秦越')
    expect(normalizeBindingName('“白鹿城”')).toBe('白鹿城')
    expect(normalizeBindingName("'掌门'")).toBe('掌门')
    expect(normalizeBindingName('BaiLu Cheng')).toBe('bailucheng')
    expect(normalizeBindingName('')).toBe('')
    expect(normalizeBindingName(null)).toBe('')
    expect(normalizeBindingName(undefined)).toBe('')
  })
})

describe('findCharacterBindingByName', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  async function seedChar(
    id: string,
    fields: Partial<CharacterBindingEntity>,
    createdAt: Date,
  ): Promise<void> {
    await ds.getRepository(CharacterBindingEntity).save({
      id,
      projectId: 'p1',
      sourceType: 'standalone',
      voiceConfig: {},
      createdAt,
      updatedAt: createdAt,
      ...fields,
    } as any)
  }

  it('归一化匹配 standalone_name（全角空格差异）', async () => {
    await seedChar('cb_a', { standaloneName: '沈云萝' }, new Date('2026-01-01'))
    const hit = await findCharacterBindingByName(ds, 'p1', '沈　云萝 ')
    expect(hit?.id).toBe('cb_a')
  })

  it('多命中取 created_at 最早者', async () => {
    await seedChar('cb_late', { standaloneName: '秦越' }, new Date('2026-02-01'))
    await seedChar('cb_early', { standaloneName: '秦越' }, new Date('2026-01-01'))
    const hit = await findCharacterBindingByName(ds, 'p1', '秦越')
    expect(hit?.id).toBe('cb_early')
  })

  it('override_name 与 alias 候选也参与匹配', async () => {
    await seedChar(
      'cb_linked',
      { sourceType: 'linked_lw', overrideName: '掌门', longWritingCharacterId: 'lwc1' },
      new Date('2026-01-01'),
    )
    await seedChar(
      'cb_alias',
      { standaloneName: '顾三', alias: '三爷 / 浪剑客' },
      new Date('2026-01-02'),
    )
    expect((await findCharacterBindingByName(ds, 'p1', '掌门'))?.id).toBe('cb_linked')
    expect((await findCharacterBindingByName(ds, 'p1', '浪剑客'))?.id).toBe('cb_alias')
  })

  it('跨项目隔离 + 未命中返回 null', async () => {
    await seedChar('cb_a', { standaloneName: '沈云萝' }, new Date('2026-01-01'))
    expect(await findCharacterBindingByName(ds, 'p2', '沈云萝')).toBeNull()
    expect(await findCharacterBindingByName(ds, 'p1', '不存在')).toBeNull()
  })
})

describe('findLocationBindingByName', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  async function seedLoc(
    id: string,
    fields: Partial<LocationBindingEntity>,
    createdAt: Date,
  ): Promise<void> {
    await ds.getRepository(LocationBindingEntity).save({
      id,
      projectId: 'p1',
      locationName: fields.standaloneName ?? '(未命名)',
      sourceType: 'standalone',
      generateImages: 0,
      createdAt,
      updatedAt: createdAt,
      ...fields,
    } as any)
  }

  it('repository 路径只写 location_name 的双轨数据也能命中', async () => {
    await ds.getRepository(LocationBindingEntity).save({
      id: 'lb_repo',
      projectId: 'p1',
      locationName: '白鹿城',
      standaloneName: null,
      sourceType: 'linked_lw',
      generateImages: 0,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as any)
    expect((await findLocationBindingByName(ds, 'p1', '白鹿城'))?.id).toBe('lb_repo')
  })

  it('前缀归一："雪麓山庄书房" 剥掉 "雪麓山庄" 命中 "书房"', async () => {
    await seedLoc('lb_base', { standaloneName: '雪麓山庄', locationName: '雪麓山庄' }, new Date('2026-01-01'))
    await seedLoc('lb_study', { standaloneName: '书房', locationName: '书房' }, new Date('2026-01-02'))
    const hit = await findLocationBindingByName(ds, 'p1', '雪麓山庄书房')
    expect(hit?.id).toBe('lb_study')
  })

  it('防误并："白鹿城门口" 不并入 "白鹿城"（剩余 "门口" 不是已有地点）', async () => {
    await seedLoc('lb_city', { standaloneName: '白鹿城', locationName: '白鹿城' }, new Date('2026-01-01'))
    expect(await findLocationBindingByName(ds, 'p1', '白鹿城门口')).toBeNull()
  })

  it('前缀剥离剩余 <2 字不允许匹配', async () => {
    await seedLoc('lb_base', { standaloneName: '雪麓山庄', locationName: '雪麓山庄' }, new Date('2026-01-01'))
    await seedLoc('lb_east', { standaloneName: '东', locationName: '东' }, new Date('2026-01-02'))
    // "雪麓山庄东" 剥前缀剩 "东"（1 字）→ 不匹配
    expect(await findLocationBindingByName(ds, 'p1', '雪麓山庄东')).toBeNull()
  })

  it('直接命中优先于前缀归一', async () => {
    await seedLoc('lb_base', { standaloneName: '雪麓山庄', locationName: '雪麓山庄' }, new Date('2026-01-01'))
    await seedLoc('lb_full', { standaloneName: '雪麓山庄书房', locationName: '雪麓山庄书房' }, new Date('2026-01-02'))
    await seedLoc('lb_study', { standaloneName: '书房', locationName: '书房' }, new Date('2026-01-03'))
    const hit = await findLocationBindingByName(ds, 'p1', '雪麓山庄书房')
    expect(hit?.id).toBe('lb_full')
  })
})

describe('findItemBindingByName', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('item_name / standalone_name 归一化匹配', async () => {
    await ds.getRepository(ItemBindingEntity).save({
      id: 'ib1',
      projectId: 'p1',
      itemName: '青龙剑',
      standaloneName: '青龙剑',
      sourceType: 'standalone',
      generateImages: 0,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as any)
    expect((await findItemBindingByName(ds, 'p1', '《青龙剑》'))?.id).toBe('ib1')
    expect(await findItemBindingByName(ds, 'p1', '别的剑')).toBeNull()
  })
})

describe('inferLocationParentBinding（2026-09-21 地点层级推断）', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  async function seedLoc(
    id: string,
    name: string,
    createdAt: Date,
  ): Promise<void> {
    await ds.getRepository(LocationBindingEntity).save({
      id,
      projectId: 'p1',
      locationName: name,
      standaloneName: name,
      sourceType: 'standalone',
      generateImages: 0,
      createdAt,
      updatedAt: createdAt,
    } as any)
  }

  it('前缀匹配："雪麓山庄闺房" → 父 "雪麓山庄"', async () => {
    await seedLoc('lb_base', '雪麓山庄', new Date('2026-01-01'))
    const hit = await inferLocationParentBinding(ds, 'p1', '雪麓山庄闺房')
    expect(hit?.id).toBe('lb_base')
  })

  it('最长匹配优先："雪麓山庄东院演武场" → 父 "雪麓山庄东院"（非 "雪麓山庄"）', async () => {
    await seedLoc('lb_base', '雪麓山庄', new Date('2026-01-01'))
    await seedLoc('lb_east', '雪麓山庄东院', new Date('2026-01-02'))
    const hit = await inferLocationParentBinding(ds, 'p1', '雪麓山庄东院演武场')
    expect(hit?.id).toBe('lb_east')
  })

  it('边界：前缀 <2 字或剩余 <2 字不推断', async () => {
    await seedLoc('lb_temple', '寺', new Date('2026-01-01'))
    await seedLoc('lb_base', '雪麓山庄', new Date('2026-01-02'))
    // "寺" 单字前缀不参与
    expect(await inferLocationParentBinding(ds, 'p1', '寺庙后山')).toBeNull()
    // "雪麓山庄东" 剥前缀剩 1 字 → 不挂
    expect(await inferLocationParentBinding(ds, 'p1', '雪麓山庄东')).toBeNull()
  })

  it('归一化（书名号/全角空格）后仍可命中；无匹配返回 null', async () => {
    await seedLoc('lb_base', '雪麓山庄', new Date('2026-01-01'))
    expect((await inferLocationParentBinding(ds, 'p1', '《雪麓山庄》　闺房'))?.id).toBe('lb_base')
    expect(await inferLocationParentBinding(ds, 'p1', '白鹿城')).toBeNull()
    expect(await inferLocationParentBinding(ds, 'p2', '雪麓山庄闺房')).toBeNull()
  })

  it('excludeId 排除自身（防自挂）', async () => {
    await seedLoc('lb_base', '雪麓山庄', new Date('2026-01-01'))
    const hit = await inferLocationParentBinding(ds, 'p1', '雪麓山庄闺房', 'lb_base')
    expect(hit).toBeNull()
  })
})
