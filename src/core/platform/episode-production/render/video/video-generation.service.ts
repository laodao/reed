/**
 * render/video/video-generation.service
 * @module platform/episode-production/render/video/video-generation.service
 * @description AI 视频生成服务：调用视频 provider 生成视频、管理异步任务轮询、
 *              下载保存视频文件、provider 可用性查询与测试。
 *              拆自原 src/core/services/video.service.ts。
 */

import * as path from 'path'
import * as fs from 'fs'
// electron-log 已被替换为跨平台 console wrapper（见下方 logger 常量）
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import { toAssetUrl } from '@core/utils/asset-path'
import {
  createVideoProvider,
  getProviderDefinition,
  isProviderImplemented
} from '@core/platform/providers/video'
import type { BaseVideoProvider } from '@core/platform/providers/video'
import type {
  VideoProvider,
  VideoGenerationRequest,
  VideoGenerationResponse,
  VideoTaskStatus,
  VideoProviderType
} from '@shared/types/video-provider.types'

// 跨平台 logger：包装 console，简单实现 electron-log 风格的 .scope/.info/.error API
const logger = {
  info: (...args: any[]) => console.log('[VideoService]', ...args),
  warn: (...args: any[]) => console.warn('[VideoService]', ...args),
  error: (...args: any[]) => console.error('[VideoService]', ...args),
  debug: (...args: any[]) => console.debug('[VideoService]', ...args),
}

/**
 * 正在进行的轮询任务
 */
const activePollingTasks = new Map<string, NodeJS.Timeout>()

/**
 * 任务级完成/失败回调——后台轮询（75 分钟）出片后回写业务侧
 * （如 storyboard.video_path）。修复"同步等待超时后，远端即使出片也
 * 没有任何路径落库"的状态卡死：DB 回写的 owner 从唯一的同步路径
 * 扩展到后台轮询终态。
 */
interface TaskLifecycleCallbacks {
  onCompleted?: (video: NonNullable<VideoTaskStatus['video']>) => void | Promise<void>
  onFailed?: (error: string) => void | Promise<void>
}
const taskCallbacks = new Map<string, TaskLifecycleCallbacks>()

/** 取走并删除任务回调（终态只触发一次） */
function consumeTaskCallbacks(taskId: string): TaskLifecycleCallbacks | undefined {
  const cb = taskCallbacks.get(taskId)
  taskCallbacks.delete(taskId)
  return cb
}

/**
 * 将本地文件路径转换为渲染端可加载的 URL。
 * 协议由 PathProvider 决定（Electron: local-video://，Web: /assets/...）。
 */
function localPathToUrl(filePath: string): string {
  if (!filePath) return ''
  return toAssetUrl(filePath, 'video')
}

/**
 * AI 视频生成服务
 */
