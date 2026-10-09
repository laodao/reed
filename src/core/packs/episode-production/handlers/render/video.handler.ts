/**
 * episode-production · 视频合成 · IPC handler
 * @module core/packs/episode-production/handlers/render/video.handler
 * @description 双端共用 handler — PC 由 electron/index.ts 注册，Web 由 register-channels.ts 注册。
 * 包含：视频预设（get-video-presets）、场景/分镜视频合成、视频导出
 */

import { resolveVideoProviderType } from '@core/platform/providers/video'
import { ipcBridge } from '@core/ipc/bridge-adapter'
import * as path from 'path'
import * as fs from 'fs'
import { getBrowserWindowFromEvent } from '@electron/ipc/handlers/_platform'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { toAssetUrl } from '@core/utils/asset-path'
import type { IpcResponse } from '@shared/types/ipc.types'
import type { VideoProjectConfig } from '@shared/types/story-to-video.types'
import { VideoSynthesisService, PRESET_VIDEO_CONFIGS } from '@core/packs/episode-production/services/video-synthesis.service'
import { VideoService } from '@core/packs/episode-production/services/video.service'
import { getSecureStorage } from '@core/interfaces/storage.interface'
import { createVideoProvider } from '@core/platform/providers/video'
import { resolveStoryToVideoAudioDir } from './scene-audio-dir'

/**
 * 将本地路径转换为渲染端可加载的图像 URL（双端协议自适配）
 */
function localPathToUrl(filePath: string): string {
  if (!filePath) return ''
  return toAssetUrl(filePath, 'image')
}

export function registerVideoHandlers(): void {
  // ==================== 视频合成 ====================
  ipcBridge.handle('ep:get-video-presets', handleGetVideoPresets)
  ipcBridge.handle('ep:synthesize-scene-video', handleSynthesizeSceneVideo)
  ipcBridge.handle('ep:synthesize-storyboard-video', handleSynthesizeStoryboardVideo)
  ipcBridge.handle('ep:export-video', handleExportVideo)
}

// ==================== 视频合成处理器 ====================

async function handleGetVideoPresets(): Promise<IpcResponse> {
  try {
    const presets = Object.keys(PRESET_VIDEO_CONFIGS).map(key => ({
      id: key,
      name: getVideoPresetName(key),
      config: PRESET_VIDEO_CONFIGS[key]
    }))
    return { success: true, data: presets }
  } catch (error: any) {
    return { success: false, error: error.message || '获取视频预设失败' }
  }
}

function getVideoPresetName(key: string): string {
  const names: Record<string, string> = {
    standard: '标准 (1080p 30fps)',
    high: '高清 (1080p 30fps 高码率)',
    low: '流畅 (720p 24fps)',
    vertical: '竖屏 (1080x1920)'
  }
  return names[key] || key
}

