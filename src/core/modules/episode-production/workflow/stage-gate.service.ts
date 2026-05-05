/**
 * 阶段门控 service（spec §2.2 / §2.3 · P6-T9）
 * @module modules/episode-production/workflow/stage-gate.service
 *
 * 给每个阶段定义"完成条件"——满足后才能进入下一阶段（软引导 + 末端硬锁）。
 *
 * 各阶段完成条件（spec §2.2）：
 *   ① 内容        → 用户已点"确认要素"（episode.uploadedCharacters 非空 OR outline 已选）
 *   ② 资产        → 所有出场要素都有可用主图（character/location/item bindings 主图就绪）
 *   ③ 剧本        → 用户点"剧本定稿"（status >= scripting 且通过 P4 完整性校验）
 *   ④ 分镜        → 每场 ≥1 个 Storyboard
 *   ⑤ 制作        → 所有分镜 videoPath 非空
 *   ⑥ 合成        → 导出 MP4（status='completed'）
 *
 * 提供 canEnterStage(currentStatus, targetStatus) 决策 + 缺失项详情，便于 UI 渲染
 *   "前置未完成"提示 + "仍要进入" / "回到 ② 资产"两路。
 *
 * 末端硬锁（spec §2.3）：⑥ 合成 → completed 必须满足"所有分镜 videoPath 非空"；
 * 前面阶段允许"软" 跳过。
 *
 * 仅查询 + 计算，不修改数据。
 */

import type { DataSource } from 'typeorm'
import type { EpisodeStatus } from '@shared/types/episode-production'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { classifyTransition } from './episode-status.machine'

/** 缺失项详情（UI 渲染用） */
export interface StageGap {
  code: string
  message: string
  /** 可选：跳转目标（如 sceneId / bindingId） */
  targetId?: string
}

/** 进入阶段决策结果 */
export interface StageEnterDecision {
  allowed: boolean
  /** 缺失项列表（allowed=true 时为空） */
  gaps: StageGap[]
  /** 即使 allowed=false，是否允许"仍要进入"（前向跳转的软放过；末端硬锁此值为 false） */
  canForce: boolean
}

/** 阶段完成判断结果 */
export interface StageCompletionStatus {
  stage: EpisodeStatus
  complete: boolean
  /** 当 incomplete 时缺啥 */
  gaps: StageGap[]
}

export class StageGateService {
  private readonly imageSvc: AssetImageService

  constructor(private readonly ds: DataSource) {
    this.imageSvc = new AssetImageService(ds)
  }

  /**
   * 决策：当前状态能否进入目标状态（前向跳转）。
   *
   * - 同状态 / 回退：直接 allowed=true
   * - 前向跳转：检查目标状态前一阶段的完成条件
   * - completed（末端硬锁）：必须⑤ 制作完成（所有分镜有 videoPath）
   */
  async canEnterStage(
    episodeId: string,
    currentStatus: EpisodeStatus,
    targetStatus: EpisodeStatus,
  ): Promise<StageEnterDecision> {
    const dir = classifyTransition(currentStatus, targetStatus)
    if (dir !== 'forward') {
      return { allowed: true, gaps: [], canForce: true }
    }

    if (targetStatus === 'completed') {
      // 末端硬锁
      const completion = await this.checkProducingComplete(episodeId)
      return {
        allowed: completion.complete,
        gaps: completion.gaps,
        canForce: false,
      }
    }

    // 软关卡：检查目标状态的前置阶段是否完成；不完成的话也允许 force
    const prevStage = previousStage(targetStatus)
    if (!prevStage) {
      return { allowed: true, gaps: [], canForce: true }
    }
    const completion = await this.checkStageComplete(episodeId, prevStage)
    return {
      allowed: completion.complete,
      gaps: completion.gaps,
      canForce: true,
    }
  }

  /**
   * 直接判某个具体阶段是否完成，独立于当前状态。
   * 用于 progress-calculator 拉每阶段进度。
   */
  async checkStageComplete(
    episodeId: string,
    stage: EpisodeStatus,
  ): Promise<StageCompletionStatus> {
    if (stage === 'pending') return this.checkContentComplete(episodeId)
    if (stage === 'asset_prep') return this.checkAssetComplete(episodeId)
    if (stage === 'scripting') return this.checkScriptComplete(episodeId)
    if (stage === 'storyboarding') return this.checkStoryboardComplete(episodeId)
    if (stage === 'producing') return this.checkProducingComplete(episodeId)
    if (stage === 'composing') return this.checkComposingComplete(episodeId)
    if (stage === 'completed') {
      return { stage, complete: true, gaps: [] }
    }
    return { stage, complete: false, gaps: [] }
  }

