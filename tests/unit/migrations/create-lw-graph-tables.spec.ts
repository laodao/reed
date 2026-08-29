/**
 * createLwGraphTables 迁移测试
 * 覆盖：双表建表幂等、索引、lw_projects.wizard_state 列、character_relation 收编（幂等不重复）。
 */
import { describe, it, expect } from 'vitest'
import { DataSource } from 'typeorm'
import { createLwGraphTables } from '@core/database/migrations/create-lw-graph-tables'
import { LwEventEntity } from '@core/database/entities/lw-event.entity'
import { LwGraphEdgeEntity } from '@core/database/entities/lw-graph-edge.entity'

async function buildDs(legacyRelations = false): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [LwEventEntity, LwGraphEdgeEntity],
    synchronize: false,
  })
  await ds.initialize()
  if (legacyRelations) {
    // 老库：lw_character_relations 无 user_id 列 + lw_story_characters（收编 JOIN 需要）
    await ds.query(`CREATE TABLE lw_story_characters (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, name TEXT NOT NULL
    )`)
    await ds.query(`CREATE TABLE lw_character_relations (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      related_character_id TEXT NOT NULL,
      relation_type TEXT,
      relation_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)
  }
  return ds
}

async function tableNames(ds: DataSource): Promise<string[]> {
  const rows = await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table'`)
  return rows.map((r: any) => r.name)
}

async function indexNames(ds: DataSource): Promise<string[]> {
  const rows = await ds.query(`SELECT name FROM sqlite_master WHERE type = 'index'`)
  return rows.map((r: any) => r.name)
}

