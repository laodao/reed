/**
 * create-builtin-apps 迁移执行测试（内置高频应用：不做运行时种子、迁移直接 INSERT）
 * @module tests/migrations/create-builtin-apps
 * @description 真实 sqlite DataSource 执行：建三表 → 跑迁移 → 断言 24 工作流 + 24 应用
 *              + 3 默认模板资产落库、user_id=NULL + is_builtin=1、幂等重跑不重复。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { createWorkflowTables } from '@core/database/migrations/create-workflow-tables'
import { createAppsTables } from '@core/database/migrations/create-apps-tables'
import { createAssetsTables } from '@core/database/migrations/create-assets-tables'
import { createBuiltinApps } from '@core/database/migrations/create-builtin-apps'
import { addWorkflowTemplateVersion } from '@core/database/migrations/add-workflow-template-version'
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
  await addWorkflowTemplateVersion(ds)
  await createAppsTables(ds)
  await createAssetsTables(ds)
  await createBuiltinApps(ds)
})

afterAll(async () => {
  await ds.destroy()
})

describe('create-builtin-apps 迁移执行（真实 sqlite）', () => {
  it('插入 24 个内置工作流（user_id NULL + is_builtin=1 + published v1）', async () => {
    const rows = await ds.query(`SELECT id, name, user_id, is_builtin, published_version, draft_graph, published_graph FROM workflow_definitions WHERE is_builtin = 1`)
    expect(rows.length).toBe(24)
    for (const r of rows) {
      expect(r.user_id).toBeNull()
      expect(r.is_builtin).toBe(1)
      expect(r.published_version).toBe(1)
      expect(r.draft_graph).toBeTruthy()
      expect(r.published_graph).toBeTruthy()
    }
  })

  it('插入 24 个内置应用（user_id NULL + is_builtin=1 + 会话渠道开 + 启用）', async () => {
    const rows = await ds.query(`SELECT id, name, user_id, is_builtin, enabled, channel_session, channel_api, source_id FROM apps WHERE is_builtin = 1`)
    expect(rows.length).toBe(24)
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

  it('插入 3 个默认模板资产（template 大类 + 报告模板子分类）', async () => {
    const rows = await ds.query(`SELECT id, name, category, sub_category, is_builtin, kind FROM assets WHERE is_builtin = 1`)
    expect(rows.length).toBe(3)
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
    expect(defs[0].c).toBe(24)
    expect(apps[0].c).toBe(24)
    expect(tpls[0].c).toBe(3)
  })

  it('内置工作流名称带 [内置] 前缀、应用名称不带前缀', async () => {
    const defNames = await ds.query(`SELECT name FROM workflow_definitions WHERE is_builtin = 1`)
    const appNames = await ds.query(`SELECT name FROM apps WHERE is_builtin = 1`)
    for (const d of defNames) expect(d.name).toMatch(/^\[内置\]/)
    for (const a of appNames) expect(a.name).not.toMatch(/^\[内置\]/)
  })

  it('内置应用带分类与标签种子（视频文案提取 → 视频处理/视频,文案）', async () => {
    const rows = await ds.query(`SELECT id, category, tags FROM apps WHERE is_builtin = 1`)
    expect(rows.length).toBe(24)
    for (const r of rows) {
      expect(r.category).toBeTruthy()
      const tags = JSON.parse(r.tags)
      expect(Array.isArray(tags)).toBe(true)
      expect(tags.length).toBeGreaterThan(0)
    }
    const video = rows.find(r => r.id === 'builtin_app_video_transcript')
    expect(video.category).toBe('视频处理')
    expect(JSON.parse(video.tags)).toEqual(['视频', '文案'])
    const daily = rows.find(r => r.id === 'builtin_app_daily_news')
    expect(daily.category).toBe('新闻资讯')
  })

  it('内置应用 pinned 缺省为 0（固定到首页需用户主动操作）', async () => {
    const rows = await ds.query(`SELECT pinned FROM apps WHERE is_builtin = 1`)
    for (const r of rows) expect(r.pinned ?? 0).toBe(0)
  })

  it('内置定义写入 template_version=1（跟随模板）', async () => {
    const rows = await ds.query(`SELECT template_version FROM workflow_definitions WHERE is_builtin = 1`)
    expect(rows.length).toBe(24)
    for (const r of rows) expect(r.template_version).toBe(1)
  })

  it('用户接管（template_version=0）后，迁移不再覆盖内置定义内容', async () => {
    const defId = 'builtin_def_daily-news-brief' // defId = 前缀 + 文件名去 .json
    // 模拟用户修改内置工作流（保存草稿后 template_version 被 repository 置 0）
    await ds.query(
      `UPDATE workflow_definitions SET draft_graph = '{"version":1,"nodes":[],"edges":[]}', template_version = 0 WHERE id = '${defId}'`
    )
    // 迁移重跑：已接管的定义不被模板重置
    await createBuiltinApps(ds)
    const row = await ds.query(
      `SELECT draft_graph, template_version FROM workflow_definitions WHERE id = '${defId}'`
    )
    expect(row[0].template_version).toBe(0) // 仍是接管态
    expect(JSON.parse(row[0].draft_graph)).toEqual({ version: 1, nodes: [], edges: [] }) // 用户内容保留
    // 未接管的定义仍被同步（内容 = 模板）
    const untouched = await ds.query(
      `SELECT template_version FROM workflow_definitions WHERE id = 'builtin_def_industry-weekly'`
    )
    expect(untouched[0].template_version).toBe(1)
  })

  it('未接管的内置定义改名在迁移重跑时同步（如 实操研究→深度研究 升级）', async () => {
    const defId = 'builtin_def_topic-research'
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../../../src/core/database/migrations/builtin-apps/topic-research.json'), 'utf-8')) as { name?: string }
    // 先把行名改成旧值模拟"模板升级前已入库"的状态
    await ds.query(`UPDATE workflow_definitions SET name = '[内置] 旧名', template_version = 1 WHERE id = '${defId}'`)
    await createBuiltinApps(ds)
    const row = await ds.query(`SELECT name FROM workflow_definitions WHERE id = '${defId}'`)
    expect(row[0].name).toBe(raw.name ?? '[内置] 主题深度研究')
    // 未接管（template_version=0）的定义即使模板改名也不被覆盖
    await ds.query(`UPDATE workflow_definitions SET name = '[内置] 用户改过的名字', template_version = 0 WHERE id = '${defId}'`)
    await createBuiltinApps(ds)
    const row2 = await ds.query(`SELECT name FROM workflow_definitions WHERE id = '${defId}'`)
    expect(row2[0].name).toBe('[内置] 用户改过的名字')
  })

  it('吃瓜工作流支持多平台文章 + 多平台视频脚本（头条/视频平台循环）', async () => {
    const rows = await ds.query(`SELECT draft_graph FROM workflow_definitions WHERE id = 'builtin_def_gossip-event-report'`)
    const g = JSON.parse(rows[0].draft_graph)
    const start = g.nodes.find(n => n.id === 'start')
    const keys = start.config.inputs.map(i => i.key)
    expect(keys).toContain('videoPlatforms')
    const platforms = start.config.inputs.find(i => i.key === 'platforms')
    expect(platforms.options.map(o => o.value)).toEqual(['微信公众号', '今日头条', '小红书', '微博', '通用'])
    const vp = start.config.inputs.find(i => i.key === 'videoPlatforms')
    expect(vp.options.map(o => o.value)).toEqual(['抖音', 'B站', '快手', '视频号', 'YouTube'])
    const ids = g.nodes.map(n => n.id)
    expect(ids).toEqual(expect.arrayContaining(['loop3', 'scriptN', 'saveScriptN']))
    const copyN = g.nodes.find(n => n.id === 'copyN')
    expect(copyN.config.systemPrompt).toContain('今日头条')
    const scriptN = g.nodes.find(n => n.id === 'scriptN')
    expect(scriptN.config.systemPrompt).toContain('{{loop3.item}}')
    // 自媒体产出统一打「自媒体文案」tag
    for (const sid of ['save1', 'saveImg1', 'saveCopyN', 'saveScript1', 'saveScriptN']) {
      const sn = g.nodes.find(n => n.id === sid)
      expect(sn.config.tags).toContain('自媒体文案')
    }
    // 背景介绍 + 5 分钟时长支持
    const vd = start.config.inputs.find(i => i.key === 'videoDuration')
    expect(vd.options.map(o => o.value)).toContain(300)
    const analyze = g.nodes.find(n => n.id === 'analyze1')
    expect(analyze.config.systemPrompt).toContain('background')
    expect(analyze.config.prompt).toContain('background')
    const gen = g.nodes.find(n => n.id === 'gen1')
    expect(gen.config.systemPrompt).toContain('背景速览')
    for (const sid of ['script1', 'scriptN']) {
      const s = g.nodes.find(n => n.id === sid)
      expect(s.config.systemPrompt).toContain('背景铺垫')
      expect(s.config.systemPrompt).toContain('时长秒数×4')
    }
  })
})
