/**
 * 图像生成服务
 * @module services/image-service
 * @description 处理图像生成的核心服务
 */

import * as path from 'path'
import * as fs from 'fs'
// electron-log 已被替换为跨平台 console wrapper（见下方 logger 常量）
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { PROVIDER_TEMPLATES } from '@core/services/provider-template.service'
import { getPathProvider } from '@core/interfaces/path.interface'
import {
  createImageProvider,
  getProviderDefinition,
  IMAGE_PROVIDER_DEFINITIONS,
  isProviderImplemented
} from '@core/image-providers'
import type { BaseImageProvider } from '@core/image-providers'
import type {
  ImageRecord,
  ImageProvider,
  ImageModel,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageTaskStatus,
  ImageProviderType
} from '@shared/types'

// 配置 electron-log：禁用控制台输出，避免 EPIPE 错误
// 跨平台 logger：包装 console，简单实现 electron-log 风格的 .scope/.info/.error API
const logger = {
  info: (...args: any[]) => console.log('[ImageService]', ...args),
  warn: (...args: any[]) => console.warn('[ImageService]', ...args),
  error: (...args: any[]) => console.error('[ImageService]', ...args),
  debug: (...args: any[]) => console.debug('[ImageService]', ...args),
}

/**
 * 正在进行的轮询任务
 */
const activePollingTasks = new Map<string, NodeJS.Timeout>()

/**
 * 将本地文件路径转换为可访问的 URL
 * @param filePath - 本地文件路径
 * @returns 可访问的 URL
 */
