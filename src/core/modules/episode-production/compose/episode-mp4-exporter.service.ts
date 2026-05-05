/**
 * 整剧 MP4 导出 service（spec §5.3 / §6.2 · P6-T4）
 * @module modules/episode-production/compose/episode-mp4-exporter.service
 *
 * 把 P6-T1 timeline + P6-T2 transition + P6-T3 subtitles 拼成单段 MP4。
 *
 * 流程：
 *   1. timeline = TimelineBuilderService.buildEpisodeTimeline(epScriptId)
 *   2. 检查 missingVideoStoryboardIds == 0 否则抛错（spec §2.3 末端硬锁）
 *   3. xfade chain：每两段视频之间按 transition 关键字构造 filter
 *   4. subtitles：可选写 SRT 临时文件 + ffmpeg subtitles= filter 烧入
 *   5. 调注入的 ffmpegRunner（默认走 fluent-ffmpeg）
 *
 * 设计决策：
 *   - command 构造逻辑提取为 pure functions（buildFilterComplex / buildFfmpegArgs），
 *     便于单测验证拼装正确性
 *   - ffmpeg 实际执行通过注入的 runner 接口，单测可 mock，运行时走 fluent-ffmpeg
 *   - 文件 IO（写 SRT）也通过注入的 fileWriter 接口
 *
 * 此 service 不引入 fluent-ffmpeg 直接依赖（避免 web 端打包失败）；adapter 实现
 * 在 ffmpeg-assembler.service.ts（已存在）或 follow-up 新建的 native runner 中。
 */

import type { DataSource } from 'typeorm'
import {
  TimelineBuilderService,
  type Timeline,
  type TimelineShot,
} from './timeline-builder.service'
import { SubtitleService } from './subtitle.service'
import {
  toFfmpegTransition,
  type FfmpegTransitionPlan,
} from './transition-translator'

/** ffmpeg 命令的执行抽象（依赖注入，便于双端 + mock 单测） */
export interface FfmpegRunner {
  /**
   * 执行一次 ffmpeg：
   * @param inputs 输入文件路径数组（按顺序映射到 -i）
   * @param filterComplex filter_complex 字符串
   * @param outputArgs 输出参数（含 -map 等）
   * @param outputPath 最终输出路径
   * @returns 实际产出时长（秒），失败抛错
   */
  run(args: {
    inputs: string[]
    filterComplex: string
    outputArgs: string[]
    outputPath: string
  }): Promise<{ outputPath: string; durationSec: number }>
}

/** 文件写入抽象（写 SRT 临时文件） */
export interface FileWriter {
  writeText(filePath: string, content: string): Promise<void>
  /** 临时目录路径（调用方可省略，默认走 path provider 提供的临时目录） */
  getTempPath?(suffix: string): string
}

export interface ExportEpisodeMp4Input {
  episodeScriptId: string
  outputPath: string
  width?: number
  height?: number
  burnSubtitles?: boolean
}

export interface ExportEpisodeMp4Result {
  outputPath: string
  durationSec: number
  /** 写到的 SRT 临时文件路径（若 burnSubtitles=true） */
  srtPath?: string
  /** 时间线信息（导出时回传，便于 UI 显示） */
  timeline: Timeline
}

const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080

/**
 * 整剧 MP4 导出。
 */
export class EpisodeMp4ExporterService {
  private readonly timelineSvc: TimelineBuilderService
  private readonly subtitleSvc: SubtitleService

  constructor(
    ds: DataSource,
    private readonly ffmpegRunner: FfmpegRunner,
    private readonly fileWriter: FileWriter,
  ) {
    this.timelineSvc = new TimelineBuilderService(ds)
    this.subtitleSvc = new SubtitleService(ds)
  }

  /** 一站式导出 */
  async exportEpisodeToMp4(
    input: ExportEpisodeMp4Input,
  ): Promise<ExportEpisodeMp4Result> {
    const timeline = await this.timelineSvc.buildEpisodeTimeline(
      input.episodeScriptId,
    )

    if (timeline.missingVideoStoryboardIds.length > 0) {
      throw new Error(
        `导出阻断：${timeline.missingVideoStoryboardIds.length} 个分镜尚未生成视频片段（${
          timeline.missingVideoStoryboardIds.slice(0, 3).join(', ')
        }${timeline.missingVideoStoryboardIds.length > 3 ? '...' : ''}）`,
      )
    }

    const width = input.width ?? DEFAULT_WIDTH
    const height = input.height ?? DEFAULT_HEIGHT

    // 收集 inputs（按 timeline 顺序）+ 转场 plans
    const flatShots = timeline.scenes.flatMap((s) => s.shots)
    if (flatShots.length === 0) {
      throw new Error('导出阻断：时间线为空')
    }
    const inputs = flatShots.map((s) => s.videoPath!)

    // 字幕（可选烧入）
    let srtPath: string | undefined
    if (input.burnSubtitles) {
      const srt = await this.subtitleSvc.buildSrt(timeline)
      if (srt.trim()) {
        const tmp =
          this.fileWriter.getTempPath?.(`.srt`) ??
          `${input.outputPath}.srt`
        await this.fileWriter.writeText(tmp, srt)
        srtPath = tmp
      }
    }

    const filterComplex = buildFilterComplex({
      shots: flatShots,
      width,
      height,
      srtPath,
    })

    const outputArgs = buildOutputArgs({ srtPath })

    const result = await this.ffmpegRunner.run({
      inputs,
      filterComplex,
      outputArgs,
      outputPath: input.outputPath,
    })

    return {
      outputPath: result.outputPath,
      durationSec: result.durationSec || timeline.totalDurationSec,
      srtPath,
      timeline,
    }
  }
}