export class VideoGenerationService {
  /**
   * 生成视频
   *
   * @param request - 视频生成请求
   * @returns 生成响应
   */
  static async generateVideo(
        request: VideoGenerationRequest,
    opts?: TaskLifecycleCallbacks
  ): Promise<VideoGenerationResponse> {
    logger.info('[VideoService.generateVideo] 开始处理请求')

    const dbManager = getCoreDatabaseManager()

    if (!dbManager.providerConfigs) {
      logger.error('[VideoService.generateVideo] 错误: 数据库未初始化')
      return { success: false, error: '数据库未初始化' }
    }

    try {
      // 获取 Provider 配置
      let providerConfig = null

      // 尝试从 providerConfigs 获取配置
      if (request.providerConfigId) {
        providerConfig = await dbManager.providerConfigs.getById(request.providerConfigId)
        logger.info('[VideoService.generateVideo] 使用指定的 Provider:', request.providerConfigId, providerConfig?.name)
      }

      // 如果没有指定，尝试获取视频类型的默认 Provider
      if (!providerConfig) {
        const enabledConfigs = await dbManager.providerConfigs.getEnabled()
        // 查找视频类型的 Provider
        providerConfig = enabledConfigs.find(c =>
          c.templateId.startsWith('video-') ||
          ['volcengine', 'runway', 'pika', 'kling'].includes(c.templateId)
        )
        logger.info('[VideoService.generateVideo] 使用默认 Provider:', providerConfig?.name)
      }

      if (!providerConfig) {
        logger.error('[VideoService.generateVideo] 错误: 未配置视频生成 Provider')
        return { success: false, error: '未配置视频生成 Provider，请先在设置中添加视频生成服务配置' }
      }

      // 按模板定义判定是否需要 API Key（ComfyUI 等本地网关免密钥）
      const authProviderType = providerConfig.templateId.replace('video-', '') as VideoProviderType
      const authDefinition = getProviderDefinition(authProviderType)
      const needsApiKey = authDefinition ? authDefinition.requiresApiKey : true

      if (needsApiKey && !providerConfig.apiKey) {
        logger.error('[VideoService.generateVideo] 错误: Provider 未配置 API 密钥')
        return { success: false, error: `Provider "${providerConfig.name}" 未配置 API 密钥` }
      }

      // 解密 API 密钥（免密钥 Provider 跳过解密，传空串给实例）
      logger.info('[VideoService.generateVideo] 开始解密 API 密钥')
      let decryptedApiKey: string
      if (!needsApiKey) {
        decryptedApiKey = ''
      } else {
        try {
          const secureStorage = getSecureStorage()
          if (!secureStorage.isInitialized()) {
            await secureStorage.initialize()
          }
          decryptedApiKey = secureStorage.decrypt(providerConfig.apiKey!)
          logger.info('[VideoService.generateVideo] API 密钥解密成功')
        } catch (decryptError) {
          logger.error('[VideoService.generateVideo] API 密钥解密失败:', decryptError)
          return { success: false, error: 'API 密钥解密失败，请重新配置 Provider' }
        }
      }

      // 确定 Provider 类型
      let providerType = providerConfig.templateId.replace('video-', '') as VideoProviderType

      // 特殊处理：bailian 和 dashscope 使用相同的 Provider（阿里云百炼）
      if (providerType === 'bailian' || providerType === 'dashscope' || providerType === 'qwen') {
        providerType = 'bailian'
      }

      // 检查 Provider 是否已实现
      if (!isProviderImplemented(providerType)) {
        logger.info(`[VideoService.generateVideo] Provider ${providerType} 未实现`)
        return { success: false, error: `视频生成服务 ${providerType} 暂未实现` }
      }

      // 创建 Provider 实例（baseUrl 优先取 videoBaseUrl——视频专用端点；回落 baseUrl）
      const provider = createVideoProvider(providerType, {
        id: providerConfig.id,
        apiKey: decryptedApiKey,
        baseUrl: providerConfig.videoBaseUrl || providerConfig.baseUrl,
        customHeaders: providerConfig.customHeaders,
        customParams: providerConfig.customParams
      })

      // 发送生成请求
      logger.info('[VideoService.generateVideo] 调用 Provider 生成视频')
      const response = await provider.generateVideo(request)

      if (!response.success) {
        logger.error('[VideoService.generateVideo] 生成失败:', response.error)
        return response
      }

      // 同步模式：直接返回了视频
      if (response.video) {
        logger.info('[VideoService.generateVideo] 同步模式，直接返回视频')

        // 如果需要保存视频
        if (!request.skipHistory && response.video.url) {
          const savedVideo = await this.saveVideoFromUrl(response.video.url, request.model)

          if (savedVideo) {
            response.video.localPath = savedVideo
            response.video.url = localPathToUrl(savedVideo)
          }
        }

        return response
      }

      // 异步模式：需要轮询任务状态
      const taskId = response.taskId
      if (!taskId) {
        return { success: false, error: '未返回任务 ID 或视频结果' }
      }

      // 注册业务侧终态回调（后台轮询出片/失败后回写 DB，与同步等待路径解耦）
      if (opts?.onCompleted || opts?.onFailed) {
        taskCallbacks.set(taskId, { onCompleted: opts.onCompleted, onFailed: opts.onFailed })
      }

      // 发送任务开始事件
      this.sendVideoEvent({
        type: 'generation-started',
        taskId: taskId
      })

      // 启动异步轮询任务
      this.startPollingTask(provider, taskId)

      return {
        success: true,
        taskId: taskId
      }
    } catch (error: any) {
      logger.error('[VideoService.generateVideo] 捕获异常:', error)
      return { success: false, error: error.message || '生成失败' }
    }
  }

