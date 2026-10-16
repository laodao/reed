/**
 * fix-lw-design-conversations-project-fk 迁移测试
 *
 * 回归：真机 lw_design_conversations.project_id 带 FK→lw_projects，standalone EP 项目
 * （未关联长文项目 / 关联被 video_projects 外键 ON DELETE SET NULL 清空）Agent 首条消息
 * 建会话父行即被 FK 拒绝（用户报障：资产界面/角色定妆右侧 Agent 报
 * SqliteError: FOREIGN KEY constraint failed）。仓储层把 project_id 当容器标签字段，
 * FK 是过期约束。测试库须按**真机 DDL**（带 FK + 事后 ALTER 补的 user_id 列）建表，
 * 否则复现不了——手工无 FK DDL 测全绿、真机才炸的又一案例（同 fix-kb-inverted-index-fk）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import { fixLwDesignConversationsProjectFk } from '@core/database/migrations/fix-lw-design-conversations-project-fk'
import { LwDesignMessageRepository } from '@core/database/repositories/lw-design-message.repository'
import { LwDesignMessageEntity } from '@core/database/entities/lw-design-message.entity'
import { LwDesignConversationEntity } from '@core/database/entities/lw-design-conversation.entity'
import { runWithUserAsync } from '@core/context/user-context'

// 真·生产 DDL（src/electron/database/index.ts initTables 原样；含正是真机炸的那条 FK）
const PROD_CONVERSATION_DDL = `
  CREATE TABLE lw_design_conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    messages TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
  )
`
// 真机二型 DDL 变体（另一台机器启动即"去 FK 失败"的存量形态）——剥除正则必须全覆盖：
// ① 具名 CONSTRAINT 前缀；② REFERENCES 省略父列清单（隐式引用父表主键）；③ DEFERRABLE 尾巴
// （残留会让重建 SQL 语法错）。列级 REFERENCES 无 FOREIGN KEY 字样正则不可达，由换表前终检兜底。
const VARIANT_DDLS: Array<[string, string]> = [
  [
    '具名 CONSTRAINT 外键',
    `
  CREATE TABLE lw_design_conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    messages TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conv_project FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE
  )
`,
  ],
  [
    'REFERENCES 省略父列清单',
    `
  CREATE TABLE lw_design_conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    messages TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES lw_projects ON DELETE CASCADE
  )
`,
  ],
  [
    'DEFERRABLE INITIALLY DEFERRED 尾巴',
    `
  CREATE TABLE lw_design_conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    messages TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES lw_projects(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
  )
`,
  ],
]
// ensure-user-id-columns 事后 ALTER 补的列与索引（不在 sqlite_master.sql 的建表语句里）
const POST_HOC_COLUMN = 'ALTER TABLE lw_design_conversations ADD COLUMN user_id TEXT'
const POST_HOC_INDEX = 'CREATE INDEX idx_lw_design_conversations_user_id ON lw_design_conversations(user_id)'
const PROD_INDEX = 'CREATE INDEX idx_lw_conversations_project_id ON lw_design_conversations(project_id)'

// 子表（消息）：FK conversation_id → lw_design_conversations，重建父表时数据与外键指向都必须保住
// （user_id 同为 ensure-user-id-columns 事后补加，仓储 sort_order 查询会引用）
const PROD_MESSAGE_DDL = `
  CREATE TABLE lw_design_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER,
    sort_order INTEGER DEFAULT 0,
    metadata TEXT,
    user_id TEXT,
    FOREIGN KEY (conversation_id) REFERENCES lw_design_conversations(id) ON DELETE CASCADE
  )
`
// 被 FK 引用的宿主表（最小列即可）
const HOST_DDL = 'CREATE TABLE lw_projects (id TEXT PRIMARY KEY)'

async function buildProdLikeDs(conversationDdl: string = PROD_CONVERSATION_DDL): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [LwDesignMessageEntity, LwDesignConversationEntity],
    synchronize: false,
  })
  await ds.initialize()
  await ds.query(HOST_DDL)
  await ds.query("INSERT INTO lw_projects (id) VALUES ('lw-real-1')")
  await ds.query(conversationDdl)
  await ds.query(POST_HOC_COLUMN)
  await ds.query(PROD_INDEX)
  await ds.query(POST_HOC_INDEX)
  await ds.query(PROD_MESSAGE_DDL)

  // 存量数据：旧关联会话（带 user_id——验证事后列的值不丢）+ 其下消息
  await ds.query(
    `INSERT INTO lw_design_conversations (id, project_id, stage, user_id) VALUES ('ep-agent:ep-old', 'lw-real-1', 'agent', 'user-9')`,
  )
  await ds.query(
    `INSERT INTO lw_design_messages (id, conversation_id, role, content, timestamp, sort_order, metadata) VALUES ('dm-old-1', 'ep-agent:ep-old', 'assistant', '历史回复', 1, 0, NULL)`,
  )
  return ds
}

describe('fixLwDesignConversationsProjectFk', () => {
  let ds: DataSource

  beforeAll(async () => {
    ds = await buildProdLikeDs()
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('真机复现：迁移前 standalone project_id 建 Agent 会话父行被 FK 拒绝', async () => {
    const repo = new LwDesignMessageRepository(ds)
    // vp-standalone 不在 lw_projects——EP standalone 视频项目映射不到 longWritingProjectId 的同款传参
    await expect(
      runWithUserAsync('user-1', () =>
        repo.add('ep-agent:ep-new', { role: 'user', content: '为当前角色生成定妆图' }, { projectId: 'vp-standalone' }),
      ),
    ).rejects.toThrow(/FOREIGN KEY/)
  })

  it('迁移后 FK 消失、数据（含事后 user_id 列）保留、索引重建、子表外键指向不变', async () => {
    await fixLwDesignConversationsProjectFk(ds)

    const fks = (await ds.query('PRAGMA foreign_key_list(lw_design_conversations)')) as unknown[]
    expect(fks).toHaveLength(0)

    // 存量会话行保留，事后 ALTER 加的 user_id 列及其值不丢
    const conv = (await ds.query(
      `SELECT id, project_id, user_id FROM lw_design_conversations WHERE id = 'ep-agent:ep-old'`,
    )) as Array<{ id: string; project_id: string; user_id: string | null }>
    expect(conv).toHaveLength(1)
    expect(conv[0].project_id).toBe('lw-real-1')
    expect(conv[0].user_id).toBe('user-9')

    // 列集完整（含 user_id，共 7 列）
    const cols = (await ds.query('PRAGMA table_info(lw_design_conversations)')) as Array<{ name: string }>
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining(['id', 'project_id', 'stage', 'messages', 'created_at', 'updated_at', 'user_id']),
    )

    // 索引原样恢复（project_id 索引来自存量 DDL，user_id 索引来自事后补建）
    const indexes = (await ds.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='lw_design_conversations' AND name LIKE 'idx_%'",
    )) as Array<{ name: string }>
    expect(indexes.map((i) => i.name).sort()).toEqual([
      'idx_lw_conversations_project_id',
      'idx_lw_design_conversations_user_id',
    ])

    // 子表消息行保留，外键仍指向本表且子表引用完整性干净
    // （只查子表——全库 foreign_key_check 会把测试库/真机库与本次无关的存量孤儿行误判进来）
    const msgs = (await ds.query('SELECT COUNT(*) AS n FROM lw_design_messages')) as Array<{ n: number }>
    expect(Number(msgs[0].n)).toBe(1)
    const childFk = (await ds.query('PRAGMA foreign_key_list(lw_design_messages)')) as Array<{ table: string }>
    expect(childFk.map((f) => f.table)).toEqual(['lw_design_conversations'])
    expect(await ds.query('PRAGMA foreign_key_check(lw_design_messages)')).toHaveLength(0)
  })

  it('迁移后 standalone project_id 的 repo.add 全链路成功（报障路径修复）', async () => {
    const repo = new LwDesignMessageRepository(ds)
    const msg = await runWithUserAsync('user-1', () =>
      repo.add('ep-agent:ep-new', { role: 'user', content: '为当前角色生成定妆图' }, { projectId: 'vp-standalone' }),
    )
    expect(msg.role).toBe('user')

    // 会话父行以 vp-standalone 为容器标签落库，消息可读回
    const list = await runWithUserAsync('user-1', () => repo.getByConversationId('ep-agent:ep-new'))
    expect(list).toHaveLength(1)
    const conv = (await ds.query(
      `SELECT project_id FROM lw_design_conversations WHERE id = 'ep-agent:ep-new'`,
    )) as Array<{ project_id: string }>
    expect(conv[0].project_id).toBe('vp-standalone')
  })

  it('幂等：重复跑不再重建（数据没丢没重拷）', async () => {
    await fixLwDesignConversationsProjectFk(ds)
    const conv = (await ds.query('SELECT COUNT(*) AS n FROM lw_design_conversations')) as Array<{ n: number }>
    const msgs = (await ds.query('SELECT COUNT(*) AS n FROM lw_design_messages')) as Array<{ n: number }>
    expect(Number(conv[0].n)).toBe(2)
    expect(Number(msgs[0].n)).toBe(2)
  })

  it('表不存在 → 静默跳过', async () => {
    const ds2 = new DataSource({ type: 'better-sqlite3', database: ':memory:' })
    await ds2.initialize()
    await expect(fixLwDesignConversationsProjectFk(ds2)).resolves.toBeUndefined()
    await ds2.destroy()
  })

  // 真机二型回归：异形 FK DDL 曾让剥除正则匹配不上 → "去 FK 失败"拒绝启动
  it.each(VARIANT_DDLS)('真机 DDL 变体：%s → 迁移成功且数据保留', async (_label, ddl) => {
    const dsV = await buildProdLikeDs(ddl)
    try {
      await dsV.query(
        `INSERT INTO lw_design_conversations (id, project_id, stage, user_id) VALUES ('ep-agent:ep-v', 'lw-real-1', 'agent', 'user-9')`,
      )
      await expect(fixLwDesignConversationsProjectFk(dsV)).resolves.toBeUndefined()
      const fks = (await dsV.query('PRAGMA foreign_key_list(lw_design_conversations)')) as unknown[]
      expect(fks).toHaveLength(0)
      const rows = (await dsV.query(
        `SELECT project_id, user_id FROM lw_design_conversations WHERE id = 'ep-agent:ep-v'`,
      )) as Array<{ project_id: string; user_id: string | null }>
      expect(rows).toEqual([{ project_id: 'lw-real-1', user_id: 'user-9' }])
      // 修复后报障路径走通：standalone project_id 建会话不再被 FK 拒绝
      const repo = new LwDesignMessageRepository(dsV)
      const msg = await runWithUserAsync('user-1', () =>
        repo.add('ep-agent:ep-new', { role: 'user', content: '变体库同款写入' }, { projectId: 'vp-standalone' }),
      )
      expect(msg.role).toBe('user')
    } finally {
      await dsV.destroy()
    }
  })
})
