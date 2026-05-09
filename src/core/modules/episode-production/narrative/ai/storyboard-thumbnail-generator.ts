/**
 * 故事板预览（缩略图）生成器（spec 2026-05-09 ep-redesign §3.2 B7 · P-18）
 *
 * 用途：剧本→分镜过渡入口的"先挑骨架再细化"路径。
 *
 * 流程：
 *   1. 加载 episodeScript（含 scenes / 角色 / 地点 effective）
 *   2. 拼 prompt（全剧故事概要 + 风格 + 9 段叙事节奏）
 *   3. 调 imageGen.generate（一次出一张大图，3×3 grid 布局）
 *   4. sharp 切片：1 张大图按 3×3 等分得 9 张独立图
 *   5. 落地到 temp/thumbnails/{episodeScriptId}-{ts}/frame-N.jpg
 *
 * 进程归属：sharp 是 Node native，**只能主进程**（Electron 主 / Web server）。
 * 渲染端通过 IPC 拿到 ThumbnailFrame[] 路径直接消费。
 *
 * 双母语：
 *   大众用户："让 AI 把剧本展开看看，挑骨架再细化"（替代逐分镜从零写描述）
 *   专业用户：thumbnail storyboard，电影前期标准做法
 */

import sharp from 'sharp'
import { promises as fs } from 'fs'
import path from 'path'
import type { ImageGenerator } from '../../assets/services/gallery-derivation.service'

export interface GenerateThumbnailsInput {
  episodeScriptId: string
  /** 默认 9（3x3 网格） */
  count?: 9 | 16 | 25
  /** 全剧故事概要（由调用方拼好；service 不读 DB） */
  storySynopsis: string
  /** 风格锚点（如 ['国风工笔']） */
  styleAnchors?: string[]
}

export interface ThumbnailFrame {
  /** 1-N（1-based） */
  frameIndex: number
  /** 落地的绝对路径（temp 目录） */
  imagePath: string
  /** 缩略图（sharp 同时生成）；可为 null（资源吃紧时跳过） */
  thumbnailPath: string | null
  /** AI 反推每帧描述；本 phase 暂不实现（留 follow-up） */
  description: string | null
}

export interface GenerateThumbnailsResult {
  /** 切片得到的 9 张帧 */
  frames: ThumbnailFrame[]
  /** 临时目录（用户挑选完成后由调用方清理） */
  sessionDir: string
}

/**
 * 故事板预览生成 service。
 *
 * 调用方（IPC handler）注入：
 *   - tempDir: app.getPath('userData') / dataDir 下的 temp 根目录
 *   - imageGen: 同 GalleryDerivationService 共用的 image generator
 */
export class StoryboardThumbnailGeneratorService {
  constructor(
    private readonly tempDir: string,
    private readonly imageGen: ImageGenerator,
  ) {}

  async generate(input: GenerateThumbnailsInput): Promise<GenerateThumbnailsResult> {
    const count = input.count ?? 9
    if (count !== 9 && count !== 16 && count !== 25) {
      throw new Error(`thumbnail count 仅支持 9 / 16 / 25，收到 ${count}`)
    }
    const grid = Math.sqrt(count)  // 3 / 4 / 5
    if (!Number.isInteger(grid)) {
      throw new Error(`thumbnail count ${count} 不是完全平方数（不能切 grid×grid）`)
    }

    if (!input.storySynopsis?.trim()) {
      throw new Error('生成故事板预览需要 storySynopsis（剧本概要）')
    }

    // 1. 拼 prompt
    const prompt = this.buildThumbnailPrompt({
      synopsis: input.storySynopsis,
      styleAnchors: input.styleAnchors,
      count,
    })

    // 2. 调 imageGen 出一张大图（grid×grid 布局；分辨率每帧 512×512 → 大图 1536/2048/2560）
    const cellSize = 512
    const totalSize = cellSize * grid
    const big = await this.imageGen.generate({
      referenceImagePaths: [],
      prompt,
      negativePrompt: 'low quality, blurry, watermark, text, numbers',
      label: `thumbnails_${input.episodeScriptId}`,
      width: totalSize,
      height: totalSize,
    } as any)

    // 3. 准备 session 目录
    const sessionDir = path.join(
      this.tempDir,
      'thumbnails',
      `${input.episodeScriptId}-${Date.now()}`,
    )
    await fs.mkdir(sessionDir, { recursive: true })

    // 4. sharp 切片
    const frames: ThumbnailFrame[] = []
    let frameIdx = 0
    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        frameIdx++
        const out = path.join(sessionDir, `frame-${frameIdx}.jpg`)
        await sharp(big.imagePath)
          .extract({
            left: col * cellSize,
            top: row * cellSize,
            width: cellSize,
            height: cellSize,
          })
          .jpeg({ quality: 88 })
          .toFile(out)
        frames.push({
          frameIndex: frameIdx,
          imagePath: out,
          thumbnailPath: null,  // follow-up：可生成 256x256 缩略图
          description: null,
        })
      }
    }

    return { frames, sessionDir }
  }

  /**
   * 拼 thumbnail 生成 prompt — 9 段叙事节奏 + 3×3 grid 布局指令。
   *
   * 关键点：
   *   - 强调"3×3 网格 / 横向并排"让 AI 输出可切片
   *   - 强调"无序号 / 无水印 / 纯背景间隔"
   *   - 9 段叙事节奏对应电影"setup / development / conflict / resolution"
   */
  private buildThumbnailPrompt(input: {
    synopsis: string
    styleAnchors?: string[]
    count: number
  }): string {
    const grid = Math.sqrt(input.count)
    const styleLine = input.styleAnchors?.length
      ? `\n风格：${input.styleAnchors.join(' / ')}`
      : ''
    return `基于以下剧本生成 ${input.count} 帧连贯故事板（thumbnail storyboard），${grid}×${grid} 网格布局：

剧本概要：${input.synopsis}${styleLine}

要求：
1. 第 1 帧：开场（建立场景 + 主角）
2. 第 2-3 帧：情节展开
3. 第 4-5 帧：冲突 / 转折点
4. 第 6-7 帧：高潮 / 关键动作
5. 第 8 帧：结果
6. 第 9 帧：尾声 / 情绪定格

输出 ${input.count} 帧并排（${grid}×${grid} 网格）。
图像间无文字、无序号、纯背景间隔。
保持人物 / 地点跨帧一致性（同一角色每帧脸型一致）。`
  }

  /**
   * 清理 session 目录（用户挑选完毕或取消时调用）。
   *
   * 用户挑选成功 → 调用方拷选中帧到正式 asset 目录后调本方法
   * 用户取消 → 立即调本方法
   * 兜底：定时任务清理 24h+ 的孤立 session（不在本 service 实现，由 main process 加 cron）
   */
  async cleanup(sessionDir: string): Promise<void> {
    try {
      await fs.rm(sessionDir, { recursive: true, force: true })
    } catch {
      // 忽略错误（目录可能已被清理）
    }
  }
}
