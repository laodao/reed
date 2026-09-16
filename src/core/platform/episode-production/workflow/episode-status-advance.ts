/**
 * Episode 状态推进原语（2026-09-16 review P0-CM2）
 * @module platform/episode-production/workflow/episode-status-advance
 *
 * 修复前状态机空转：全仓只写 pending/scripting，storyboarding/producing/composing/
 * completed 四个后段状态零写者，进度恒 35%、completed 终态不可达。
 * 本模块提供「只前进、不回退」的推进原语，供各生产环节完成时调用：
 *   - 剧本生成 → scripting（script.handler / ep-agent-actions 既有写法保留）
 *   - 分镜生成 → storyboarding（storyboard.handler / ep-agent-actions）
 *   - 视频/片段出片 → producing（video-segment / segment-video service）
 *   - 导出开始/成功 → composing / completed（episode-mp4-exporter.service）
 *
 * 语义：STAGE_ORDER 上 target ≤ current 时跳过（用户手动回退后重新生成不降级）；
 * 未知当前状态视为 pending（最弱），允许推进。裸 repo 直取与 compose/render 域
 * 既有风格一致（scoped 收编见 0914 登记后续项 1）。
 */

import type { DataSource } from 'typeorm'
import { STAGE_ORDER } from './episode-status.machine'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import type { EpisodeStatus } from '@shared/types/episode-production'

/** 按状态机推进 episode 状态（只前进不回退）。返回是否实际写入。 */
export async function advanceEpisodeStatus(
  ds: DataSource,
  episodeId: string,
  target: EpisodeStatus,
): Promise<boolean> {
  const repo = ds.getRepository(VideoEpisodeEntity)
  const ep = await repo.findOne({ where: { id: episodeId } as any })
  if (!ep) return false
  const current = STAGE_ORDER[(ep.status ?? 'pending') as EpisodeStatus] ?? 1
  const targetOrder = STAGE_ORDER[target]
  if (targetOrder <= current) return false
  await repo.update({ id: episodeId } as any, { status: target, updatedAt: new Date() })
  return true
}

/** storyboardId → scene → episodeScript → episode 链式解析后推进状态。 */
export async function advanceEpisodeStatusForStoryboard(
  ds: DataSource,
  storyboardId: string,
  target: EpisodeStatus,
): Promise<boolean> {
  const sb = await ds.getRepository(StoryboardEntity).findOne({ where: { id: storyboardId } as any })
  if (!sb) return false
  const scene = await ds
    .getRepository(SceneScriptEntity)
    .findOne({ where: { id: sb.sceneScriptId } as any })
  if (!scene) return false
  const script = await ds
    .getRepository(EpisodeScriptEntity)
    .findOne({ where: { id: scene.episodeScriptId } as any })
  if (!script) return false
  return advanceEpisodeStatus(ds, script.episodeId, target)
}
