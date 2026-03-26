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
  PortraitVariant,
  PortraitAngle,
  PortraitVariantType,
  CreatePortraitProjectRequest,
  UpdatePortraitProjectRequest,
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
  ANGLE_PROMPTS
} from '../../shared/types/portrait.types'
import { randomUUID } from 'crypto'

/**
 * 角度提示词映射
 */
const ANGLE_PROMPT_MAP: Record<PortraitAngle, string> = {
  front: 'front view, facing camera, full face visible, looking at viewer',
  left: 'left side view, profile view, left side of face visible',
  right: 'right side view, profile view, right side of face visible',
  back: 'back view, from behind, rear view, seen from behind'
}

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
  /**
   * 创建人物项目
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

    if (!dbManager.portraitProjects || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取项目的所有变体，删除图片文件
      const variants = await dbManager.portraitVariants.getByProjectId(id)
      for (const variant of variants) {
        if (variant.imagePath && fs.existsSync(variant.imagePath)) {
          fs.unlinkSync(variant.imagePath)
        }
      }

      // 删除项目（会级联删除变体）
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

  /**
   * 获取项目的变体列表
   */
  static async listVariants(projectId: string): Promise<{ success: boolean; data?: PortraitVariant[]; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const variants = await dbManager.portraitVariants.getByProjectId(projectId)
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

    if (!dbManager.portraitProjects || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 创建或获取项目
      let project: PortraitProject
      if (request.projectId) {
        const existing = await dbManager.portraitProjects.getById(request.projectId)
        if (!existing) {
          return { success: false, error: '项目不存在' }
        }
        // 更新项目的 prompt、providerId、modelId
        const updated = await dbManager.portraitProjects.update({
          id: request.projectId,
          prompt: request.prompt,
          referenceImages: request.referenceImages,
          providerId: request.providerId,
          modelId: request.modelId,
          config: request.config
        })
        project = updated || existing
      } else {
        // 创建新项目
        project = await dbManager.portraitProjects.create({
          name: `人物 ${new Date().toLocaleString('zh-CN')}`,
          prompt: request.prompt,
          referenceImages: request.referenceImages,
          providerId: request.providerId,
          modelId: request.modelId,
          config: request.config
        })
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
        projectId: project.id,
        angles: angles
      })

      for (let i = 0; i < angles.length; i++) {
        const angle = angles[i]

        // 发送进度
        this.sendPortraitEvent(window, {
          type: 'generation-progress',
          projectId: project.id,
          angle: angle,
          progress: (i / angles.length) * 100
        })

        // 构建角度特定的提示词
        const anglePrompt = ANGLE_PROMPT_MAP[angle]
        const fullPrompt = `${request.prompt}, ${anglePrompt}, consistent character, same person, pure solid background`

        // 调用图像生成
        const imageResult = await ImageService.generateImage(window, {
          providerConfigId: request.providerId,
          model: request.modelId,
          prompt: fullPrompt,
          width: request.config.width || 1024,
          height: request.config.height || 1024,
          seed: baseSeed
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 生成角度 ${angle} 失败:`, imageResult.error)
          continue
        }

        // 保存变体记录
        const image = imageResult.images[0]
        const variant = await dbManager.portraitVariants.create({
          projectId: project.id,
          type: 'base',
          angle: angle,
          imagePath: image.filePath.replace('local-image:///', ''),
          prompt: fullPrompt,
          config: {
            seed: baseSeed,
            width: request.config.width || 1024,
            height: request.config.height || 1024
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
        projectId: project.id,
        variants: variants
      })

      return {
        success: true,
        projectId: project.id,
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

    if (!dbManager.portraitProjects || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const project = await dbManager.portraitProjects.getById(request.projectId)
      if (!project) {
        return { success: false, error: '项目不存在' }
      }

      // 获取基础变体作为参考
      const baseVariants = await dbManager.portraitVariants.getBaseVariants(request.projectId)
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
        const fullPrompt = `${project.prompt}, wearing ${request.clothesDescription}, ${anglePrompt}, consistent character, same person, pure solid background`

        // 调用图像生成
        const imageResult = await ImageService.generateImage(window, {
          providerConfigId: project.providerId,
          model: project.modelId,
          prompt: fullPrompt,
          width: baseVariant.config?.width || 1024,
          height: baseVariant.config?.height || 1024,
          seed: baseVariant.config?.seed
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 换衣角度 ${angle} 失败:`, imageResult.error)
          continue
        }

        const image = imageResult.images[0]
        const variant = await dbManager.portraitVariants.create({
          projectId: request.projectId,
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

    if (!dbManager.portraitProjects || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const project = await dbManager.portraitProjects.getById(request.projectId)
      if (!project) {
        return { success: false, error: '项目不存在' }
      }

      // 获取基础变体作为参考
      const baseVariants = await dbManager.portraitVariants.getBaseVariants(request.projectId)
      if (baseVariants.length === 0) {
        return { success: false, error: '没有基础形象可参考' }
      }

      // 构建背景描述
      let backgroundDescription = ''
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
      }

      const variants: PortraitVariant[] = []

      for (const angle of request.angles) {
        const baseVariant = baseVariants.find(v => v.angle === angle)
        if (!baseVariant) continue

        const anglePrompt = ANGLE_PROMPT_MAP[angle]
        const fullPrompt = `${project.prompt}, ${anglePrompt}, consistent character, same person, ${backgroundDescription}`

        const imageResult = await ImageService.generateImage(window, {
          provider: project.providerId,
          model: project.modelId,
          prompt: fullPrompt,
          width: baseVariant.config?.width || 1024,
          height: baseVariant.config?.height || 1024,
          seed: baseVariant.config?.seed
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 换背景角度 ${angle} 失败:`, imageResult.error)
          continue
        }

        const image = imageResult.images[0]
        const variant = await dbManager.portraitVariants.create({
          projectId: request.projectId,
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
   * 根据已有的正面形象生成其他角度
   */
  static async generateAngles(
    window: BrowserWindow,
    request: GenerateAnglesRequest
  ): Promise<GenerateAnglesResponse> {
    console.log('[PortraitService.generateAngles] 开始生成多角度')

    const dbManager = getDatabaseManager()

    if (!dbManager.portraitProjects || !dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const project = await dbManager.portraitProjects.getById(request.projectId)
      if (!project) {
        return { success: false, error: '项目不存在' }
      }

      // 获取正面基础变体作为参考
      const frontVariant = await dbManager.portraitVariants.getFrontVariant(request.projectId)
      if (!frontVariant) {
        return { success: false, error: '没有正面形象可参考，请先生成正面形象' }
      }

      const variants: PortraitVariant[] = []

      // 发送进度事件
      this.sendPortraitEvent(window, {
        type: 'generation-started',
        projectId: request.projectId,
        angles: request.angles
      })

      for (let i = 0; i < request.angles.length; i++) {
        const angle = request.angles[i]

        // 发送进度
        this.sendPortraitEvent(window, {
          type: 'generation-progress',
          projectId: request.projectId,
          angle: angle,
          progress: (i / request.angles.length) * 100
        })

        // 构建角度特定的提示词
        const anglePrompt = ANGLE_PROMPT_MAP[angle]
        const fullPrompt = `${project.prompt}, ${anglePrompt}, consistent character, same person, pure solid background`

        // 调用图像生成，使用相同的种子保持一致性
        const imageResult = await ImageService.generateImage(window, {
          providerConfigId: project.providerId,
          model: project.modelId,
          prompt: fullPrompt,
          width: frontVariant.config?.width || 1024,
          height: frontVariant.config?.height || 1024,
          seed: frontVariant.config?.seed
        })

        if (!imageResult.success || !imageResult.images?.length) {
          console.error(`[PortraitService] 生成角度 ${angle} 失败:`, imageResult.error)
          continue
        }

        // 保存变体记录
        const image = imageResult.images[0]
        const variant = await dbManager.portraitVariants.create({
          projectId: request.projectId,
          type: 'base',
          angle: angle,
          imagePath: image.filePath.replace('local-image:///', ''),
          prompt: fullPrompt,
          config: frontVariant.config
        })

        variants.push({
          ...variant,
          imagePath: localPathToUrl(variant.imagePath)
        })
      }

      // 发送完成事件
      this.sendPortraitEvent(window, {
        type: 'generation-completed',
        projectId: request.projectId,
        variants: variants
      })

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
   * 导出人物形象
   */
  static async exportPortraits(request: ExportPortraitRequest): Promise<ExportPortraitResponse> {
    console.log('[PortraitService.exportPortraits] 开始导出')

    const dbManager = getDatabaseManager()

    if (!dbManager.portraitVariants) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取要导出的变体
      let variants: PortraitVariant[]
      if (request.variantIds && request.variantIds.length > 0) {
        variants = []
        for (const id of request.variantIds) {
          const variant = await dbManager.portraitVariants.getById(id)
          if (variant) variants.push(variant)
        }
      } else {
        variants = await dbManager.portraitVariants.getByProjectId(request.projectId)
      }

      if (variants.length === 0) {
        return { success: false, error: '没有可导出的图片' }
      }

      const dataPathService = DataPathService.getInstance()
      const exportDir = path.join(dataPathService.getDataPath(), 'exports', 'portraits')

      // 确保导出目录存在
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

      if (request.type === 'single') {
        // 导出单张图片
        const variant = variants[0]
        const ext = path.extname(variant.imagePath) || '.png'
        const fileName = `portrait_${variant.angle}_${timestamp}${ext}`
        const outputPath = path.join(exportDir, fileName)
        fs.copyFileSync(variant.imagePath, outputPath)
        return { success: true, filePath: outputPath }
      } else if (request.type === 'grid') {
        // 导出拼接图（简化版：仅复制文件，实际拼接需要 canvas 库）
        // 由于 Node.js 没有原生 canvas 支持，这里先导出为 zip
        const archiver = require('archiver')
        const fileName = `portrait_grid_${timestamp}.zip`
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

          // 添加所有图片到 zip
          variants.forEach((variant, index) => {
            if (fs.existsSync(variant.imagePath)) {
              const ext = path.extname(variant.imagePath) || '.png'
              archive.file(variant.imagePath, { name: `${variant.angle}${ext}` })
            }
          })

          archive.finalize()
        })
      } else {
        // 导出为 zip 压缩包
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

          // 按类型分组
          const groups: Record<string, PortraitVariant[]> = {}
          variants.forEach(v => {
            const groupKey = v.type
            if (!groups[groupKey]) groups[groupKey] = []
            groups[groupKey].push(v)
          })

          // 添加所有图片到 zip
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