  /**
   * 启动轮询任务
   *
   * @param provider - Provider 实例
   * @param taskId - 任务 ID
   */
  private static startPollingTask(
        provider: BaseVideoProvider,
    taskId: string
  ): void {
    // 如果已有相同任务的轮询，先停止
    if (activePollingTasks.has(taskId)) {
      clearInterval(activePollingTasks.get(taskId)!)
    }

    let pollCount = 0
    // 评审 #103：局域网 ComfyUI 网关 H3 全质量单镜实测 15~25 分钟（10s 片段 872s 未完成），
    // 原 120 次×5s=10 分钟必然超时。提至 900 次（约 75 分钟），需大于 video-gen 节点等待上限。
    const maxPolls = 900 // 最多轮询 900 次（约 75 分钟）

    const pollTask = async () => {
      pollCount++
      logger.info(`[VideoService] 轮询任务状态, taskId: ${taskId}, 第 ${pollCount} 次`)

      try {
        const status = await provider.getTaskStatus(taskId)

        // 发送进度事件
        this.sendVideoEvent({
          type: 'generation-progress',
          taskId: taskId,
          status: status.status,
          progress: status.progress
        })

        if (status.status === 'completed') {
          // 评审 #104：先取回产物再结束轮询。下载失败不清 interval——
          // 网关状态持续 done，下一轮自动重试下载，直到成功或达 maxPolls，
          // 避免"完成了但产物没落盘/节点永久挂起"。
          const videoUrl = status.video?.url
          if (videoUrl) {
            const savedPath = await this.saveVideoFromUrl(videoUrl, 'unknown')
            if (savedPath && status.video) {
              status.video.localPath = savedPath
              status.video.url = localPathToUrl(savedPath)
              const interval = activePollingTasks.get(taskId)
              if (interval) {
                clearInterval(interval)
                activePollingTasks.delete(taskId)
              }
              this.sendVideoEvent({
                type: 'generation-completed',
                taskId: taskId,
                video: status.video
              })
              // 业务侧回写（如 storyboard.video_path）；同步等待超时后由此兜底落库
              try {
                await consumeTaskCallbacks(taskId)?.onCompleted?.(status.video)
              } catch (cbErr) {
                logger.error('[VideoService] 任务完成回调执行失败:', cbErr)
              }
            }
            // 下载失败：不结束轮询，等下轮再试（5s 后）
          } else {
            // 网关没给下载地址：按失败收敛
            const interval = activePollingTasks.get(taskId)
            if (interval) {
              clearInterval(interval)
              activePollingTasks.delete(taskId)
            }
            this.sendVideoEvent({
              type: 'generation-failed',
              taskId: taskId,
              error: '视频生成完成但缺少下载地址'
            })
            try {
              await consumeTaskCallbacks(taskId)?.onFailed?.('视频生成完成但缺少下载地址')
            } catch (cbErr) {
              logger.error('[VideoService] 任务失败回调执行失败:', cbErr)
            }
          }
        } else if (status.status === 'failed') {
          // 停止轮询
          const interval = activePollingTasks.get(taskId)
          if (interval) {
            clearInterval(interval)
            activePollingTasks.delete(taskId)
          }

          // 发送失败事件
          const failMsg = status.error || '视频生成失败'
          this.sendVideoEvent({
            type: 'generation-failed',
            taskId: taskId,
            error: failMsg
          })
          try {
            await consumeTaskCallbacks(taskId)?.onFailed?.(failMsg)
          } catch (cbErr) {
            logger.error('[VideoService] 任务失败回调执行失败:', cbErr)
          }
        } else if (pollCount >= maxPolls) {
          // 超时
          const interval = activePollingTasks.get(taskId)
          if (interval) {
            clearInterval(interval)
            activePollingTasks.delete(taskId)
          }

          this.sendVideoEvent({
            type: 'generation-failed',
            taskId: taskId,
            error: '任务超时，请重试'
          })
          try {
            await consumeTaskCallbacks(taskId)?.onFailed?.('任务超时')
          } catch (cbErr) {
            logger.error('[VideoService] 任务失败回调执行失败:', cbErr)
          }
        }
      } catch (error: any) {
        logger.error('[VideoService] 轮询任务状态失败:', error)
      }
    }

    // 每 5 秒轮询一次
    const interval = setInterval(pollTask, 5000)
    activePollingTasks.set(taskId, interval)

    // 立即执行一次
    pollTask()
  }

