/**
 * 视频合成服务
 * @module services/video-synthesis.service
 * @description 使用 FFmpeg 合成视频，包括图片转视频、音频合成、字幕叠加、转场效果
 */

import * as path from 'path'
import * as fs from 'fs'
import { getEventEmitter } from '@core/interfaces/event.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffprobePath from '@ffprobe-installer/ffprobe'
import type {
  Storyboard,
  SceneScript,
  ImageAsset,
  AudioAsset
} from '@shared/types/story-to-video.types'

// 设置 FFmpeg 路径
ffmpeg.setFfmpegPath(ffmpegPath.path)
ffmpeg.setFfprobePath(ffprobePath.path)

/**
 * 视频合成配置
 */
export interface VideoSynthesisConfig {
  width: number
  height: number
  fps: number
  videoBitrate: string
  audioBitrate: string
  preset: string
  crf: number
}

/**
 * 预设视频配置
 */
export const PRESET_VIDEO_CONFIGS: Record<string, VideoSynthesisConfig> = {
  standard: {
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: '5000k',
    audioBitrate: '128k',
    preset: 'medium',
    crf: 23
  },
  high: {
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: '8000k',
    audioBitrate: '192k',
    preset: 'slow',
    crf: 18
  },
  low: {
    width: 1280,
    height: 720,
    fps: 24,
    videoBitrate: '2500k',
    audioBitrate: '96k',
    preset: 'fast',
    crf: 28
  },
  vertical: {
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitrate: '4000k',
    audioBitrate: '128k',
    preset: 'medium',
    crf: 23
  }
}

/**
 * 转场效果类型
 */
export type TransitionType =
  | 'fade'
  | 'fadein'
  | 'fadeout'
  | 'xfade'
  | 'dissolve'
  | 'wipeleft'
  | 'wiperight'
  | 'wipeup'
  | 'wipedown'
  | 'slideleft'
  | 'slideright'
  | 'circlecrop'
  | 'rectcrop'
  | 'distance'
  | 'none'

/**
 * 转场效果配置
 */
export interface TransitionConfig {
  type: TransitionType
  duration: number // 转场时长（秒）
  offset?: number // 转场开始时间点
}

/**
 * 视频合成结果
 */
export interface SynthesisResult {
  success: boolean
  outputPath?: string
  duration?: number
  error?: string
}

/**
 * 视频合成服务
 */
