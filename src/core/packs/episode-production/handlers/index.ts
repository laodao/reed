/**
 * episode-production · IPC handler 注册中心
 * @module core/packs/episode-production/handlers
 * @description 剧集制作模块所有 IPC handler 的统一入口。
 * 双端共用：PC/Web 均由 episodeProductionPack.activate() 调用（包内核统一激活）。
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
  registerAssetReferenceImageHandlers,
  registerAssetSummaryHandlers,
  registerAssetSettingEnrichmentHandlers,
} from './asset'
import { registerScriptHandlers } from './narrative/script.handler'
import { registerStoryboardHandlers } from './narrative/storyboard.handler'
import { registerStoryboardCharacterHandlers } from './narrative/storyboard-character.handler'
import { registerStoryboardThumbnailHandlers } from './narrative/storyboard-thumbnail.handler'
import { registerUserAssetHandlers } from './asset/user-asset.handler'
import { registerReferenceVideoHandlers } from './narrative/reference-video.handler'
import { registerPresetDigitalHandlers } from './asset/preset-digital.handler'
import { registerCharacterExtractionHandlers } from './asset/character-extraction.handler'
import { registerReferenceHandlers } from './narrative/reference.handler'
import { registerKeyframeHandlers } from './render/keyframe.handler'
import { registerVideoHandlers } from './render/video.handler'
import { registerVideoSegmentHandlers } from './render/video-segment.handler'
import { registerSegmentHandlers } from './render/segment.handler'
import { registerAudioHandlers } from './render/audio.handler'
import { registerComposeHandlers } from './compose.handler'
import { registerWorkflowHandlers } from './workflow.handler'
import { registerEpisodeAgentHandlers } from './agent.handler'

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
  // spec 2026-05-09：资产参考图上传（主图生成 reference）
  registerAssetReferenceImageHandlers()
  // FU5-C1 项目级资产聚合
  registerAssetSummaryHandlers()
  // spec 2026-05-07 · AI 设定反推
  registerAssetSettingEnrichmentHandlers()
  registerScriptHandlers()
  registerStoryboardHandlers()
  // P5-T32 分镜内角色独立配置（spec §4.5.3）
  registerStoryboardCharacterHandlers()
  // spec 2026-05-09 ep-redesign §3.2 B7 · 9 帧故事板预览
  registerStoryboardThumbnailHandlers()
  // spec 2026-05-09 ep-redesign §3.2 D2 · 跨项目角色库
  registerUserAssetHandlers()
  // spec 2026-05-09 ep-redesign §3.2 D5 · 视频解析
  registerReferenceVideoHandlers()
  // spec 2026-05-09 ep-redesign §3.2 D3 · 数字人池（list + 按需生成形象图）
  registerPresetDigitalHandlers()
  // spec 2026-05-09 ep-redesign §3.2 E1 · Phase 5 视频提取主体
  registerCharacterExtractionHandlers()
  // P4-T6 新增：引用解析 + 完整性校验
  registerReferenceHandlers()
  registerKeyframeHandlers()
  registerVideoHandlers()
  // P5-T13 视频片段 + provider 列表
  registerVideoSegmentHandlers()
  // 视频片段制（2026-09-04）：自动分段 + 片段级生成
  registerSegmentHandlers()
  registerAudioHandlers()
  registerComposeHandlers()
  registerWorkflowHandlers()
  registerEpisodeAgentHandlers()
}
