/**
 * 分享令牌明文清理迁移测试（评审 #74）+ apps.pinned 历史污染清理（评审 #69）
 * @module tests/migrations/sanitize-share-tokens
 * @description 真实 sqlite DataSource：明文+无 hash 行 → 回填 hash → 清明文；
 *              hash+明文并存行 → 只清明文；重跑幂等；清明文后按 hash 查找仍命中；
 *              apps.pinned=1 历史污染值被归零。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'node:crypto'
import { DataSource } from 'typeorm'
import { createWorkflowTables } from '@core/database/migrations/create-workflow-tables'
import { createAppsTables } from '@core/database/migrations/create-apps-tables'
import { addWorkflowTemplateVersion } from '@core/database/migrations/add-workflow-template-version'
import { addWorkflowShareToken } from '@core/database/migrations/add-workflow-share-token'
import { sanitizeShareTokens } from '@core/database/migrations/sanitize-share-tokens'
import { WorkflowDefinitionEntity } from '@core/database/entities/workflow-definition.entity'
import { AppEntity } from '@core/database/entities/app.entity'

let ds: DataSource

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

beforeAll(async () => {
  ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [WorkflowDefinitionEntity, AppEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createWorkflowTables(ds)
  // is_builtin/template_version 与 share_token(_hash) 列由这些迁移补齐
  await addWorkflowTemplateVersion(ds)
  await addWorkflowShareToken(ds)
  await createAppsTables(ds)
})

afterAll(async () => {
  await ds.destroy()
})

describe('sanitizeShareTokens 迁移（评审#74）', () => {
  it('明文+无 hash 行：回填 hash 并清空明文；hash 查找仍命中；重跑幂等', async () => {
    const now = new Date().toISOString()
    // 场景 A：老存量行（仅明文）
    await ds.query(
      `INSERT INTO workflow_definitions (id, user_id, name, draft_graph, published_graph, published_version, triggers, is_builtin, template_version, share_token, created_at, updated_at)
       VALUES ('wf-old', NULL, '老分享', '{}', '{}', 1, '[]', 0, 0, 'plain-token-old', ?, ?)`,
      [now, now]
    )
    // 场景 B：8/27 批已 hash 行（明文列残留兼容值）
    await ds.query(
      `INSERT INTO workflow_definitions (id, user_id, name, draft_graph, published_graph, published_version, triggers, is_builtin, template_version, share_token, share_token_hash, created_at, updated_at)
       VALUES ('wf-both', NULL, '并存行', '{}', '{}', 1, '[]', 0, 0, 'plain-token-both', ?, ?, ?)`,
      [sha256('plain-token-both'), now, now]
    )

    await sanitizeShareTokens(ds)

    const old = (await ds.query(`SELECT share_token, share_token_hash FROM workflow_definitions WHERE id = 'wf-old'`))[0]
    expect(old.share_token).toBeNull()
    expect(old.share_token_hash).toBe(sha256('plain-token-old'))

    const both = (await ds.query(`SELECT share_token, share_token_hash FROM workflow_definitions WHERE id = 'wf-both'`))[0]
    expect(both.share_token).toBeNull()
    expect(both.share_token_hash).toBe(sha256('plain-token-both'))

    // 幂等重跑：不抛错、不变更
    await sanitizeShareTokens(ds)
    const rerun = (await ds.query(`SELECT share_token, share_token_hash FROM workflow_definitions WHERE id = 'wf-both'`))[0]
    expect(rerun.share_token).toBeNull()
    expect(rerun.share_token_hash).toBe(sha256('plain-token-both'))
  })

  it('apps 表同样处理；pinned 历史污染值归零（评审#69）', async () => {
    const now = new Date().toISOString()
    await ds.query(
      `INSERT INTO apps (id, user_id, name, source_kind, source_id, enabled, channel_share, share_token, share_token_hash, pinned, created_at, updated_at)
       VALUES ('app-1', NULL, '应用A', 'workflow', 'wf-old', 1, 1, 'plain-app-token', NULL, 1, ?, ?)`,
      [now, now]
    )
    await sanitizeShareTokens(ds)
    // 评审 #69：pinned 归零在 createAppsTables 迁移内——插行后重跑幂等迁移（与 boot 语义一致）
    const { createAppsTables: rerunApps } = await import('@core/database/migrations/create-apps-tables')
    await rerunApps(ds)
    const row = (await ds.query(`SELECT share_token, share_token_hash FROM apps WHERE id = 'app-1'`))[0]
    expect(row.share_token).toBeNull()
    expect(row.share_token_hash).toBe(sha256('plain-app-token'))

    // 评审 #69：pinned=1 污染值被迁移归零（个人固定走 app_user_prefs）
    const pinned = (await ds.query(`SELECT pinned FROM apps WHERE id = 'app-1'`))[0]
    expect(pinned.pinned).toBe(0)
  })
})
