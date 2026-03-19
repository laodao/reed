/**
 * 图像生成服务
 * @module services/image-service
 * @description 处理图像生成的核心服务
 */

import { BrowserWindow, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getDatabaseManager } from '../database'
import { SecureStorageService } from './secure-storage.service'
import {
  createImageProvider,
  getProviderDefinition,
  IMAGE_PROVIDER_DEFINITIONS,
  isProviderImplemented
} from '../image-providers'
import type { BaseImageProvider } from '../image-providers'
import type {
  ImageRecord,
  ImageProvider,
  ImageModel,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageTaskStatus,
  ImageProviderType
} from '../../shared/types'

/**
 * 正在进行的轮询任务
 */
const activePollingTasks = new Map<string, NodeJS.Timeout>()

/**
 * 图像生成服务
 */
export class ImageService {
  /**
   * 生成图像
   *
   * @param window - BrowserWindow 实例
   * @param request - 图像生成请求
   * @returns 生成响应
   */
  static async generateImage(
    window: BrowserWindow,
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    console.log('[ImageService.generateImage] 开始处理请求')

    const dbManager = getDatabaseManager()

    if (!dbManager.images || !dbManager.providerConfigs) {
      console.error('[ImageService.generateImage] 错误: 数据库未初始化')
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取 Provider 配置
      let providerConfig = null

      // 尝试从 providerConfigs 获取配置
      if (request.providerConfigId) {
        providerConfig = await dbManager.providerConfigs.getById(request.providerConfigId)
      }

      // 如果没有指定，尝试获取图像类型的默认 Provider
      if (!providerConfig) {
        const enabledConfigs = await dbManager.providerConfigs.getEnabled()
        // 查找图像类型的 Provider（template_id 以 'image-' 开头或者是已知的图像 provider）
        providerConfig = enabledConfigs.find(c =>
          c.templateId.startsWith('image-') ||
          ['bailian', 'volcengine', 'minimax', 'zhipu'].includes(c.templateId)
        )
      }

      if (!providerConfig) {
        console.error('[ImageService.generateImage] 错误: 未配置图像生成 Provider')
        return { success: false, error: '未配置图像生成 Provider，请先在设置中添加图像生成服务配置' }
      }

      if (!providerConfig.apiKey) {
        console.error('[ImageService.generateImage] 错误: Provider 未配置 API 密钥')
        return { success: false, error: `Provider "${providerConfig.name}" 未配置 API 密钥` }
      }

      // 解密 API 密钥
      console.log('[ImageService.generateImage] 开始解密 API 密钥')
      let decryptedApiKey: string
      try {
        const secureStorage = SecureStorageService.getInstance()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        decryptedApiKey = secureStorage.decrypt(providerConfig.apiKey)
        console.log('[ImageService.generateImage] API 密钥解密成功')
      } catch (decryptError) {
        console.error('[ImageService.generateImage] API 密钥解密失败:', decryptError)
        return { success: false, error: 'API 密钥解密失败，请重新配置 Provider' }
      }

      // 获取 Provider 类型
      const providerType = providerConfig.templateId.replace('image-', '') as ImageProviderType

      // 创建 Provider 实例
      const provider = createImageProvider(providerType, {
        id: providerConfig.id,
        apiKey: decryptedApiKey,
        baseUrl: providerConfig.baseUrl,
        customHeaders: providerConfig.customHeaders,
        customParams: providerConfig.customParams
      })

      // 发送生成请求
      console.log('[ImageService.generateImage] 调用 Provider 生成图像')
      const response = await provider.generateImage(request)

      if (!response.success) {
        console.error('[ImageService.generateImage] 生成失败:', response.error)
        return response
      }

      // 创建图像记录
      const taskId = response.taskId
      const imageRecords: ImageRecord[] = []

      // 创建待处理的图像记录
      for (let i = 0; i < (request.count || 1); i++) {
        const imageRecord = await dbManager.images.create({
          prompt: request.prompt,
          negativePrompt: request.negativePrompt,
          style: request.style,
          quality: request.quality,
          providerId: provider.id,
          modelId: request.model,
          generationParams: {
            width: request.width,
            height: request.height,
            seed: request.seed
          },
          seed: request.seed,
          taskId: taskId,
          status: 'pending',
          filePath: '' // 临时为空，待生成完成后更新
        })
        imageRecords.push(imageRecord)
      }

      // 发送任务开始事件
      this.sendImageEvent(window, {
        type: 'generation-started',
        taskId: taskId,
        imageIds: imageRecords.map(r => r.id)
      })

      // 启动异步轮询任务
      this.startPollingTask(window, provider, taskId, imageRecords.map(r => r.id))

      return {
        success: true,
        taskId: taskId,
        images: imageRecords
      }
    } catch (error: any) {
      console.error('[ImageService.generateImage] 捕获异常:', error)
      return { success: false, error: error.message || '生成失败' }
    }
  }

