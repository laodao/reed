/**
 * compose/scene-video.service
 * @module platform/episode-production/compose/scene-video.service
 * @description 顶层场景视频合成：分镜视频 + 音频混音 → 完整场景视频。
 *              拆自原 video-synthesis.service.ts 的 synthesizeSceneVideo 方法。
 */

import * as path from 'path'
import * as fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import type {
  SynthesisResult,
  VideoSynthesisConfig,
  TransitionConfig,
  TransitionType
} from './types'
import { PRESET_VIDEO_CONFIGS } from './types'
import type { Storyboard, SceneScript } from '@shared/types/story-to-video.types'
import { FfmpegAssemblerService } from './ffmpeg-assembler.service'
import { ShotVideoService } from './shot-video.service'
import { SceneShotsService } from './scene-shots.service'
import { TransitionService } from './transition.service'
import { AudioMixService } from './audio-mix.service'

/**
 * 场景视频顶层合成服务：编排分镜视频、音频混音、转场合并，输出完整场景视频。
 * 依赖 ShotVideoService、SceneShotsService、TransitionService、AudioMixService、FfmpegAssemblerService。
 */
export class SceneVideoService {
  private static instance: SceneVideoService

  private readonly ffmpegAssembler = FfmpegAssemblerService.getInstance()
  private readonly shotVideo = ShotVideoService.getInstance()
  private readonly sceneShots = SceneShotsService.getInstance()
  private readonly transition = TransitionService.getInstance()
  private readonly audioMix = AudioMixService.getInstance()

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): SceneVideoService {
    if (!SceneVideoService.instance) {
      SceneVideoService.instance = new SceneVideoService()
    }
    return SceneVideoService.instance
  }

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
      const outputDir = this.ffmpegAssembler.getVideoOutputDir(projectId)
      const tempDir = this.ffmpegAssembler.getTempDir(projectId)

      // Phase 1: 创建镜头视频
      if (onProgress) onProgress('shots', 0)

      const shotVideoPaths = await this.sceneShots.createSceneShotVideos(
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
      const audioResult = await this.audioMix.mixSceneAudio(
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
      const mergeResult = await this.transition.mergeVideosWithTransitions(
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

      const finalResult = await this.ffmpegAssembler.runFFmpegCommand(finalCommand)

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
}
