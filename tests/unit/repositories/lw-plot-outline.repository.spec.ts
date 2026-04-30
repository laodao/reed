/**
 * LW 批次 4：lw-plot + lw-outline + 5 个关联表
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwPlotRepository } from '@core/database/repositories/lw-plot.repository'
import { LwOutlineRepository } from '@core/database/repositories/lw-outline.repository'

describe.each(getTestDialects())('LW Plot+Outline [%s]', dialect => {
  let tds: TestDataSource
  let plots: LwPlotRepository
  let outlines: LwOutlineRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    plots = new LwPlotRepository(tds.ds)
    outlines = new LwOutlineRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ Plot ============

  it('Plot: create + getByProjectId 按 plot_order 排序', async () => {
    await plots.create({ projectId: 'p1', title: 'A', summary: 'as' } as any)
    await plots.create({ projectId: 'p1', title: 'B', summary: 'bs' } as any)
    const list = await plots.getByProjectId('p1')
    expect(list.map(p => p.title)).toEqual(['A', 'B'])
    expect(list[0].plotOrder).toBe(0)
    expect(list[1].plotOrder).toBe(1)
  })

  it('Plot: 关联表 (involvedCharacters 是 ID 时同步写入)', async () => {
    const p = await plots.create({
      projectId: 'p1', title: 'A', summary: 's',
      involvedCharacters: ['char_c1', 'char_c2'],
    } as any)
    expect((await plots.getCharacterIds(p.id)).sort()).toEqual(['char_c1', 'char_c2'])
  })

  it('Plot: batchCreate 事务 + reorderPlots', async () => {
    const list = await plots.batchCreate('p1', [
      { title: 'A', summary: 's1' } as any,
      { title: 'B', summary: 's2' } as any,
      { title: 'C', summary: 's3' } as any,
    ])
    expect(list).toHaveLength(3)
    expect(await plots.countByProjectId('p1')).toBe(3)

    await plots.reorderPlots('p1', [
      { id: list[0].id, order: 10 },
      { id: list[1].id, order: 5 },
    ])
    const sorted = await plots.getByProjectId('p1')
    expect(sorted[0].id).toBe(list[2].id) // order=2
  })

  it('Plot: update 替换 involved + 重新同步关联表', async () => {
    const p = await plots.create({
      projectId: 'p1', title: 'A', summary: '',
      involvedCharacters: ['char_a'],
    } as any)
    await plots.update(p.id, {
      involvedCharacters: ['char_b', 'char_c'],
    } as any)
    expect((await plots.getCharacterIds(p.id)).sort()).toEqual(['char_b', 'char_c'])
  })

  it('Plot: delete 级联删关联表', async () => {
    const p = await plots.create({
      projectId: 'p1', title: 'A', summary: '',
      involvedCharacters: ['char_a'],
      involvedLocations: ['loc_a'],
    } as any)
    await plots.delete(p.id)
    expect(await plots.getById(p.id)).toBeNull()
    expect((await plots.getCharacterIds(p.id)).length).toBe(0)
  })

  // ============ Outline ============

  it('Outline: create root + child', async () => {
    const root = await outlines.create({
      projectId: 'p1', name: '第一章', nodeType: 'volume',
    } as any)
    expect(root.level).toBe(1)
    const child = await outlines.create({
      projectId: 'p1', parentId: root.id, name: '第一节', nodeType: 'chapter',
    } as any)
    // 保留原 Repo 行为：create 中 calculateLevel 不加 1（保留兼容）
    expect(child.level).toBe(1)
    expect(child.parentId).toBe(root.id)
  })

  it('Outline: getTreeByProjectId 嵌套结构', async () => {
    const r = await outlines.create({
      projectId: 'p1', name: 'Root', nodeType: 'volume',
    } as any)
    await outlines.create({
      projectId: 'p1', parentId: r.id, name: 'C1', nodeType: 'chapter',
    } as any)
    await outlines.create({
      projectId: 'p1', parentId: r.id, name: 'C2', nodeType: 'chapter',
    } as any)

    const tree = await outlines.getTreeByProjectId('p1')
    expect(tree).toHaveLength(1)
    expect((tree[0] as any).children).toHaveLength(2)
  })

  it('Outline: moveTo 改变 parent + level + orderIndex', async () => {
    const a = await outlines.create({
      projectId: 'p1', name: 'A', nodeType: 'volume',
    } as any)
    const b = await outlines.create({
      projectId: 'p1', name: 'B', nodeType: 'volume',
    } as any)
    const child = await outlines.create({
      projectId: 'p1', parentId: a.id, name: 'C', nodeType: 'chapter',
    } as any)

    await outlines.moveTo(child.id, b.id)
    const moved = await outlines.getById(child.id)
    expect(moved!.parentId).toBe(b.id)
    // moveTo 用 calculateLevel + 1 语义；b.level=1 → newLevel=2
    expect(moved!.level).toBe(2)
  })

  it('Outline: delete 递归删除子节点 + 关联表', async () => {
    const r = await outlines.create({
      projectId: 'p1', name: 'R', nodeType: 'volume',
      involvedCharacters: ['char_a'],
    } as any)
    const c = await outlines.create({
      projectId: 'p1', parentId: r.id, name: 'C', nodeType: 'chapter',
    } as any)

    await outlines.delete(r.id)
    expect(await outlines.getById(r.id)).toBeNull()
    expect(await outlines.getById(c.id)).toBeNull()
  })

  it('Outline: update + character/location/item 关联', async () => {
    const o = await outlines.create({
      projectId: 'p1', name: 'O', nodeType: 'chapter',
      involvedCharacters: ['c1'],
      involvedItems: ['i1'],
    } as any)
    expect((await outlines.getCharacterIds(o.id)).length).toBe(1)
    expect((await outlines.getItemIds(o.id)).length).toBe(1)

    await outlines.update(o.id, {
      involvedCharacters: ['c1', 'c2'],
      involvedLocations: ['l1'],
    } as any)
    expect((await outlines.getCharacterIds(o.id)).sort()).toEqual(['c1', 'c2'])
    expect((await outlines.getLocationIds(o.id))).toEqual(['l1'])
  })

  it('Outline: batch get 关联 IDs maps', async () => {
    const o1 = await outlines.create({
      projectId: 'p1', name: 'O1', nodeType: 'chapter',
      involvedCharacters: ['c1', 'c2'],
    } as any)
    const o2 = await outlines.create({
      projectId: 'p1', name: 'O2', nodeType: 'chapter',
      involvedCharacters: ['c2'],
    } as any)
    const map = await outlines.getCharacterIdsByOutlineIds([o1.id, o2.id])
    expect(map.get(o1.id)!.sort()).toEqual(['c1', 'c2'])
    expect(map.get(o2.id)).toEqual(['c2'])
  })
})