async function handleSynthesizeSceneVideo(
  event: any,
  sceneId: string,
  quality: string = 'standard'
): Promise<IpcResponse> {
  try {
    const db = getCoreDatabaseManager()
    if (!db.sceneScripts || !db.storyboards || !db.characterBindings) {
      return { success: false, error: '数据库未初始化' }
    }

    // 获取窗口
    const window = getBrowserWindowFromEvent(event)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    // 获取场景
    const scene = await db.sceneScripts.getById(sceneId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取分镜
    const storyboards = await db.storyboards.getBySceneScriptId(sceneId)
    if (storyboards.length === 0) {
      return { success: false, error: '场景没有分镜' }
    }

    // 检查分镜是否都有图片
    const missingImages = storyboards.filter(sb => !sb.frameImage)
    if (missingImages.length > 0) {
      return { success: false, error: `有 ${missingImages.length} 个分镜没有图片，请先生成图片` }
    }

    // 获取项目 ID
    let projectId = ''
    if (db.episodeScripts) {
      const script = await db.episodeScripts.getById(scene.episodeScriptId)
      if (script && db.videoEpisodes) {
        const episode = await db.videoEpisodes.getById(script.episodeId)
        if (episode) {
          projectId = episode.projectId
        }
      }
    }

    if (!projectId) {
      return { success: false, error: '无法获取项目信息' }
    }

    // 获取音频资产（与 audio.handler 生成侧共用同一基准：resolveStoryToVideoAudioDir，
    // 自定义数据目录时扫描 dataPath 而非 userData，避免写读分裂 → 场景视频无声）
    const audioDir = resolveStoryToVideoAudioDir(projectId)
    const audioAssets = new Map<string, string>()

    // 收集音频文件
    if (fs.existsSync(audioDir)) {
      const audioFiles = fs.readdirSync(audioDir)
      for (const file of audioFiles) {
        if (file.endsWith('.wav') || file.endsWith('.mp3')) {
          // 根据文件名判断是旁白还是对话
          if (file.startsWith('narration')) {
            audioAssets.set('narration', path.join(audioDir, file))
          } else if (file.startsWith('dialogue')) {
            // 尝试从文件名提取分镜 ID
            // 文件名格式: dialogue_{characterId}_{timestamp}.wav
            // 暂时简单处理
            audioAssets.set(file, path.join(audioDir, file))
          }
        }
      }
    }

    // 获取视频配置
    const videoConfig = PRESET_VIDEO_CONFIGS[quality] || PRESET_VIDEO_CONFIGS.standard

    // 调用视频合成服务
    const synthesisService = VideoSynthesisService.getInstance()
    const result = await synthesisService.synthesizeSceneVideo(
      storyboards,
      scene,
      projectId,
      sceneId,
      audioAssets,
      videoConfig,
      (phase, progress) => {
        // 发送进度事件
        window.webContents.send('ep:synthesis-progress', {
          sceneId,
          phase,
          progress
        })
      }
    )

    if (result.success) {
      return {
        success: true,
        data: {
          outputPath: result.outputPath,
          duration: result.duration
        }
      }
    }

    return { success: false, error: result.error || '视频合成失败' }
  } catch (error: any) {
    return { success: false, error: error.message || '视频合成失败' }
  }
}

/**
 * 处理合成单个分镜视频
 * 使用 AI 视频生成（图生视频）
 */
async function handleSynthesizeStoryboardVideo(
  event: any,
  storyboardId: string,
  _quality: string = 'standard'
): Promise<IpcResponse> {
  try {
    // 获取窗口
    const window = getBrowserWindowFromEvent(event)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    const db = getCoreDatabaseManager()

    // 获取分镜信息
    if (!db.storyboards) {
      return { success: false, error: '数据库未初始化' }
    }
    const storyboard = await db.storyboards.getById(storyboardId)
    if (!storyboard) {
      return { success: false, error: '分镜不存在' }
    }
    // 闭包内 TS 收窄失效，先固定引用
    const storyboardsRepo = db.storyboards

    // 检查分镜是否有画面
    if (!storyboard.frameImage) {
      return { success: false, error: '分镜没有画面，请先生成画面' }
    }

    // 获取场景信息以获取项目ID
    if (!db.sceneScripts) {
      return { success: false, error: '数据库未初始化' }
    }
    const scene = await db.sceneScripts.getById(storyboard.sceneScriptId)
    if (!scene) {
      return { success: false, error: '场景不存在' }
    }

    // 获取剧本信息以获取项目ID
    if (!db.episodeScripts) {
      return { success: false, error: '数据库未初始化' }
    }
    const script = await db.episodeScripts.getById(scene.episodeScriptId)
    if (!script) {
      return { success: false, error: '剧本不存在' }
    }
    const projectId = script.projectId

    // 获取项目配置
    if (!db.videoProjects) {
      return { success: false, error: '数据库未初始化' }
    }
    const project = await db.videoProjects.getById(projectId)
    if (!project) {
      return { success: false, error: '项目不存在' }
    }

    // 解析项目配置
    let projectConfig: VideoProjectConfig
    try {
      projectConfig = typeof project.config === 'string'
        ? JSON.parse(project.config)
        : project.config
    } catch {
      return { success: false, error: '项目配置解析失败' }
    }

    // 检查是否配置了视频模型
    if (!projectConfig.videoModel || !projectConfig.videoModel.providerConfigId) {
      return { success: false, error: '未配置视频生成模型，请在项目设置中选择视频模型' }
    }

    // 获取分镜图片路径
    const imagePath = storyboard.frameImage.filePath || storyboard.frameImage.url

    // 构建视频生成请求
    const videoRequest: any = {
      providerConfigId: projectConfig.videoModel.providerConfigId,
      model: projectConfig.videoModel.modelId,
      prompt: storyboard.frameDescription || `镜头 ${storyboard.shotNumber} 的动态画面`,
      duration: storyboard.duration || 5,
      aspectRatio: projectConfig.aspectRatio || '16:9'
    }

    // 如果有图片，传递给视频服务（百炼 Provider 会自动处理本地文件上传）
    if (imagePath) {
      videoRequest.image = imagePath
      console.log('[handleSynthesizeStoryboardVideo] 传递图片路径给视频服务:', imagePath.substring(0, 100))
    }

    console.log('[handleSynthesizeStoryboardVideo] 调用 AI 视频生成:', {
      storyboardId,
      model: videoRequest.model,
      duration: videoRequest.duration,
      hasImage: !!imagePath
    })

    // 获取 Provider 配置
    const providerConfig = await db.providerConfigs.getById(projectConfig.videoModel.providerConfigId)
    if (!providerConfig) {
      return { success: false, error: '视频模型配置不存在' }
    }

    // 解密 API 密钥
    const secureStorage = getSecureStorage()
    if (!secureStorage.isInitialized()) {
      await secureStorage.initialize()
    }
    const decryptedApiKey = secureStorage.decrypt(providerConfig.apiKey)

    // 确定 Provider 类型（统一映射：ai-hub → aihub，防 replace 漏改 N2）
    const providerType = resolveVideoProviderType(providerConfig.templateId)
    if (providerType === 'bailian' || providerType === 'dashscope' || providerType === 'qwen') {
      // bailian/dashscope/qwen 同走百炼 Provider（createVideoProvider 内部映射），保持原值即可
    }

    // 创建 Provider 实例（baseUrl 优先 videoBaseUrl——视频专用端点，与 video-generation.service 对齐）
    const provider = createVideoProvider(providerType as any, {
      id: providerConfig.id,
      apiKey: decryptedApiKey,
      baseUrl: providerConfig.videoBaseUrl || providerConfig.baseUrl,
      customHeaders: providerConfig.customHeaders,
      customParams: providerConfig.customParams
    })

    // 调用 AI 视频生成服务；注册终态回调——同步等待超时后，后台轮询（75 分钟）
    // 出片/失败仍能回写 DB（此前回写 owner 只有同步路径，超时即永久丢产物落库）
    const result = await VideoService.generateVideo(videoRequest, {
      onCompleted: async (video) => {
        const localPath = (video as { localPath?: string }).localPath
        const actualDuration = (video as { duration?: number }).duration
        if (localPath) {
          // 2026-09-16 P1-RD3：回填实际时长——此前只写 videoPath，timeline 用声明的
          // "理论"时长算 xfade offset，provider 实际时长不符时转场处冻结/黑屏
          await storyboardsRepo.update(storyboardId, {
            videoPath: localPath,
            ...(actualDuration ? { duration: actualDuration } : {}),
          })
          console.log('[handleSynthesizeStoryboardVideo] 后台任务完成，已回填 videoPath:', localPath)
          try {
            const { advanceEpisodeStatusForStoryboard } = await import(
              '@core/platform/episode-production/workflow/episode-status-advance'
            )
            if (db.dataSource) await advanceEpisodeStatusForStoryboard(db.dataSource, storyboardId, 'producing')
          } catch { /* 状态推进失败不影响产物回写 */ }
        }
      },
      onFailed: async (err) => {
        console.warn('[handleSynthesizeStoryboardVideo] 后台任务失败:', err)
      },
    })

    if (result.success) {
      // 同步模式：直接返回了视频
      if (result.video?.localPath || result.video?.url) {
        const videoPath = result.video.localPath || result.video.url
        // 更新分镜的 videoPath + 实际时长（P1-RD3：避免 xfade offset 按理论时长错位）
        await db.storyboards.update(storyboardId, {
          videoPath,
          ...(result.video.duration ? { duration: result.video.duration } : {}),
        })
        try {
          const { advanceEpisodeStatusForStoryboard } = await import(
            '@core/platform/episode-production/workflow/episode-status-advance'
          )
          if (db.dataSource) await advanceEpisodeStatusForStoryboard(db.dataSource, storyboardId, 'producing')
        } catch { /* 状态推进失败不阻断返回 */ }

        return {
          success: true,
          data: {
            outputPath: videoPath,
            duration: result.video.duration || storyboard.duration
          }
        }
      }

      // 异步模式：等待任务完成
      if (result.taskId) {
        console.log('[handleSynthesizeStoryboardVideo] 异步任务已创建，等待完成:', result.taskId)

        // 等待任务完成：评审 #103 实测局域网网关 15~25 分钟，原 5 分钟必然假超时——
        // 提至 30 分钟；即便超时，后台轮询 + 终态回调仍会把产物回写 videoPath
        const taskStatus = await VideoService.waitForTaskCompletion(provider, result.taskId, 30 * 60 * 1000)

        if (taskStatus.status === 'completed' && taskStatus.video?.url) {
          console.log('[handleSynthesizeStoryboardVideo] 视频生成成功，下载中...')

          // 下载视频到本地
          const savedPath = await VideoService['saveVideoFromUrl'](taskStatus.video.url, videoRequest.model || 'unknown')

          if (savedPath) {
            const localUrl = localPathToUrl(savedPath)
            console.log('[handleSynthesizeStoryboardVideo] 视频保存成功:', savedPath)
            // 更新分镜的 videoPath + 实际时长（P1-RD3）
            await db.storyboards.update(storyboardId, {
              videoPath: savedPath,
              ...(taskStatus.video.duration ? { duration: taskStatus.video.duration } : {}),
            })
            try {
              const { advanceEpisodeStatusForStoryboard } = await import(
                '@core/platform/episode-production/workflow/episode-status-advance'
              )
              if (db.dataSource) await advanceEpisodeStatusForStoryboard(db.dataSource, storyboardId, 'producing')
            } catch { /* 状态推进失败不阻断返回 */ }

            return {
              success: true,
              data: {
                outputPath: localUrl,
                duration: taskStatus.video.duration || storyboard.duration
              }
            }
          } else {
            // 下载失败：不再把（可能带签名、会过期的）远程 URL 写入 videoPath——
            // 过期后合成阶段 ffmpeg 拉流必败。后台轮询会持续重试下载，
            // 成功后经 onCompleted 回调自动回填本地路径
            console.warn('[handleSynthesizeStoryboardVideo] 视频已生成但下载失败，后台将持续重试并自动回填')
            return {
              success: false,
              error: '视频已生成但下载失败，系统将在后台持续重试下载并自动回填，请稍后刷新查看'
            }
          }
        } else {
          // 任务失败 / 同步等待超时。超时≠终局：后台轮询（约 75 分钟）仍在跑，
          // 出片后经 onCompleted 回调自动回填 videoPath
          if (taskStatus.error === '任务超时') {
            return {
              success: false,
              error: '等待超时：视频任务仍在后台执行（实测最长约 25 分钟），完成后将自动回填，请稍后刷新查看'
            }
          }
          return { success: false, error: taskStatus.error || '视频生成失败' }
        }
      }
    }

    return { success: false, error: result.error || '视频生成失败' }
  } catch (error: any) {
    console.error('[handleSynthesizeStoryboardVideo] 错误:', error)
    return { success: false, error: error.message || '视频生成失败' }
  }
}

async function handleExportVideo(
  event: any,
  sourcePath: string,
  outputPath: string,
  quality: string = 'standard'
): Promise<IpcResponse> {
  try {
    // 获取窗口
    const window = getBrowserWindowFromEvent(event)
    if (!window) {
      return { success: false, error: '窗口不存在' }
    }

    // 检查源文件是否存在
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: '源视频不存在' }
    }

    // 调用导出服务
    const synthesisService = VideoSynthesisService.getInstance()
    const result = await synthesisService.exportVideo(sourcePath, outputPath, 'mp4', quality)

    if (result.success) {
      return { success: true, data: { outputPath: result.outputPath } }
    }

    return { success: false, error: result.error || '导出视频失败' }
  } catch (error: any) {
    return { success: false, error: error.message || '导出视频失败' }
  }
}
