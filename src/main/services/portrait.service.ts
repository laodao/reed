/**
 * 人像设计服务
 * @module services/portrait.service
 * @description 处理人像设计的核心服务
 */

import { BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getDatabaseManager } from '../database'
import { SecureStorageService } from './secure-storage.service'
import { DataPathService } from './data-path.service'
import { ImageService } from './image.service'
import type {
  PortraitProject,
  PortraitCharacter,
  PortraitVariant,
  PortraitAngle,
  PortraitVariantType,
  CreatePortraitProjectRequest,
  UpdatePortraitProjectRequest,
  CreatePortraitCharacterRequest,
  UpdatePortraitCharacterRequest,
  GeneratePortraitRequest,
  GeneratePortraitResponse,
  ChangeClothesRequest,
  ChangeClothesResponse,
  ChangeBackgroundRequest,
  ChangeBackgroundResponse,
  ExportPortraitRequest,
  ExportPortraitResponse,
  GenerateAnglesRequest,
  GenerateAnglesResponse,
  ANGLE_PROMPTS,
  PortraitGender,
  PortraitRace
} from '../../shared/types/portrait.types'
import { randomUUID } from 'crypto'

/**
 * 角度提示词映射
 * 所有角度必须是全身照片，这是硬性要求
 * 强调单人肖像，避免生成多人
 */
const ANGLE_PROMPT_MAP: Record<PortraitAngle, string> = {
  front: 'front view, facing camera, full face visible, looking at viewer, full body shot, standing pose, showing entire body from head to toe, single person, solo portrait, one person only, symmetrical composition',
  left: 'left side view, left profile, full body shot from left side, standing pose, showing entire body from head to toe, single person, solo portrait, one person only, same pose as reference',
  right: 'right side view, right profile, full body shot from right side, standing pose, showing entire body from head to toe, single person, solo portrait, one person only, same pose as reference',
  back: 'back view, from behind, rear view, seen from behind, full body shot from back, standing pose, showing entire body from head to toe, single person, solo portrait, one person only, same pose as reference'
}

/**
 * 全身照片要求的固定后缀
 */
const FULL_BODY_SUFFIX = 'full body shot, standing pose, showing entire body from head to toe, must include feet'

/**
 * 将本地文件路径转换为可访问的 URL
 */
function localPathToUrl(filePath: string): string {
  if (!filePath) return ''
  let normalizedPath = filePath
  if (process.platform === 'win32') {
    normalizedPath = filePath.replace(/\\/g, '/')
  }
  return `local-image:///${normalizedPath}`
}

/**
 * 人像设计服务
 */
export class PortraitService {
  // ==================== 项目管理 ====================

