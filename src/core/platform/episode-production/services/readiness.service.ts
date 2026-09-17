/**
 * 阶段就绪状态机 service（tasks/2026-09-16-ep-studio-polish · S-01）
 * @module platform/episode-production/services/readiness.service
 *
 * evaluateEpisode(episodeId) 按 Studio 四 tab（剧本/资产/分镜/合成）给出就绪状态，
 * 供 EpisodeStudio 状态点 + 提示条 + 按钮 gating 使用。仅查询，不修改数据。
 *
 * 判定规则（design.md S-01）：
 *   剧本：episode_scripts 存在且 scene_scripts 非空；
 *   资产：项目 binding 数 > 0，且每个出场角色/地点都有主图
 *         （asset_image is_main=1 且 image_path 非空）；缺谁列谁。
 *         出场集合 = 场景 characters[].characterBindingId + 场景 locationBindingId
 *                  + 分镜 characters[].characterId + 分镜 locationBindingIds；
 *   分镜：storyboards 非空，且每个镜的 characters[].characterId 全非空
 *         （characters 为空数组的镜算合格）；
 *   合成：非 superseded 片段存在且全部 completed 且有 video_path。
 *
 * 与 workflow/stage-gate.service.ts 的区别：stage-gate 面向 6 段状态机流转
 * （含 approved 定稿、 composedVideoPath 等），本 service 面向 Studio 四 tab 的
 * "这一步还差什么"提示，规则更贴 tab 语义。
 */

import type { DataSource } from 'typeorm'
import type { SceneCharacter, StoryboardCharacter } from '@shared/types/story-to-video.types'
import { VideoEpisodeRepository } from '@core/database/repositories/video-episode.repository'
import { EpisodeScriptRepository } from '@core/database/repositories/episode-script.repository'
import { SceneScriptRepository } from '@core/database/repositories/scene-script.repository'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { CharacterBindingRepository } from '@core/database/repositories/character-binding.repository'
import { LocationBindingRepository } from '@core/database/repositories/location-binding.repository'
import { ItemBindingRepository } from '@core/database/repositories/item-binding.repository'
import { AssetImageRepository } from '@core/database/repositories/asset-image.repository'
import { EpVideoSegmentRepository } from '@core/database/repositories/video-segment.repository'

/** 单阶段就绪状态：ready + 缺失项人类可读列表（UI 提示条直接渲染） */
export interface EpisodeStageReadiness {
  ready: boolean
  missing: string[]
}

/** 四阶段就绪结果（key 与 Studio tab 对应：script/asset/storyboard/compose） */
export interface EpisodeReadiness {
  script: EpisodeStageReadiness
  assets: EpisodeStageReadiness
  storyboard: EpisodeStageReadiness
  compose: EpisodeStageReadiness
}

export class EpisodeReadinessService {
  private readonly episodeRepo: VideoEpisodeRepository
  private readonly scriptRepo: EpisodeScriptRepository
  private readonly sceneRepo: SceneScriptRepository
  private readonly storyboardRepo: StoryboardRepository
  private readonly charBindingRepo: CharacterBindingRepository
  private readonly locBindingRepo: LocationBindingRepository
  private readonly itemBindingRepo: ItemBindingRepository
  private readonly assetImageRepo: AssetImageRepository
  private readonly segmentRepo: EpVideoSegmentRepository

  constructor(ds: DataSource) {
    this.episodeRepo = new VideoEpisodeRepository(ds)
    this.scriptRepo = new EpisodeScriptRepository(ds)
    this.sceneRepo = new SceneScriptRepository(ds)
    this.storyboardRepo = new StoryboardRepository(ds)
    this.charBindingRepo = new CharacterBindingRepository(ds)
    this.locBindingRepo = new LocationBindingRepository(ds)
    this.itemBindingRepo = new ItemBindingRepository(ds)
    this.assetImageRepo = new AssetImageRepository(ds)
    this.segmentRepo = new EpVideoSegmentRepository(ds)
  }

  async evaluateEpisode(episodeId: string): Promise<EpisodeReadiness> {
    const episode = await this.episodeRepo.getById(episodeId)
    if (!episode) throw new Error('剧集不存在')

    const script = await this.scriptRepo.getByEpisodeId(episodeId)
    const scenes = script ? await this.sceneRepo.getByEpisodeScriptId(script.id) : []
    const storyboards = []
    for (const scene of scenes) {
      storyboards.push(...(await this.storyboardRepo.getBySceneScriptId(scene.id)))
    }

    return {
      script: this.evalScript(script != null, scenes.length),
      assets: await this.evalAssets(episode.projectId, scenes, storyboards),
      storyboard: this.evalStoryboard(scenes, storyboards),
      compose: await this.evalCompose(episodeId),
    }
  }

  /** 剧本：episode_scripts 存在且 scene_scripts 非空 */
  private evalScript(hasScript: boolean, sceneCount: number): EpisodeStageReadiness {
    const missing: string[] = []
    if (!hasScript) missing.push('剧本尚未生成')
    else if (sceneCount === 0) missing.push('剧本没有任何场景')
    return { ready: missing.length === 0, missing }
  }