  /**
   * 启动轮询任务
   *
   * @param window - BrowserWindow 实例
   * @param provider - Provider 实例
   * @param taskId - 任务 ID
   * @param imageIds - 图像 ID 列表
   */
  private static startPollingTask(
    window: BrowserWindow,
    provider: BaseImageProvider,
    taskId: string,
    imageIds: string[]
  ): void {
    // 如果已有相同任务的轮询，先停止
    if (activePollingTasks.has(taskId)) {
      clearInterval(activePollingTasks.get(taskId)!)
    }

    let pollCount = 0
    const maxPolls = 60 // 最多轮询 60 次（约 5 分钟）

    const pollTask = async () => {
      pollCount++
      console.log(`[ImageService] 轮询任务状态, taskId: ${taskId}, 第 ${pollCount} 次`)

      try {
        const status = await provider.getTaskStatus(taskId)

        // 发送进度事件
        this.sendImageEvent(window, {
          type: 'generation-progress',
          taskId: taskId,
          status: status.status,
          progress: status.progress
        })

        if (status.status === 'completed') {
          // 停止轮询
          const interval = activePollingTasks.get(taskId)
          if (interval) {
            clearInterval(interval)
            activePollingTasks.delete(taskId)
          }

          // 下载并保存图像
          const savedImages = await this.saveGeneratedImages(taskId, status.images || [], imageIds)

          // 发送完成事件
          this.sendImageEvent(window, {
            type: 'generation-completed',
            taskId: taskId,
            images: savedImages
          })
        } else if (status.status === 'failed') {
          // 停止轮询
          const interval = activePollingTasks.get(taskId)
          if (interval) {
            clearInterval(interval)
            activePollingTasks.delete(taskId)
          }

          // 更新数据库状态
          const dbManager = getDatabaseManager()
          if (dbManager.images) {
            await dbManager.images.updateStatusByTaskId(taskId, 'failed', status.error)
          }

          // 发送失败事件
          this.sendImageEvent(window, {
            type: 'generation-failed',
            taskId: taskId,
            error: status.error || '图像生成失败'
          })
        } else if (pollCount >= maxPolls) {
          // 超时
          const interval = activePollingTasks.get(taskId)
          if (interval) {
            clearInterval(interval)
            activePollingTasks.delete(taskId)
          }

          const dbManager = getDatabaseManager()
          if (dbManager.images) {
            await dbManager.images.updateStatusByTaskId(taskId, 'failed', '任务超时')
          }

          this.sendImageEvent(window, {
            type: 'generation-failed',
            taskId: taskId,
            error: '任务超时，请重试'
          })
        }
      } catch (error: any) {
        console.error('[ImageService] 轮询任务状态失败:', error)
      }
    }

    // 每 5 秒轮询一次
    const interval = setInterval(pollTask, 5000)
    activePollingTasks.set(taskId, interval)

    // 立即执行一次
    pollTask()
  }

  /**
   * 保存生成的图像
   *
   * @param taskId - 任务 ID
   * @param images - 生成的图像列表
   * @param imageIds - 对应的图像记录 ID
   * @returns 保存后的图像记录
   */
  private static async saveGeneratedImages(
    taskId: string,
    images: Array<{ url: string }>,
    imageIds: string[]
  ): Promise<ImageRecord[]> {
    const dbManager = getDatabaseManager()
    if (!dbManager.images) {
      return []
    }

    const savedImages: ImageRecord[] = []
    const userDataPath = app.getPath('userData')
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const imagesDir = path.join(userDataPath, 'images', String(year), month, day)

    // 确保目录存在
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }

