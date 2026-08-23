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
import { WorkflowDefinitionEntity } from '@core/database/entities/workflow-definition.entity'
import { WorkflowDefinitionRepository } from '@core/database/repositories/workflow-definition.repository'
import { runWithUserAsync } from '@core/context/user-context'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [WorkflowDefinitionEntity], synchronize: false })
  await ds.initialize()
  await createWorkflowTables(ds)
  await addWorkflowShareToken(ds)
  const cols = (await ds.query(`SELECT name FROM pragma_table_info('workflow_definitions')`)).map((r: { name: string }) => r.name)
  if (!cols.includes('is_builtin')) {
    await ds.query(`ALTER TABLE workflow_definitions ADD COLUMN is_builtin INTEGER DEFAULT 0`)
  }
  return ds
}

/** 插工作流行（简化列）：userId 传 'user-1' 表示用户自有，内置传 NULL + isBuiltin=1；updatedAtExpr 为 SQL 表达式片段 */
async function insertDef(ds: DataSource, id: string, name: string, updatedAtExpr: string, userId: string | null = 'user-1', isBuiltin = 0): Promise<void> {
  const userSql = userId === null ? 'NULL' : `'${userId}'`
  await ds.query(
    `INSERT INTO workflow_definitions (id, user_id, name, description, category, draft_graph, published_graph, published_version, is_builtin, updated_at)
     VALUES ('${id}', ${userSql}, '${name}', '', 'test', '{}', '{}', 1, ${isBuiltin}, ${updatedAtExpr})`
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

  it('用户工作流按最近更新倒序', async () => {
    await runWithUserAsync('user-1', async () => {
      await insertDef(ds, 'def-old', '旧工作流', minutesAgo(5))
      await insertDef(ds, 'def-new', '新工作流', minutesAgo(1))
      const { items } = await repo.list({ page: 1, pageSize: 20 })
      expect(items.map(d => d.name)).toEqual(['新工作流', '旧工作流'])
    })
  })

  it('内置工作流不强制靠前：整体按时间降序', async () => {
    await runWithUserAsync('user-1', async () => {
      // 内置工作流更新较早（时间在前），用户工作流更新较晚（时间在后）
      await insertDef(ds, 'builtin_workflow_x', '内置工作流', minutesAgo(10), null, 1)
      await insertDef(ds, 'def-user', '用户工作流', minutesAgo(2))
      const { items } = await repo.list({ page: 1, pageSize: 20 })
      expect(items.map(d => d.name)).toEqual(['用户工作流', '内置工作流'])
    })
  })
})
