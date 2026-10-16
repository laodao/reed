/**
 * 工作流定义仓库排序测试（统一时间降序）
 * @module tests/core/database/workflow-definition.repository
 * @description 真实 sqlite：列表按 updated_at 降序（最近更新的工作流在前），
 *              内置工作流不再强制靠前（时间降序为主序，id 稳定次级）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { createWorkflowTables } from '@core/database/migrations/create-workflow-tables'
import { addWorkflowShareToken } from '@core/database/migrations/add-workflow-share-token'
import { addWorkflowTemplateVersion } from '@core/database/migrations/add-workflow-template-version'
import { createWorkflowDefinitionVersionsTable } from '@core/database/migrations/create-workflow-definition-versions'
import { WorkflowDefinitionEntity } from '@core/database/entities/workflow-definition.entity'
import { WorkflowDefinitionVersionEntity } from '@core/database/entities/workflow-definition-version.entity'
import { WorkflowDefinitionRepository } from '@core/database/repositories/workflow-definition.repository'
import { runWithUserAsync } from '@core/context/user-context'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [WorkflowDefinitionEntity, WorkflowDefinitionVersionEntity], synchronize: false })
  await ds.initialize()
  await createWorkflowTables(ds)
  await addWorkflowShareToken(ds)
  const cols = (await ds.query(`SELECT name FROM pragma_table_info('workflow_definitions')`)).map((r: { name: string }) => r.name)
  if (!cols.includes('is_builtin')) {
    await ds.query(`ALTER TABLE workflow_definitions ADD COLUMN is_builtin INTEGER DEFAULT 0`)
  }
  if (!cols.includes('template_version')) {
    await ds.query(`ALTER TABLE workflow_definitions ADD COLUMN template_version INTEGER DEFAULT 0`)
  }
  await createWorkflowDefinitionVersionsTable(ds)
  return ds
}

/** 插工作流行（简化列）：userId 传 'user-1' 表示用户自有，内置传 NULL + isBuiltin=1；timeExpr 为 SQL 表达式片段（同时用于 created_at 与 updated_at） */
async function insertDef(ds: DataSource, id: string, name: string, timeExpr: string, userId: string | null = 'user-1', isBuiltin = 0, over: Record<string, unknown> = {}): Promise<void> {
  const userSql = userId === null ? 'NULL' : `'${userId}'`
  const pubAt = over.publishedAt ? `'${over.publishedAt}'` : 'NULL'
  const lastRun = over.lastRunAt ? `'${over.lastRunAt}'` : 'NULL'
  await ds.query(
    `INSERT INTO workflow_definitions (id, user_id, name, description, category, draft_graph, published_graph, published_version, is_builtin, created_at, updated_at, published_at, last_run_at)
     VALUES ('${id}', ${userSql}, '${name}', '', 'test', '{}', '{}', 1, ${isBuiltin}, ${timeExpr}, ${timeExpr}, ${pubAt}, ${lastRun})`
  )
}

/** 相对当前时刻的 SQLite datetime 偏移（格式与迁移写入一致，保证字典序=时间序） */
function minutesAgo(min: number): string {
  return `datetime('now', '-${min} minutes')`
}

