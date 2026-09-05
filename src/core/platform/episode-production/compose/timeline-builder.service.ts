/**
 * 时间线装配 service（spec §5.3 · P6-T1）
 * @module platform/episode-production/compose/timeline-builder.service
 *
 * 把整个剧本（episode_script）的场景 + 分镜 + 视频片段拼装成一条时间线，
 * 给 P6-T4 ffmpeg-assembler / P6-T6 TimelineEditor UI 消费。
 *
 * 输入：episodeScriptId
 * 输出：Timeline = scenes[] + totalDurationSec
 *      每个 scene 含 shots[]（按 shotNumber 排序），每个 shot 有 startSec / endSec /
 *      videoPath / transition / 所属对话/旁白/动作 ID 引用。
 *
 * 时间累加规则：
 *   - 整剧从 0 开始
 *   - 每个场景紧挨上一个
 *   - 每个分镜紧挨上一个分镜
 *   - 转场不"吃"时长（fade/dissolve 等是渲染期重叠效果，时间线分镜各自仍占
 *     duration 秒；ffmpeg-assembler 用 transition.duration 做 crossfade overlap）
 *
 * 纯查询 + 纯计算（无 IO 副作用），双端共用，便于单测。
 */

import type { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import type {
  TransitionConfig,
  TransitionType,
} from '@shared/types/episode-production'

/** 时间线上的一个分镜 */
export interface TimelineShot {
  storyboardId: string
  sceneId: string
  shotNumber: number
  /** 在整个剧集内的起始秒数（按"包含全部分镜"计算；导出时仅 includeInFinal=true 才入帧） */
  startSec: number
  endSec: number
  durationSec: number
  videoPath: string | null
  /** 此分镜与前一分镜之间的转场（首镜为 null） */
  transition: TransitionConfig | null
  /** 是否入最终成片（默认 true）— 用户可在 ⑥ 时间线上切换 */
  includeInFinal: boolean
  /**
   * 所属视频片段 ID（视频片段制 2026-09-04；未分段的老项目为 null）。
   * 导出时同片段的分镜合并为一个合成单元（段内不 xfade）。
   */
  segmentId: string | null
}

/** 时间线上的一个场景 */
export interface TimelineScene {
  sceneId: string
  sceneNumber: number
  startSec: number
  endSec: number
  durationSec: number
  shots: TimelineShot[]
}

/** 整剧时间线 */
export interface Timeline {
  episodeScriptId: string
  totalDurationSec: number
  scenes: TimelineScene[]
  /** 缺失视频的分镜 ID 列表（导出 MP4 前的硬关卡，spec §2.3） */
  missingVideoStoryboardIds: string[]
}

const DEFAULT_SHOT_DURATION = 3
const DEFAULT_TRANSITION_DURATION_MS = 500

/**
 * 时间线装配服务。
 * 没有 IO 副作用：仅查表 + 计算 + 返回结构化 Timeline。
 */
export class TimelineBuilderService {
  constructor(private readonly ds: DataSource) {}

  /**
   * 装配整剧时间线。
   *
   * @param episodeScriptId 剧本 ID
   * @throws 当 episode_script 不存在或未关联任何场景
   */
  async buildEpisodeTimeline(episodeScriptId: string): Promise<Timeline> {
    const sceneRepo = this.ds.getRepository(SceneScriptEntity)
    const sbRepo = this.ds.getRepository(StoryboardEntity)
    const segRepo = this.ds.getRepository(EpVideoSegmentEntity)

    const scenes = await sceneRepo.find({
      where: { episodeScriptId },
      order: { sceneNumber: 'ASC' },
    })
    if (scenes.length === 0) {
      throw new Error(`EpisodeScript ${episodeScriptId} 没有任何场景`)
    }

    const timelineScenes: TimelineScene[] = []
    const missingVideoIds: string[] = []
    let cursorSec = 0

    // 视频片段制：分镜自身无视频但所属片段已出片时不算缺失（导出用的是片段视频）
    const segVideoCache = new Map<string, boolean>()
    const segHasVideo = async (segmentId: string | null | undefined): Promise<boolean> => {
      if (!segmentId) return false
      const cached = segVideoCache.get(segmentId)
      if (cached !== undefined) return cached
      const seg = await segRepo.findOne({ where: { id: segmentId } as any })
      const has = !!seg?.videoPath
      segVideoCache.set(segmentId, has)
      return has
    }

    for (const scene of scenes) {
      // 时间线返回全部分镜（含未入选的，让 UI 能展示并切换）；
      // 真正"入选合成"由 EpisodeMp4ExporterService 在导出时按 includeInFinal 过滤。
      const storyboards = await sbRepo.find({
        where: { sceneScriptId: scene.id },
        order: { shotNumber: 'ASC' },
      })

      const sceneStartSec = cursorSec
      const shots: TimelineShot[] = []
      for (let i = 0; i < storyboards.length; i++) {
        const sb = storyboards[i]
        const durationSec = Math.max(0.5, sb.duration ?? DEFAULT_SHOT_DURATION)
        const shotStart = cursorSec
        const shotEnd = cursorSec + durationSec

        const segId = (sb as any).segmentId ?? null
        if (!sb.videoPath && !(await segHasVideo(segId))) missingVideoIds.push(sb.id)

        shots.push({
          storyboardId: sb.id,
          sceneId: scene.id,
          shotNumber: sb.shotNumber,
          startSec: shotStart,
          endSec: shotEnd,
          durationSec,
          videoPath: sb.videoPath,
          // 首镜无 transition；其它镜从 entity 读 transition_*
          transition: i === 0 ? null : this.buildTransitionFromEntity(sb),
          includeInFinal: ((sb as any).includeInFinal ?? 1) !== 0,
          // 视频片段制（2026-09-04）：老库列由 create-ep-video-segments 迁移补齐
          segmentId: segId,
        })
        cursorSec = shotEnd
      }

      timelineScenes.push({
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        startSec: sceneStartSec,
        endSec: cursorSec,
        durationSec: cursorSec - sceneStartSec,
        shots,
      })
    }

    return {
      episodeScriptId,
      totalDurationSec: cursorSec,
      scenes: timelineScenes,
      missingVideoStoryboardIds: missingVideoIds,
    }
  }

  /** 从 storyboard entity 的规范化字段构建 TransitionConfig；无规范字段时退到默认 fade */
  private buildTransitionFromEntity(sb: StoryboardEntity): TransitionConfig {
    const type = (sb.transitionType as TransitionType | null) ?? 'fade'
    const duration =
      sb.transitionDurationMs != null
        ? Math.max(0, sb.transitionDurationMs)
        : DEFAULT_TRANSITION_DURATION_MS
    const cfg: TransitionConfig = { type, duration }
    if (sb.transitionDirection) {
      cfg.direction = sb.transitionDirection as TransitionConfig['direction']
    }
    if (sb.transitionEasing) {
      cfg.easing = sb.transitionEasing as TransitionConfig['easing']
    }
    if (sb.transitionColor) {
      cfg.color = sb.transitionColor
    }
    return cfg
  }
}
