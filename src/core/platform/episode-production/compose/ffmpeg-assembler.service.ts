/**
 * compose/ffmpeg-assembler.service
 * @module platform/episode-production/compose/ffmpeg-assembler.service
 * @description ffmpeg 命令执行 + 视频信息查询 + 输出目录管理。
 *              拆自原 video-synthesis.service.ts 的基础工具方法。
 */

import * as path from 'path'
import * as fs from 'fs'
import { getPathProvider } from '@core/interfaces/path.interface'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from '@ffmpeg-installer/ffmpeg'
import ffprobePath from '@ffprobe-installer/ffprobe'
import type { SynthesisResult } from './types'
import { PRESET_VIDEO_CONFIGS } from './types'

// 设置 FFmpeg 路径
ffmpeg.setFfmpegPath(ffmpegPath.path)
ffmpeg.setFfprobePath(ffprobePath.path)

/**
 * ffmpeg 基础服务：命令执行、视频信息查询、输出目录管理。
 * 作为 compose 子域的基础依赖，被其他 compose service 通过 getInstance() 获取。
 */
export class FfmpegAssemblerService {
  private static instance: FfmpegAssemblerService

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): FfmpegAssemblerService {
    if (!FfmpegAssemblerService.instance) {
      FfmpegAssemblerService.instance = new FfmpegAssemblerService()
    }
    return FfmpegAssemblerService.instance
  }

  /**
   * 获取视频输出目录
   * （原为 VideoSynthesisService.getVideoOutputDir private，升为 public 供同层 service 复用）
   */
  getVideoOutputDir(projectId: string): string {
    const userDataPath = getPathProvider().getUserDataPath()
    const outputDir = path.join(userDataPath, 'story-to-video', projectId, 'videos')

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    return outputDir
  }

  /**
   * 获取临时文件目录
   * （原为 VideoSynthesisService.getTempDir private，升为 public 供同层 service 复用）
   */
  getTempDir(projectId: string): string {
    const userDataPath = getPathProvider().getUserDataPath()
    const tempDir = path.join(userDataPath, 'story-to-video', projectId, 'temp')

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    return tempDir
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
   * 执行 FFmpeg 命令
   * （原为 VideoSynthesisService.runFFmpegCommand private，升为 public 供同层 service 复用）
   */
  runFFmpegCommand(command: ffmpeg.FfmpegCommand): Promise<SynthesisResult> {
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
   * 导出视频到指定路径
   * （原为 VideoSynthesisService.exportVideo public，归属 ffmpeg 基础操作层）
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
}
