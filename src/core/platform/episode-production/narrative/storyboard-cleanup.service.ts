/**
 * 分镜级联清理（2026-09-19 review P2-14）
 * @module platform/episode-production/narrative/storyboard-cleanup
 *
 * 所有"删分镜"路径的统一出口。原各删除路径只删 storyboards 行（至多连带
 * storyboard_keyframe 行），keyframe 的 image_assets 行与磁盘文件、片段归属
 * 全部残留成孤儿。本服务一次收齐：
 *   1. storyboard_characters 行
 *   2. storyboard_keyframe 行 + 对应 image_assets 行 + 磁盘文件
 *      （复用 render/keyframe/keyframe-cleanup 的 deleteKeyframeWithAsset）
 *   3. 受影响 ep_video_segments：凡关联了被删分镜的片段置 superseded
 *      （语义同 ep-segmentation.recompute：保留行与 video_path 可追溯，
 *      不再参与合成/导出；不自造状态值）
 *   4. storyboards 行
 *
 * dbOrTx 传 DataSource 时整体包一层事务（与 script.handler 删场景重建同事务
 * 先例一致）；传事务内 EntityManager 时并入 caller 事务。
 */

import { DataSource, In, type EntityManager } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { StoryboardCharacterEntity } from '@core/database/entities/episode-production/storyboard-character.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import {
  deleteKeyframeWithAsset,
  userScopeWhere,
} from '@core/platform/episode-production/render/keyframe/keyframe-cleanup'

export interface StoryboardCleanupSummary {
  /** 实际删除的分镜行数 */
  storyboards: number
  /** 删除的关键帧行数（其 image_assets 行与磁盘文件由 deleteKeyframeWithAsset 回收） */
  keyframes: number
  /** 被置 superseded 的片段 id */
  supersededSegments: string[]
}

const emptySummary = (): StoryboardCleanupSummary => ({ storyboards: 0, keyframes: 0, supersededSegments: [] })

export async function cleanupStoryboards(
  dbOrTx: DataSource | EntityManager,
  storyboardIds: string[],
): Promise<StoryboardCleanupSummary> {
  const ids = [...new Set(storyboardIds)].filter(Boolean)
  if (ids.length === 0) return emptySummary()
  if (dbOrTx instanceof DataSource) {
    return dbOrTx.transaction(manager => execCleanup(manager, ids))
  }
  return execCleanup(dbOrTx, ids)
}

async function execCleanup(
  qr: EntityManager,
  ids: string[],
): Promise<StoryboardCleanupSummary> {
  const scope = userScopeWhere()
  const sbRepo = qr.getRepository(StoryboardEntity)
  const sbcRepo = qr.getRepository(StoryboardCharacterEntity)
  const kfRepo = qr.getRepository(StoryboardKeyframeEntity)
  const segRepo = qr.getRepository(EpVideoSegmentEntity)

  const storyboards = await sbRepo.find({ where: { id: In(ids), ...scope } as any })
  const foundIds = storyboards.map(s => s.id)
  if (foundIds.length === 0) return emptySummary()

  // 1. storyboard_characters
  await sbcRepo.delete({ storyboardId: In(foundIds), ...scope } as any)

  // 2. storyboard_keyframe + image_assets + 磁盘文件
  const kfRows = await kfRepo.find({
    where: { storyboardId: In(foundIds), ...scope } as any,
    select: ['id'] as any,
  })
  for (const kf of kfRows) {
    await deleteKeyframeWithAsset(qr, kf.id)
  }

  // 3. 关联了被删分镜的片段 → superseded
  const segmentIds = [
    ...new Set(
      storyboards
        .map(s => s.segmentId)
        .filter((id): id is string => !!id),
    ),
  ]
  if (segmentIds.length > 0) {
    await segRepo.update(
      { id: In(segmentIds), ...scope } as any,
      { status: 'superseded', updatedAt: new Date() } as any,
    )
  }

  // 4. storyboards 行
  await sbRepo.delete({ id: In(foundIds), ...scope } as any)

  return { storyboards: foundIds.length, keyframes: kfRows.length, supersededSegments: segmentIds }
}
