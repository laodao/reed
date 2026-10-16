/**
 * 修复 lw_design_conversations.project_id 过期外键（EP Agent 会话容器字段语义对齐）
 *
 * 背景（真机实证）：存量建表 DDL 带 FOREIGN KEY (project_id) REFERENCES lw_projects ON DELETE CASCADE，
 * 而仓储层（lw-design-message.repository ensureConversationRow）把 project_id 当**容器标签字段**：
 * EP Agent（剧集制作助手）会话的 project_id 来自调用方映射——视频项目需映射回 longWritingProjectId；
 * standalone 视频项目（未关联长文项目，或关联被 video_projects 外键 ON DELETE SET NULL 清空）
 * 拿不到合法 lw_projects.id，首条消息建会话父行即被 FK 拒绝。用户报障：资产界面/角色定妆
 * 右侧 Agent 输入指令报 SqliteError: FOREIGN KEY constraint failed。测试库手工 DDL 无 FK
 * 故测试全绿，真机才炸——schema 双源漂移的又一案例（同 fix-kb-inverted-index-fk）。
 *
 * 处置：容器字段不是关系语义——重建表去掉 FK（列/数据/索引保留，子表 lw_design_messages
 * 的 conversation_id 外键不受影响）。幂等；兼容 SQLite（rebuild）+ PG（DROP CONSTRAINT）。
 * 真机二型：另一台机器存量库的 FK 子句为异形 DDL（具名 CONSTRAINT / 省略父列清单等），
 * 剥除正则匹配不上 → "去 FK 失败"拒绝启动。处置：FK 正则补全 SQLite 外键语法全量 +
 * 报错带出 DDL 尾部（异形 DDL 一次报错即定位）+ 换表前临时表 PRAGMA 终检（未知变体
 * 拦在 DROP 原表之前）。
 * 行为变化提示：删除 lw_projects 不再级联删设计会话（孤儿行仅作历史占位，无引用方）。
 *
 * 注册点（双入口，防漏单端——PR checklist 必查）：
 * - Electron: src/electron/database/index.ts runMultiTenantMigrations
 * - Web:      src/web/server/index.ts（与 fix-kb-inverted-index-fk 同层）
 */
import type { DataSource } from 'typeorm'

const TABLE = 'lw_design_conversations'
const TMP_TABLE = 'lw_design_conversations__fkfix'

/**
 * 表级 FOREIGN KEY 子句（SQLite 外键语法全量）——列定义内不含 "FOREIGN KEY" 字样，惰性匹配安全。
 * 须覆盖真机出现过的全部形态（漏一种就触发"去 FK 失败"拒绝启动）：
 * - 可选 CONSTRAINT <name> 前缀（具名约束）
 * - 父表列清单可省略（REFERENCES 父表 即引用其主键）
 * - 引号风格不限："x" / [x] / `x` / 'x'，引号内可含 - 等特殊字符；裸名可含 .
 * - 可选 MATCH <name> 与 [NOT] DEFERRABLE [INITIALLY DEFERRED|IMMEDIATE] 尾巴（残留会导致重建 SQL 语法错）
 * 列级 REFERENCES（列定义内联，无 FOREIGN KEY 字样）无法由此剥除——由换表前 PRAGMA 终检兜底拒绝。
 */