export class VideoSynthesisService {
  private static instance: VideoSynthesisService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): VideoSynthesisService {
    if (!VideoSynthesisService.instance) {
      VideoSynthesisService.instance = new VideoSynthesisService()
    }
    return VideoSynthesisService.instance
  }

  /**
   * 获取视频输出目录
   */
  private getVideoOutputDir(projectId: string): string {
    const userDataPath = getPathProvider().getUserDataPath()
    const outputDir = path.join(userDataPath, 'story-to-video', projectId, 'videos')

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    return outputDir
  }

  /**
   * 获取临时文件目录
   */
  private getTempDir(projectId: string): string {
    const userDataPath = getPathProvider().getUserDataPath()
    const tempDir = path.join(userDataPath, 'story-to-video', projectId, 'temp')

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    return tempDir
  }

  // ==================== 单镜头合成 ====================

  /**
   * 将单个分镜的图片转换为视频片段
   */
  async createShotVideo(
    storyboard: Storyboard,
    outputPath: string,
    audioPath?: string,
    config: VideoSynthesisConfig = PRESET_VIDEO_CONFIGS.standard
  ): Promise<SynthesisResult> {
    try {
      // 检查图片是否存在
      if (!storyboard.frameImage?.filePath && !storyboard.frameImage?.url) {
        return { success: false, error: '分镜没有图片' }
      }

      const imagePath = storyboard.frameImage.filePath || storyboard.frameImage.url
      const duration = storyboard.duration || 3 // 默认 3 秒

      // 创建 FFmpeg 命令
      const command = ffmpeg()

      // 输入图片（循环播放指定时长）
      command.input(imagePath)
        .inputOptions([
          `-loop 1`,
          `-t ${duration}`,
          `-framerate ${config.fps}`
        ])

      // 如果有音频，添加音频输入
      if (audioPath && fs.existsSync(audioPath)) {
        command.input(audioPath)
      }

      // 视频滤镜
      const videoFilters = [
        `scale=${config.width}:${config.height}`,
        `fps=${config.fps}`
      ]

      // 添加字幕（如果有）
      // TODO: 实现字幕叠加

      command.videoFilter(videoFilters.join(','))

      // 输出配置
      command
        .videoCodec('libx264')
        .videoBitrate(config.videoBitrate)
        .outputOptions([
          `-crf ${config.crf}`,
          `-pix_fmt yuv420p`,
          `-preset ${config.preset}`
        ])

      // 如果有音频
      if (audioPath && fs.existsSync(audioPath)) {
        command
          .audioCodec('aac')
          .audioBitrate(config.audioBitrate)
          .outputOptions(['-shortest']) // 以最短的轨道为准
      }

      // 设置输出路径
      command.output(outputPath)

      // 执行
      return await this.runFFmpegCommand(command)
    } catch (error: any) {
      console.error('[VideoSynthesis] 创建镜头视频失败:', error)
      return { success: false, error: error.message || '创建镜头视频失败' }
    }
  }

  /**
   * 合成单个分镜视频
   */
  async synthesizeStoryboardVideo(
    storyboard: Storyboard,
    projectId: string,
    config: VideoSynthesisConfig = PRESET_VIDEO_CONFIGS.standard
  ): Promise<SynthesisResult> {
    try {
      const outputDir = this.getVideoOutputDir(projectId)

      // 检查分镜是否有图片
      if (!storyboard.frameImage?.filePath && !storyboard.frameImage?.url) {
        return { success: false, error: '分镜没有图片' }
      }

      // 输出文件名
      const outputFileName = `storyboard_${storyboard.shotNumber}_${storyboard.id}.mp4`
      const outputPath = path.join(outputDir, outputFileName)

      // 调用 createShotVideo 方法合成视频
      const result = await this.createShotVideo(
        storyboard,
        outputPath,
        undefined, // 暂时不处理音频
        config
      )

      if (result.success) {
        return {
          success: true,
          outputPath,
          duration: storyboard.duration || 3
        }
      }

      return result
    } catch (error: any) {
      console.error('[VideoSynthesis] 合成分镜视频失败:', error)
      return { success: false, error: error.message || '合成分镜视频失败' }
    }
  }

  /**
   * 批量创建场景镜头视频
   */
  async createSceneShotVideos(
        storyboards: Storyboard[],
    projectId: string,
    sceneId: string,
    audioAssets: Map<string, string>,
    config: VideoSynthesisConfig = PRESET_VIDEO_CONFIGS.standard,
    onProgress?: (index: number, total: number) => void
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    const outputDir = this.getVideoOutputDir(projectId)

    for (let i = 0; i < storyboards.length; i++) {
      const storyboard = storyboards[i]

      if (onProgress) {
        onProgress(i, storyboards.length)
        // 通知前端进度
        getEventEmitter().emit('stv:synthesis-progress', {
          sceneId,
          type: 'shot',
          index: i,
          total: storyboards.length,
          storyboardId: storyboard.id
        })
      }

      // 输出文件名
      const outputFileName = `shot_${storyboard.shotNumber}_${storyboard.id}.mp4`
      const outputPath = path.join(outputDir, outputFileName)

      // 查找对应的音频（旁白或对话）
      const audioPath = audioAssets.get(storyboard.id)

      try {
        const result = await this.createShotVideo(
          storyboard,
          outputPath,
          audioPath,
          config
        )

        if (result.success) {
          results.set(storyboard.id, outputPath)
        }
      } catch (error) {
        console.error(`创建镜头 ${storyboard.shotNumber} 视频失败:`, error)
      }

      // 添加延迟避免资源占用过高
      if (i < storyboards.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    return results
  }

  // ==================== 转场合成 ====================

  /**
   * 合并多个视频片段（带转场效果）
   */
  async mergeVideosWithTransitions(
    videoPaths: string[],
    transitions: TransitionConfig[],
    outputPath: string,
    config: VideoSynthesisConfig = PRESET_VIDEO_CONFIGS.standard
  ): Promise<SynthesisResult> {
    try {
      if (videoPaths.length === 0) {
        return { success: false, error: '没有视频片段' }
      }

      // 如果只有一个视频，直接处理
      if (videoPaths.length === 1) {
        return await this.processSingleVideo(
          videoPaths[0],
          outputPath,
          config
        )
      }

      // 使用 xfade 滤镜进行转场
      const command = ffmpeg()

      // 添加所有视频输入
      for (const videoPath of videoPaths) {
        command.input(videoPath)
      }

      // 构建 xfade 滤镜链
      const filterComplex = this.buildXfadeFilterComplex(
        videoPaths.length,
        transitions,
        config
      )

      command.complexFilter(filterComplex)

      // 输出配置
      command
        .videoCodec('libx264')
        .audioCodec('aac')
        .output(outputPath)
        .outputOptions([
          `-preset ${config.preset}`,
          `-crf ${config.crf}`
        ])

      return await this.runFFmpegCommand(command)
    } catch (error: any) {
      console.error('[VideoSynthesis] 合并视频失败:', error)
      return { success: false, error: error.message || '合并视频失败' }
    }
  }

  /**
   * 构建 xfade 滤镜链
   */
  private buildXfadeFilterComplex(
    videoCount: number,
    transitions: TransitionConfig[],
    config: VideoSynthesisConfig
  ): string {
    const filters: string[] = []

    // 简化版本：使用 concat 滤镜
    // xfade 需要精确的时间计算，复杂场景使用 concat

    if (transitions.length === 0 || transitions.every(t => t.type === 'none')) {
      // 无转场，直接拼接
      const inputs = Array.from({ length: videoCount }, (_, i) => `[${i}:v][${i}:a]`).join('')
      filters.push(`${inputs}concat=n=${videoCount}:v=1:a=1[outv][outa]`)
    } else {
      // 带转场效果
      // 使用简单的 fade 转场
      for (let i = 0; i < videoCount; i++) {
        const transition = transitions[i] || { type: 'none', duration: 0 }

        if (i === 0) {
          // 第一个视频，添加 fadein
          if (transition.type === 'fadein' || transition.type === 'fade') {
            filters.push(`[${i}:v]fade=t=in:st=0:d=${transition.duration}[v${i}]`)
            filters.push(`[${i}:a]afade=t=in:st=0:d=${transition.duration}[a${i}]`)
          } else {
            filters.push(`[${i}:v]null[v${i}]`)
            filters.push(`[${i}:a]anull[a${i}]`)
          }
        } else if (i === videoCount - 1) {
          // 最后一个视频，添加 fadeout
          if (transition.type === 'fadeout' || transition.type === 'fade') {
            // 需要先获取视频时长
            filters.push(`[${i}:v]fade=t=out:st=${transition.offset || 0}:d=${transition.duration}[v${i}]`)
            filters.push(`[${i}:a]afade=t=out:st=${transition.offset || 0}:d=${transition.duration}[a${i}]`)
          } else {
            filters.push(`[${i}:v]null[v${i}]`)
            filters.push(`[${i}:a]anull[a${i}]`)
          }
        } else {
          filters.push(`[${i}:v]null[v${i}]`)
          filters.push(`[${i}:a]anull[a${i}]`)
        }
      }

      // 拼接所有处理后的视频
      const inputs = Array.from({ length: videoCount }, (_, i) => `[v${i}][a${i}]`).join('')
      filters.push(`${inputs}concat=n=${videoCount}:v=1:a=1[outv][outa]`)
    }

    return filters.join(';')
  }

  /**
   * 处理单个视频（重编码）
   */
  private async processSingleVideo(
    inputPath: string,
    outputPath: string,
    config: VideoSynthesisConfig
  ): Promise<SynthesisResult> {
    const command = ffmpeg(inputPath)

    command
      .videoCodec('libx264')
      .videoBitrate(config.videoBitrate)
      .audioCodec('aac')
      .audioBitrate(config.audioBitrate)
      .outputOptions([
        `-crf ${config.crf}`,
        `-pix_fmt yuv420p`,
        `-preset ${config.preset}`
      ])
      .output(outputPath)

    return await this.runFFmpegCommand(command)
  }

  // ==================== 音频合成 ====================

  /**
   * 合成场景音频（旁白 + 对话 + 背景音乐）
   */
  async mixSceneAudio(
    narrationPath?: string,
    dialoguePaths: string[] = [],
    backgroundMusicPath?: string,
    outputPath: string,
    totalDuration: number
  ): Promise<SynthesisResult> {
    try {
      const command = ffmpeg()

      // 添加音频输入
      const audioInputs: number[] = []

      if (narrationPath && fs.existsSync(narrationPath)) {
        command.input(narrationPath)
        audioInputs.push(audioInputs.length)
      }

      for (const dialoguePath of dialoguePaths) {
        if (fs.existsSync(dialoguePath)) {
          command.input(dialoguePath)
          audioInputs.push(audioInputs.length)
        }
      }

      if (backgroundMusicPath && fs.existsSync(backgroundMusicPath)) {
        command.input(backgroundMusicPath)
        command.inputOptions([`-stream_loop -1`]) // 循环背景音乐
        audioInputs.push(audioInputs.length)
      }

      if (audioInputs.length === 0) {
        return { success: false, error: '没有音频输入' }
      }

      // 构建 audio mix 滤镜
      const filterInputs = audioInputs.map(i => `[${i}:a]`).join('')
      const amixFilter = `${filterInputs}amix=inputs=${audioInputs.length}:duration=longest[aout]`

      command.complexFilter(amixFilter)
      command.outputOptions([`-t ${totalDuration}`])
      command.audioCodec('aac')
      command.audioBitrate('128k')
      command.output(outputPath)

      return await this.runFFmpegCommand(command)
    } catch (error: any) {
      console.error('[VideoSynthesis] 合成音频失败:', error)
      return { success: false, error: error.message || '合成音频失败' }
    }
  }

  // ==================== 完整场景合成 ====================

  /**
   * 合成完整的场景视频
   */
  async synthesizeSceneVideo(
        storyboards: Storyboard[],
    scene: SceneScript,
    projectId: string,
    sceneId: string,
    audioAssets: Map<string, string>,
    config: VideoSynthesisConfig = PRESET_VIDEO_CONFIGS.standard,
    onProgress?: (phase: string, progress: number) => void
  ): Promise<SynthesisResult> {
    try {
      const outputDir = this.getVideoOutputDir(projectId)
      const tempDir = this.getTempDir(projectId)

      // Phase 1: 创建镜头视频
      if (onProgress) onProgress('shots', 0)

      const shotVideoPaths = await this.createSceneShotVideos(
        storyboards,
        projectId,
        sceneId,
        audioAssets,
        config,
        (index, total) => {
          if (onProgress) {
            onProgress('shots', (index / total) * 100)
          }
        }
      )

      if (shotVideoPaths.size === 0) {
        return { success: false, error: '没有生成镜头视频' }
      }

      // Phase 2: 合成场景音频
      if (onProgress) onProgress('audio', 0)

      // 计算总时长
      const totalDuration = storyboards.reduce((sum, sb) => sum + (sb.duration || 3), 0)

      // 获取音频文件路径
      const narrationPath = audioAssets.get('narration')
      const dialoguePaths = Array.from(audioAssets.values())
        .filter(p => p !== narrationPath && p.includes('dialogue'))

      const audioOutputPath = path.join(tempDir, `scene_${sceneId}_audio.aac`)
      const audioResult = await this.mixSceneAudio(
        narrationPath,
        dialoguePaths,
        undefined, // 暂无背景音乐
        audioOutputPath,
        totalDuration
      )

      // Phase 3: 合并视频片段
      if (onProgress) onProgress('merge', 0)

      const videoPaths = Array.from(shotVideoPaths.values())

      // 获取转场配置
      const transitions: TransitionConfig[] = storyboards.map(sb => ({
        type: (sb.transition as TransitionType) || 'none',
        duration: 0.5 // 默认转场时长 0.5 秒
      }))

      const mergedVideoPath = path.join(tempDir, `scene_${sceneId}_merged.mp4`)
      const mergeResult = await this.mergeVideosWithTransitions(
        videoPaths,
        transitions,
        mergedVideoPath,
        config
      )

      if (!mergeResult.success) {
        return mergeResult
      }

      // Phase 4: 添加音频到视频
      if (onProgress) onProgress('final', 0)

      const finalOutputPath = path.join(outputDir, `scene_${sceneId}_final.mp4`)

      const finalCommand = ffmpeg()

      finalCommand.input(mergedVideoPath)
      if (audioResult.success && audioResult.outputPath) {
        finalCommand.input(audioResult.outputPath)
      }

      if (audioResult.success && audioResult.outputPath) {
        // 替换音频
        finalCommand.outputOptions([
          '-map 0:v',
          '-map 1:a',
          '-c:v copy',
          '-c:a aac',
          '-shortest'
        ])
      } else {
        // 保持原有音频
        finalCommand.outputOptions([
          '-c copy'
        ])
      }

      finalCommand.output(finalOutputPath)

      const finalResult = await this.runFFmpegCommand(finalCommand)

      // 清理临时文件
      this.cleanupTempFiles(tempDir)

      if (onProgress) onProgress('complete', 100)

      return {
        success: finalResult.success,
        outputPath: finalResult.success ? finalOutputPath : undefined,
        duration: totalDuration,
        error: finalResult.error
      }
    } catch (error: any) {
      console.error('[VideoSynthesis] 合成场景视频失败:', error)
      return { success: false, error: error.message || '合成场景视频失败' }
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 执行 FFmpeg 命令
   */
  private runFFmpegCommand(command: ffmpeg.FfmpegCommand): Promise<SynthesisResult> {
    return new Promise((resolve) => {
      command
        .on('start', (commandLine) => {
          console.log('[FFmpeg] 执行命令:', commandLine)
        })
        .on('progress', (progress) => {
          console.log('[FFmpeg] 进度:', progress.percent || 0, '%')
        })
        .on('error', (error) => {
          console.error('[FFmpeg] 错误:', error.message)
          resolve({ success: false, error: error.message })
        })
        .on('end', () => {
          resolve({ success: true })
        })
        .run()
    })
  }

  /**
   * 获取视频信息
   */
  async getVideoInfo(videoPath: string): Promise<{
    duration: number
    width: number
    height: number
    fps: number
  } | null> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(videoPath, (error, data) => {
        if (error) {
          console.error('[FFprobe] 错误:', error)
          resolve(null)
          return
        }

        const videoStream = data.streams.find(s => s.codec_type === 'video')
        if (!videoStream) {
          resolve(null)
          return
        }

        resolve({
          duration: data.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: this.parseFps(videoStream.r_frame_rate || '30')
        })
      })
    })
  }

  /**
   * 解析帧率字符串
   */
  private parseFps(fpsString: string): number {
    const parts = fpsString.split('/')
    if (parts.length === 2) {
      return parseInt(parts[0]) / parseInt(parts[1])
    }
    return parseInt(fpsString)
  }

  /**
   * 清理临时文件
   */
  private cleanupTempFiles(tempDir: string): void {
    try {
      const files = fs.readdirSync(tempDir)
      for (const file of files) {
        const filePath = path.join(tempDir, file)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
    } catch (error) {
      console.error('[VideoSynthesis] 清理临时文件失败:', error)
    }
  }

  // ==================== 导出功能 ====================

  /**
   * 导出视频到指定路径
   */
  async exportVideo(
    sourcePath: string,
    outputPath: string,
    format: string = 'mp4',
    quality: string = 'standard'
  ): Promise<SynthesisResult> {
    try {
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: '源视频不存在' }
      }

      const config = PRESET_VIDEO_CONFIGS[quality] || PRESET_VIDEO_CONFIGS.standard

      const command = ffmpeg(sourcePath)

      command
        .videoCodec('libx264')
        .videoBitrate(config.videoBitrate)
        .audioCodec('aac')
        .audioBitrate(config.audioBitrate)
        .outputOptions([
          `-crf ${config.crf}`,
          `-pix_fmt yuv420p`,
          `-movflags +faststart`,
          `-preset ${config.preset}`
        ])
        .output(outputPath)

      return await this.runFFmpegCommand(command)
    } catch (error: any) {
      console.error('[VideoSynthesis] 导出视频失败:', error)
      return { success: false, error: error.message || '导出视频失败' }
    }
  }
}