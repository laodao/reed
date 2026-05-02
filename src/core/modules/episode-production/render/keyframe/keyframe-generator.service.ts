/**
 * keyframe-generator.service
 * @module modules/episode-production/render/keyframe/keyframe-generator.service
 * @description 关键帧（即旧"分镜单图"）生成服务。
 *              本 phase 仍是单帧生成；P5 改造为多关键帧 + 参考链。
 *              拆自原 story-to-video-resource.service.ts 的 generateStoryboardImage / generateStoryboardImages 方法。
 */

import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { ImageService } from '@core/services/image.service'
import type {
  Storyboard,
  SceneScript,
  CharacterBinding,
  LocationBinding,
  ImageAsset
} from '@shared/types/story-to-video.types'
import type { ImageGenerationRequest } from '@shared/types'
import { PRESET_STYLES, buildImagePrompt } from './keyframe-prompt-builder'

/**
 * 关键帧生成服务
 */
export class KeyframeGeneratorService {
  private static instance: KeyframeGeneratorService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): KeyframeGeneratorService {
    if (!KeyframeGeneratorService.instance) {
      KeyframeGeneratorService.instance = new KeyframeGeneratorService()
    }
    return KeyframeGeneratorService.instance
  }

  /**
   * 生成分镜画面
   */
  async generateStoryboardImage(    storyboard: Storyboard,
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    locationBindings: LocationBinding[],
    styleName: string,
    providerConfigId?: string,
    modelId?: string,
    width: number = 1920,
    height: number = 1080
  ): Promise<ImageAsset | null> {
    console.log('[StoryToVideoResource] generateStoryboardImage 参数:', {
      storyboardId: storyboard.id,
      styleName,
      providerConfigId,
      modelId,
      width,
      height
    })

    // 获取风格配置
    const styleConfig = PRESET_STYLES[styleName] || PRESET_STYLES.cinematic

    // 构建 Prompt
    const prompt = buildImagePrompt(
      storyboard,
      scene,
      characterBindings,
      locationBindings,
      styleConfig
    )

    console.log('[StoryToVideoResource] 生成的 prompt:', prompt.substring(0, 200) + '...')

    // 构建请求
    const request: ImageGenerationRequest = {
      prompt,
      negativePrompt: styleConfig.negativePrompt,
      width,
      height,
      model: modelId,
      providerConfigId,
      count: 1,
      skipHistory: true  // 不保存到图像历史
    }

    console.log('[StoryToVideoResource] 图像生成请求:', {
      model: request.model,
      providerConfigId: request.providerConfigId,
      promptLength: prompt.length
    })

    try {
      // 调用图像生成服务
      const response = await ImageService.generateImage(request)

      console.log('[StoryToVideoResource] 图像生成响应:', {
        success: response.success,
        error: response.error,
        imageCount: response.images?.length
      })

      if (response.success && response.images && response.images.length > 0) {
        const imageInfo = response.images[0]

        return {
          id: `imgasset_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          type: 'generated' as const,
          imagePath: imageInfo.url || '',
          prompt,
          width,
          height,
          createdAt: Date.now(),
        }
      }

      console.error('[StoryToVideoResource] 图像生成失败:', response.error)
      return null
    } catch (error: any) {
      console.error('[StoryToVideoResource] 生成分镜画面异常:', error)
      return null
    }
  }

  /**
   * 批量生成分镜画面
   */
  async generateStoryboardImages(    storyboards: Storyboard[],
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    locationBindings: LocationBinding[],
    styleName: string,
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (index: number, total: number) => void
  ): Promise<Map<string, ImageAsset>> {
    const results = new Map<string, ImageAsset>()

    // 获取项目配置的分辨率
    const db = getCoreDatabaseManager()
    let width = 1920
    let height = 1080

    if (scene.id && db.sceneScripts) {
      // 尝试从场景获取项目配置
      // 这里简化处理，实际应该从项目配置获取
    }

    for (let i = 0; i < storyboards.length; i++) {
      const storyboard = storyboards[i]

      if (onProgress) {
        onProgress(i, storyboards.length)
      }

      try {
        const imageAsset = await this.generateStoryboardImage(
          storyboard,
          scene,
          characterBindings,
          locationBindings,
          styleName,
          providerConfigId,
          modelId,
          width,
          height
        )

        if (imageAsset) {
          results.set(storyboard.id, imageAsset)
        }
      } catch (error) {
        console.error(`生成镜头 ${storyboard.shotNumber} 失败:`, error)
      }

      // 添加延迟避免 API 限流
      if (i < storyboards.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    return results
  }
}