  /**
   * 创建项目
   */
  static async createProject(request: CreatePortraitProjectRequest): Promise<{ success: boolean; data?: PortraitProject; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const project = await dbManager.portraitProjects.create(request)
      return { success: true, data: project }
    } catch (error: any) {
      console.error('[PortraitService.createProject] 错误:', error)
      return { success: false, error: error.message || '创建项目失败' }
    }
  }

  /**
   * 获取项目列表
   */
  static async listProjects(page: number = 1, pageSize: number = 20): Promise<{ success: boolean; data?: { projects: PortraitProject[]; total: number }; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const result = await dbManager.portraitProjects.getList(page, pageSize)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[PortraitService.listProjects] 错误:', error)
      return { success: false, error: error.message || '获取列表失败' }
    }
  }

  /**
   * 获取项目详情
   */
  static async getProject(id: string): Promise<{ success: boolean; data?: PortraitProject; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const project = await dbManager.portraitProjects.getById(id)
      if (!project) {
        return { success: false, error: '项目不存在' }
      }
      return { success: true, data: project }
    } catch (error: any) {
      console.error('[PortraitService.getProject] 错误:', error)
      return { success: false, error: error.message || '获取项目失败' }
    }
  }

  /**
   * 删除项目
   */
  static async deleteProject(id: string): Promise<{ success: boolean; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitProjects || !dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取项目下所有角色，删除图片文件
      const characters = await dbManager.portraitCharacters.getByProjectId(id)
      for (const character of characters) {
        const variants = await dbManager.portraitVariants.getByCharacterId(character.id)
        for (const variant of variants) {
          if (variant.imagePath && fs.existsSync(variant.imagePath)) {
            fs.unlinkSync(variant.imagePath)
          }
        }
      }

      // 删除项目（会级联删除角色和变体）
      await dbManager.portraitProjects.delete(id)
      return { success: true }
    } catch (error: any) {
      console.error('[PortraitService.deleteProject] 错误:', error)
      return { success: false, error: error.message || '删除项目失败' }
    }
  }

  /**
   * 更新项目（重命名等）
   */
  static async updateProject(request: UpdatePortraitProjectRequest): Promise<{ success: boolean; data?: PortraitProject; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitProjects) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const project = await dbManager.portraitProjects.update(request)
      if (!project) {
        return { success: false, error: '项目不存在' }
      }
      return { success: true, data: project }
    } catch (error: any) {
      console.error('[PortraitService.updateProject] 错误:', error)
      return { success: false, error: error.message || '更新项目失败' }
    }
  }

  // ==================== 角色管理 ====================

  /**
   * 创建角色
   */
  static async createCharacter(request: CreatePortraitCharacterRequest): Promise<{ success: boolean; data?: PortraitCharacter; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.create(request)
      return { success: true, data: character }
    } catch (error: any) {
      console.error('[PortraitService.createCharacter] 错误:', error)
      return { success: false, error: error.message || '创建角色失败' }
    }
  }

  /**
   * 获取项目的角色列表
   */
  static async listCharacters(projectId: string): Promise<{ success: boolean; data?: PortraitCharacter[]; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const characters = await dbManager.portraitCharacters.getByProjectId(projectId)
      return { success: true, data: characters }
    } catch (error: any) {
      console.error('[PortraitService.listCharacters] 错误:', error)
      return { success: false, error: error.message || '获取角色列表失败' }
    }
  }

  /**
   * 获取角色详情
   */
  static async getCharacter(id: string): Promise<{ success: boolean; data?: PortraitCharacter; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(id)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }
      return { success: true, data: character }
    } catch (error: any) {
      console.error('[PortraitService.getCharacter] 错误:', error)
      return { success: false, error: error.message || '获取角色失败' }
    }
  }

  /**
   * 更新角色
   */
  static async updateCharacter(request: UpdatePortraitCharacterRequest): Promise<{ success: boolean; data?: PortraitCharacter; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.update(request)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }
      return { success: true, data: character }
    } catch (error: any) {
      console.error('[PortraitService.updateCharacter] 错误:', error)
      return { success: false, error: error.message || '更新角色失败' }
    }
  }

  /**
   * 删除角色
   */
  static async deleteCharacter(id: string): Promise<{ success: boolean; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取角色的所有变体，删除图片文件
      const variants = await dbManager.portraitVariants.getByCharacterId(id)
      for (const variant of variants) {
        if (variant.imagePath && fs.existsSync(variant.imagePath)) {
          fs.unlinkSync(variant.imagePath)
        }
      }

      // 删除角色（会级联删除变体）
      await dbManager.portraitCharacters.delete(id)
      return { success: true }
    } catch (error: any) {
      console.error('[PortraitService.deleteCharacter] 错误:', error)
      return { success: false, error: error.message || '删除角色失败' }
    }
  }

  // ==================== 变体管理 ====================

  /**
   * 获取角色的变体列表
   */
  static async listVariants(characterId: string): Promise<{ success: boolean; data?: PortraitVariant[]; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const variants = await dbManager.portraitVariants.getByCharacterId(characterId)
      // 转换图片路径为可访问的 URL
      const result = variants.map(v => ({
        ...v,
        imagePath: localPathToUrl(v.imagePath)
      }))
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[PortraitService.listVariants] 错误:', error)
      return { success: false, error: error.message || '获取变体列表失败' }
    }
  }

  /**
   * 生成人物形象
   */
  static async generatePortrait(
    window: BrowserWindow,
    request: GeneratePortraitRequest
  ): Promise<GeneratePortraitResponse> {
    console.log('[PortraitService.generatePortrait] 开始生成人物')

    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取角色信息
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      // 生成基础种子，确保四角度一致性
      const baseSeed = request.config.seed ?? Math.floor(Math.random() * 2147483647)

      // 为每个角度生成图像
      const angles = request.config.angles
      const variants: PortraitVariant[] = []
      const dataPathService = DataPathService.getInstance()
      const userDataPath = dataPathService.getDataPath()

      // 发送进度事件
      this.sendPortraitEvent(window, {
        type: 'generation-started',
        characterId: character.id,
        angles: angles
      })

      for (let i = 0; i < angles.length; i++) {
        const angle = angles[i]

        // 发送进度
        this.sendPortraitEvent(window, {
          type: 'generation-progress',
          characterId: character.id,
          angle: angle,
          progress: (i / angles.length) * 100
        })

        // 构建角度特定的提示词
        const anglePrompt = ANGLE_PROMPT_MAP[angle]
        // 强制添加全身照片要求
        const fullPrompt = `${request.prompt}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, consistent character, same person, pure solid background`

        // 调用图像生成
        const imageWidth = request.config.width || 1024
        const imageHeight = request.config.height || 1024
        const imageResult = await ImageService.generateImage(window, {
          providerConfigId: request.providerId,
          model: request.modelId,
          prompt: fullPrompt,
          negativePrompt: request.negativePrompt,
          width: imageWidth,
          height: imageHeight,
          seed: baseSeed,
          skipHistory: true
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 生成角度 ${angle} 失败:`, imageResult.error)
          continue
        }

        // 保存变体记录
        const image = imageResult.images[0]
        const actualImagePath = image.filePath.replace('local-image:///', '')

        const variant = await dbManager.portraitVariants.create({
          characterId: character.id,
          type: 'base',
          angle: angle,
          imagePath: actualImagePath,
          prompt: fullPrompt,
          config: {
            seed: baseSeed,
            width: imageWidth,
            height: imageHeight
          }
        })

        variants.push({
          ...variant,
          imagePath: localPathToUrl(variant.imagePath)
        })
      }

      // 发送完成事件
      this.sendPortraitEvent(window, {
        type: 'generation-completed',
        characterId: character.id,
        variants: variants
      })

      return {
        success: true,
        characterId: character.id,
        variants: variants
      }
    } catch (error: any) {
      console.error('[PortraitService.generatePortrait] 错误:', error)
      return { success: false, error: error.message || '生成失败' }
    }
  }

  /**
   * 换衣功能
   */
  static async changeClothes(
    window: BrowserWindow,
    request: ChangeClothesRequest
  ): Promise<ChangeClothesResponse> {
    console.log('[PortraitService.changeClothes] 开始换衣')

    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      // 获取基础变体作为参考
      const baseVariants = await dbManager.portraitVariants.getBaseVariants(request.characterId)
      if (baseVariants.length === 0) {
        return { success: false, error: '没有基础形象可参考' }
      }

      const variants: PortraitVariant[] = []

      for (const angle of request.angles) {
        // 找到对应角度的基础变体
        const baseVariant = baseVariants.find(v => v.angle === angle)
        if (!baseVariant) continue

        // 构建换衣提示词
        const anglePrompt = ANGLE_PROMPT_MAP[angle]
        // 强制添加全身照片要求
        let fullPrompt = `${character.prompt}, wearing ${request.clothesDescription}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, consistent character, same person, pure solid background`

        // 准备参考图像
        let referenceImageBase64: string | undefined = undefined
        if (request.referenceImage) {
          referenceImageBase64 = request.referenceImage
          console.log('[PortraitService.changeClothes] 使用服装参考图')
        } else if (baseVariant.imagePath && fs.existsSync(baseVariant.imagePath)) {
          const imageBuffer = fs.readFileSync(baseVariant.imagePath)
          referenceImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`
        }

        const imageWidth = baseVariant.config?.width || 1920
        const imageHeight = baseVariant.config?.height || 1920

        const imageResult = await ImageService.generateImage(window, {
          providerConfigId: character.providerId,
          model: character.modelId,
          prompt: fullPrompt,
          width: imageWidth,
          height: imageHeight,
          seed: baseVariant.config?.seed,
          referenceImage: referenceImageBase64,
          skipHistory: true
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 换衣角度 ${angle} 失败:`, imageResult.error)
          continue
        }

        const image = imageResult.images[0]
        const variant = await dbManager.portraitVariants.create({
          characterId: request.characterId,
          type: 'clothes',
          parentId: request.variantId || baseVariant.id,
          angle: angle,
          imagePath: image.filePath.replace('local-image:///', ''),
          prompt: fullPrompt,
          config: baseVariant.config,
          variantInfo: {
            clothesDescription: request.clothesDescription
          }
        })

        variants.push({
          ...variant,
          imagePath: localPathToUrl(variant.imagePath)
        })
      }

      return {
        success: true,
        variants: variants
      }
    } catch (error: any) {
      console.error('[PortraitService.changeClothes] 错误:', error)
      return { success: false, error: error.message || '换衣失败' }
    }
  }

  /**
   * 换背景功能
   */
  static async changeBackground(
    window: BrowserWindow,
    request: ChangeBackgroundRequest
  ): Promise<ChangeBackgroundResponse> {
    console.log('[PortraitService.changeBackground] 开始换背景')

    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      // 获取基础变体作为参考
      const baseVariants = await dbManager.portraitVariants.getBaseVariants(request.characterId)
      if (baseVariants.length === 0) {
        return { success: false, error: '没有基础形象可参考' }
      }

      // 构建背景描述
      let backgroundDescription = ''
      let referenceImageBase64: string | undefined = undefined

      if (request.backgroundType === 'solid' && request.backgroundColor) {
        backgroundDescription = `solid ${request.backgroundColor} background`
      } else if (request.backgroundType === 'preset' && request.presetScene) {
        const presetNames: Record<string, string> = {
          indoor: 'indoor environment',
          outdoor: 'outdoor nature scene',
          office: 'professional office',
          studio: 'professional photography studio',
          gallery: 'art gallery',
          street: 'city street',
          beach: 'beach scene',
          mountain: 'mountain landscape'
        }
        backgroundDescription = presetNames[request.presetScene] || request.presetScene
      } else if (request.backgroundType === 'custom' && request.customDescription) {
        backgroundDescription = request.customDescription
      } else if (request.backgroundType === 'image' && request.backgroundImage) {
        backgroundDescription = 'custom background from uploaded image'
        referenceImageBase64 = request.backgroundImage
      }

      const variants: PortraitVariant[] = []

      for (const angle of request.angles) {
        const baseVariant = baseVariants.find(v => v.angle === angle)
        if (!baseVariant) continue

        const anglePrompt = ANGLE_PROMPT_MAP[angle]
        // 强制添加全身照片要求
        const fullPrompt = `${character.prompt}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, consistent character, same person, ${backgroundDescription}`

        if (!referenceImageBase64 && baseVariant.imagePath && fs.existsSync(baseVariant.imagePath)) {
          const imageBuffer = fs.readFileSync(baseVariant.imagePath)
          referenceImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`
        }

        const imageWidth = baseVariant.config?.width || 1920
        const imageHeight = baseVariant.config?.height || 1920

        const imageResult = await ImageService.generateImage(window, {
          providerConfigId: character.providerId,
          model: character.modelId,
          prompt: fullPrompt,
          width: imageWidth,
          height: imageHeight,
          seed: baseVariant.config?.seed,
          referenceImage: referenceImageBase64,
          skipHistory: true
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 换背景角度 ${angle} 失败:`, imageResult.error)
          continue
        }

        const image = imageResult.images[0]
        const variant = await dbManager.portraitVariants.create({
          characterId: request.characterId,
          type: 'background',
          parentId: request.variantId || baseVariant.id,
          angle: angle,
          imagePath: image.filePath.replace('local-image:///', ''),
          prompt: fullPrompt,
          config: baseVariant.config,
          variantInfo: {
            backgroundDescription: backgroundDescription,
            backgroundType: request.backgroundType,
            backgroundColor: request.backgroundColor,
            presetScene: request.presetScene
          }
        })

        variants.push({
          ...variant,
          imagePath: localPathToUrl(variant.imagePath)
        })
      }

      return {
        success: true,
        variants: variants
      }
    } catch (error: any) {
      console.error('[PortraitService.changeBackground] 错误:', error)
      return { success: false, error: error.message || '换背景失败' }
    }
  }

  /**
   * 删除变体
   */
  static async deleteVariant(id: string): Promise<{ success: boolean; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const variant = await dbManager.portraitVariants.getById(id)
      if (variant?.imagePath && fs.existsSync(variant.imagePath)) {
        fs.unlinkSync(variant.imagePath)
      }

      await dbManager.portraitVariants.delete(id)
      return { success: true }
    } catch (error: any) {
      console.error('[PortraitService.deleteVariant] 错误:', error)
      return { success: false, error: error.message || '删除失败' }
    }
  }

  /**
   * 生成多角度（第二步）
   */
  static async generateAngles(
    window: BrowserWindow,
    request: GenerateAnglesRequest
  ): Promise<GenerateAnglesResponse> {
    console.log('[PortraitService.generateAngles] 开始生成多角度')

    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      // 获取参考变体
      let referenceVariant: PortraitVariant | null = null
      if (request.variantId) {
        console.log('[PortraitService.generateAngles] 收到 variantId:', request.variantId)
        referenceVariant = await dbManager.portraitVariants.getById(request.variantId)
      }
      if (!referenceVariant) {
        referenceVariant = await dbManager.portraitVariants.getFrontVariant(request.characterId)
        console.log('[PortraitService.generateAngles] 使用正面基础变体作为参考')
      }

      if (!referenceVariant) {
        return { success: false, error: '没有正面形象可参考，请先生成正面形象' }
      }

      const variants: PortraitVariant[] = []

      // 读取参考图文件
      let referenceImageBase64: string | undefined = undefined
      const referenceImagePath = referenceVariant.imagePath
      if (referenceImagePath && fs.existsSync(referenceImagePath)) {
        const imageBuffer = fs.readFileSync(referenceImagePath)
        referenceImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`
        console.log('[PortraitService.generateAngles] 已加载参考图作为参考图像')
      }

      // 发送进度事件
      this.sendPortraitEvent(window, {
        type: 'generation-started',
        characterId: request.characterId,
        angles: request.angles
      })

      // 记录失败的角度
      const failedAngles: string[] = []
      const failedErrors: string[] = []

      for (let i = 0; i < request.angles.length; i++) {
        const angle = request.angles[i]

        this.sendPortraitEvent(window, {
          type: 'generation-progress',
          characterId: request.characterId,
          angle: angle,
          progress: (i / request.angles.length) * 100
        })

        const basePrompt = referenceVariant.prompt || character.prompt
        const anglePrompt = ANGLE_PROMPT_MAP[angle]

        // 强调保持相同姿势的一致性提示词
        let consistencyPrompt = 'consistent character, same person as reference image, identical pose, same posture, same body position, same stance'
        if (referenceVariant.type === 'clothes') {
          consistencyPrompt = 'same person, same face, same hairstyle, identical pose and posture, same body position, same stance, same background, same lighting, only viewing angle changed, wearing the same clothes as reference image'
        } else if (referenceVariant.type === 'background') {
          consistencyPrompt = 'same person, same face, same hairstyle, identical pose and posture, same body position, same stance, same clothes, same lighting, only viewing angle changed, same background as reference image'
        } else {
          consistencyPrompt = 'same person, same face, same hairstyle, identical pose and posture, same body position, same stance, same clothes, only viewing angle changed'
        }

        // 强制添加全身照片要求
        const fullPrompt = `${basePrompt}, ${anglePrompt}, ${FULL_BODY_SUFFIX}, ${consistencyPrompt}, pure solid background`

        console.log(`[PortraitService.generateAngles] 角度 ${angle} 提示词:`, fullPrompt)

        const imageWidth = referenceVariant.config?.width || 1920
        const imageHeight = referenceVariant.config?.height || 1920

        const imageResult = await ImageService.generateImage(window, {
          providerConfigId: character.providerId,
          model: character.modelId,
          prompt: fullPrompt,
          width: imageWidth,
          height: imageHeight,
          seed: referenceVariant.config?.seed,
          referenceImage: referenceImageBase64,
          skipHistory: true
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 生成角度 ${angle} 失败:`, imageResult.error)
          failedAngles.push(angle)
          failedErrors.push(`角度 ${angle}: ${imageResult.error || '生成失败'}`)
          continue
        }

        const image = imageResult.images[0]
        const imagePath = image.filePath.replace('local-image:///', '')

        const variant = await dbManager.portraitVariants.create({
          characterId: request.characterId,
          type: referenceVariant.type,
          parentId: referenceVariant.id,
          angle: angle,
          imagePath: imagePath,
          prompt: fullPrompt,
          config: referenceVariant.config,
          variantInfo: referenceVariant.variantInfo
        })

        variants.push({
          ...variant,
          imagePath: localPathToUrl(variant.imagePath)
        })
      }

      this.sendPortraitEvent(window, {
        type: 'generation-completed',
        characterId: request.characterId,
        variants: variants
      })

      if (failedAngles.length > 0) {
        return {
          success: true,
          variants: variants,
          warning: `部分角度生成失败: ${failedErrors.join('; ')}`
        }
      }

      return {
        success: true,
        variants: variants
      }
    } catch (error: any) {
      console.error('[PortraitService.generateAngles] 错误:', error)
      return { success: false, error: error.message || '生成失败' }
    }
  }

  /**
   * 编辑图像
   */
  static async editImage(
    window: BrowserWindow,
    request: {
      characterId: string
      variantId: string
      editPrompt: string
    }
  ): Promise<{ success: boolean; variant?: PortraitVariant; error?: string }> {
    console.log('[PortraitService.editImage] 开始编辑图像')

    const dbManager = getDatabaseManager()

    if (!dbManager.portraitCharacters || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const character = await dbManager.portraitCharacters.getById(request.characterId)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }

      const variant = await dbManager.portraitVariants.getById(request.variantId)
      if (!variant) {
        return { success: false, error: '变体不存在' }
      }

      // 读取原图作为参考
      const originalImagePath = variant.imagePath
      let referenceImageBase64: string | undefined = undefined
      if (originalImagePath && fs.existsSync(originalImagePath)) {
        const imageBuffer = fs.readFileSync(originalImagePath)
        referenceImageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`
      }

      const basePrompt = character.prompt || ''
      // 强制添加全身照片要求
      const editPrompt = `${basePrompt}, ${request.editPrompt}, consistent character, same person, ${FULL_BODY_SUFFIX}, pure solid background`

      const imageWidth = variant.config?.width || 1920
      const imageHeight = variant.config?.height || 1920

      const imageResult = await ImageService.generateImage(window, {
        providerConfigId: character.providerId,
        model: character.modelId,
        prompt: editPrompt,
        width: imageWidth,
        height: imageHeight,
        seed: variant.config?.seed,
        referenceImage: referenceImageBase64,
        skipHistory: true
      })

      if (!imageResult.success || !imageResult.images?.length) {
        return { success: false, error: imageResult.error || '编辑失败' }
      }

      const image = imageResult.images[0]
      const updatedVariant = await dbManager.portraitVariants.update(variant.id, {
        imagePath: image.filePath.replace('local-image:///', ''),
        prompt: editPrompt
      })

      if (!updatedVariant) {
        return { success: false, error: '更新变体失败' }
      }

      return {
        success: true,
        variant: {
          ...updatedVariant,
          imagePath: localPathToUrl(updatedVariant.imagePath)
        }
      }
    } catch (error: any) {
      console.error('[PortraitService.editImage] 错误:', error)
      return { success: false, error: error.message || '编辑失败' }
    }
  }

  /**
   * 导出人物形象
   */
  static async exportPortraits(request: ExportPortraitRequest): Promise<ExportPortraitResponse> {
    console.log('[PortraitService.exportPortraits] 开始导出')

    const dbManager = getDatabaseManager()

    if (!dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      let variants: PortraitVariant[]
      if (request.variantIds && request.variantIds.length > 0) {
        variants = []
        for (const id of request.variantIds) {
          const variant = await dbManager.portraitVariants.getById(id)
          if (variant) variants.push(variant)
        }
      } else {
        variants = await dbManager.portraitVariants.getByCharacterId(request.characterId)
      }

      if (variants.length === 0) {
        return { success: false, error: '没有可导出的图片' }
      }

      const dataPathService = DataPathService.getInstance()
      const exportDir = path.join(dataPathService.getDataPath(), 'exports', 'portraits')

      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

      if (request.type === 'single') {
        const variant = variants[0]
        const ext = path.extname(variant.imagePath) || '.png'
        const fileName = `portrait_${variant.angle}_${timestamp}${ext}`
        const outputPath = path.join(exportDir, fileName)
        fs.copyFileSync(variant.imagePath, outputPath)
        return { success: true, filePath: outputPath }
      } else {
        const archiver = require('archiver')
        const fileName = `portrait_export_${timestamp}.zip`
        const outputPath = path.join(exportDir, fileName)

        return new Promise((resolve) => {
          const output = fs.createWriteStream(outputPath)
          const archive = archiver('zip', { zlib: { level: 9 } })

          output.on('close', () => {
            resolve({ success: true, filePath: outputPath })
          })

          archive.on('error', (err: Error) => {
            resolve({ success: false, error: err.message })
          })

          archive.pipe(output)

          const groups: Record<string, PortraitVariant[]> = {}
          variants.forEach(v => {
            const groupKey = v.type
            if (!groups[groupKey]) groups[groupKey] = []
            groups[groupKey].push(v)
          })

          Object.entries(groups).forEach(([type, items]) => {
            items.forEach((variant) => {
              if (fs.existsSync(variant.imagePath)) {
                const ext = path.extname(variant.imagePath) || '.png'
                const folder = type === 'base' ? '基础形象' : type === 'clothes' ? '换衣变体' : '换背景变体'
                archive.file(variant.imagePath, { name: `${folder}/${variant.angle}${ext}` })
              }
            })
          })

          archive.finalize()
        })
      }
    } catch (error: any) {
      console.error('[PortraitService.exportPortraits] 错误:', error)
      return { success: false, error: error.message || '导出失败' }
    }
  }

  /**
   * 发送人像设计事件到渲染进程
   */
  private static sendPortraitEvent(
    window: BrowserWindow,
    event: {
      type: string
      [key: string]: any
    }
  ): void {
    window.webContents.send('portrait:generation-event', event)
  }
}