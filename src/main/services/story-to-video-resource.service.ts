/**
 * 剧集资源生成服务
 * @module services/story-to-video-resource.service
 * @description 处理剧集制作中的图像和音频资源生成
 */

import { BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getDatabaseManager } from '../database'
import { ImageService } from './image.service'
import { VoiceService } from './voice.service'
import type {
  Storyboard,
  SceneScript,
  CharacterBinding,
  ImageAsset
} from '../../shared/types/story-to-video.types'
import type { ImageGenerationRequest, TTSRequest } from '../../shared/types'

/**
 * 图像风格配置
 */
export interface StyleConfig {
  stylePrefix: string      // 风格前缀
  qualitySuffix: string    // 质量后缀
  negativePrompt: string   // 负面提示词
}

/**
 * 预设风格配置
 */
export const PRESET_STYLES: Record<string, StyleConfig> = {
  cinematic: {
    stylePrefix: 'cinematic, high quality, 8k, professional photography, movie scene',
    qualitySuffix: 'masterpiece, best quality, highly detailed',
    negativePrompt: 'low quality, blurry, distorted, ugly, bad anatomy, watermark, signature'
  },
  anime: {
    stylePrefix: 'anime style, detailed anime art, high quality, vibrant colors',
    qualitySuffix: 'masterpiece, best quality, detailed illustration',
    negativePrompt: 'low quality, bad anatomy, blurry, ugly, deformed, watermark'
  },
  realistic: {
    stylePrefix: 'photorealistic, ultra realistic, 8k, raw photo, professional photography',
    qualitySuffix: 'highly detailed, sharp focus, natural lighting',
    negativePrompt: 'cartoon, anime, illustration, painting, drawing, low quality, blurry'
  },
  fantasy: {
    stylePrefix: 'fantasy art, magical, ethereal, epic fantasy scene, digital art',
    qualitySuffix: 'highly detailed, cinematic, dramatic lighting',
    negativePrompt: 'modern, urban, realistic, low quality, blurry, watermark'
  },
  ancient_chinese: {
    stylePrefix: 'ancient Chinese style, traditional Chinese painting, elegant, classical',
    qualitySuffix: 'masterpiece, high quality, detailed, artistic',
    negativePrompt: 'modern, western, low quality, blurry, deformed'
  }
}