  /**
   * 资产：项目 binding 数 > 0，且每个出场角色/地点有主图（is_main=1 且 image_path 非空）。
   * 无剧本/分镜时出场集合为空 → 只要求有 binding（资产 tab 本来就先于剧本准备资产）。
   */
  private async evalAssets(
    projectId: string,
    scenes: Awaited<ReturnType<SceneScriptRepository['getByEpisodeScriptId']>>,
    storyboards: Awaited<ReturnType<StoryboardRepository['getBySceneScriptId']>>,
  ): Promise<EpisodeStageReadiness> {
    const [chars, locs, items] = await Promise.all([
      this.charBindingRepo.getByProjectId(projectId),
      this.locBindingRepo.getByProjectId(projectId),
      this.itemBindingRepo.getByProjectId(projectId),
    ])
    const missing: string[] = []
    if (chars.length + locs.length + items.length === 0) {
      missing.push('项目还没有任何资产（角色 / 地点 / 物品至少创建一个）')
      return { ready: false, missing }
    }

    // 出场角色 binding 集合：场景 characters[].characterBindingId + 分镜 characters[].characterId
    const charNameById = new Map(
      chars.map(b => [b.id, b.overrideName ?? b.standaloneName ?? b.id] as const),
    )
    const locNameById = new Map(
      locs.map(b => [b.id, b.overrideName ?? b.standaloneName ?? b.locationName ?? b.id] as const),
    )
    const appearingCharIds = new Set<string>()
    const appearingLocIds = new Set<string>()
    for (const scene of scenes) {
      for (const c of (scene.characters ?? []) as SceneCharacter[]) {
        if (c.characterBindingId) appearingCharIds.add(c.characterBindingId)
      }
      if (scene.locationBindingId) appearingLocIds.add(scene.locationBindingId)
    }
    for (const sb of storyboards) {
      for (const c of (sb.characters ?? []) as StoryboardCharacter[]) {
        if (c.characterId) appearingCharIds.add(c.characterId)
      }
      for (const id of sb.locationBindingIds ?? []) {
        if (id) appearingLocIds.add(id)
      }
    }

    for (const id of appearingCharIds) {
      if (!(await this.hasMainImage('character', id))) {
        missing.push(`角色「${charNameById.get(id) ?? id}」还没有主图`)
      }
    }
    for (const id of appearingLocIds) {
      if (!(await this.hasMainImage('location', id))) {
        missing.push(`地点「${locNameById.get(id) ?? id}」还没有主图`)
      }
    }
    return { ready: missing.length === 0, missing }
  }

  /** 主图就绪 = asset_image 存在 is_main=1 且 image_path 非空的行 */
  private async hasMainImage(
    assetType: 'character' | 'location',
    assetId: string,
  ): Promise<boolean> {
    const main = await this.assetImageRepo.getMainImage(assetType, assetId)
    return !!main?.imagePath
  }

  /** 分镜：storyboards 非空，且每镜 characters[].characterId 全非空（空 characters 数组合格） */
  private evalStoryboard(
    scenes: Awaited<ReturnType<SceneScriptRepository['getByEpisodeScriptId']>>,
    storyboards: Awaited<ReturnType<StoryboardRepository['getBySceneScriptId']>>,
  ): EpisodeStageReadiness {
    const missing: string[] = []
    if (storyboards.length === 0) {
      missing.push('尚未生成分镜')
      return { ready: false, missing }
    }
    const sceneNoById = new Map(scenes.map(s => [s.id, s.sceneNumber] as const))
    for (const sb of storyboards) {
      const chars = (sb.characters ?? []) as StoryboardCharacter[]
      const unbound = chars.filter(c => !c.characterId).length
      if (unbound > 0) {
        missing.push(
          `场景 ${sceneNoById.get(sb.sceneScriptId) ?? '?'} 镜头 ${sb.shotNumber} 有 ${unbound} 个角色未绑定资产`,
        )
      }
    }
    return { ready: missing.length === 0, missing }
  }

  /** 合成：非 superseded 片段存在且全部 completed 且有 video_path */
  private async evalCompose(episodeId: string): Promise<EpisodeStageReadiness> {
    const all = await this.segmentRepo.listByEpisode(episodeId)
    const active = all.filter(s => s.status !== 'superseded')
    const missing: string[] = []
    if (active.length === 0) {
      missing.push('尚无视频片段（请先在「分镜」页分段并生成片段视频）')
      return { ready: false, missing }
    }
    for (const seg of active) {
      if (seg.status !== 'completed') {
        missing.push(`片段 ${seg.seq} 未完成生成（当前状态：${seg.status}）`)
      } else if (!seg.videoPath) {
        missing.push(`片段 ${seg.seq} 缺少视频文件`)
      }
    }
    return { ready: missing.length === 0, missing }
  }
}
