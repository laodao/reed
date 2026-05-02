/**
 * compose · barrel
 * @module modules/episode-production/compose
 * @description 合成域子服务统一出口。
 */
export { FfmpegAssemblerService } from './ffmpeg-assembler.service'
export { TransitionService } from './transition.service'
export { ShotVideoService } from './shot-video.service'
export { SceneShotsService } from './scene-shots.service'
export { AudioMixService } from './audio-mix.service'
export { SceneVideoService } from './scene-video.service'
export type {
  VideoSynthesisConfig,
  TransitionType,
  TransitionConfig,
  SynthesisResult
} from './types'
export { PRESET_VIDEO_CONFIGS } from './types'
