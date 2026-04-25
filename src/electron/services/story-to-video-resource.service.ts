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
  LocationBinding,
  ItemBinding,
  ImageAsset
} from '@shared/types/story-to-video.types'
import type { ImageGenerationRequest, TTSRequest } from '@shared/types'

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
    locationBindings: LocationBinding[],
    styleConfig: StyleConfig
  ): string {
    const parts: string[] = []

    // 1. 风格前缀
    parts.push(styleConfig.stylePrefix)

    // 2. 场景描述
    parts.push(scene.sceneDescription)

    // 3. 地点描述（新增）
    // 从场景的 location 字段匹配地点绑定
    const locationBinding = locationBindings.find(
      b => b.locationName === scene.location
    )
    if (locationBinding?.generateConfig?.baseDescription) {
      parts.push(`location: ${locationBinding.generateConfig.baseDescription}`)
    }

    // 4. 分镜画面描述
    if (storyboard.frameDescription) {
      parts.push(storyboard.frameDescription)
    }

    // 5. 主体描述
    if (storyboard.subject) {
      parts.push(`main subject: ${storyboard.subject}`)
    }

    // 6. 角色描述
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

    // 7. 氛围和光线
    if (scene.mood) {
      parts.push(`${scene.mood} atmosphere`)
    }

    // 8. 时间和天气
    if (scene.timeOfDay) {
      parts.push(`${scene.timeOfDay} lighting`)
    }
    if (scene.weather) {
      parts.push(scene.weather)
    }

    // 9. 构图
    if (storyboard.composition) {
      parts.push(storyboard.composition)
    }

    // 10. 镜头语言
    parts.push(this.getShotTypePrompt(storyboard.shotType))
    parts.push(this.getCameraAnglePrompt(storyboard.cameraAngle))

    // 11. 质量后缀
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
    const prompt = this.buildImagePrompt(
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
      const response = await ImageService.generateImage(window, request)

      console.log('[StoryToVideoResource] 图像生成响应:', {
        success: response.success,
        error: response.error,
        imageCount: response.images?.length
      })

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
  async generateStoryboardImages(
    window: BrowserWindow,
    storyboards: Storyboard[],
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
        voiceId: voiceConfig.voiceId || 'Cherry',
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
      const voiceId = binding?.voiceConfig?.voiceId || 'Cherry'
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
        { voiceId: 'Cherry', speed: 1.0, pitch: 0 },
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

  // ==================== 地点和物品绑定 ====================

  /**
   * 自动创建地点绑定
   * 从长文写作项目中的地点列表创建视频项目的地点绑定
   */
  autoCreateLocationBindings(
    projectId: string,
    locations: Array<{ id: string; name: string; description: string }>
  ): LocationBinding[] {
    const db = getDatabaseManager()
    if (!db.locationBindings) return []

    const bindings: LocationBinding[] = []

    for (const location of locations) {
      // 检查是否已存在绑定
      const existing = db.locationBindings.getByLongWritingLocationId(projectId, location.id)
      if (existing) {
        bindings.push(existing)
        continue
      }

      // 创建新绑定
      const binding = db.locationBindings.create({
        projectId,
        longWritingLocationId: location.id,
        locationName: location.name,
        imagePaths: [],
        generateConfig: {
          baseDescription: location.description
        },
        generateImages: true
      })
      bindings.push(binding)
    }

    console.log(`[StoryToVideoResource] 自动创建 ${bindings.length} 个地点绑定`)
    return bindings
  }

  /**
   * 自动创建物品绑定
   * 从长文写作项目中的物品列表创建视频项目的物品绑定
   */
  autoCreateItemBindings(
    projectId: string,
    items: Array<{ id: string; name: string; description: string }>
  ): ItemBinding[] {
    const db = getDatabaseManager()
    if (!db.itemBindings) return []

    const bindings: ItemBinding[] = []

    for (const item of items) {
      // 检查是否已存在绑定
      const existing = db.itemBindings.getByLongWritingItemId(projectId, item.id)
      if (existing) {
        bindings.push(existing)
        continue
      }

      // 创建新绑定
      const binding = db.itemBindings.create({
        projectId,
        longWritingItemId: item.id,
        itemName: item.name,
        imagePaths: [],
        generateConfig: {
          baseDescription: item.description
        },
        generateImages: true
      })
      bindings.push(binding)
    }

    console.log(`[StoryToVideoResource] 自动创建 ${bindings.length} 个物品绑定`)
    return bindings
  }

  /**
   * 获取项目的地点绑定列表
   */
  getLocationBindings(projectId: string): LocationBinding[] {
    const db = getDatabaseManager()
    return db.locationBindings?.getByProjectId(projectId) || []
  }

  /**
   * 获取项目的物品绑定列表
   */
  getItemBindings(projectId: string): ItemBinding[] {
    const db = getDatabaseManager()
    return db.itemBindings?.getByProjectId(projectId) || []
  }

  /**
   * 更新地点绑定的图片
   */
  updateLocationBindingImages(
    locationBindingId: string,
    imagePaths: string[]
  ): LocationBinding | null {
    const db = getDatabaseManager()
    if (!db.locationBindings) return null

    return db.locationBindings.update(locationBindingId, { imagePaths })
  }

  /**
   * 更新物品绑定的图片
   */
  updateItemBindingImages(
    itemBindingId: string,
    imagePaths: string[]
  ): ItemBinding | null {
    const db = getDatabaseManager()
    if (!db.itemBindings) return null

    return db.itemBindings.update(itemBindingId, { imagePaths })
  }

  // ==================== 临时实体图片生成 ====================

  /**
   * 为临时角色生成形象图片
   * 使用模板生成固定形象，保持视频一致性
   */
  async generateTemporaryCharacterImage(
    window: BrowserWindow,
    characterId: string,
    styleName: string = 'cinematic',
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ success: boolean; imageId?: string; error?: string }> {
    const db = getDatabaseManager()
    if (!db.lwCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    const character = db.lwCharacters.getById(characterId)
    if (!character) {
      return { success: false, error: '角色不存在' }
    }

    if (character.importance !== 'temporary') {
      return { success: false, error: '只能为临时角色生成模板图片' }
    }

    // 导入临时实体模板服务
    const { TemporaryEntityTemplateService } = await import('./temporary-entity-template.service')
    const templateService = TemporaryEntityTemplateService.getInstance()

    // 获取模板类型，如果没有则匹配
    const templateType = character.templateType ||
      templateService.matchCharacterTemplate(character.name, character.appearance).templateType

    // 生成图片提示词
    const prompt = templateService.generateCharacterImagePrompt(
      templateType as any,
      styleName,
      character.appearance
    )
    const negativePrompt = templateService.getCharacterNegativePrompt(templateType as any)

    console.log(`[StoryToVideoResource] 为临时角色 "${character.name}" 生成图片`)
    console.log(`[StoryToVideoResource] 模板类型: ${templateType}`)
    console.log(`[StoryToVideoResource] Prompt: ${prompt.substring(0, 100)}...`)

    try {
      // 调用图像生成服务
      const request: ImageGenerationRequest = {
        prompt,
        negativePrompt,
        width: 512,
        height: 768,
        model: modelId,
        providerConfigId,
        count: 1,
        skipHistory: true
      }

      const response = await ImageService.generateImage(window, request)

      if (response.success && response.images && response.images.length > 0) {
        const imageInfo = response.images[0]

        // 更新角色的 generatedImageId
        const updated = db.lwCharacters.update(characterId, {
          generatedImageId: imageInfo.id || imageInfo.filePath
        })

        console.log(`[StoryToVideoResource] 临时角色图片生成成功: ${imageInfo.filePath}`)

        return {
          success: true,
          imageId: imageInfo.id || imageInfo.filePath
        }
      }

      return {
        success: false,
        error: response.error || '图片生成失败'
      }
    } catch (error: any) {
      console.error('[StoryToVideoResource] 生成临时角色图片失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 为临时地点生成形象图片
   */
  async generateTemporaryLocationImage(
    window: BrowserWindow,
    locationId: string,
    styleName: string = 'cinematic',
    providerConfigId?: string,
    modelId?: string
  ): Promise<{ success: boolean; imageId?: string; error?: string }> {
    const db = getDatabaseManager()
    if (!db.lwLocations) {
      return { success: false, error: '数据库未初始化' }
    }

    const location = db.lwLocations.getById(locationId)
    if (!location) {
      return { success: false, error: '地点不存在' }
    }

    if (location.entityImportance !== 'temporary') {
      return { success: false, error: '只能为临时地点生成模板图片' }
    }

    // 导入临时实体模板服务
    const { TemporaryEntityTemplateService } = await import('./temporary-entity-template.service')
    const templateService = TemporaryEntityTemplateService.getInstance()

    // 获取模板类型，如果没有则匹配
    const templateType = location.templateType ||
      templateService.matchLocationTemplate(location.name, location.description).templateType

    // 生成图片提示词
    const prompt = templateService.generateLocationImagePrompt(
      templateType as any,
      styleName,
      location.description
    )
    const negativePrompt = templateService.getLocationNegativePrompt(templateType as any)

    console.log(`[StoryToVideoResource] 为临时地点 "${location.name}" 生成图片`)

    try {
      // 调用图像生成服务
      const request: ImageGenerationRequest = {
        prompt,
        negativePrompt,
        width: 1920,
        height: 1080,
        model: modelId,
        providerConfigId,
        count: 1,
        skipHistory: true
      }

      const response = await ImageService.generateImage(window, request)

      if (response.success && response.images && response.images.length > 0) {
        const imageInfo = response.images[0]

        // 更新地点的 generatedImageId
        const updated = db.lwLocations.update(locationId, {
          generatedImageId: imageInfo.id || imageInfo.filePath
        })

        return {
          success: true,
          imageId: imageInfo.id || imageInfo.filePath
        }
      }

      return {
        success: false,
        error: response.error || '图片生成失败'
      }
    } catch (error: any) {
      console.error('[StoryToVideoResource] 生成临时地点图片失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 批量为项目的临时实体生成图片
   */
  async batchGenerateTemporaryEntityImages(
    window: BrowserWindow,
    projectId: string,
    styleName: string = 'cinematic',
    providerConfigId?: string,
    modelId?: string,
    onProgress?: (type: string, current: number, total: number) => void
  ): Promise<{
    characters: { id: string; success: boolean; imageId?: string }[]
    locations: { id: string; success: boolean; imageId?: string }[]
  }> {
    const db = getDatabaseManager()
    const result = {
      characters: [] as { id: string; success: boolean; imageId?: string }[],
      locations: [] as { id: string; success: boolean; imageId?: string }[]
    }

    // 获取所有临时角色
    const tempCharacters = db.lwCharacters?.getTemporaryByProjectId(projectId) || []
    console.log(`[StoryToVideoResource] 找到 ${tempCharacters.length} 个临时角色需要生成图片`)

    for (let i = 0; i < tempCharacters.length; i++) {
      const char = tempCharacters[i]

      // 跳过已有图片的角色
      if (char.generatedImageId || char.portraitId) {
        result.characters.push({ id: char.id, success: true, imageId: char.generatedImageId || char.portraitId })
        continue
      }

      if (onProgress) onProgress('character', i, tempCharacters.length)

      const genResult = await this.generateTemporaryCharacterImage(
        window,
        char.id,
        styleName,
        providerConfigId,
        modelId
      )

      result.characters.push({
        id: char.id,
        success: genResult.success,
        imageId: genResult.imageId
      })

      // 添加延迟避免 API 限流
      if (i < tempCharacters.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // 获取所有临时地点
    const tempLocations = db.lwLocations?.getTemporaryByProjectId(projectId) || []
    console.log(`[StoryToVideoResource] 找到 ${tempLocations.length} 个临时地点需要生成图片`)

    for (let i = 0; i < tempLocations.length; i++) {
      const loc = tempLocations[i]

      // 跳过已有图片的地点
      if (loc.generatedImageId) {
        result.locations.push({ id: loc.id, success: true, imageId: loc.generatedImageId })
        continue
      }

      if (onProgress) onProgress('location', i, tempLocations.length)

      const genResult = await this.generateTemporaryLocationImage(
        window,
        loc.id,
        styleName,
        providerConfigId,
        modelId
      )

      result.locations.push({
        id: loc.id,
        success: genResult.success,
        imageId: genResult.imageId
      })

      // 添加延迟避免 API 限流
      if (i < tempLocations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log('[StoryToVideoResource] 批量生成临时实体图片完成:', result)
    return result
  }

  /**
   * 获取临时实体的图片路径（用于视频制作）
   * 如果是临时实体且没有图片，返回模板生成的提示词
   */
  getTemporaryEntityImagePrompt(
    entityId: string,
    entityType: 'character' | 'location',
    styleName: string = 'cinematic'
  ): { hasImage: boolean; imagePath?: string; prompt?: string } {
    const db = getDatabaseManager()

    if (entityType === 'character') {
      const character = db.lwCharacters?.getById(entityId)
      if (!character) {
        return { hasImage: false }
      }

      // 如果有图片，返回图片路径
      if (character.generatedImageId || character.portraitId) {
        return {
          hasImage: true,
          imagePath: character.generatedImageId || character.portraitId
        }
      }

      // 如果是临时角色但没有图片，返回模板提示词
      if (character.importance === 'temporary') {
        const { TemporaryEntityTemplateService } = require('./temporary-entity-template.service')
        const templateService = TemporaryEntityTemplateService.getInstance()

        const templateType = character.templateType ||
          templateService.matchCharacterTemplate(character.name, character.appearance).templateType

        const prompt = templateService.generateCharacterImagePrompt(
          templateType as any,
          styleName,
          character.appearance
        )

        return { hasImage: false, prompt }
      }
    } else if (entityType === 'location') {
      const location = db.lwLocations?.getById(entityId)
      if (!location) {
        return { hasImage: false }
      }

      // 如果有图片，返回图片路径
      if (location.generatedImageId) {
        return {
          hasImage: true,
          imagePath: location.generatedImageId
        }
      }

      // 如果是临时地点但没有图片，返回模板提示词
      if (location.entityImportance === 'temporary') {
        const { TemporaryEntityTemplateService } = require('./temporary-entity-template.service')
        const templateService = TemporaryEntityTemplateService.getInstance()

        const templateType = location.templateType ||
          templateService.matchLocationTemplate(location.name, location.description).templateType

        const prompt = templateService.generateLocationImagePrompt(
          templateType as any,
          styleName,
          location.description
        )

        return { hasImage: false, prompt }
      }
    }

    return { hasImage: false }
  }
}