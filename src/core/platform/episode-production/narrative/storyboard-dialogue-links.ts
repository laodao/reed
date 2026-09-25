/**
 * storyboard_dialogue_links 维护
 * @module platform/episode-production/narrative/storyboard-dialogue-links
 * @description links 表是字幕镜头级分配的数据源，与 storyboards.dialogue_ids JSON 列
 *              互为投影。所有写入路径（生成 / 更新 / 场景重写）在 dialogueIds 落库后
 *              统一走这里先删后插重建该分镜的 links 行，避免两数据源脱钩。
 *              dbOrTx 传 DataSource 时内部包一层事务（DELETE+INSERT 原子）；传事务内
 *              EntityManager 时并入调用方事务。与 cleanupStoryboards 的 dbOrTx 惯例一致。
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
  for (let i = 0; i < dialogueIds.length; i++) {
    const dialogueId = dialogueIds[i]
    if (!dialogueId) continue
    await qr.query(
      `INSERT OR REPLACE INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES (?, ?, ?, ?)`,
      [`sdl_${Math.random().toString(36).slice(2, 12)}`, storyboard.id, String(dialogueId), i],
    )
  }
}
