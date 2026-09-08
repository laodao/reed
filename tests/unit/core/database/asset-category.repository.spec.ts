/**
 * 资产分类定义仓库测试
 * @module tests/core/database/asset-category.repository
 * @description 真实 sqlite：CRUD、JSON 数组列序列化还原、排序、内置禁删。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { createAssetCategories } from '@core/database/migrations/create-asset-categories'
import { AssetCategoryEntity } from '@core/database/entities/asset-category.entity'
import { AssetCategoryRepository } from '@core/database/repositories/asset-category.repository'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [AssetCategoryEntity], synchronize: false })
  await ds.initialize()
  await createAssetCategories(ds)
  return ds
}

describe('AssetCategoryRepository', () => {
  let ds: DataSource
  let repo: AssetCategoryRepository

  beforeEach(async () => {
    ds = await buildDs()
    repo = new AssetCategoryRepository(ds)
  })
  afterEach(async () => {
    await ds.destroy()
  })

  it('create 写入，toDto 还原（JSON 数组列 → 数组）', async () => {
    const rec = await repo.create({
      name: '产品周报',
      code: 'product_weekly',
      allowedKinds: ['text', 'file'],
      allowedCategories: ['text', 'image'],
      previewable: true,
      previewMode: 'report',
      previewTemplateId: 'industryWeekly',
      sortOrder: 5,
    })
    expect(rec.name).toBe('产品周报')
    expect(rec.allowedKinds).toEqual(['text', 'file'])
    expect(rec.allowedCategories).toEqual(['text', 'image'])
    expect(rec.previewMode).toBe('report')
    expect(rec.previewTemplateId).toBe('industryWeekly')
    expect(rec.isBuiltin).toBe(false)
    const got = await repo.findById(rec.id)
    expect(got?.allowedKinds).toEqual(['text', 'file'])
  })

  it('缺省 previewable=true、previewMode=auto、allowedKinds=[]（不限）', async () => {
    const rec = await repo.create({ name: '自由分类' })
    expect(rec.previewable).toBe(true)
    expect(rec.previewMode).toBe('auto')
    expect(rec.allowedKinds).toEqual([])
    expect(rec.allowedCategories).toEqual([])
  })

  it('listAll 按 sortOrder,name 排序且含内置', async () => {
    await repo.create({ name: '自定义分类', sortOrder: 999 })
    const all = await repo.listAll()
    expect(all.length).toBe(12) // 11 内置（含网页收藏）+ 1 自定义
    expect(all[0].name).toBe('早报')
    expect(all[all.length - 1].name).toBe('自定义分类')
  })

  it('findByName 命中/未命中', async () => {
    const hit = await repo.findByName('行业周报')
    expect(hit?.previewMode).toBe('report')
    expect(hit?.previewTemplateId).toBe('industryWeekly')
    expect(await repo.findByName('不存在')).toBeNull()
  })

  it('update 修改定义字段', async () => {
    const rec = await repo.create({ name: '旧名', previewMode: 'text' })
    const upd = await repo.update(rec.id, { name: '新名', previewMode: 'report', previewTemplateId: 'morningReport', allowedKinds: ['text'] })
    expect(upd?.name).toBe('新名')
    expect(upd?.previewMode).toBe('report')
    expect(upd?.previewTemplateId).toBe('morningReport')
    expect(upd?.allowedKinds).toEqual(['text'])
    expect(await repo.findByName('旧名')).toBeNull()
  })

  it('内置分类禁删；自有分类可删', async () => {
    const builtin = await repo.findByName('早报')
    expect(builtin?.isBuiltin).toBe(true)
    expect(await repo.delete(builtin!.id)).toBe(0)
    expect(await repo.findByName('早报')).not.toBeNull()

    const mine = await repo.create({ name: '我的分类' })
    expect(await repo.delete(mine.id)).toBe(1)
    expect(await repo.findById(mine.id)).toBeNull()
  })
})
