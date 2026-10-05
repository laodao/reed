/**
 * scene_dialogues 单行更新（2026-10-05 台词可编辑）。
 * @module platform/episode-production/narrative/scene-dialogues
 *
 * 台词原文的唯一数据源是 scene_dialogues——字幕分配与视频 prompt 注入都从这里
 * 读（经 storyboard_dialogue_links），所以编辑只需写回这一张表，全链路自动一致。
 * 注意：scene_dialogues 无 updated_at 列，仅更新 text。
 */

import type { DataSource } from 'typeorm'

function isPg(ds: DataSource): boolean {
  return ds.options.type === 'postgres'
}

/**
 * 更新单条台词原文。
 * @returns true=已更新；false=台词不存在
 * @throws dialogueId/text 为空时抛错（空台词等于删除，删除是另一个操作，不允许误伤）
 */
export async function updateSceneDialogueText(
  ds: DataSource,
  dialogueId: string,
  text: string,
): Promise<boolean> {
  const trimmed = (text ?? '').trim()
  if (!dialogueId) throw new Error('dialogueId 不能为空')
  if (!trimmed) throw new Error('台词内容不能为空')
  const ph = (n: number) => (isPg(ds) ? `$${n}` : '?')
  // 先查存在性再更新：各驱动 UPDATE 返回值形态不一（changes/rowCount/数组），
  // 存在性检查是唯一跨驱动确定性的「找到没有」判断
  const rows = (await ds.query(
    `SELECT id FROM scene_dialogues WHERE id = ${ph(1)}`,
    [dialogueId],
  )) as Array<{ id: string }>
  if (!rows?.length) return false
  await ds.query(
    `UPDATE scene_dialogues SET text = ${ph(1)} WHERE id = ${ph(2)}`,
    [trimmed, dialogueId],
  )
  return true
}