describe('createLwGraphTables 迁移', () => {
  it('新库建 lw_events + lw_graph_edges 表（含索引），重跑幂等', async () => {
    const ds = await buildDs()
    await createLwGraphTables(ds)
    await createLwGraphTables(ds) // 幂等重跑

    const tables = await tableNames(ds)
    expect(tables).toContain('lw_events')
    expect(tables).toContain('lw_graph_edges')

    const indexes = await indexNames(ds)
    expect(indexes).toContain('idx_lw_events_project_id')
    expect(indexes).toContain('idx_lw_events_chapter')
    expect(indexes).toContain('idx_lw_graph_edges_source')
    expect(indexes).toContain('idx_lw_graph_edges_target')
    expect(indexes).toContain('idx_lw_graph_edges_relation')

    // lw_events 列结构
    const eventCols = (await ds.query(`SELECT name FROM pragma_table_info('lw_events')`)).map((r: any) => r.name)
    expect(eventCols).toEqual(expect.arrayContaining(['id', 'user_id', 'project_id', 'name', 'description', 'chapter_number', 'story_time', 'involved_entities', 'state_before', 'state_after', 'created_at', 'updated_at']))

    // lw_graph_edges 列结构（含时间线字段）
    const edgeCols = (await ds.query(`SELECT name FROM pragma_table_info('lw_graph_edges')`)).map((r: any) => r.name)
    expect(edgeCols).toEqual(expect.arrayContaining(['id', 'user_id', 'project_id', 'source_type', 'source_id', 'target_type', 'target_id', 'relation_type', 'label', 'valid_from_chapter', 'valid_until_chapter', 'description']))

    await ds.destroy()
  })

  it('lw_projects 补 wizard_state 列（老库幂等）', async () => {
    const ds = await buildDs()
    await ds.query(`CREATE TABLE lw_projects (
      id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, type TEXT NOT NULL,
      stage TEXT NOT NULL, progress INTEGER DEFAULT 0,
      created_at DATETIME, updated_at DATETIME
    )`)
    await createLwGraphTables(ds)
    const cols = (await ds.query(`SELECT name FROM pragma_table_info('lw_projects')`)).map((r: any) => r.name)
    expect(cols).toContain('wizard_state')
    await createLwGraphTables(ds) // 幂等
    await ds.destroy()
  })

  it('character_relation 收编：写入 lw_graph_edges（project_id 反查、valid_from=1），重跑不重复', async () => {
    const ds = await buildDs(true)
    // 老数据：两个角色 + 一条关系
    await ds.query(`INSERT INTO lw_story_characters (id, user_id, project_id, name) VALUES ('c1', NULL, 'p1', '林晓'), ('c2', NULL, 'p1', '顾言')`)
    await ds.query(`INSERT INTO lw_character_relations (id, character_id, related_character_id, relation_type, relation_description) VALUES ('r1', 'c1', 'c2', '师徒', '林晓师从顾言')`)

    await createLwGraphTables(ds)
    const rows1 = await ds.query(`SELECT source_type, source_id, target_type, target_id, relation_type, label, valid_from_chapter, project_id, user_id FROM lw_graph_edges`)
    expect(rows1).toHaveLength(1)
    expect(rows1[0]).toMatchObject({
      source_type: 'character',
      source_id: 'c1',
      target_type: 'character',
      target_id: 'c2',
      relation_type: '师徒',
      label: '师徒',
      valid_from_chapter: 1,
      project_id: 'p1',
      user_id: null,
    })

    // 幂等：重跑不重复插入
    await createLwGraphTables(ds)
    const rows2 = await ds.query(`SELECT COUNT(*) as c FROM lw_graph_edges`)
    expect(Number(rows2[0].c)).toBe(1)

    // 原表保留（兼容旧读接口）
    const legacy = await ds.query(`SELECT COUNT(*) as c FROM lw_character_relations`)
    expect(Number(legacy[0].c)).toBe(1)

    await ds.destroy()
  })

  it('lw_design_messages 老库补 metadata 列（幂等）', async () => {
    const ds = await buildDs(false)
    // 老库：对话容器 + 消息表（无 metadata 列）
    await ds.query(`CREATE TABLE lw_design_conversations (
      id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, stage TEXT NOT NULL,
      messages TEXT, created_at DATETIME, updated_at DATETIME
    )`)
    await ds.query(`CREATE TABLE lw_design_messages (
      id TEXT PRIMARY KEY, user_id TEXT, conversation_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, timestamp INTEGER, sort_order INTEGER DEFAULT 0
    )`)
    await createLwGraphTables(ds)
    const cols = (await ds.query(`SELECT name FROM pragma_table_info('lw_design_messages')`)).map((r: any) => r.name)
    expect(cols).toContain('metadata')
    await createLwGraphTables(ds) // 幂等重跑
    await ds.destroy()
  })

  it('无老表时不报错（干净库直接跑）', async () => {
    const ds = await buildDs(false)
    await createLwGraphTables(ds)
    const tables = await tableNames(ds)
    expect(tables).toContain('lw_events')
    await ds.destroy()
  })

  it('评审#64：迁移行带角色归属 user_id；源表重复行不撞主键', async () => {
    const ds = await buildDs(true)
    // 角色行带 user_id（归属者），关系表插入重复行（同 character+related+relation_type）
    await ds.query(`INSERT INTO lw_story_characters (id, user_id, project_id, name) VALUES ('c9', 'user-x', 'proj-x', '测试角色'), ('c8', 'user-x', 'proj-x', '对手')`)
    await ds.query(`INSERT INTO lw_character_relations (id, character_id, related_character_id, relation_type, relation_description) VALUES ('rel-a', 'c9', 'c8', 'ally', '盟友')`)
    await ds.query(`INSERT INTO lw_character_relations (id, character_id, related_character_id, relation_type, relation_description) VALUES ('rel-b', 'c9', 'c8', 'ally', '盟友(重复行)')`)
    // 迁移不抛错（内部重复被 GROUP BY 收敛，确定性 id 不再撞主键）
    await createLwGraphTables(ds)
    const rows = await ds.query(`SELECT user_id, source_id, target_id FROM lw_graph_edges WHERE id = 'edge_migrated_c9_c8_ally'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe('user-x')
    expect(rows[0].source_id).toBe('c9')
    await ds.destroy()
  })
})
