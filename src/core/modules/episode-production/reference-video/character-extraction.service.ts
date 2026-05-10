/**
 * 视频提取主体 service（spec 2026-05-09 ep-redesign §3.2 E1 · P-22 · Phase 5）
 *
 * 用户上传 5-30s 短视频 → ffmpeg 抽多角度代表帧 → 落到角色主图 + 多角度变体。
 *
 * Phase 5 完整版需要 face-api.js 做人脸聚类挑代表帧；当前依赖未装，先做时间均匀采样的
 * 降级版本：把视频按等距 N 段抽 N 帧（默认 4 帧 → 正/侧前/侧后/背 4 个 view 候选）。
 * 用户在 dialog 里挑选要保留的帧 → 落到 character_binding 的 main / view 类目。
 *
 * 算法说明：
 *   - face-api.js 路径（future）：人脸 bbox + embedding → cluster → 选每 cluster 大尺寸/正脸帧
 *   - 当前路径（time-uniform）：N 等分时长抽帧；用户人工挑选；接受度好且零依赖
 *
 * 工作流:
 *   videoPath → ffmpeg 抽 N 帧 → 返回临时文件路径数组 → 用户挑要保留的帧 →
 *   IPC 把选中帧落到 asset_image 表（category='main'/'view', label='正/侧前/...'）
 */

import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getVideoMetadata, extractFrame } from './ffmpeg-helpers'

export interface ExtractInput {
  videoPath: string
  /** temp 目录（生成 session 子目录存帧） */
  tempDir: string
  /** 要抽的代表帧数（默认 4：正/侧前/侧后/背） */
  frameCount?: number
}

export interface ExtractedFrame {
  index: number
  timeSec: number
  framePath: string
  /** 建议的视图 label（正/侧前/侧后/背 等；按等距时间猜测） */
  suggestedLabel: string
}

export interface ExtractResult {
  sessionId: string
  videoDurationSec: number
  frames: ExtractedFrame[]
}

export class CharacterExtractionService {
  /**
   * 抽视频代表帧。不写库；调用方拿 frames 后由用户挑选 → 单独 IPC 落主图。
   */
  async extractFrames(input: ExtractInput): Promise<ExtractResult> {
    if (!input.videoPath) throw new Error('videoPath 必填')
    try {
      await fs.access(input.videoPath)
    } catch {
      throw new Error(`视频文件不存在：${input.videoPath}`)
    }
    if (!input.tempDir) throw new Error('tempDir 必填')

    const meta = await getVideoMetadata(input.videoPath)
    const frameCount = Math.max(1, Math.min(input.frameCount ?? 4, 8))
    const sessionId = `cex_${randomBytes(8).toString('hex')}`
    const sessionDir = path.join(input.tempDir, 'character-extract', sessionId)
    await fs.mkdir(sessionDir, { recursive: true })

    // 时间等距采样：避开首末 5%（开头黑场 / 结尾过渡），从 (5%, 95%) 内取 frameCount 个等距点
    const startSec = meta.durationSec * 0.05
    const endSec = meta.durationSec * 0.95
    const span = endSec - startSec

    const frames: ExtractedFrame[] = []
    const labels = this.suggestLabels(frameCount)
    for (let i = 0; i < frameCount; i++) {
      const t = frameCount === 1
        ? meta.durationSec / 2
        : startSec + (span * i) / (frameCount - 1)
      const framePath = path.join(sessionDir, `frame-${i + 1}.jpg`)
      try {
        await extractFrame(input.videoPath, t, framePath)
        frames.push({
          index: i + 1,
          timeSec: t,
          framePath,
          suggestedLabel: labels[i],
        })
      } catch (err: any) {
        console.warn(`[CharacterExtract] 帧 ${i + 1} (t=${t.toFixed(2)}s) 抽取失败：${err?.message ?? err}`)
      }
    }

    return {
      sessionId,
      videoDurationSec: meta.durationSec,
      frames,
    }
  }

  /**
   * 给抽出的 N 帧建议视图 label（character bible 角度命名约定）。
   * 4 帧 → 正/侧前/侧后/背；3 帧 → 正/侧/背；其他帧数用通用 view-N。
   */
  private suggestLabels(n: number): string[] {
    if (n === 1) return ['正']
    if (n === 2) return ['正', '背']
    if (n === 3) return ['正', '侧', '背']
    if (n === 4) return ['正', '侧前', '侧后', '背']
    if (n === 5) return ['正', '侧前', '侧', '侧后', '背']
    return Array.from({ length: n }, (_, i) => `view-${i + 1}`)
  }

  /**
   * 删 session（temp 目录清理）。
   */
  async cleanup(sessionId: string, tempDir: string): Promise<void> {
    const sessionDir = path.join(tempDir, 'character-extract', sessionId)
    await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
  }
}
