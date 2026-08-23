/**
 * create-builtin-apps 迁移执行测试（内置高频应用：不做运行时种子、迁移直接 INSERT）
 * @module tests/migrations/create-builtin-apps
 * @description 真实 sqlite DataSource 执行：建三表 → 跑迁移 → 断言 8 工作流 + 8 应用
 *              + 2 默认模板资产落库、user_id=NULL + is_builtin=1、幂等重跑不重复。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import { createWorkflowTables } from '@core/database/migrations/create-workflow-tables'
import { createAppsTables } from '@core/database/migrations/create-apps-tables'
import { createAssetsTables } from '@core/database/migrations/create-assets-tables'
import { createBuiltinApps } from '@core/database/migrations/create-builtin-apps'
import { WorkflowDefinitionEntity } from '@core/database/entities/workflow-definition.entity'
import { AppEntity } from '@core/database/entities/app.entity'
import { AssetEntity } from '@core/database/entities/asset.entity'

let ds: DataSource

beforeAll(async () => {
  ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [WorkflowDefinitionEntity, AppEntity, AssetEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createWorkflowTables(ds)
  await createAppsTables(ds)
  await createAssetsTables(ds)
  await createBuiltinApps(ds)
})

afterAll(async () => {
  await ds.destroy()
})

describe('create-builtin-apps 迁移执行（真实 sqlite）', () => {
  it('插入 8 个内置工作流（user_id NULL + is_builtin=1 + published v1）', async () => {
    const rows = await ds.query(`SELECT id, name, user_id, is_builtin, published_version, draft_graph, published_graph FROM workflow_definitions WHERE is_builtin = 1`)
    expect(rows.length).toBe(8)
    for (const r of rows) {
      expect(r.user_id).toBeNull()
      expect(r.is_builtin).toBe(1)
      expect(r.published_version).toBe(1)
      expect(r.draft_graph).toBeTruthy()
      expect(r.published_graph).toBeTruthy()
    }
  })

  it('插入 8 个内置应用（user_id NULL + is_builtin=1 + 会话渠道开 + 启用）', async () => {
    const rows = await ds.query(`SELECT id, name, user_id, is_builtin, enabled, channel_session, channel_api, source_id FROM apps WHERE is_builtin = 1`)
    expect(rows.length).toBe(8)
    for (const r of rows) {
      expect(r.user_id).toBeNull()
      expect(r.is_builtin).toBe(1)
      expect(r.enabled).toBe(1)
      expect(r.channel_session).toBe(1)
      expect(r.channel_api).toBe(0)
      expect(r.source_id).toMatch(/^builtin_def_/)
    }
    // 应用 source_id 都能找到对应工作流
    for (const r of rows) {
      const def = await ds.query(`SELECT 1 FROM workflow_definitions WHERE id = ?`, [r.source_id])
      expect(def.length).toBe(1)
    }
  })

  it('插入 2 个默认模板资产（template 大类 + 报告模板子分类）', async () => {
    const rows = await ds.query(`SELECT id, name, category, sub_category, is_builtin, kind FROM assets WHERE is_builtin = 1`)
    expect(rows.length).toBe(2)
    for (const r of rows) {
      expect(r.category).toBe('template')
      expect(r.sub_category).toBe('报告模板')
      expect(r.is_builtin).toBe(1)
      expect(r.kind).toBe('text')
    }
  })

  it('幂等：重跑不重复插入', async () => {
    await createBuiltinApps(ds)
    const defs = await ds.query(`SELECT count(*) c FROM workflow_definitions WHERE is_builtin = 1`)
    const apps = await ds.query(`SELECT count(*) c FROM apps WHERE is_builtin = 1`)
    const tpls = await ds.query(`SELECT count(*) c FROM assets WHERE is_builtin = 1`)
    expect(defs[0].c).toBe(8)
    expect(apps[0].c).toBe(8)
    expect(tpls[0].c).toBe(2)
  })

  it('内置工作流名称带 [内置] 前缀、应用名称不带前缀', async () => {
    const defNames = await ds.query(`SELECT name FROM workflow_definitions WHERE is_builtin = 1`)
    const appNames = await ds.query(`SELECT name FROM apps WHERE is_builtin = 1`)
    for (const d of defNames) expect(d.name).toMatch(/^\[内置\]/)
    for (const a of appNames) expect(a.name).not.toMatch(/^\[内置\]/)
  })
})