  // ─── 各阶段完成检查 ──────────────────────────────────

  /** ① 内容：识别要素已确认（uploadedCharacters 非空或 outline 已选） */
  private async checkContentComplete(
    episodeId: string,
  ): Promise<StageCompletionStatus> {
    const ep = await this.ds
      .getRepository(VideoEpisodeEntity)
      .findOne({ where: { id: episodeId } })
    if (!ep) {
      return {
        stage: 'pending',
        complete: false,
        gaps: [{ code: 'EPISODE_NOT_FOUND', message: '剧集不存在' }],
      }
    }
    const hasOutline = (ep as any).outlineId != null
    let uploadedChars = (ep as any).uploadedCharacters
    if (typeof uploadedChars === 'string') {
      try {
        uploadedChars = JSON.parse(uploadedChars)
      } catch {
        uploadedChars = []
      }
    }
    const hasUploaded = Array.isArray(uploadedChars) && uploadedChars.length > 0
    if (hasOutline || hasUploaded) {
      return { stage: 'pending', complete: true, gaps: [] }
    }
    return {
      stage: 'pending',
      complete: false,
      gaps: [
        {
          code: 'CONTENT_NOT_CONFIRMED',
          message: '请先选择章节大纲或上传长文并识别要素',
        },
      ],
    }
  }

  /** ② 资产：所有 binding 都有主图 */
  private async checkAssetComplete(
    episodeId: string,
  ): Promise<StageCompletionStatus> {
    const ep = await this.ds
      .getRepository(VideoEpisodeEntity)
      .findOne({ where: { id: episodeId } })
    if (!ep) {
      return {
        stage: 'asset_prep',
        complete: false,
        gaps: [{ code: 'EPISODE_NOT_FOUND', message: '剧集不存在' }],
      }
    }
    const projectId = ep.projectId
    const gaps: StageGap[] = []

    const charRepo = this.ds.getRepository(CharacterBindingEntity)
    const locRepo = this.ds.getRepository(LocationBindingEntity)
    const itemRepo = this.ds.getRepository(ItemBindingEntity)

    const chars = await charRepo.find({ where: { projectId } })
    for (const b of chars) {
      const main = await this.imageSvc.getMainImage('character', b.id)
      if (!main) {
        gaps.push({
          code: 'CHARACTER_MAIN_IMAGE_MISSING',
          message: `角色"${b.standaloneName ?? b.id}"还没生成主图`,
          targetId: b.id,
        })
      }
    }
    const locs = await locRepo.find({ where: { projectId } })
    for (const b of locs) {
      const main = await this.imageSvc.getMainImage('location', b.id)
      if (!main) {
        gaps.push({
          code: 'LOCATION_MAIN_IMAGE_MISSING',
          message: `地点"${(b as any).locationName ?? b.id}"还没生成主图`,
          targetId: b.id,
        })
      }
    }
    const items = await itemRepo.find({ where: { projectId } })
    for (const b of items) {
      const main = await this.imageSvc.getMainImage('item', b.id)
      if (!main) {
        gaps.push({
          code: 'ITEM_MAIN_IMAGE_MISSING',
          message: `物品"${(b as any).itemName ?? b.id}"还没生成主图`,
          targetId: b.id,
        })
      }
    }
    return {
      stage: 'asset_prep',
      complete: gaps.length === 0,
      gaps,
    }
  }

  /** ③ 剧本：episode_script 存在 + status='approved' */
  private async checkScriptComplete(
    episodeId: string,
  ): Promise<StageCompletionStatus> {
    const script = await this.ds
      .getRepository(EpisodeScriptEntity)
      .findOne({ where: { episodeId } })
    if (!script) {
      return {
        stage: 'scripting',
        complete: false,
        gaps: [{ code: 'SCRIPT_NOT_GENERATED', message: '剧本尚未生成' }],
      }
    }
    if ((script as any).status !== 'approved') {
      return {
        stage: 'scripting',
        complete: false,
        gaps: [
          {
            code: 'SCRIPT_NOT_APPROVED',
            message: '剧本未定稿（请通过完整性校验后点定稿）',
          },
        ],
      }
    }
    return { stage: 'scripting', complete: true, gaps: [] }
  }

