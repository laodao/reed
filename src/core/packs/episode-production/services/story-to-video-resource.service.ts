/**
 * @deprecated 已拆分到 modules/episode-production/{render/keyframe, render/audio, assets/services}
 *             消费方 import 路径会在后续 task / phase 切换。
 */

export { buildImagePrompt, PRESET_STYLES } from '@core/platform/episode-production/render/keyframe'
export type { StyleConfig } from '@core/platform/episode-production/render/keyframe'
export { KeyframeGeneratorService } from '@core/platform/episode-production/render/keyframe'
export { NarrationSynthesisService, DialogueSynthesisService, SceneAudioService } from '@core/platform/episode-production/render/audio'
export { TempAssetService } from '@core/platform/episode-production/assets/services'

import { KeyframeGeneratorService } from '@core/platform/episode-production/render/keyframe'
import { NarrationSynthesisService, DialogueSynthesisService, SceneAudioService } from '@core/platform/episode-production/render/audio'
import { TempAssetService } from '@core/platform/episode-production/assets/services'
import { buildImagePrompt } from '@core/platform/episode-production/render/keyframe'
import type { StyleConfig } from '@core/platform/episode-production/render/keyframe'
import type {
  Storyboard,
  SceneScript,
  CharacterBinding,
  LocationBinding,
  ImageAsset
} from '@shared/types/story-to-video.types'

/**
 * @deprecated 改用各专职 service。保留 facade 兼容现有调用方。
 */
export class StoryToVideoResourceService {
  private static instance: StoryToVideoResourceService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): StoryToVideoResourceService {
    if (!StoryToVideoResourceService.instance) {
      StoryToVideoResourceService.instance = new StoryToVideoResourceService()
    }
    return StoryToVideoResourceService.instance
  }

  // ==================== 图像生成 ====================

  buildImagePrompt(
    storyboard: Storyboard,
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    locationBindings: LocationBinding[],
    styleConfig: StyleConfig
  ): string {
    return buildImagePrompt(storyboard, scene, characterBindings, locationBindings, styleConfig)
  }

  async generateStoryboardImage(
    storyboard: Storyboard,
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    locationBindings: LocationBinding[],
    styleName: string,
    providerConfigId?: string,
    modelId?: string,
    width: number = 1920,
    height: number = 1080
  ): Promise<ImageAsset | null> {
    return KeyframeGeneratorService.getInstance().generateStoryboardImage(
      storyboard, scene, characterBindings, locationBindings,
      styleName, providerConfigId, modelId, width, height
    )
  }

  async generateStoryboardImages(
    storyboards: Storyboard[],
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    locationBindings: LocationBinding[],
    styleName: string,
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (index: number, total: number) => void
  ): Promise<Map<string, ImageAsset>> {
    return KeyframeGeneratorService.getInstance().generateStoryboardImages(
      storyboards, scene, characterBindings, locationBindings,
      styleName, providerConfigId, modelId, onProgress
    )
  }

  // ==================== 音频生成 ====================

  async generateNarrationAudio(
    text: string,
    voiceConfig: {
      voiceId: string
      speed?: number
      pitch?: number
    },
    outputDir: string
  ): Promise<string | null> {
    return NarrationSynthesisService.getInstance().generateNarrationAudio(text, voiceConfig, outputDir)
  }

  async generateDialogueAudio(
    text: string,
    characterId: string,
    characterBindings: CharacterBinding[],
    outputDir: string
  ): Promise<string | null> {
    return DialogueSynthesisService.getInstance().generateDialogueAudio(text, characterId, characterBindings, outputDir)
  }

  async generateSceneAudio(
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    outputDir: string,
    onProgress?: (type: string, index: number, total: number) => void
  ): Promise<{
    narrationPath?: string
    dialoguePaths: Map<string, string>
  }> {
    return SceneAudioService.getInstance().generateSceneAudio(scene, characterBindings, outputDir, onProgress)
  }

  // ==================== 临时实体图片生成 ====================

  async generateTemporaryCharacterImage(
    characterId: string,
    styleName: string = 'cinematic',
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ success: boolean; imageId?: string; error?: string }> {
    return TempAssetService.getInstance().generateTemporaryCharacterImage(characterId, styleName, providerConfigId, modelId)
  }

  async generateTemporaryLocationImage(
    locationId: string,
    styleName: string = 'cinematic',
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ success: boolean; imageId?: string; error?: string }> {
    return TempAssetService.getInstance().generateTemporaryLocationImage(locationId, styleName, providerConfigId, modelId)
  }
}