/**
 * 剧集资源生成服务
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

  /**
   * 构建图像生成 Prompt
   */
  buildImagePrompt(
    storyboard: Storyboard,
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    styleConfig: StyleConfig
  ): string {
    const parts: string[] = []

    // 1. 风格前缀
    parts.push(styleConfig.stylePrefix)

    // 2. 场景描述
    parts.push(scene.sceneDescription)

    // 3. 分镜画面描述
    if (storyboard.frameDescription) {
      parts.push(storyboard.frameDescription)
    }

    // 4. 主体描述
    if (storyboard.subject) {
      parts.push(`main subject: ${storyboard.subject}`)
    }

    // 5. 角色描述
    for (const char of storyboard.characters) {
      const binding = characterBindings.find(
        b => b.longWritingCharacterId === char.characterId
      )

      // 角色基础描述
      if (binding?.generateConfig?.baseDescription) {
        parts.push(binding.generateConfig.baseDescription)
      }

      // 角色表情
      if (char.expression) {
        parts.push(`${char.expression} expression`)
      }

      // 角色动作
      if (char.action) {
        parts.push(char.action)
      }
    }

    // 6. 氛围和光线
    if (scene.mood) {
      parts.push(`${scene.mood} atmosphere`)
    }

    // 7. 时间和天气
    if (scene.timeOfDay) {
      parts.push(`${scene.timeOfDay} lighting`)
    }
    if (scene.weather) {
      parts.push(scene.weather)
    }

    // 8. 构图
    if (storyboard.composition) {
      parts.push(storyboard.composition)
    }

    // 9. 镜头语言
    parts.push(this.getShotTypePrompt(storyboard.shotType))
    parts.push(this.getCameraAnglePrompt(storyboard.cameraAngle))

    // 10. 质量后缀
    parts.push(styleConfig.qualitySuffix)

    return parts.join(', ')
  }

  /**
   * 获取景别 Prompt
   */
  private getShotTypePrompt(shotType: string): string {
    const shotTypeMap: Record<string, string> = {
      extreme_long: 'extreme long shot, vast landscape, establishing shot',
      long: 'long shot, full scene visible, wide angle',
      full: 'full shot, showing entire body, full figure',
      medium: 'medium shot, showing from waist up',
      medium_close: 'medium close-up shot, showing from chest up',
      close: 'close-up shot, face and shoulders, detailed facial features',
      extreme_close: 'extreme close-up, detailed face, intense emotion',
      detail: 'extreme detail shot, macro photography, intricate details'
    }
    return shotTypeMap[shotType] || ''
  }

  /**
   * 获取镜头角度 Prompt
   */
  private getCameraAnglePrompt(angle: string): string {
    const angleMap: Record<string, string> = {
      eye_level: 'eye level angle, natural perspective',
      high: 'high angle, looking down, bird eye perspective',
      low: 'low angle, looking up, dramatic perspective',
      dutch: 'dutch angle, tilted frame, dynamic composition',
      birds_eye: 'birds eye view, overhead shot, top down view',
      worms_eye: 'worms eye view, extreme low angle'
    }
    return angleMap[angle] || ''
  }

  /**
   * 生成分镜画面
   */
  async generateStoryboardImage(
    window: BrowserWindow,
    storyboard: Storyboard,
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    styleName: string,
    providerConfigId?: string,
    modelId?: string,
    width: number = 1920,
    height: number = 1080
  ): Promise<ImageAsset | null> {
    // 获取风格配置
    const styleConfig = PRESET_STYLES[styleName] || PRESET_STYLES.cinematic

    // 构建 Prompt
    const prompt = this.buildImagePrompt(
      storyboard,
      scene,
      characterBindings,
      styleConfig
    )

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

    try {
      // 调用图像生成服务
      const response = await ImageService.generateImage(window, request)

      if (response.success && response.images && response.images.length > 0) {
        const imageInfo = response.images[0]

        return {
          type: 'generated',
          url: imageInfo.url || '',
          filePath: imageInfo.filePath || '',
          width,
          height,
          prompt,
          generatedAt: Date.now()
        }
      }

      return null
    } catch (error) {
      console.error('生成分镜画面失败:', error)
      return null
    }
  }

  /**
   * 批量生成分镜画面
   */
  async generateStoryboardImages(
    window: BrowserWindow,
    storyboards: Storyboard[],
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    styleName: string,
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (index: number, total: number) => void
  ): Promise<Map<string, ImageAsset>> {
    const results = new Map<string, ImageAsset>()

    // 获取项目配置的分辨率
    const db = getDatabaseManager()
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
          window,
          storyboard,
          scene,
          characterBindings,
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

  // ==================== 音频生成 ====================

  /**
   * 生成旁白音频
   */
  async generateNarrationAudio(
    window: BrowserWindow,
    text: string,
    voiceConfig: {
      voiceId: string
      speed?: number
      pitch?: number
    },
    outputDir: string
  ): Promise<string | null> {
    // 检查文本是否为空
    if (!text || !text.trim()) {
      return null
    }

    try {
      // 构建 TTS 请求
      const ttsRequest: TTSRequest = {
        text: text.trim(),
        voiceId: voiceConfig.voiceId || 'zhitian_emo',
        speed: voiceConfig.speed || 1.0,
        pitch: voiceConfig.pitch || 0,
        language: 'zh'
      }

      // 调用 VoiceService 生成语音
      const response = await VoiceService.generateSpeech(window, ttsRequest)

      if (!response.success || !response.data?.audioPath) {
        console.error('[StoryToVideoResource] 生成旁白音频失败:', response.error)
        return null
      }

      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // 复制音频文件到项目目录
      const sourcePath = response.data.audioPath
      const fileName = `narration_${Date.now()}.wav`
      const outputPath = path.join(outputDir, fileName)

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, outputPath)
        console.log('[StoryToVideoResource] 旁白音频已保存:', outputPath)
        return outputPath
      }

      return null
    } catch (error) {
      console.error('生成旁白音频失败:', error)
      return null
    }
  }

  /**
   * 生成对话音频
   */
  async generateDialogueAudio(
    window: BrowserWindow,
    text: string,
    characterId: string,
    characterBindings: CharacterBinding[],
    outputDir: string
  ): Promise<string | null> {
    if (!text || !text.trim()) {
      return null
    }

    try {
      // 查找角色绑定
      const binding = characterBindings.find(
        b => b.longWritingCharacterId === characterId
      )

      // 构建语音配置
      const voiceId = binding?.voiceConfig?.voiceId || 'zhitian_emo'
      const speed = binding?.voiceConfig?.speed || 1.0
      const pitch = binding?.voiceConfig?.pitch || 0

      // 构建 TTS 请求
      const ttsRequest: TTSRequest = {
        text: text.trim(),
        voiceId,
        speed,
        pitch,
        language: 'zh'
      }

      // 调用 VoiceService 生成语音
      const response = await VoiceService.generateSpeech(window, ttsRequest)

      if (!response.success || !response.data?.audioPath) {
        console.error('[StoryToVideoResource] 生成对话音频失败:', response.error)
        return null
      }

      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // 复制音频文件到项目目录
      const sourcePath = response.data.audioPath
      const fileName = `dialogue_${characterId}_${Date.now()}.wav`
      const outputPath = path.join(outputDir, fileName)

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, outputPath)
        console.log('[StoryToVideoResource] 对话音频已保存:', outputPath)
        return outputPath
      }

      return null
    } catch (error) {
      console.error('生成对话音频失败:', error)
      return null
    }
  }

  /**
   * 批量生成场景音频
   */
  async generateSceneAudio(
    window: BrowserWindow,
    scene: SceneScript,
    characterBindings: CharacterBinding[],
    outputDir: string,
    onProgress?: (type: string, index: number, total: number) => void
  ): Promise<{
    narrationPath?: string
    dialoguePaths: Map<string, string>
  }> {
    const result: {
      narrationPath?: string
      dialoguePaths: Map<string, string>
    } = {
      dialoguePaths: new Map()
    }

    // 生成旁白
    if (scene.narration) {
      if (onProgress) onProgress('narration', 0, 1)

      const narrationPath = await this.generateNarrationAudio(
        window,
        scene.narration,
        { voiceId: 'zhitian_emo', speed: 1.0, pitch: 0 },
        outputDir
      )

      if (narrationPath) {
        result.narrationPath = narrationPath
      }
    }

    // 生成对话
    for (let i = 0; i < scene.dialogues.length; i++) {
      const dialogue = scene.dialogues[i]
      if (onProgress) onProgress('dialogue', i, scene.dialogues.length)

      const dialoguePath = await this.generateDialogueAudio(
        window,
        dialogue.text,
        dialogue.characterId,
        characterBindings,
        outputDir
      )

      if (dialoguePath) {
        result.dialoguePaths.set(dialogue.id, dialoguePath)
      }

      // 添加延迟避免 API 限流
      if (i < scene.dialogues.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    return result
  }
}