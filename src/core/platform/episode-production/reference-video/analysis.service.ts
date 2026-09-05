/**
 * 参考视频解析 service（spec 2026-05-09 ep-redesign §3.2 D5 · P-22）
 *
 * 流程：
 *   1. ffmpeg 抽帧 + scene detection → shot 边界数组
 *   2. 每 shot 抽 3-5 关键帧到 temp 目录（本期：每 shot 抽 1 个代表帧 = 中点帧）
 *   3. （follow-up）VLM 批处理每 shot 关键帧 → { shotType, cameraAngle, ... }
 *   4. （follow-up）抽音频 + STT → 对白
 *   5. 聚合 ParsedShot[] → 落 reference_video_analyses 表
 *
 * 本期实现：1 + 2 + 5（用占位 ParsedShot 字段，等 follow-up VLM 接入）。
 * 用户能在 dialog 看到检测出的 shot 列表 + 代表帧；编辑成分镜骨架待真实 VLM 接入。
 */

import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import type { DataSource } from 'typeorm'
import {
  ReferenceVideoAnalysisEntity,
  type ParsedShot,
} from '@core/database/entities/episode-production/reference-video-analysis.entity'
import {
  getVideoMetadata,
  detectShots,
  extractFrame,
} from './ffmpeg-helpers'

export interface AnalyzeInput {
  videoPath: string
  /** temp 目录（每次 analyze 创建独立 session 子目录） */
  tempDir: string
  userId?: string | null
  /** scene detection 阈值；0.3 较敏感 / 0.5 较保守 */
  sceneThreshold?: number
  /**
   * VLM 推断 callback（spec 2026-05-09 follow-up）。
   * 接受代表帧路径，返回部分 ParsedShot 字段（shotType / cameraAngle / cameraMovement /
   * frameDescription / emotion）。不传时 service 沿用占位字段。
   *
   * 依赖注入便于测试 mock 与 provider 解耦。
   */
  vlmInfer?: (framePath: string, durationSec: number) => Promise<Partial<ParsedShot>>
}

export interface AnalyzeResult {
  analysisId: string
  shotCount: number
  videoDurationSec: number
}

export class ReferenceVideoAnalysisService {
  constructor(private readonly ds: DataSource) {}

  private generateId(): string {
    return `rva_${randomBytes(8).toString('hex')}`
  }

  /**
   * 启动解析。本期同步执行（适合短视频 ≤ 3 min）；长视频 follow-up 改异步任务队列。
   */
  async analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
    if (!input.videoPath) throw new Error('videoPath 必填')

    // 校验文件存在
    try {
      await fs.access(input.videoPath)
    } catch {
      throw new Error(`视频文件不存在：${input.videoPath}`)
    }

    const repo = this.ds.getRepository(ReferenceVideoAnalysisEntity)
    const id = this.generateId()
    const now = Date.now()

    // 写 pending 行
    await repo.save({
      id,
      userId: input.userId ?? null,
      videoPath: input.videoPath,
      videoDurationSec: null,
      status: 'analyzing',
      shots: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    } as any)

    try {
      // 1. 取 metadata
      const meta = await getVideoMetadata(input.videoPath)

      // 2. scene detection
      const shotBounds = await detectShots(
        input.videoPath,
        input.sceneThreshold ?? 0.3,
      )
      if (shotBounds.length === 0) {
        // 无切换 → 把整个视频作为一个 shot
        shotBounds.push({ startSec: 0, endSec: meta.durationSec, durationSec: meta.durationSec })
      }

      // 3. 每 shot 抽中点代表帧
      const sessionDir = path.join(input.tempDir, 'reference-video', id)
      await fs.mkdir(sessionDir, { recursive: true })

      const shots: ParsedShot[] = []
      for (let i = 0; i < shotBounds.length; i++) {
        const b = shotBounds[i]
        const midSec = b.startSec + b.durationSec / 2
        const framePath = path.join(sessionDir, `shot-${i + 1}.jpg`)
        try {
          await extractFrame(input.videoPath, midSec, framePath)
        } catch {
          // 抽帧失败不致命，继续下一个 shot
          continue
        }

        // 默认占位字段（无 VLM 时使用）
        let inferredFields: Partial<ParsedShot> = {
          shotType: 'medium',
          cameraAngle: 'eye_level',
          cameraMovement: 'static',
          frameDescription: '（待 VLM 反推）',
          emotion: '',
        }

        // VLM 推断（DI 注入时调用）
        if (input.vlmInfer) {
          try {
            const inferred = await input.vlmInfer(framePath, b.durationSec)
            inferredFields = { ...inferredFields, ...inferred }
          } catch (vlmErr: any) {
            console.warn(
              `[ReferenceVideoAnalysis] VLM 推断 shot ${i + 1} 失败：${vlmErr?.message ?? vlmErr}（沿用占位字段）`,
            )
          }
        }

        shots.push({
          shotIndex: i + 1,
          startSec: b.startSec,
          endSec: b.endSec,
          durationSec: b.durationSec,
          shotType: inferredFields.shotType ?? 'medium',
          cameraAngle: inferredFields.cameraAngle ?? 'eye_level',
          cameraMovement: inferredFields.cameraMovement ?? 'static',
          frameDescription: inferredFields.frameDescription ?? '',
          emotion: inferredFields.emotion ?? '',
          representativeFramePath: framePath,
          detectedDialogue: inferredFields.detectedDialogue ?? null,
        })
      }

      // 4. 落库
      await repo.update(id, {
        videoDurationSec: meta.durationSec,
        status: 'ready',
        shots,
        updatedAt: Date.now(),
      } as any)

      return {
        analysisId: id,
        shotCount: shots.length,
        videoDurationSec: meta.durationSec,
      }
    } catch (e: any) {
      await repo.update(id, {
        status: 'failed',
        metadata: { error: e?.message ?? String(e) },
        updatedAt: Date.now(),
      } as any)
      throw e
    }
  }

  async getById(id: string): Promise<ReferenceVideoAnalysisEntity | null> {
    return await this.ds.getRepository(ReferenceVideoAnalysisEntity).findOne({ where: { id } })
  }

  async listByUser(userId: string | null): Promise<ReferenceVideoAnalysisEntity[]> {
    return await this.ds.getRepository(ReferenceVideoAnalysisEntity).find({
      where: { userId },
      order: { createdAt: 'DESC' },
    })
  }

  /**
   * 删除：DB 行 + temp 目录（如果还在）。
   */
  async delete(id: string, tempDir: string): Promise<void> {
    const sessionDir = path.join(tempDir, 'reference-video', id)
    await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
    await this.ds.getRepository(ReferenceVideoAnalysisEntity).delete(id)
  }
}
