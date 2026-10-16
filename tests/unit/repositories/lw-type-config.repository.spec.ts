/**
 * LW 批次 9：lw-type-config（4 个表）
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import {
  LwTypeConfigRepository,
  DEFAULT_SKILL_TYPE_CONFIGS,
  DEFAULT_ITEM_TYPE_CONFIGS,
  DEFAULT_SKILL_LEVELS,
  DEFAULT_ITEM_LEVELS,
} from '@core/database/repositories/lw-type-config.repository'

describe.each(getTestDialects())('LwTypeConfig [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwTypeConfigRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwTypeConfigRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ Skill Type Config ============

  it('SkillType create + getByCode + getById', async () => {
    const c = await repo.createSkillTypeConfig({
      projectId: 'p1', code: 'martial', name: '武功',
    } as any)
    const got = await repo.getSkillTypeConfig(c.id)
    expect(got!.name).toBe('武功')
    const byCode = await repo.getSkillTypeConfigByCode('p1', 'martial')
    expect(byCode!.id).toBe(c.id)
  })

  it('SkillType list 排序按 sortOrder', async () => {
    await repo.createSkillTypeConfig({ projectId: 'p1', code: 'a', name: 'A' } as any)
    await repo.createSkillTypeConfig({ projectId: 'p1', code: 'b', name: 'B' } as any)
    const list = await repo.getSkillTypeConfigs('p1')
    expect(list).toHaveLength(2)
    expect(list[0].sortOrder).toBe(0)
    expect(list[1].sortOrder).toBe(1)
  })

  it('SkillType update + delete 级联删除等级', async () => {
    const c = await repo.createSkillTypeConfig({
      projectId: 'p1', code: 'martial', name: 'X',
    } as any)
    await repo.createSkillLevel({
      projectId: 'p1', skillTypeCode: 'martial', code: 'l1', name: 'L1',
    } as any)
    await repo.createSkillLevel({
      projectId: 'p1', skillTypeCode: 'martial', code: 'l2', name: 'L2',
    } as any)

    const updated = await repo.updateSkillTypeConfig(c.id, { name: 'Y' } as any)
    expect(updated!.name).toBe('Y')

    expect(await repo.deleteSkillTypeConfig(c.id)).toBe(true)
    expect(await repo.getSkillLevels('p1', 'martial')).toHaveLength(0)
  })

  it('initializeDefaultSkillTypes 写入类型 + 等级', async () => {
    await repo.initializeDefaultSkillTypes('p1')
    const types = await repo.getSkillTypeConfigs('p1')
    expect(types).toHaveLength(DEFAULT_SKILL_TYPE_CONFIGS.length)
    for (const t of DEFAULT_SKILL_TYPE_CONFIGS) {
      const levels = await repo.getSkillLevels('p1', t.code)
      expect(levels.length).toBe(DEFAULT_SKILL_LEVELS[t.code]?.length ?? 0)
    }
    // 二次调用幂等
    await repo.initializeDefaultSkillTypes('p1')
    expect(await repo.getSkillTypeConfigs('p1')).toHaveLength(
      DEFAULT_SKILL_TYPE_CONFIGS.length,
    )
  })

  // ============ Item Type Config ============

  it('ItemType create + getByCode', async () => {
    const c = await repo.createItemTypeConfig({
      projectId: 'p1', code: 'weapon', name: '武器',
    } as any)
    const byCode = await repo.getItemTypeConfigByCode('p1', 'weapon')
    expect(byCode!.id).toBe(c.id)
  })

  it('ItemType update + delete 级联', async () => {
    const c = await repo.createItemTypeConfig({
      projectId: 'p1', code: 'weapon', name: 'X',
    } as any)
    await repo.createItemLevel({
      projectId: 'p1', itemTypeCode: 'weapon', code: 'l1', name: 'L1',
    } as any)
    expect(await repo.deleteItemTypeConfig(c.id)).toBe(true)
    expect(await repo.getItemLevels('p1', 'weapon')).toHaveLength(0)
  })

  it('initializeDefaultItemTypes 写入类型 + 等级', async () => {
    await repo.initializeDefaultItemTypes('p1')
    const types = await repo.getItemTypeConfigs('p1')
    expect(types).toHaveLength(DEFAULT_ITEM_TYPE_CONFIGS.length)
    for (const t of DEFAULT_ITEM_TYPE_CONFIGS) {
      const levels = await repo.getItemLevels('p1', t.code)
      expect(levels.length).toBe(DEFAULT_ITEM_LEVELS[t.code]?.length ?? 0)
    }
  })

  // ============ Skill Level ============

  it('SkillLevel CRUD + reorder', async () => {
    const a = await repo.createSkillLevel({
      projectId: 'p1', skillTypeCode: 'martial', code: 'a', name: 'A',
    } as any)
    const b = await repo.createSkillLevel({
      projectId: 'p1', skillTypeCode: 'martial', code: 'b', name: 'B',
    } as any)
    const c = await repo.createSkillLevel({
      projectId: 'p1', skillTypeCode: 'martial', code: 'c', name: 'C',
    } as any)

    await repo.reorderSkillLevels('p1', 'martial', [c.id, a.id, b.id])
    const list = await repo.getSkillLevels('p1', 'martial')
    expect(list.map(l => l.code)).toEqual(['c', 'a', 'b'])

    await repo.updateSkillLevel(a.id, { name: 'A2' } as any)
    expect((await repo.getSkillLevel(a.id))!.name).toBe('A2')

    expect(await repo.deleteSkillLevel(b.id)).toBe(true)
    expect(await repo.getSkillLevels('p1', 'martial')).toHaveLength(2)
  })

  // ============ Item Level ============

  it('ItemLevel CRUD + reorder', async () => {
    const a = await repo.createItemLevel({
      projectId: 'p1', itemTypeCode: 'weapon', code: 'a', name: 'A',
    } as any)
    const b = await repo.createItemLevel({
      projectId: 'p1', itemTypeCode: 'weapon', code: 'b', name: 'B',
    } as any)

    await repo.reorderItemLevels('p1', 'weapon', [b.id, a.id])
    const list = await repo.getItemLevels('p1', 'weapon')
    expect(list.map(l => l.code)).toEqual(['b', 'a'])

    expect(await repo.deleteItemLevel(a.id)).toBe(true)
  })
})
