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
 */

import { DataSource, type EntityManager } from 'typeorm'

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
  await qr.query(
    `DELETE FROM storyboard_dialogue_links WHERE storyboard_id = ?`,
    [storyboard.id],
  )
  const dialogueIds = Array.isArray(storyboard.dialogueIds) ? storyboard.dialogueIds : []
  const ids = dialogueIds.filter(Boolean).map(String)
  if (ids.length === 0) return

  // 悬空 id 过滤：直接 INSERT 会 FK 失败中断逐条插入，留下部分 links（已插
  // 前缀残留、后续有效 id 全丢）。查一次实有 id 集合，只插有效项，sort_order
  // 按过滤后数组下标紧凑重排。
  const placeholders = ids.map(() => '?').join(',')
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
    await qr.query(
      `INSERT OR REPLACE INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES (?, ?, ?, ?)`,
      [`sdl_${Math.random().toString(36).slice(2, 12)}`, storyboard.id, effective[i], i],
    )
  }
}
