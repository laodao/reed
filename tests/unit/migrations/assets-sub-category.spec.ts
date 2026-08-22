/**
 * 通用资产库 subCategory 细化测试（内置应用模板资产/资产中心二级分类）
 * @module tests/migrations/assets-sub-category
 * @description 验证 createAssetsTables 迁移：新库 CREATE TABLE 含 sub_category 列、
 *              幂等补列逻辑存在（老库 ALTER）；以及 asset.types 的 template 大类。
 *              注：真实 sqlite DataSource 测试依赖 better-sqlite3 native ABI
 *              （Electron 编译 119 vs Node 127），在本 CI 环境不可用，
 *              仓库读写逻辑由 tsc + 端到端验证覆盖。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS, type AssetRecord, type SaveAssetInput } from '@shared/types/asset.types'

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
  const source = readFileSync(resolve(__dirname, '../../../src/core/database/migrations/create-assets-tables.ts'), 'utf-8')

  it('CREATE TABLE assets 含 sub_category 列', () => {
    expect(source).toMatch(/sub_category\s+\$\{vc\}/)
    expect(source).toMatch(/CREATE TABLE assets[\s\S]*?sub_category/)
  })

  it('老库幂等补列（ensureColumn 调用）', () => {
    expect(source).toContain('ensureColumn(ds, \'assets\', \'sub_category\'')
  })

  it('sub_category 索引', () => {
    expect(source).toContain('idx_assets_sub_category')
  })
})
