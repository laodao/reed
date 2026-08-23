/**
 * 通用资产库 subCategory 细化测试（内置应用模板资产/资产中心二级分类）
 * @module tests/migrations/assets-sub-category
 * @description 真实 sqlite DataSource 执行：建表含 sub_category、老库幂等补列、
 *              AssetRepository subCategory 读写/筛选/统计、内置资产合并查询与禁删。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { createAssetsTables } from '@core/database/migrations/create-assets-tables'
import { AssetEntity } from '@core/database/entities/asset.entity'
import { AssetRepository } from '@core/database/repositories/asset.repository'
import { runWithUserAsync } from '@core/context/user-context'
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS, type AssetRecord, type SaveAssetInput } from '@shared/types/asset.types'

async function buildDs(legacy = false): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [AssetEntity], synchronize: false })
  await ds.initialize()
  if (legacy) {
    // 老库：无 sub_category / is_builtin 列
    await ds.query(`CREATE TABLE assets (
      id TEXT PRIMARY KEY, user_id TEXT, category TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT, tags TEXT, kind TEXT NOT NULL, storage_path TEXT, url TEXT,
      text_content TEXT, json_content TEXT, mime_type TEXT, size_bytes INTEGER,
      metadata TEXT, source_type TEXT, source_ref TEXT, created_at DATETIME, updated_at DATETIME
    )`)
  }
  return ds
}

describe('ASSET_CATEGORIES 增加 template 大类', () => {
  it('template 存在且标签为「模板」', () => {
    expect(ASSET_CATEGORIES.template).toBe('template')
    expect(ASSET_CATEGORY_LABELS.template).toBe('模板')
  })

  it('AssetRecord 与 SaveAssetInput 支持 subCategory', () => {
    const rec: AssetRecord = {
      id: 'a1', userId: null, category: 'template', subCategory: '报告模板',
      name: '早报模板', tags: [], kind: 'text', textContent: '# x', createdAt: '', updatedAt: '',
    }
    expect(rec.subCategory).toBe('报告模板')
    const input: SaveAssetInput = { category: 'template', subCategory: '报告模板', content: { kind: 'text', text: '# x' } }
    expect(input.subCategory).toBe('报告模板')
  })
})

describe('createAssetsTables 迁移（sub_category 列）', () => {
  it('新库建表含 sub_category 列', async () => {
    const ds = await buildDs()
    await createAssetsTables(ds)
    const cols = (await ds.query(`SELECT name FROM pragma_table_info('assets')`)).map((r: any) => r.name)
    expect(cols).toContain('sub_category')
    await ds.destroy()
  })

  it('老库幂等补列且重跑不报错', async () => {
    const ds = await buildDs(true)
    await createAssetsTables(ds)
    const cols = (await ds.query(`SELECT name FROM pragma_table_info('assets')`)).map((r: any) => r.name)
    expect(cols).toContain('sub_category')
    await createAssetsTables(ds) // 幂等
    await ds.destroy()
  })
})

describe('AssetRepository subCategory（真实 sqlite）', () => {
  let ds: DataSource
  let repo: AssetRepository

  beforeEach(async () => {
    ds = await buildDs()
    await createAssetsTables(ds)
    // is_builtin 列由 create-builtin-apps 迁移补（本测试聚焦 subCategory，手动补齐）
    await ds.query(`ALTER TABLE assets ADD COLUMN is_builtin INTEGER DEFAULT 0`)
    repo = new AssetRepository(ds)
  })

  afterEach(async () => {
    await ds.destroy()
  })

  it('create 写入 subCategory，toDto 还原', async () => {
    const rec = await repo.create({
      category: 'template',
      subCategory: '报告模板',
      name: '早报模板',
      kind: 'text',
      textContent: '# {{topics}} 早报\n\n{{llm1.content}}',
    })
    expect(rec.subCategory).toBe('报告模板')
    const got = await repo.findById(rec.id)
    expect(got?.subCategory).toBe('报告模板')
    expect(got?.category).toBe('template')
  })

  it('listAsset 支持 subCategory 筛选', async () => {
    await repo.create({ category: 'template', subCategory: '报告模板', name: 'A', kind: 'text' })
    await repo.create({ category: 'template', subCategory: '报告模板', name: 'B', kind: 'text' })
    await repo.create({ category: 'template', subCategory: '其他', name: 'C', kind: 'text' })
    const r1 = await repo.listAsset({ category: 'template', subCategory: '报告模板', page: 1, pageSize: 20 })
    expect(r1.total).toBe(2)
    const r2 = await repo.listAsset({ category: 'template', page: 1, pageSize: 20 })
    expect(r2.total).toBe(3)
    await repo.update(r1.items[0].id, { subCategory: '已归档' })
    const r3 = await repo.listAsset({ category: 'template', subCategory: '报告模板', page: 1, pageSize: 20 })
    expect(r3.total).toBe(1)
  })

  it('countBySubCategory 分组计数', async () => {
    await repo.create({ category: 'template', subCategory: '报告模板', name: 'A', kind: 'text' })
    await repo.create({ category: 'template', subCategory: '报告模板', name: 'B', kind: 'text' })
    await repo.create({ category: 'template', subCategory: '海报模板', name: 'C', kind: 'text' })
    await repo.create({ category: 'image', subCategory: '项目图', name: 'D', kind: 'file', storagePath: 'x.png' })
    const stats = await repo.countBySubCategory('template')
    const bySub = Object.fromEntries(stats.map(s => [s.subCategory ?? '(未分组)', s.count]))
    expect(bySub['报告模板']).toBe(2)
    expect(bySub['海报模板']).toBe(1)
  })

  it('listAsset 按创建时间降序（最新资产在前，含内置稳定次级）', async () => {
    const a = await repo.create({ category: 'text', name: '最早', kind: 'text' })
    const b = await repo.create({ category: 'text', name: '中间', kind: 'text' })
    const c = await repo.create({ category: 'text', name: '最新', kind: 'text' })
    void a; void b
    // 模拟 c 稍后创建
    await ds.query(`UPDATE assets SET created_at = datetime('now', '+1 minute') WHERE id = '${c.id}'`)
    const r = await repo.listAsset({ page: 1, pageSize: 20 })
    expect(r.items.map(i => i.name)).toEqual(['最新', '中间', '最早'])
  })

  it('内置资产（is_builtin=1, user_id=NULL）对任意用户可见且禁删', async () => {
    // 模拟内置资产（迁移插入的行）
    await ds.query(
      `INSERT INTO assets (id, user_id, category, sub_category, name, kind, text_content, source_type, is_builtin, created_at, updated_at)
       VALUES ('builtin_tpl_1', NULL, 'template', '报告模板', '内置模板', 'text', '# 模板', 'builtin', 1, datetime('now'), datetime('now'))`
    )
    await runWithUserAsync('user-A', async () => {
      const got = await repo.findById('builtin_tpl_1')
      expect(got?.isBuiltin).toBe(true)
      expect(got?.name).toBe('内置模板')
      // 禁删
      const del = await repo.delete('builtin_tpl_1')
      expect(del).toBe(0)
      const still = await repo.findById('builtin_tpl_1')
      expect(still).not.toBeNull()
      // 列表合并（内置 + 自有）
      const list = await repo.listAsset({ page: 1, pageSize: 50 })
      expect(list.items.some(a => a.id === 'builtin_tpl_1')).toBe(true)
    })
  })
})