    for (let i = 0; i < Math.min(images.length, imageIds.length); i++) {
      const imageInfo = images[i]
      const imageId = imageIds[i]

      try {
        // 下载图像
        const response = await fetch(imageInfo.url)
        if (!response.ok) {
          throw new Error(`下载图像失败: ${response.status}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // 生成文件名
        const fileName = `${imageId}.png`
        const filePath = path.join(imagesDir, fileName)

        // 保存文件
        fs.writeFileSync(filePath, buffer)

        // 更新数据库记录
        await dbManager.images.update(imageId, {
          filePath: filePath,
          fileName: fileName,
          fileSize: buffer.length,
          mimeType: 'image/png',
          status: 'completed'
        })

        // 获取更新后的记录
        const updatedRecord = await dbManager.images.getById(imageId)
        if (updatedRecord) {
          savedImages.push(updatedRecord)
        }
      } catch (error: any) {
        console.error(`[ImageService] 保存图像失败: ${imageId}`, error)
        await dbManager.images.updateStatus(imageId, 'failed', error.message || '保存图像失败')
      }
    }

    return savedImages
  }

  /**
   * 查询任务状态
   *
   * @param taskId - 任务 ID
   * @returns 任务状态
   */
  static async getTaskStatus(taskId: string): Promise<ImageTaskStatus> {
    const dbManager = getDatabaseManager()

    if (!dbManager.images) {
      return {
        taskId,
        status: 'failed',
        error: '数据库未初始化'
      }
    }

    // 从数据库获取任务相关的图像
    const images = await dbManager.images.getByTaskId(taskId)
    if (images.length === 0) {
      return {
        taskId,
        status: 'failed',
        error: '任务不存在'
      }
    }

    // 返回第一个图像的状态（同一任务的所有图像状态相同）
    const firstImage = images[0]
    return {
      taskId,
      status: firstImage.status as 'pending' | 'processing' | 'completed' | 'failed',
      images: images.map(img => ({ url: img.filePath })),
      error: firstImage.errorMessage
    }
  }

  /**
   * 停止生成任务
   *
   * @param taskId - 任务 ID
   * @returns 是否成功停止
   */
  static stopGeneration(taskId: string): boolean {
    const interval = activePollingTasks.get(taskId)
    if (interval) {
      clearInterval(interval)
      activePollingTasks.delete(taskId)

      // 更新数据库状态
      const dbManager = getDatabaseManager()
      if (dbManager.images) {
        dbManager.images.updateStatusByTaskId(taskId, 'failed', '用户取消')
      }

      return true
    }
    return false
  }

  /**
   * 获取图像列表
   *
   * @param page - 页码
   * @param pageSize - 每页数量
   * @param favoriteOnly - 只看收藏
   * @param status - 按状态筛选
   * @returns 图像列表
   */
  static async getList(
    page: number = 1,
    pageSize: number = 20,
    favoriteOnly: boolean = false,
    status?: string
  ): Promise<{ success: boolean; data?: { images: ImageRecord[]; total: number; hasMore: boolean }; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.images) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const result = await dbManager.images.getList(page, pageSize, favoriteOnly, status)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[ImageService.getList] 错误:', error)
      return { success: false, error: error.message || '获取列表失败' }
    }
  }

  /**
   * 根据 ID 获取图像
   *
   * @param id - 图像 ID
   * @returns 图像记录
   */
  static async getById(id: string): Promise<{ success: boolean; data?: ImageRecord; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.images) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const image = await dbManager.images.getById(id)
      if (!image) {
        return { success: false, error: '图像不存在' }
      }
      return { success: true, data: image }
    } catch (error: any) {
      console.error('[ImageService.getById] 错误:', error)
      return { success: false, error: error.message || '获取图像失败' }
    }
  }

  /**
   * 切换收藏状态
   *
   * @param id - 图像 ID
   * @returns 新的收藏状态
   */
  static async toggleFavorite(id: string): Promise<{ success: boolean; data?: boolean; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.images) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const newFavorite = await dbManager.images.toggleFavorite(id)
      return { success: true, data: newFavorite }
    } catch (error: any) {
      console.error('[ImageService.toggleFavorite] 错误:', error)
      return { success: false, error: error.message || '切换收藏失败' }
    }
  }

  /**
   * 删除图像
   *
   * @param id - 图像 ID
   * @returns 是否成功
   */
  static async delete(id: string): Promise<{ success: boolean; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.images) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取图像记录
      const image = await dbManager.images.getById(id)
      if (!image) {
        return { success: false, error: '图像不存在' }
      }

      // 删除文件
      if (image.filePath && fs.existsSync(image.filePath)) {
        fs.unlinkSync(image.filePath)
      }

      // 删除数据库记录
      await dbManager.images.delete(id)

      return { success: true }
    } catch (error: any) {
      console.error('[ImageService.delete] 错误:', error)
      return { success: false, error: error.message || '删除失败' }
    }
  }

  /**
   * 批量删除图像
   *
   * @param ids - 图像 ID 列表
   * @returns 删除的数量
   */
  static async deleteMany(ids: string[]): Promise<{ success: boolean; data?: number; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.images) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取图像记录并删除文件
      for (const id of ids) {
        const image = await dbManager.images.getById(id)
        if (image?.filePath && fs.existsSync(image.filePath)) {
          fs.unlinkSync(image.filePath)
        }
      }

      // 删除数据库记录
      const count = await dbManager.images.deleteMany(ids)

      return { success: true, data: count }
    } catch (error: any) {
      console.error('[ImageService.deleteMany] 错误:', error)
      return { success: false, error: error.message || '批量删除失败' }
    }
  }

  /**
   * 获取可用的 Provider 列表
   *
   * @returns Provider 列表
   */
  static async getProviders(): Promise<{ success: boolean; data?: ImageProvider[]; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取所有已配置的图像类型 Provider
      const enabledConfigs = await dbManager.providerConfigs.getEnabled()
      const imageConfigs = enabledConfigs.filter(c =>
        c.templateId.startsWith('image-') ||
        ['bailian', 'volcengine', 'minimax', 'zhipu'].includes(c.templateId)
      )

      const providers: ImageProvider[] = []

      // 添加已配置的 Provider
      for (const config of imageConfigs) {
        const providerType = config.templateId.replace('image-', '') as ImageProviderType
        const definition = getProviderDefinition(providerType)

        if (definition) {
          providers.push({
            id: config.id,
            name: config.name,
            configured: !!config.apiKey,
            models: [] // 模型列表需要单独调用 getModels 获取
          })
        }
      }

      // 添加可配置但未配置的 Provider
      for (const [type, definition] of Object.entries(IMAGE_PROVIDER_DEFINITIONS)) {
        const existingProvider = providers.find(p => p.id === type)
        if (!existingProvider) {
          providers.push({
            id: type,
            name: definition.name,
            configured: false,
            models: []
          })
        }
      }

      return { success: true, data: providers }
    } catch (error: any) {
      console.error('[ImageService.getProviders] 错误:', error)
      return { success: false, error: error.message || '获取 Provider 列表失败' }
    }
  }

  /**
   * 获取 Provider 支持的模型列表
   *
   * @param providerId - Provider ID
   * @returns 模型列表
   */
  static async getModels(providerId: string): Promise<{ success: boolean; data?: ImageModel[]; error?: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取 Provider 配置
      const config = await dbManager.providerConfigs.getById(providerId)

      if (!config) {
        // 如果不是配置 ID，可能是 Provider 类型
        const providerType = providerId as ImageProviderType
        const definition = getProviderDefinition(providerType)
        if (!definition) {
          return { success: false, error: 'Provider 不存在' }
        }

        // 返回默认模型列表
        // 注意：如果没有 API Key，无法获取真实模型列表
        return {
          success: true,
          data: this.getDefaultModels(providerType)
        }
      }

      // 确定 Provider 类型
      const providerType = config.templateId.replace('image-', '') as ImageProviderType

      // 检查 Provider 是否已实现
      if (!isProviderImplemented(providerType)) {
        // 如果未实现，返回默认模型列表
        console.log(`[ImageService.getModels] Provider ${providerType} 未实现，返回默认模型列表`)
        return {
          success: true,
          data: this.getDefaultModels(providerType)
        }
      }

      // 解密 API 密钥
      if (!config.apiKey) {
        return { success: false, error: 'Provider 未配置 API 密钥' }
      }

      const secureStorage = SecureStorageService.getInstance()
      if (!secureStorage.isInitialized()) {
        await secureStorage.initialize()
      }
      const decryptedApiKey = secureStorage.decrypt(config.apiKey)

      // 创建 Provider 实例
      const provider = createImageProvider(providerType, {
        id: config.id,
        apiKey: decryptedApiKey,
        baseUrl: config.baseUrl,
        customHeaders: config.customHeaders,
        customParams: config.customParams
      })

      // 获取模型列表
      const models = await provider.getModels()

      return { success: true, data: models }
    } catch (error: any) {
      console.error('[ImageService.getModels] 错误:', error)
      return { success: false, error: error.message || '获取模型列表失败' }
    }
  }

  /**
   * 获取默认模型列表
   *
   * @param providerType - Provider 类型
   * @returns 默认模型列表
   */
  private static getDefaultModels(providerType: ImageProviderType): ImageModel[] {
    switch (providerType) {
      case 'bailian':
        return [
          {
            id: 'wanx-v1',
            name: '通义万相 v1',
            providerId: 'bailian',
            providerName: '百炼平台',
            features: {
              textToImage: true,
              imageToImage: true,
              imageEdit: false,
              maxResolution: '2048x2048',
              supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024']
            }
          }
        ]
      case 'volcengine':
        return [
          {
            id: 'default',
            name: '默认模型',
            providerId: 'volcengine',
            providerName: '火山引擎',
            features: {
              textToImage: true,
              imageToImage: false,
              imageEdit: false,
              maxResolution: '1024x1024',
              supportedSizes: ['512x512', '1024x1024']
            }
          }
        ]
      case 'minimax':
        return [
          {
            id: 'default',
            name: '默认模型',
            providerId: 'minimax',
            providerName: 'Minimax',
            features: {
              textToImage: true,
              imageToImage: false,
              imageEdit: false,
              maxResolution: '1024x1024',
              supportedSizes: ['512x512', '1024x1024']
            }
          }
        ]
      case 'zhipu':
        return [
          {
            id: 'default',
            name: '默认模型',
            providerId: 'zhipu',
            providerName: '智谱 AI',
            features: {
              textToImage: true,
              imageToImage: false,
              imageEdit: false,
              maxResolution: '1024x1024',
              supportedSizes: ['512x512', '1024x1024']
            }
          }
        ]
      default:
        return []
    }
  }

  /**
   * 测试 Provider 连接
   *
   * @param providerConfigId - Provider 配置 ID
   * @returns 测试结果
   */
  static async testProvider(
    providerConfigId: string
  ): Promise<{ success: boolean; message: string }> {
    const dbManager = getDatabaseManager()

    if (!dbManager.providerConfigs) {
      return { success: false, message: '数据库未初始化' }
    }

    try {
      const config = await dbManager.providerConfigs.getById(providerConfigId)
      if (!config) {
        return { success: false, message: 'Provider 配置不存在' }
      }

      if (!config.apiKey) {
        return { success: false, message: 'Provider 未配置 API 密钥' }
      }

      // 解密 API 密钥
      const secureStorage = SecureStorageService.getInstance()
      if (!secureStorage.isInitialized()) {
        await secureStorage.initialize()
      }
      const decryptedApiKey = secureStorage.decrypt(config.apiKey)

      // 创建 Provider 实例
      const providerType = config.templateId.replace('image-', '') as ImageProviderType
      const provider = createImageProvider(providerType, {
        id: config.id,
        apiKey: decryptedApiKey,
        baseUrl: config.baseUrl,
        customHeaders: config.customHeaders,
        customParams: config.customParams
      })

      // 测试连接
      const result = await provider.testConnection()

      // 更新测试结果
      await dbManager.providerConfigs.updateTestResult(
        providerConfigId,
        result.success ? 'success' : 'failed',
        result.message
      )

      return result
    } catch (error: any) {
      console.error('[ImageService.testProvider] 错误:', error)
      return { success: false, message: error.message || '测试连接失败' }
    }
  }

  /**
   * 发送图像事件到渲染进程
   *
   * @param window - BrowserWindow 实例
   * @param event - 事件数据
   */
  private static sendImageEvent(
    window: BrowserWindow,
    event: {
      type: string
      [key: string]: any
    }
  ): void {
    window.webContents.send('image:generation-event', event)
  }
}