// ─── pure helpers（导出供单测）─────────────────────────────

/**
 * 构造 ffmpeg filter_complex：
 *   - scale 每个输入到统一尺寸
 *   - 用 xfade 链相邻两段（按 transition plan）
 *   - 末端 concat 输出 [outv]
 *   - 字幕烧入：在 [outv] 后追加 subtitles= filter
 *
 * 简化策略：cut 模式之间用 concat（先把同 cut 段 concat 再 xfade 跨段过于复杂；
 * 当前所有非 cut 都走 xfade，cut 走 xfade duration=0 + transition=fade 模拟硬切）。
 *
 * 输出最后挂载在 [outv][outa]。
 */
export function buildFilterComplex(args: {
  shots: TimelineShot[]
  width: number
  height: number
  srtPath?: string
}): string {
  const { shots, width, height, srtPath } = args
  const parts: string[] = []

  // 1. 每个输入 scale 到统一尺寸；命名 [v0_norm], [v1_norm], ...
  for (let i = 0; i < shots.length; i++) {
    parts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}_n]`,
    )
  }

  if (shots.length === 1) {
    // 单段：直接 [v0_n]
    parts.push(applySubtitlesIfAny('[v0_n]', srtPath, '[outv]'))
    parts.push(`[0:a]anull[outa]`)
    return parts.join(';')
  }

  // 2. xfade 链：把 [v0_n] 和 [v1_n] 用 transition 连接；输出 [vx0]
  //    然后 [vx0] 和 [v2_n] → [vx1]，依此类推
  let prevLabel = '[v0_n]'
  let cumulativeDur = shots[0].durationSec
  for (let i = 1; i < shots.length; i++) {
    const transition = shots[i].transition
    const plan: FfmpegTransitionPlan = transition
      ? toFfmpegTransition(transition)
      : { xfadeName: null, durationSec: 0, needsXfade: false }
    const xfadeName = plan.xfadeName || 'fade' // 兜底；fade duration=0 等同硬切
    const dur = plan.durationSec
    const offset = Math.max(0, cumulativeDur - dur)
    const out = i === shots.length - 1 ? '[vchain]' : `[vx${i}]`
    parts.push(
      `${prevLabel}[v${i}_n]xfade=transition=${xfadeName}:duration=${round3(dur)}:offset=${round3(offset)}${out}`,
    )
    prevLabel = out
    cumulativeDur = cumulativeDur + shots[i].durationSec - dur // xfade 重叠
  }

  // 3. 字幕烧入（可选）
  parts.push(applySubtitlesIfAny('[vchain]', srtPath, '[outv]'))

  // 4. 音轨：用 concat 拼所有音频；多输入 concat 简化版（无音频时也得给静音占位）
  const audioInputs = shots.map((_, i) => `[${i}:a]`).join('')
  parts.push(`${audioInputs}concat=n=${shots.length}:v=0:a=1[outa]`)

  return parts.join(';')
}

/** 给定上游 [vchain] 标签，按需追加字幕 filter；输出绑定 [outv] */
function applySubtitlesIfAny(
  fromLabel: string,
  srtPath: string | undefined,
  toLabel: string,
): string {
  if (srtPath) {
    // ffmpeg subtitles 滤镜会读 srt 文件并在视频上烧入字幕
    // 路径中的 ' 和 \ 需要转义
    const escaped = srtPath.replace(/\\/g, '/').replace(/'/g, "\\'")
    return `${fromLabel}subtitles='${escaped}'${toLabel}`
  }
  return `${fromLabel}null${toLabel}`
}

/** 构造 ffmpeg 输出参数 */
export function buildOutputArgs(args: { srtPath?: string }): string[] {
  void args
  return [
    '-map',
    '[outv]',
    '-map',
    '[outa]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  ]
}

function round3(n: number): number {
  return Number(n.toFixed(3))
}