  /**
   * 从 URL 保存视频到本地
   *
   * @param videoUrl - 视频 URL
   * @param modelId - 模型 ID
   * @returns 本地文件路径
   */
  private static async saveVideoFromUrl(
    videoUrl: string,
    _modelId: string
  ): Promise<string | null> {
    try {
      const userDataPath = getPathProvider().getDataPath()
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const videosDir = path.join(userDataPath, 'videos', String(year), month, day)

      // 确保目录存在
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true })
      }

      // 生成文件名
      const videoId = `video_${Date.now()}`
      const fileName = `${videoId}.mp4`
      const filePath = path.join(videosDir, fileName)

      // 下载视频（评审 #104：180s 超时，悬挂/断连不无限等）
      logger.info('[VideoService] 下载视频:', videoUrl)
      const response = await fetch(videoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(180_000)
      })

      if (!response.ok) {
        throw new Error(`下载视频失败: HTTP ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // 保存文件
      fs.writeFileSync(filePath, buffer)
      logger.info('[VideoService] 视频保存成功:', filePath)

      return filePath
    } catch (error: any) {
      logger.error('[VideoService] 保存视频失败:', error)
      return null
    }
  }

  /**
   * 查询任务状态
   *
   * @param taskId - 任务 ID
   * @returns 任务状态
   */
  static async getTaskStatus(taskId: string): Promise<VideoTaskStatus> {
    // 简化实现，实际应该从 Provider 查询
    return {
      taskId,
      status: 'pending'
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
      taskCallbacks.delete(taskId)
      return true
    }
    return false
  }

  /**
   * 同步等待任务完成
   * 用于需要等待视频生成完成的场景
   *
   * @param provider - Provider 实例
   * @param taskId - 任务 ID
   * @param maxWaitMs - 最大等待时间（毫秒），默认 5 分钟
   * @returns 任务状态，包含视频信息
   */
  static async waitForTaskCompletion(
    provider: BaseVideoProvider,
    taskId: string,
    maxWaitMs: number = 5 * 60 * 1000
  ): Promise<VideoTaskStatus> {
    const startTime = Date.now()
    const pollInterval = 5000 // 每 5 秒查询一次

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const status = await provider.getTaskStatus(taskId)
        logger.info(`[VideoService] 任务 ${taskId} 状态: ${status.status}`)

        if (status.status === 'completed' || status.status === 'failed') {
          return status
        }

        // 等待后继续轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      } catch (error: any) {
        logger.error(`[VideoService] 查询任务状态失败:`, error)
        // 继续重试
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      }
    }

    // 超时
    return {
      taskId,
      status: 'failed',
      error: '任务超时'
    }
  }

  /**
   * 获取可用的 Provider 列表
   *
   * @returns Provider 列表
   */
  static async getProviders(): Promise<{ success: boolean; data?: VideoProvider[]; error?: string }> {
    const dbManager = getCoreDatabaseManager()

    if (!dbManager.providerConfigs) {
      return { success: false, error: '数据库未初始化' }
    }

    try {
      const enabledConfigs = await dbManager.providerConfigs.getEnabled()

      const providers: VideoProvider[] = []

      for (const config of enabledConfigs) {
        const providerType = config.templateId.replace('video-', '') as VideoProviderType

        if (!isProviderImplemented(providerType)) {
          continue
        }

        providers.push({
          id: config.id,
          name: config.name,
          configured: !!config.apiKey,
          models: []
        })
      }

      return { success: true, data: providers }
    } catch (error: any) {
      logger.error('[VideoService.getProviders] 错误:', error)
      return { success: false, error: error.message || '获取 Provider 列表失败' }
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
      const providerType = config.templateId.replace('video-', '') as VideoProviderType

      if (!isProviderImplemented(providerType)) {
        return { success: false, message: `视频生成服务 ${providerType} 暂未实现` }
      }

      const provider = createVideoProvider(providerType, {
        id: config.id,
        apiKey: decryptedApiKey,
        baseUrl: config.baseUrl,
        customHeaders: config.customHeaders,
        customParams: config.customParams
      })

      // 测试连接
      const result = await provider.testConnection()

      return result
    } catch (error: any) {
      logger.error('[VideoService.testProvider] 错误:', error)
      return { success: false, message: error.message || '测试连接失败' }
    }
  }

  /**
   * 发送视频事件到渲染进程
   *
   * @param event - 事件数据
   */
  private static sendVideoEvent(
        event: {
      type: string
      [key: string]: any
    }
  ): void {
    getEventEmitter().emit('video:generation-event', event)
  }
}