describe('WorkflowDefinitionRepository.list 排序（时间降序）', () => {
  let ds: DataSource
  let repo: WorkflowDefinitionRepository

  beforeEach(async () => {
    ds = await buildDs()
    repo = new WorkflowDefinitionRepository(ds)
  })
  afterEach(async () => {
    await ds.destroy()
  })

  it('默认按创建时间降序（列表默认排序）', async () => {
    await runWithUserAsync('user-1', async () => {
      await insertDef(ds, 'def-old', '旧工作流', minutesAgo(5))
      await insertDef(ds, 'def-new', '新工作流', minutesAgo(1))
      const { items } = await repo.list({ page: 1, pageSize: 20 })
      expect(items.map(d => d.name)).toEqual(['新工作流', '旧工作流'])
    })
  })

  it('内置工作流不强制靠前：整体按创建时间降序', async () => {
    await runWithUserAsync('user-1', async () => {
      // 内置工作流创建较早（时间在前），用户工作流创建较晚（时间在后）
      await insertDef(ds, 'builtin_workflow_x', '内置工作流', minutesAgo(10), null, 1)
      await insertDef(ds, 'def-user', '用户工作流', minutesAgo(2))
      const { items } = await repo.list({ page: 1, pageSize: 20 })
      expect(items.map(d => d.name)).toEqual(['用户工作流', '内置工作流'])
    })
  })

  it('sortBy 切换排序字段：发布时间 / 最近运行；升序方向生效', async () => {
    await runWithUserAsync('user-1', async () => {
      // A：发布早，未运行；B：发布晚、最近运行晚；C：未发布、最近运行早
      await insertDef(ds, 'def-a', 'A', minutesAgo(10), 'user-1', 0, { publishedAt: '2026-01-02 00:00:00' })
      await insertDef(ds, 'def-b', 'B', minutesAgo(9), 'user-1', 0, { publishedAt: '2026-01-05 00:00:00', lastRunAt: '2026-01-06 00:00:00' })
      await insertDef(ds, 'def-c', 'C', minutesAgo(8), 'user-1', 0, { lastRunAt: '2026-01-01 00:00:00' })
      // 按发布时间降序：B(01-05) → A(01-02) → C(未发布 NULL 最后)
      const byPubDesc = await repo.list({ page: 1, pageSize: 20, sortBy: 'publishedAt', sortOrder: 'desc' })
      expect(byPubDesc.items.map(d => d.name)).toEqual(['B', 'A', 'C'])
      // 升序：C(未发布 NULL 最前) → A → B
      const byPubAsc = await repo.list({ page: 1, pageSize: 20, sortBy: 'publishedAt', sortOrder: 'asc' })
      expect(byPubAsc.items.map(d => d.name)).toEqual(['C', 'A', 'B'])
      // 最近运行降序：B(01-06) → C(01-01) → A(未运行 NULL 最后)
      const byRunDesc = await repo.list({ page: 1, pageSize: 20, sortBy: 'lastRunAt', sortOrder: 'desc' })
      expect(byRunDesc.items.map(d => d.name)).toEqual(['B', 'C', 'A'])
      // 升序：A(未运行 NULL 最前) → C → B
      const byRunAsc = await repo.list({ page: 1, pageSize: 20, sortBy: 'lastRunAt', sortOrder: 'asc' })
      expect(byRunAsc.items.map(d => d.name)).toEqual(['A', 'C', 'B'])
    })
  })

  it('内置定义（user_id=NULL）允许修改：改图/名称生效，且标记已接管（template_version=0）', async () => {
    await runWithUserAsync('user-1', async () => {
      await insertDef(ds, 'builtin_def_x', '内置定义', minutesAgo(10), null, 1)
      // 内置模板版本初始为 1（跟随模板）
      await ds.query(`UPDATE workflow_definitions SET template_version = 1 WHERE id = 'builtin_def_x'`)
      // 名称修改（不动图）→ 不触发接管标记
      const renamed = await repo.update('builtin_def_x', { name: '内置改名' })
      expect(renamed?.name).toBe('内置改名')
      expect(renamed?.templateVersion).toBe(1)
      // 保存草稿（改图）→ 生效 + 标记已接管（template_version=0，迁移不再覆盖）
      const saved = await repo.update('builtin_def_x', { draftGraph: { version: 1, nodes: [], edges: [] } })
      expect(saved?.draftGraph).toEqual({ version: 1, nodes: [], edges: [] })
      expect(saved?.templateVersion).toBe(0)
    })
  })

  it('版本历史：createVersion / listVersions（降序）/ getVersion', async () => {
    await runWithUserAsync('user-1', async () => {
      await insertDef(ds, 'def_v', '带版本的工作流', minutesAgo(5))
      const graph = { version: 1, nodes: [{ id: 'start', type: 'start', name: '开始', position: { x: 0, y: 0 }, config: {} }], edges: [] }
      const v1 = await repo.createVersion({
        definitionId: 'def_v', version: 1, name: '工作流', description: null, category: 'test',
        graph, triggers: [], settings: null, createdBy: 'user-1',
      })
      await repo.createVersion({
        definitionId: 'def_v', version: 2, name: '工作流 v2', description: null, category: 'test',
        graph: { ...graph, nodes: [...graph.nodes, { id: 'end', type: 'end', name: '结束', position: { x: 100, y: 0 }, config: {} }] },
        triggers: [], settings: null, createdBy: 'user-1',
      })
      const list = await repo.listVersions('def_v')
      expect(list.map(v => v.version)).toEqual([2, 1]) // 降序
      expect(list[1].graph.nodes).toHaveLength(1)
      const got = await repo.getVersion(v1.id)
      expect(got?.version).toBe(1)
      expect(got?.graph.nodes[0].id).toBe('start')
      // 定义不可见（其他用户）→ 空列表
      await runWithUserAsync('user-2', async () => {
        expect(await repo.listVersions('def_v')).toEqual([])
      })
    })
  })
})