const FK_CLAUSE_RE =
  /,\s*(?:CONSTRAINT\s+(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|'[^']*'|[\w$]+)\s+)?FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|'[^']*'|[\w$.]+)(?:\s*\([^)]*\))?(?:\s+MATCH\s+(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|'[^']*'|[\w$]+))?((?:\s+ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION|RESTRICT))*)(?:\s+(?:NOT\s+)?DEFERRABLE(?:\s+INITIALLY\s+(?:DEFERRED|IMMEDIATE))?)?/gi

export async function fixLwDesignConversationsProjectFk(ds: DataSource): Promise<void> {
  const isPg = ds.options.type === 'postgres'

  if (isPg) {
    // PG：直接删约束（按信息架构找，不存在则跳过——synchronize 建表本无 FK，防御旧库）
    const rows = (await ds.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = '${TABLE}'::regclass AND contype = 'f'`,
    )) as Array<{ conname: string }>
    for (const r of rows) {
      await ds.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS "${r.conname}"`)
    }
    return
  }

  // SQLite：表不存在（全新 Web 库等）→ 静默跳过
  const exists = (await ds.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [TABLE],
  )) as unknown[]
  if (exists.length === 0) return

  // PRAGMA foreign_key_list 有行才需要重建（幂等出口）
  const fks = (await ds.query(`PRAGMA foreign_key_list(${TABLE})`)) as unknown[]
  if (fks.length === 0) return

  const sqlRows = (await ds.query(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [TABLE],
  )) as Array<{ sql: string | null }>
  const createSql = sqlRows[0]?.sql
  if (!createSql) {
    throw new Error(`[fix-lw-design-conversations-project-fk] 取不到 ${TABLE} 的建表语句，无法重建`)
  }

  // 改写建表语句：换临时表名 + 去掉表级 FOREIGN KEY 子句（表名替换正则同 sqlite-relax-notnull）
  const renamed = createSql.replace(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"|\[[^\]]+\]|`[^`]+`|[\w$]+)/i,
    `CREATE TABLE "${TMP_TABLE}"`,
  )
  const newSql = renamed.replace(FK_CLAUSE_RE, '')
  if (!newSql.includes(`"${TMP_TABLE}"`) || /FOREIGN\s+KEY/i.test(newSql)) {
    // DDL 尾部随报错带出（JSON 序列化让 CRLF 等不可见字符现形）——真机异形 DDL 一次报错即可定位
    throw new Error(
      `[fix-lw-design-conversations-project-fk] 无法安全改写 ${TABLE} 的建表语句（去 FK 失败），放弃重建。` +
        `DDL 尾部 200 字符：${JSON.stringify(createSql.slice(-200))}`,
    )
  }

  // 既有索引/触发器随 DROP 旧表消失，先快照原定义，重建后原样恢复
  const indexSqls = (
    (await ds.query(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
      [TABLE],
    )) as Array<{ sql: string }>
  ).map((r) => r.sql)
  const triggerSqls = (
    (await ds.query(
      `SELECT sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND sql IS NOT NULL`,
      [TABLE],
    )) as Array<{ sql: string }>
  ).map((r) => r.sql)

  // 真机列集 = 存量 DDL + 事后 ALTER ADD COLUMN（如 ensure-user-id-columns 补的 user_id，
  // 不在 sqlite_master.sql 里）——重建表须补齐这些列，拷贝用显式列清单
  const origCols = (await ds.query(`PRAGMA table_info(${TABLE})`)) as Array<{
    name: string
    type: string
    notnull: number
    dflt_value: string | null
  }>
  if (origCols.length === 0) {
    throw new Error(`[fix-lw-design-conversations-project-fk] 读不到 ${TABLE} 的列定义，放弃重建`)
  }

  // 清理上次失败可能残留的临时表（幂等保证）
  await ds.query(`DROP TABLE IF EXISTS "${TMP_TABLE}"`)

  // 重建规程遵循 sqlite.org 12 步 ALTER（foreign_keys 必须在事务外关闭——事务内 PRAGMA 是 no-op）
  await ds.query(`PRAGMA foreign_keys = OFF`)
  await ds.query(`BEGIN`)
  try {
    await ds.query(newSql)
    // 补齐事后 ALTER 加的列（临时表只继承了存量 DDL 里的列）
    const tmpCols = (await ds.query(`PRAGMA table_info(${TMP_TABLE})`)) as Array<{ name: string }>
    const tmpColNames = new Set(tmpCols.map((c) => c.name))
    for (const col of origCols) {
      if (tmpColNames.has(col.name)) continue
      const dflt = col.dflt_value != null ? ` DEFAULT ${col.dflt_value}` : ''
      await ds.query(`ALTER TABLE "${TMP_TABLE}" ADD COLUMN "${col.name}" ${col.type}${col.notnull ? ' NOT NULL' : ''}${dflt}`)
    }
    const colList = origCols.map((c) => `"${c.name}"`).join(', ')
    // 换表前终检：临时表外键必须已清空——把未预见的 DDL 变体拦在 DROP 原表之前（失败整体回滚，原表无损）
    const tmpFks = (await ds.query(`PRAGMA foreign_key_list(${TMP_TABLE})`)) as unknown[]
    if (tmpFks.length > 0) {
      throw new Error(
        `[fix-lw-design-conversations-project-fk] 临时表 ${TMP_TABLE} 仍存在外键（疑似列级 REFERENCES，正则不可达），放弃重建`,
      )
    }
    await ds.query(`INSERT INTO "${TMP_TABLE}" (${colList}) SELECT ${colList} FROM "${TABLE}"`)
    await ds.query(`DROP TABLE "${TABLE}"`)
    await ds.query(`ALTER TABLE "${TMP_TABLE}" RENAME TO "${TABLE}"`)
    for (const sql of indexSqls) await ds.query(sql)
    for (const sql of triggerSqls) await ds.query(sql)
    await ds.query(`COMMIT`)
  } catch (e) {
    await ds.query(`ROLLBACK`).catch(() => {})
    throw e
  } finally {
    await ds.query(`PRAGMA foreign_keys = ON`)
  }

  // 终检：本表 FK 必须已清空 + 直接子表（lw_design_messages）引用完整性。
  // 注意只能按表检查——真机库存在与本次无关的存量孤儿行（lw_project_skill_levels 等，
  // 历史上 raw DDL 连接外键开关状态不一所致），全库 foreign_key_check 会把它们误判为本次损坏。
  const after = (await ds.query(`PRAGMA foreign_key_list(${TABLE})`)) as unknown[]
  if (after.length > 0) {
    throw new Error(`[fix-lw-design-conversations-project-fk] 重建后 ${TABLE} 仍存在外键，拒绝继续`)
  }
  const childViolations = (await ds.query(`PRAGMA foreign_key_check(lw_design_messages)`)) as unknown[]
  if (childViolations.length > 0) {
    throw new Error(`[fix-lw-design-conversations-project-fk] 重建后消息子表外键完整性校验失败：${JSON.stringify(childViolations)}`)
  }
}
