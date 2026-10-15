/**
 * storyboard_dialogue_links 维护
 * @module platform/episode-production/narrative/storyboard-dialogue-links
 * @description links 表是字幕镜头级分配的数据源，与 storyboards.dialogue_ids JSON 列
 *              互为投影。所有写入路径（生成 / 更新 / 场景重写）在 dialogueIds 落库后
 *              统一走这里先删后插重建该分镜的 links 行，避免两数据源脱钩。
 *              插入前按 scene_dialogues 实有 id 过滤——悬空 id 直接 INSERT 会 FK
 *              失败中断逐条插入，留下「已插前缀残留 + 后续有效 id 全丢」的部分状态；
 *              过滤后只插有效项，悬空 id 记 warn。dbOrTx 传 DataSource 时内部包一层
 *              事务（DELETE+INSERT 原子）；传事务内 EntityManager 时并入调用方事务。
 *              与 cleanupStoryboards 的 dbOrTx 惯例一致。
 *
 *              双端方言（多租户复核修复）：此前用 SQLite 方言（`?` 占位 +
 *              INSERT OR REPLACE），且该表只在 Electron initTables 建——Web(PG)
 *              上表不存在、SQL 必抛错。现改为：占位符按方言生成、INSERT 冲突
 *              子句按方言选择、表结构自举（CREATE TABLE IF NOT EXISTS，按
 *              DataSource 缓存一次）。
 */

import { DataSource, type EntityManager } from 'typeorm'

/** 每个 DataSource 只建一次表（幂等 IF NOT EXISTS） */
const ensuredTables = new WeakMap<DataSource, Promise<void>>()

function isPg(qr: EntityManager): boolean {
  return qr.connection.options.type === 'postgres'
}

/** 方言占位符：PG 用 $n，SQLite 用 ? */
function ph(qr: EntityManager, index: number): string {
  return isPg(qr) ? `$${index}` : '?'
}

async function ensureTable(qr: EntityManager): Promise<void> {
  const ds = qr.connection
  let pending = ensuredTables.get(ds)
  if (!pending) {
    pending = (async () => {
      // 必须走 qr（事务 manager）而非 ds：本函数只在事务回调内被调，Electron
      // 端 DataSource 装了 SQLite 串行门，全局 ds.query 会被门拒绝。
      if (isPg(qr)) {
        await qr.query(`
          CREATE TABLE IF NOT EXISTS storyboard_dialogue_links (
            id VARCHAR PRIMARY KEY,
            storyboard_id VARCHAR NOT NULL,
            dialogue_id VARCHAR NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
            FOREIGN KEY (dialogue_id) REFERENCES scene_dialogues(id) ON DELETE CASCADE
          )
        `)
        await qr.query(
          `CREATE INDEX IF NOT EXISTS idx_storyboard_dialogue_links_storyboard_id ON storyboard_dialogue_links(storyboard_id)`,
        )
      } else {
        await qr.query(`
          CREATE TABLE IF NOT EXISTS storyboard_dialogue_links (
            id TEXT PRIMARY KEY,
            storyboard_id TEXT NOT NULL,
            dialogue_id TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
            FOREIGN KEY (dialogue_id) REFERENCES scene_dialogues(id) ON DELETE CASCADE
          )
        `)
        await qr.query(
          `CREATE INDEX IF NOT EXISTS idx_storyboard_dialogue_links_storyboard_id ON storyboard_dialogue_links(storyboard_id)`,
        )
      }
    })().catch(e => {
      // 建表失败不缓存，下次重试；错误抛回调用方（调用方各自决定降级策略）
      ensuredTables.delete(ds)
      throw e
    })
    ensuredTables.set(ds, pending)
  }
  await pending
}

export async function rebuildStoryboardDialogueLinks(
  dbOrTx: DataSource | EntityManager,
  storyboard: { id: string; dialogueIds?: unknown },
): Promise<void> {
  if (dbOrTx instanceof DataSource) {
    return dbOrTx.transaction(manager => execRebuild(manager, storyboard))
  }
  return execRebuild(dbOrTx, storyboard)
}

async function execRebuild(
  qr: EntityManager,
  storyboard: { id: string; dialogueIds?: unknown },
): Promise<void> {
  await ensureTable(qr)

  await qr.query(`DELETE FROM storyboard_dialogue_links WHERE storyboard_id = ${ph(qr, 1)}`, [
    storyboard.id,
  ])
  const dialogueIds = Array.isArray(storyboard.dialogueIds) ? storyboard.dialogueIds : []
  const ids = dialogueIds.filter(Boolean).map(String)
  if (ids.length === 0) return

  // 悬空 id 过滤：直接 INSERT 会 FK 失败中断逐条插入，留下部分 links（已插
  // 前缀残留、后续有效 id 全丢）。查一次实有 id 集合，只插有效项，sort_order
  // 按过滤后数组下标紧凑重排。
  const placeholders = ids.map((_, i) => ph(qr, i + 1)).join(',')
  const rows = (await qr.query(
    `SELECT id FROM scene_dialogues WHERE id IN (${placeholders})`,
    ids,
  )) as Array<{ id: string }>
  const validIds = new Set(rows.map(r => String(r.id)))
  const effective: string[] = []
  const dangling: string[] = []
  for (const id of ids) {
    if (validIds.has(id)) effective.push(id)
    else dangling.push(id)
  }
  if (dangling.length > 0) {
    console.warn(
      `[storyboard-dialogue-links] 分镜 ${storyboard.id} 的 dialogueIds 含悬空 id，已跳过:`,
      dangling.join(', '),
    )
  }

  for (let i = 0; i < effective.length; i++) {
    const rowId = `sdl_${Math.random().toString(36).slice(2, 12)}`
    if (isPg(qr)) {
      // PG 无 INSERT OR REPLACE：PK 冲突（随机 id 实际不可能）时更新投影列
      await qr.query(
        `INSERT INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET storyboard_id = EXCLUDED.storyboard_id, dialogue_id = EXCLUDED.dialogue_id, sort_order = EXCLUDED.sort_order`,
        [rowId, storyboard.id, effective[i], i],
      )
    } else {
      await qr.query(
        `INSERT OR REPLACE INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES (?, ?, ?, ?)`,
        [rowId, storyboard.id, effective[i], i],
      )
    }
  }
}
