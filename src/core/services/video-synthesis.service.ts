/**
 * @deprecated 已拆分到 modules/episode-production/compose/*
 *             消费方 import 路径会在后续 task / phase 切换。
 *             本文件保留 VideoSynthesisService compat facade 以兼容现有调用方。
 */

// 重新导出类型（保持原有导出接口不变）
export type {
  VideoSynthesisConfig,
  TransitionType,
  TransitionConfig,
  SynthesisResult
} from '../modules/episode-production/compose/types'
export { PRESET_VIDEO_CONFIGS } from '../modules/episode-production/compose/types'

// 重新导出各专职 service
export {
  FfmpegAssemblerService,
  TransitionService,
  ShotVideoService,
  SceneShotsService,
  AudioMixService,
  SceneVideoService
} from '../modules/episode-production/compose'

import {
  ShotVideoService,
  SceneShotsService,
  TransitionService,
  AudioMixService,
  SceneVideoService,
  FfmpegAssemblerService
} from '../modules/episode-production/compose'

/**
 * @deprecated 改用各专职 compose service。保留 facade 兼容现有调用方。
 */
export class VideoSynthesisService {
  private static instance: VideoSynthesisService

  static getInstance(): VideoSynthesisService {
    if (!VideoSynthesisService.instance) {
      VideoSynthesisService.instance = new VideoSynthesisService()
    }
    return VideoSynthesisService.instance
  }

  private readonly shotVid = ShotVideoService.getInstance()
  private readonly sceneShots = SceneShotsService.getInstance()
  private readonly transition = TransitionService.getInstance()
  private readonly audioMix = AudioMixService.getInstance()
  private readonly sceneVid = SceneVideoService.getInstance()
  private readonly ffmpegSvc = FfmpegAssemblerService.getInstance()

  createShotVideo = this.shotVid.createShotVideo.bind(this.shotVid)
  synthesizeStoryboardVideo = this.shotVid.synthesizeStoryboardVideo.bind(this.shotVid)
  createSceneShotVideos = this.sceneShots.createSceneShotVideos.bind(this.sceneShots)
  mergeVideosWithTransitions = this.transition.mergeVideosWithTransitions.bind(this.transition)
  mixSceneAudio = this.audioMix.mixSceneAudio.bind(this.audioMix)
  synthesizeSceneVideo = this.sceneVid.synthesizeSceneVideo.bind(this.sceneVid)
  getVideoInfo = this.ffmpegSvc.getVideoInfo.bind(this.ffmpegSvc)
  exportVideo = this.ffmpegSvc.exportVideo.bind(this.ffmpegSvc)
  // 注意：getVideoOutputDir / getTempDir / runFFmpegCommand / buildXfadeFilterComplex 在原版是私有，
  //       facade 也不暴露（保留 private 含义；调用方通过 cross-service composition 走）
}
