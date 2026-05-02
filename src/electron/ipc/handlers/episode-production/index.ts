/**
 * episode-production · IPC handler 注册中心
 * @module electron/ipc/handlers/episode-production
 * @description 剧集制作模块所有 IPC handler 的统一入口。
 * 双端共用：PC 由 electron/index.ts 调用，Web 由 register-channels.ts 调用。
 */

import { registerProjectHandlers } from './project.handler'
import { registerEpisodeHandlers } from './episode.handler'
import { registerCharacterAssetHandlers } from './asset/character-asset.handler'
import { registerLocationAssetHandlers } from './asset/location-asset.handler'
import { registerItemAssetHandlers } from './asset/item-asset.handler'
import { registerVoiceAssetHandlers } from './asset/voice-asset.handler'
import { registerScriptHandlers } from './narrative/script.handler'
import { registerStoryboardHandlers } from './narrative/storyboard.handler'
import { registerKeyframeHandlers } from './render/keyframe.handler'
import { registerVideoHandlers } from './render/video.handler'
import { registerAudioHandlers } from './render/audio.handler'
import { registerComposeHandlers } from './compose.handler'
import { registerWorkflowHandlers } from './workflow.handler'

/**
 * 注册剧集制作模块所有 IPC handler（46 个 ep:* channel）
 */
export function registerEpisodeProductionHandlers(): void {
  registerProjectHandlers()
  registerEpisodeHandlers()
  registerCharacterAssetHandlers()
  registerLocationAssetHandlers()
  registerItemAssetHandlers()
  registerVoiceAssetHandlers()
  registerScriptHandlers()
  registerStoryboardHandlers()
  registerKeyframeHandlers()
  registerVideoHandlers()
  registerAudioHandlers()
  registerComposeHandlers()
  registerWorkflowHandlers()
}
