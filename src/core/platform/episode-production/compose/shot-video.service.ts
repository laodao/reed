/**
 * compose/shot-video.service
 * @module platform/episode-production/compose/shot-video.service
 * @description 单镜头图片转视频 + 单分镜视频合成。
 *              拆自原 video-synthesis.service.ts 的单镜头合成方法。
 */

import * as path from 'path'
import * as fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import type {
  SynthesisResult,
  VideoSynthesisConfig
} from './types'
import { PRESET_VIDEO_CONFIGS } from './types'
import type { Storyboard } from '@shared/types/story-to-video.types'
import { FfmpegAssemblerService } from './ffmpeg-assembler.service'

/**
 * 单镜头视频合成服务：图片 → 视频片段、单分镜视频合成。
 * 依赖 FfmpegAssemblerService 执行底层 ffmpeg 命令及目录管理。
 */
export class ShotVideoService {
  private static instance: ShotVideoService

  private readonly ffmpegAssembler = FfmpegAssemblerService.getInstance()

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ShotVideoService {
    if (!ShotVideoService.instance) {
      ShotVideoService.instance = new ShotVideoService()
    }
    return ShotVideoService.instance
  }

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
      return await this.ffmpegAssembler.runFFmpegCommand(command)
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
      const outputDir = this.ffmpegAssembler.getVideoOutputDir(projectId)

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
}
