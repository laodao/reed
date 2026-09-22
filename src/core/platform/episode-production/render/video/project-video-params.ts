/**
 * 项目级视频画质参数读取 helper（tasks/2026-09-16-storyboard-asset-cogen D6）
 * @module platform/episode-production/render/video/project-video-params
 *
 * 分镜 UI 路径（片段级 SegmentVideoService / 单镜 VideoSegmentService）生成视频时，
 * 从 video_projects.config 读 videoQuality / videoSteps 透传到 VideoGenerationRequest
 * （ComfyUI H3 provider 已支持，见评审 #105）。未配置 → 返回 {}，调用方不传字段，
 * provider 保持各自默认（H3 为 high / steps 20）。
 */

import type { DataSource } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import type { VideoProjectConfig } from '@shared/types/episode-production/workflow.types'

export interface ProjectVideoParams {
  quality?: 'high' | 'low'
  steps?: number
  /** 项目风格词（config.stylePrompt），拼进视频提示词约束 */
  stylePrompt?: string
  /**
   * 视频生成路径（2026-09-21 一致性修复 v2，缺省按 'assetRef'）：
   *   'assetRef' — 提示词引用资产：@资产/结构化字段 → 资产主图作外观参考（唯一开通路径）；
   *   'keyframe' — 旧关键帧路径（keyframes2video/image2video），已暂停，仅作回切换。
   * 缺省 assetRef 的原因：关键帧 11/11 废帧（照抄参考板）后，关键帧依赖型路径全部失锚。
   */
  renderPath?: 'assetRef' | 'keyframe'
}

/** 从 video_projects.config 读视频画质参数；项目不存在/未配置 → {}（provider 默认） */
export async function getProjectVideoParams(
  ds: DataSource,
  projectId: string,
): Promise<ProjectVideoParams> {
  if (!ds.hasMetadata(VideoProjectEntity)) return {}
  const project = await ds
    .getRepository(VideoProjectEntity)
    .findOne({ where: { id: projectId } })
  const cfg = (project?.config ?? {}) as Partial<VideoProjectConfig>
  const params: ProjectVideoParams = {}
  if (cfg.videoQuality === 'high' || cfg.videoQuality === 'low') {
    params.quality = cfg.videoQuality
  }
  if (typeof cfg.videoSteps === 'number' && cfg.videoSteps > 0) {
    params.steps = cfg.videoSteps
  }
  if (typeof (cfg as any).stylePrompt === 'string' && (cfg as any).stylePrompt.trim()) {
    params.stylePrompt = (cfg as any).stylePrompt.trim()
  }
  // 一致性修复 v2：renderPath 缺省 = 'assetRef'（关键帧/图生视频路径已暂停）
  params.renderPath = (cfg as any).renderPath === 'keyframe' ? 'keyframe' : 'assetRef'
  return params
}

/** 片段级入口：episode → project（链断 → {}，不阻塞生成） */
export async function resolveVideoParamsForEpisode(
  ds: DataSource,
  episodeId: string,
): Promise<ProjectVideoParams> {
  if (!ds.hasMetadata(VideoEpisodeEntity)) return {}
  const episode = await ds
    .getRepository(VideoEpisodeEntity)
    .findOne({ where: { id: episodeId } })
  if (!episode?.projectId) return {}
  return await getProjectVideoParams(ds, episode.projectId)
}

/** 单镜入口：storyboard → scene → episodeScript → episode → project（链断 → {}） */
export async function resolveVideoParamsForStoryboard(
  ds: DataSource,
  storyboardId: string,
): Promise<ProjectVideoParams> {
  if (!ds.hasMetadata(StoryboardEntity)) return {}
  const sb = await ds
    .getRepository(StoryboardEntity)
    .findOne({ where: { id: storyboardId } })
  if (!sb || !ds.hasMetadata(SceneScriptEntity)) return {}
  const scene = await ds
    .getRepository(SceneScriptEntity)
    .findOne({ where: { id: sb.sceneScriptId } })
  if (!scene || !ds.hasMetadata(EpisodeScriptEntity)) return {}
  const script = await ds
    .getRepository(EpisodeScriptEntity)
    .findOne({ where: { id: scene.episodeScriptId } })
  if (!script?.episodeId) return {}
  return await resolveVideoParamsForEpisode(ds, script.episodeId)
}