function localPathToUrl(filePath: string): string {
  if (!filePath) {
    logger.info('[localPathToUrl] 空路径')
    return ''
  }

  logger.info('[localPathToUrl] 输入路径:', filePath)

  // Windows 路径处理：将反斜杠转换为正斜杠
  let normalizedPath = filePath
  if (process.platform === 'win32') {
    normalizedPath = filePath.replace(/\\/g, '/')
  }

  // 使用三个斜杠格式（标准 file URI 格式）：local-image:///C:/Users/...
  // 不编码冒号，让盘符成为路径的一部分
  const url = `local-image:///${normalizedPath}`
  logger.info('[localPathToUrl] 输出 URL:', url)
  return url
}

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
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResponse> {
    logger.info('[ImageService.generateImage] 开始处理请求')

    const dbManager = getCoreDatabaseManager()

    if (!dbManager.images || !dbManager.providerConfigs) {
      logger.error('[ImageService.generateImage] 错误: 数据库未初始化')
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取 Provider 配置
      let providerConfig = null

      // 尝试从 providerConfigs 获取配置
      if (request.providerConfigId) {
        providerConfig = await dbManager.providerConfigs.getById(request.providerConfigId)
        logger.info('[ImageService.generateImage] 使用指定的 Provider:', request.providerConfigId, providerConfig?.name)
      }

      // 如果没有指定，尝试获取图像类型的默认 Provider
      if (!providerConfig) {
        const enabledConfigs = await dbManager.providerConfigs.getEnabled()
        // 查找图像类型的 Provider（template_id 以 'image-' 开头或者是已知的图像 provider）
        providerConfig = enabledConfigs.find(c =>
          c.templateId.startsWith('image-') ||
          ['bailian', 'volcengine', 'minimax', 'zhipu', 'openai'].includes(c.templateId)
        )
        logger.info('[ImageService.generateImage] 使用默认 Provider:', providerConfig?.name)
      }

      if (!providerConfig) {
        logger.error('[ImageService.generateImage] 错误: 未配置图像生成 Provider')
        return { success: false, error: '未配置图像生成 Provider，请先在设置中添加图像生成服务配置' }
      }

      if (!providerConfig.apiKey) {
        logger.error('[ImageService.generateImage] 错误: Provider 未配置 API 密钥')
        return { success: false, error: `Provider "${providerConfig.name}" 未配置 API 密钥` }
      }

      // 解密 API 密钥
      logger.info('[ImageService.generateImage] 开始解密 API 密钥')
      let decryptedApiKey: string
      try {
        const secureStorage = getSecureStorage()
        if (!secureStorage.isInitialized()) {
          await secureStorage.initialize()
        }
        decryptedApiKey = secureStorage.decrypt(providerConfig.apiKey)
        logger.info('[ImageService.generateImage] API 密钥解密成功')
      } catch (decryptError) {
        logger.error('[ImageService.generateImage] API 密钥解密失败:', decryptError)
        return { success: false, error: 'API 密钥解密失败，请重新配置 Provider' }
      }

      // 确定 Provider 类型
      let providerType = providerConfig.templateId.replace('image-', '') as ImageProviderType

      // 特殊处理：bailian 提供商根据 API Key 格式选择实现
      if (providerType === 'bailian') {
        // 检查 API Key 格式
        if (decryptedApiKey.includes(':')) {
          // AccessKeyId:AccessKeySecret 格式 -> 使用百炼平台签名认证
          logger.info('[ImageService.generateImage] 检测到阿里云 AccessKey 格式，使用百炼平台 API')
          providerType = 'bailian'
        } else {
          // 普通 Bearer Token 格式 -> 使用 DashScope API
          logger.info('[ImageService.generateImage] 检测到 DashScope API Key 格式，使用 DashScope API')
          providerType = 'dashscope'
        }
      }

      // 特殊处理：zhipu 和 minimax 使用 OpenAI 兼容格式
      // 这些 Provider 的图像生成 API 与 OpenAI 格式兼容
      if (providerType === 'zhipu' || providerType === 'minimax') {
        logger.info(`[ImageService.generateImage] ${providerType} 使用 OpenAI 兼容格式`)
        providerType = 'openai'
      }

      // 获取模板中的 imageBaseUrl
      const template = PROVIDER_TEMPLATES.find(t => t.id === providerConfig.templateId)

      // 优先级：用户配置 > 模板默认
      const imageBaseUrl = providerConfig.imageBaseUrl ||
                           template?.apiConfig?.imageBaseUrl ||
                           template?.apiConfig?.baseUrl

      logger.info('[ImageService.generateImage] 使用图像 API URL:', imageBaseUrl)

      // 创建 Provider 实例
      const provider = createImageProvider(providerType, {
        id: providerConfig.id,
        apiKey: decryptedApiKey,
        baseUrl: imageBaseUrl,
        customHeaders: providerConfig.customHeaders,
        customParams: providerConfig.customParams
      })

      // 发送生成请求
      logger.info('[ImageService.generateImage] 调用 Provider 生成图像')
      const response = await provider.generateImage(request)

      if (!response.success) {
        logger.error('[ImageService.generateImage] 生成失败:', response.error)
        return response
      }

      // 同步模式：直接返回了图像 URL
      if (response.images && response.images.length > 0) {
        logger.info('[ImageService.generateImage] 同步模式，直接返回图像')

        // 如果跳过历史记录，直接下载保存并返回
        if (request.skipHistory) {
          logger.info('[ImageService.generateImage] skipHistory=true, 调用 saveImagesWithoutHistory')
          logger.info('[ImageService.generateImage] response.images 数量:', response.images?.length)
          logger.info('[ImageService.generateImage] response.images 内容:', JSON.stringify(response.images?.map(img => ({
            url: img.url?.substring(0, 150) + '...',
            hasUrl: !!img.url
          }))))

          try {
            const savedImages = await this.saveImagesWithoutHistory(response.images)

            logger.info('[ImageService.generateImage] saveImagesWithoutHistory 返回:', savedImages.length, '张图片')
            logger.info('[ImageService.generateImage] 返回的图片路径:', savedImages.map(img => img.filePath))

            return {
              success: true,
              images: savedImages
            }
          } catch (saveError: any) {
            logger.error('[ImageService.generateImage] 保存图像失败:', saveError)
            return {
              success: false,
              error: saveError.message || '保存图像失败'
            }
          }
        }

        const imageRecords: ImageRecord[] = []
        const tempTaskId = `sync_${Date.now()}`

        // 为每个图像创建记录
        for (let i = 0; i < response.images.length; i++) {
          const imageInfo = response.images[i]
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
            taskId: tempTaskId,
            status: 'pending',
            filePath: ''
          })
          imageRecords.push(imageRecord)
        }

        // 发送任务开始事件
        this.sendImageEvent({
          type: 'generation-started',
          taskId: tempTaskId,
          imageIds: imageRecords.map(r => r.id)
        })

        // 直接下载并保存图像
        const savedImages = await this.saveGeneratedImages(tempTaskId, response.images, imageRecords.map(r => r.id))

        // 发送完成事件
        this.sendImageEvent({
          type: 'generation-completed',
          taskId: tempTaskId,
          images: savedImages
        })

        return {
          success: true,
          taskId: tempTaskId,
          images: savedImages
        }
      }

      // 异步模式：需要轮询任务状态
      const taskId = response.taskId
      if (!taskId) {
        return { success: false, error: '未返回任务 ID 或图像结果' }
      }

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
      this.sendImageEvent({
        type: 'generation-started',
        taskId: taskId,
        imageIds: imageRecords.map(r => r.id)
      })

      // 启动异步轮询任务
      this.startPollingTask(provider, taskId, imageRecords.map(r => r.id))

      return {
        success: true,
        taskId: taskId,
        images: imageRecords
      }
    } catch (error: any) {
      logger.error('[ImageService.generateImage] 捕获异常:', error)
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
    provider: BaseImageProvider,
    taskId: string,
    imageIds: string[],
  ): void {
    // 如果已有相同任务的轮询，先停止
    if (activePollingTasks.has(taskId)) {
      clearInterval(activePollingTasks.get(taskId)!)
    }

    let pollCount = 0
    const maxPolls = 60 // 最多轮询 60 次（约 5 分钟）

    const pollTask = async () => {
      pollCount++
      logger.info(`[ImageService] 轮询任务状态, taskId: ${taskId}, 第 ${pollCount} 次`)

      try {
        const status = await provider.getTaskStatus(taskId)

        // 发送进度事件
        this.sendImageEvent({
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
          this.sendImageEvent({
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
          const dbManager = getCoreDatabaseManager()
          if (dbManager.images) {
            await dbManager.images.updateStatusByTaskId(taskId, 'failed', status.error)
          }

          // 发送失败事件
          this.sendImageEvent({
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

          const dbManager = getCoreDatabaseManager()
          if (dbManager.images) {
            await dbManager.images.updateStatusByTaskId(taskId, 'failed', '任务超时')
          }

          this.sendImageEvent({
            type: 'generation-failed',
            taskId: taskId,
            error: '任务超时，请重试'
          })
        }
      } catch (error: any) {
        logger.error('[ImageService] 轮询任务状态失败:', error)
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
    const dbManager = getCoreDatabaseManager()
    if (!dbManager.images) {
      return []
    }

    const savedImages: ImageRecord[] = []
    // 使用 DataPathService 获取正确的数据路径
    const userDataPath = getPathProvider().getDataPath()
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
        let buffer: Buffer

        // 检查是否是 base64 格式的图像
        if (imageInfo.url.startsWith('data:')) {
          // base64 格式：data:image/png;base64,xxxxx
          const base64Data = imageInfo.url.split(',')[1]
          if (!base64Data) {
            throw new Error('无效的 base64 图像数据')
          }
          buffer = Buffer.from(base64Data, 'base64')
          logger.info('[ImageService] 从 base64 数据保存图像')
        } else {
          // URL 格式：下载图像
          logger.info('[ImageService] 从 URL 下载图像:', imageInfo.url)
          const response = await fetch(imageInfo.url)
          if (!response.ok) {
            throw new Error(`下载图像失败: ${response.status}`)
          }

          const arrayBuffer = await response.arrayBuffer()
          buffer = Buffer.from(arrayBuffer)
        }

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
          // 将文件路径转换为可访问的 URL
          savedImages.push({
            ...updatedRecord,
            filePath: localPathToUrl(updatedRecord.filePath)
          } as ImageRecord)
        }
      } catch (error: any) {
        logger.error(`[ImageService] 保存图像失败: ${imageId}`, error)
        await dbManager.images.updateStatus(imageId, 'failed', error.message || '保存图像失败')
      }
    }

    return savedImages
  }

  /**
   * 保存图像但不记录到历史（用于其他模块调用）
   *
   * @param images - 生成的图像列表
   * @returns 保存后的图像信息
   */
  private static async saveImagesWithoutHistory(
    images: Array<{ url: string }>
  ): Promise<Array<{ filePath: string }>> {
    logger.info('[saveImagesWithoutHistory] 开始保存图像，数量:', images.length)
    logger.info('[saveImagesWithoutHistory] 图像信息:', images.map(img => ({ url: img.url?.substring(0, 100) + '...' })))

    if (!images || images.length === 0) {
      logger.error('[saveImagesWithoutHistory] 错误：图像数组为空')
      throw new Error('没有可保存的图像')
    }

    const userDataPath = getPathProvider().getDataPath()
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const imagesDir = path.join(userDataPath, 'images', String(year), month, day)

    logger.info('[saveImagesWithoutHistory] 图像保存目录:', imagesDir)

    // 确保目录存在
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }

    const savedImages: Array<{ filePath: string }> = []
    const errors: string[] = []

    for (let i = 0; i < images.length; i++) {
      const imageInfo = images[i]
      const imageId = `img_${Date.now()}_${i}`

      try {
        // 检查 URL 是否存在
        if (!imageInfo.url) {
          throw new Error('图像 URL 为空')
        }

        let buffer: Buffer

        // 检查是否是 base64 格式的图像
        if (imageInfo.url.startsWith('data:')) {
          logger.info(`[saveImagesWithoutHistory] 图像 ${i} 是 base64 格式`)
          const base64Data = imageInfo.url.split(',')[1]
          if (!base64Data) {
            throw new Error('无效的 base64 图像数据')
          }
          buffer = Buffer.from(base64Data, 'base64')
        } else {
          logger.info(`[saveImagesWithoutHistory] 图像 ${i} 从 URL 下载:`, imageInfo.url.substring(0, 100) + '...')
          try {
            const response = await fetch(imageInfo.url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            })
            logger.info(`[saveImagesWithoutHistory] 图像 ${i} fetch 响应状态:`, response.status, response.statusText)
            if (!response.ok) {
              throw new Error(`下载图像失败: HTTP ${response.status} ${response.statusText}`)
            }
            const arrayBuffer = await response.arrayBuffer()
            buffer = Buffer.from(arrayBuffer)
            logger.info(`[saveImagesWithoutHistory] 图像 ${i} 下载成功，大小:`, buffer.length, 'bytes')
          } catch (fetchError: any) {
            logger.error(`[saveImagesWithoutHistory] 图像 ${i} fetch 异常:`, fetchError.message)
            throw fetchError
          }
        }

        // 检查 buffer 是否有效
        if (!buffer || buffer.length === 0) {
          throw new Error('图像数据为空')
        }

        // 生成文件名
        const fileName = `${imageId}.png`
        const filePath = path.join(imagesDir, fileName)

        // 保存文件
        fs.writeFileSync(filePath, buffer)
        logger.info(`[saveImagesWithoutHistory] 图像 ${i} 保存成功:`, filePath)

        // 验证文件是否真的存在
        const fileExists = fs.existsSync(filePath)
        logger.info(`[saveImagesWithoutHistory] 图像 ${i} 文件存在验证:`, fileExists)
        if (!fileExists) {
          throw new Error('文件保存后验证失败')
        }

        savedImages.push({
          filePath: localPathToUrl(filePath)
        })
      } catch (error: any) {
        logger.error(`[saveImagesWithoutHistory] 保存图像 ${i} 失败:`, error)
        errors.push(`图像 ${i + 1}: ${error.message}`)
      }
    }

    logger.info('[saveImagesWithoutHistory] 保存完成，成功数量:', savedImages.length, '失败数量:', errors.length)

    // 如果所有图片都保存失败，抛出异常
    if (savedImages.length === 0 && errors.length > 0) {
      throw new Error(`所有图像保存失败: ${errors.join('; ')}`)
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
    const dbManager = getCoreDatabaseManager()

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
      images: images.map(img => ({ url: localPathToUrl(img.filePath) })),
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
      const dbManager = getCoreDatabaseManager()
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
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.images) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const result = await dbManager.images.getList(page, pageSize, favoriteOnly, status)
      logger.info('[ImageService.getList] 数据库返回图片数量:', result.images.length)

      // 转换文件路径为可访问的 URL
      const images = result.images.map(img => {
        const originalPath = img.filePath
        const convertedPath = localPathToUrl(img.filePath)
        logger.info('[ImageService.getList] 图片ID:', img.id, '原始路径:', originalPath, '转换后:', convertedPath)
        return {
          ...img,
          filePath: convertedPath
        }
      })
      return { success: true, data: { ...result, images } }
    } catch (error: any) {
      logger.error('[ImageService.getList] 错误:', error)
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
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.images) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const image = await dbManager.images.getById(id)
      if (!image) {
        return { success: false, error: '图像不存在' }
      }
      // 转换文件路径为可访问的 URL
      return { success: true, data: { ...image, filePath: localPathToUrl(image.filePath) } }
    } catch (error: any) {
      logger.error('[ImageService.getById] 错误:', error)
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
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.images) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const newFavorite = await dbManager.images.toggleFavorite(id)
      return { success: true, data: newFavorite }
    } catch (error: any) {
      logger.error('[ImageService.toggleFavorite] 错误:', error)
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
    const dbManager = getCoreDatabaseManager()

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
      logger.error('[ImageService.delete] 错误:', error)
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
    const dbManager = getCoreDatabaseManager()

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
      logger.error('[ImageService.deleteMany] 错误:', error)
      return { success: false, error: error.message || '批量删除失败' }
    }
  }

  /**
   * 获取可用的 Provider 列表
   * 从现有的 AI 提供商配置中筛选包含图像模型的提供商
   *
   * @returns Provider 列表
   */
  static async getProviders(): Promise<{ success: boolean; data?: ImageProvider[]; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取所有已启用的提供商配置
      const enabledConfigs = await dbManager.providerConfigs.getEnabled()

      const providers: ImageProvider[] = []

      for (const config of enabledConfigs) {
        // 确定 Provider 类型
        const providerType = config.templateId.replace('image-', '') as ImageProviderType

        // 检查 Provider 是否已实现
        if (!isProviderImplemented(providerType)) {
          // 安全日志：避免 EPIPE 错误
          try {
            logger.info(`[ImageService.getProviders] Provider ${providerType} 未实现，跳过`)
          } catch { /* 忽略 EPIPE 错误 */ }
          continue
        }

        // 检查该提供商是否有图像类型的模型
        const models = config.models || []
        const imageModels = models.filter(m =>
          m.type === 'image' ||
          m.type === 'multimodal' // 多模态模型也可能支持图像生成
        )

        // 或者检查提供商模板的能力是否包含 image
        const hasImageCapability = await this.checkImageCapability(config.templateId)

        if (imageModels.length > 0 || hasImageCapability) {
          providers.push({
            id: config.id,
            name: config.name,
            configured: !!config.apiKey,
            models: imageModels.map(m => ({
              id: m.id,
              name: m.name || m.id,
              providerId: config.id,
              providerName: config.name,
              features: {
                textToImage: true,
                imageToImage: false,
                imageEdit: false,
                maxResolution: m.contextWindow ? `${m.contextWindow}x${m.contextWindow}` : '1024x1024',
                supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024']
              }
            }))
          })
        }
      }

      // 如果没有从现有配置中找到图像提供商，回退到独立的图像提供商配置
      if (providers.length === 0) {
        const imageConfigs = enabledConfigs.filter(c =>
          c.templateId.startsWith('image-') ||
          ['bailian', 'volcengine', 'minimax', 'zhipu'].includes(c.templateId)
        )

        for (const config of imageConfigs) {
          const providerType = config.templateId.replace('image-', '') as ImageProviderType

          // 检查 Provider 是否已实现
          if (!isProviderImplemented(providerType)) {
            // 安全日志：避免 EPIPE 错误
            try {
              logger.info(`[ImageService.getProviders] Provider ${providerType} 未实现，跳过`)
            } catch { /* 忽略 EPIPE 错误 */ }
            continue
          }

          const definition = getProviderDefinition(providerType)

          if (definition) {
            providers.push({
              id: config.id,
              name: config.name,
              configured: !!config.apiKey,
              models: []
            })
          }
        }
      }

      return { success: true, data: providers }
    } catch (error: any) {
      logger.error('[ImageService.getProviders] 错误:', error)
      return { success: false, error: error.message || '获取 Provider 列表失败' }
    }
  }

  /**
   * 检查模板是否支持图像生成能力
   *
   * @param templateId - 模板 ID
   * @returns 是否支持图像生成
   */
  private static async checkImageCapability(templateId: string): Promise<boolean> {
    // 已知的支持图像生成的模板
    const imageCapableTemplates = [
      'openai',        // OpenAI DALL-E
      'qwen',          // 通义千问（部分模型支持图像生成）
      'zhipu',         // 智谱 AI
      'minimax',       // Minimax
      'volcengine',    // 火山引擎
      'bailian',       // 百炼平台
      'siliconflow',   // SiliconFlow
      'dashscope'      // 阿里云 DashScope
    ]

    // 移除 'image-' 前缀后再检查
    const normalizedTemplateId = templateId.replace('image-', '')

    return imageCapableTemplates.includes(normalizedTemplateId) ||
           imageCapableTemplates.includes(templateId)
  }

  /**
   * 获取 Provider 支持的模型列表
   *
   * @param providerId - Provider ID
   * @returns 模型列表
   */
  static async getModels(providerId: string): Promise<{ success: boolean; data?: ImageModel[]; error?: string }> {
    const dbManager = getCoreDatabaseManager()

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

        // 未配置的 Provider 没有模型可用
        return {
          success: true,
          data: []
        }
      }

      // 从配置的模型列表中筛选图像模型
      const configModels = config.models || []
      const imageModels = configModels.filter(m =>
        m.type === 'image' || m.type === 'multimodal'
      )

      // 如果配置中有图像模型，直接返回
      if (imageModels.length > 0) {
        return {
          success: true,
          data: imageModels.map(m => ({
            id: m.id,
            name: m.name || m.id,
            providerId: config.id,
            providerName: config.name,
            features: {
              textToImage: true,
              imageToImage: m.features?.includes('image-to-image') || false,
              imageEdit: m.features?.includes('image-edit') || false,
              maxResolution: m.contextWindow ? `${m.contextWindow}x${m.contextWindow}` : '1024x1024',
              supportedSizes: ['512x512', '1024x1024', '1024x768', '768x1024']
            }
          }))
        }
      }

      // 确定 Provider 类型
      const providerType = config.templateId.replace('image-', '') as ImageProviderType

      // 检查 Provider 是否已实现
      if (!isProviderImplemented(providerType)) {
        // 如果未实现，返回空数组
        logger.info(`[ImageService.getModels] Provider ${providerType} 未实现`)
        return {
          success: true,
          data: []
        }
      }

      // 解密 API 密钥
      if (!config.apiKey) {
        return { success: false, error: 'Provider 未配置 API 密钥' }
      }

      const secureStorage = getSecureStorage()
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
      logger.error('[ImageService.getModels] 错误:', error)
      return { success: false, error: error.message || '获取模型列表失败' }
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
    const dbManager = getCoreDatabaseManager()

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
      const secureStorage = getSecureStorage()
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
      logger.error('[ImageService.testProvider] 错误:', error)
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
    event: {
      type: string
      [key: string]: any
    }
  ): void {
    getEventEmitter().emit('image:generation-event', event)
  }
}