  /** ④ 分镜：每个场景至少一个 storyboard */
  private async checkStoryboardComplete(
    episodeId: string,
  ): Promise<StageCompletionStatus> {
    const script = await this.ds
      .getRepository(EpisodeScriptEntity)
      .findOne({ where: { episodeId } })
    if (!script) {
      return {
        stage: 'storyboarding',
        complete: false,
        gaps: [{ code: 'SCRIPT_NOT_FOUND', message: '剧本不存在' }],
      }
    }
    const scenes = await this.ds
      .getRepository(SceneScriptEntity)
      .find({ where: { episodeScriptId: script.id } })
    if (scenes.length === 0) {
      return {
        stage: 'storyboarding',
        complete: false,
        gaps: [{ code: 'NO_SCENES', message: '剧本没有任何场景' }],
      }
    }
    const sbRepo = this.ds.getRepository(StoryboardEntity)
    const gaps: StageGap[] = []
    for (const scene of scenes) {
      const count = await sbRepo.count({ where: { sceneScriptId: scene.id } })
      if (count === 0) {
        gaps.push({
          code: 'SCENE_NO_STORYBOARD',
          message: `场景 ${scene.sceneNumber} 还没生成分镜`,
          targetId: scene.id,
        })
      }
    }
    return {
      stage: 'storyboarding',
      complete: gaps.length === 0,
      gaps,
    }
  }

  /** ⑤ 制作：所有 storyboard 都有 videoPath */
  private async checkProducingComplete(
    episodeId: string,
  ): Promise<StageCompletionStatus> {
    const script = await this.ds
      .getRepository(EpisodeScriptEntity)
      .findOne({ where: { episodeId } })
    if (!script) {
      return {
        stage: 'producing',
        complete: false,
        gaps: [{ code: 'SCRIPT_NOT_FOUND', message: '剧本不存在' }],
      }
    }
    const scenes = await this.ds
      .getRepository(SceneScriptEntity)
      .find({ where: { episodeScriptId: script.id } })
    const gaps: StageGap[] = []
    for (const scene of scenes) {
      const sbs = await this.ds
        .getRepository(StoryboardEntity)
        .find({ where: { sceneScriptId: scene.id } })
      for (const sb of sbs) {
        if (!sb.videoPath) {
          gaps.push({
            code: 'SHOT_VIDEO_MISSING',
            message: `场景 ${scene.sceneNumber} 镜头 ${sb.shotNumber} 还没生成视频`,
            targetId: sb.id,
          })
        }
      }
    }
    return {
      stage: 'producing',
      complete: gaps.length === 0,
      gaps,
    }
  }

  /** ⑥ 合成：episode.composedVideoPath 非空（用户已成功导出 MP4） */
  private async checkComposingComplete(
    episodeId: string,
  ): Promise<StageCompletionStatus> {
    const ep = await this.ds
      .getRepository(VideoEpisodeEntity)
      .findOne({ where: { id: episodeId } })
    if (!ep) {
      return {
        stage: 'composing',
        complete: false,
        gaps: [{ code: 'EPISODE_NOT_FOUND', message: '剧集不存在' }],
      }
    }
    const composed = (ep as any).composedVideoPath
    if (!composed) {
      return {
        stage: 'composing',
        complete: false,
        gaps: [{ code: 'NOT_EXPORTED', message: '尚未导出 MP4' }],
      }
    }
    return { stage: 'composing', complete: true, gaps: [] }
  }
}

/** 拿目标阶段的前一阶段（用于 canEnterStage 软关卡） */
function previousStage(stage: EpisodeStatus): EpisodeStatus | null {
  switch (stage) {
    case 'pending':
      return null
    case 'asset_prep':
      return 'pending'
    case 'scripting':
      return 'asset_prep'
    case 'storyboarding':
      return 'scripting'
    case 'producing':
      return 'storyboarding'
    case 'composing':
      return 'producing'
    case 'completed':
      return 'composing'
    default:
      return null
  }
}
