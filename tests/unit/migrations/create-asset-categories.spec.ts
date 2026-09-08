/**
 * 资产分类定义迁移测试（asset_categories 表）
 * @module tests/migrations/create-asset-categories
 * @description 真实 sqlite DataSource 执行：新库建表、老库补列、内置分类种子幂等插入/更新。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { createAssetCategories } from '@core/database/migrations/create-asset-categories'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], synchronize: false })
  await ds.initialize()
  return ds
}

async function columnsOf(ds: DataSource, table: string): Promise<string[]> {
  const rows = (await ds.query(`SELECT name FROM pragma_table_info('${table}')`)) as Array<{ name: string }>
  return rows.map(r => r.name)
}

describe('createAssetCategories 迁移', () => {
  let ds: DataSource
  beforeEach(async () => {
    ds = await buildDs()
  })
  afterEach(async () => {
    await ds.destroy()
  })

  it('新库建表：全部定义列齐全', async () => {
    await createAssetCategories(ds)
    const cols = await columnsOf(ds, 'asset_categories')
    for (const c of ['id', 'name', 'code', 'allowed_kinds', 'allowed_categories', 'previewable', 'preview_mode', 'preview_template_id', 'sort_order', 'is_builtin', 'created_at', 'updated_at']) {
      expect(cols).toContain(c)
    }
  })

  it('重跑幂等不报错', async () => {
    await createAssetCategories(ds)
    await createAssetCategories(ds)
  })

  it('内置种子：11 个业务分类，早报=report+morningReport，行业周报=report+industryWeekly，吃瓜报告=report+gossipTabloid，网页收藏=html', async () => {
    await createAssetCategories(ds)
    const rows = (await ds.query(`SELECT name, preview_mode, preview_template_id, is_builtin, sort_order FROM asset_categories ORDER BY sort_order`)) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(11)
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))
    expect(byName['早报']).toMatchObject({ preview_mode: 'report', preview_template_id: 'morningReport', is_builtin: 1 })
    expect(byName['行业周报']).toMatchObject({ preview_mode: 'report', preview_template_id: 'industryWeekly' })
    expect(byName['吃瓜报告']).toMatchObject({ preview_mode: 'report', preview_template_id: 'gossipTabloid' })
    expect(byName['报告模板']).toMatchObject({ preview_mode: 'markdown' })
    expect(byName['视频文案']).toMatchObject({ preview_mode: 'markdown' })
    expect(byName['文案']).toMatchObject({ preview_mode: 'markdown' })
    expect(byName['网页摘要']).toMatchObject({ preview_mode: 'markdown' })
    expect(byName['网页转写']).toMatchObject({ preview_mode: 'markdown' })
    expect(byName['图文卡片']).toMatchObject({ preview_mode: 'markdown' })
    expect(byName['润色稿']).toMatchObject({ preview_mode: 'markdown' })
    expect(byName['网页收藏']).toMatchObject({ preview_mode: 'html', is_builtin: 1 })
  })

  it('内置分类网页收藏：allowed_kinds=["file","text"]、allowed_categories=["document","text"]', async () => {
    await createAssetCategories(ds)
    const row = (await ds.query(`SELECT allowed_kinds, allowed_categories FROM asset_categories WHERE name = '网页收藏'`))[0] as { allowed_kinds: string; allowed_categories: string }
    expect(JSON.parse(row.allowed_kinds)).toEqual(['file', 'text'])
    expect(JSON.parse(row.allowed_categories)).toEqual(['document', 'text'])
  })

  it('内置分类 allowed_kinds 存 JSON 数组 ["text"]', async () => {
    await createAssetCategories(ds)
    const row = (await ds.query(`SELECT allowed_kinds FROM asset_categories WHERE name = '早报'`))[0] as { allowed_kinds: string }
    expect(JSON.parse(row.allowed_kinds)).toEqual(['text'])
  })

  it('已存在同名分类时更新定义而非重复插入（幂等）', async () => {
    await createAssetCategories(ds)
    // 用户把「早报」改成了自定义预览模式
    await ds.query(`UPDATE asset_categories SET preview_mode = 'text' WHERE name = '早报'`)
    await createAssetCategories(ds)
    const rows = (await ds.query(`SELECT preview_mode FROM asset_categories WHERE name = '早报'`)) as Array<{ preview_mode: string }>
    expect(rows).toHaveLength(1)
    // 迁移会把定义同步回内置版（早报应回到 report 渲染长图）
    expect(rows[0].preview_mode).toBe('report')
    const total = (await ds.query(`SELECT COUNT(*) AS c FROM asset_categories`))[0] as { c: number }
    expect(Number(total.c)).toBe(11)
  })

  it('name 唯一索引存在', async () => {
    await createAssetCategories(ds)
    const idx = (await ds.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'asset_categories' AND name = 'idx_asset_categories_name'`)) as Array<{ name: string }>
    expect(idx.length).toBe(1)
  })
})
