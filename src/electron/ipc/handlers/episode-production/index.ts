/**
 * episode-production · IPC handler 注册中心
 * @module electron/ipc/handlers/episode-production
 * @description 剧集制作模块所有 IPC handler 的统一入口。
 * 双端共用：PC 由 electron/index.ts 调用，Web 由 register-channels.ts 调用。
 */

import { registerProjectHandlers } from './project.handler'
import { registerEpisodeHandlers } from './episode.handler'
import {
  registerCharacterAssetHandlers,
  registerLocationAssetHandlers,
  registerItemAssetHandlers,
  registerVoiceAssetHandlers,
  registerAssetImageHandlers,
  registerDerivationHandlers,
  registerImportHandlers,
  registerPanoramaHandlers,
} from './asset'
import { registerScriptHandlers } from './narrative/script.handler'
import { registerStoryboardHandlers } from './narrative/storyboard.handler'
import { registerReferenceHandlers } from './narrative/reference.handler'
import { registerKeyframeHandlers } from './render/keyframe.handler'
import { registerVideoHandlers } from './render/video.handler'
import { registerAudioHandlers } from './render/audio.handler'
import { registerComposeHandlers } from './compose.handler'
import { registerWorkflowHandlers } from './workflow.handler'

/**
 * 注册剧集制作模块所有 IPC handler（V2 老 channel + V2.5 新增资产域 ep:asset:* channel）
 */
export function registerEpisodeProductionHandlers(): void {
  registerProjectHandlers()
  registerEpisodeHandlers()
  registerCharacterAssetHandlers()
  registerLocationAssetHandlers()
  registerItemAssetHandlers()
  registerVoiceAssetHandlers()
  // V2.5 新增：统一图谱 / 派生 / 引用导入
  registerAssetImageHandlers()
  registerDerivationHandlers()
  registerImportHandlers()
  // P3c Task 4 新增：360 全景 + 视角截图
  registerPanoramaHandlers()
  registerScriptHandlers()
  registerStoryboardHandlers()
  // P4-T6 新增：引用解析 + 完整性校验
  registerReferenceHandlers()
  registerKeyframeHandlers()
  registerVideoHandlers()
  registerAudioHandlers()
  registerComposeHandlers()
  registerWorkflowHandlers()
}
