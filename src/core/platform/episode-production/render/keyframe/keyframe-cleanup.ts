/**
 * 关键帧删除回收（2026-09-19 review P2-14c 抽共享）
 * @module platform/episode-production/render/keyframe/keyframe-cleanup
 *
 * 原 KeyframeGenerationService.deleteKeyframeWithAsset（private）抽成共享函数：
 * 删 storyboard_keyframe 行 + 其 image_assets 行 + 磁盘文件。
 * 供 keyframe-generation.service（重生成回收旧帧）与 narrative/storyboard-cleanup
 * （删分镜级联）共用，避免删除路径各自手写漏掉资产/磁盘回收。
 *
 * dbOrTx 接受 DataSource 或事务内 EntityManager（caller 在事务里时传 manager）。
 * user_id 过滤与 BaseRepository.scoped 同语义（ALS userId；null → IS NULL）。
 * 文件/资产回收失败静默——不阻塞关键帧主流程。
 */

import type { DataSource, EntityManager } from 'typeorm'
import { IsNull } from 'typeorm'
import * as fs from 'fs'
import * as path from 'path'
import { getPathProvider } from '@core/interfaces/path.interface'
import { getCurrentUserId } from '@core/context/user-context'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { ImageAssetEntity } from '@core/database/entities/image-asset.entity'

/** ALS userId 对应的 where 片段（与 BaseRepository.scopeWhere 同语义） */
export function userScopeWhere(): { userId: string | ReturnType<typeof IsNull> } {
  const userId = getCurrentUserId()
  return { userId: userId === null ? IsNull() : userId }
}

/** 删关键帧行并回收其 image_assets 行与磁盘文件。 */
export async function deleteKeyframeWithAsset(
  dbOrTx: DataSource | EntityManager,
  keyframeId: string,
): Promise<void> {
  const kfRepo = dbOrTx.getRepository(StoryboardKeyframeEntity)
  const imgRepo = dbOrTx.getRepository(ImageAssetEntity)
  const scope = userScopeWhere()
  const row = await kfRepo.findOne({ where: { id: keyframeId, ...scope } as any })
  if (!row) return
  await kfRepo.delete({ id: keyframeId, ...scope } as any)
  const assetId = row.imageAssetId
  if (!assetId) return
  try {
    const asset = await imgRepo.findOne({ where: { id: assetId, ...scope } as any })
    if (!asset) return
    await imgRepo.delete({ id: assetId, ...scope } as any)
    const dataPath = getPathProvider().getDataPath()
    for (const p of [asset.imagePath, asset.thumbnailPath]) {
      if (!p) continue
      try {
        const abs = path.isAbsolute(p) ? p : path.join(dataPath, p)
        if (fs.existsSync(abs)) fs.unlinkSync(abs)
      } catch { /* 单个文件清理失败不阻塞 */ }
    }
  } catch { /* 资产行清理失败不阻塞 */ }
}
