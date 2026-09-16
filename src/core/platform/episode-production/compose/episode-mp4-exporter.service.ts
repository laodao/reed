/**
 * 整剧 MP4 导出 service（spec §5.3 / §6.2 · P6-T4）
 * @module platform/episode-production/compose/episode-mp4-exporter.service
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

import * as path from 'path'
import type { DataSource } from 'typeorm'
import { In } from 'typeorm'
import { getPathProvider } from '@core/interfaces/path.interface'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { advanceEpisodeStatus } from '../workflow/episode-status-advance'
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

/**
 * 解析 user-rel 相对路径为绝对路径：业务层（image_assets / storyboard.videoPath）
 * 持久化的是相对 user 数据根的路径，ffmpeg 等 native 工具需要绝对路径。
 * 与 base-video-provider-bridge.resolveImagePath 同义；这里就近实现避免跨模块依赖。
 */
function resolveUserRelPath(p: string): string {
  if (!p) return p
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return p  // http(s)://、file://、local-image://、data:
  if (path.isAbsolute(p)) return p
  return path.join(getPathProvider().getDataPath(), p)
}

/** ffmpeg 命令的执行抽象（依赖注入，便于双端 + mock 单测） */
export interface FfmpegRunner {
  /**
   * 执行一次 ffmpeg：
   * @param inputs 输入文件路径数组（按顺序映射到 -i）
   * @param lavfiInputs 追加在文件输入之后的 lavfi 合成输入（如 anullsrc 静音占位；
   *        其流编号 = inputs.length 起顺延——与 buildFilterComplex 的 audioLabel 约定一致）
   * @param filterComplex filter_complex 字符串
   * @param outputArgs 输出参数（含 -map 等）
   * @param outputPath 最终输出路径
   * @returns 实际产出时长（秒），失败抛错
   */
  run(args: {
    inputs: string[]
    lavfiInputs?: string[]
    filterComplex: string
    outputArgs: string[]
    outputPath: string
  }): Promise<{ outputPath: string; durationSec: number }>

  /**
   * 探测输入是否含音轨（可选能力；缺省时导出器按"全部有音轨"处理，保持旧行为）。
   * 复核修复 P1-7：i2v 产物（如 volcengine generate_audio=false）常无音轨，
   * `[i:a]` 对无流输入是确定性报错。
   */
  probeHasAudio?(input: string): Promise<boolean>
}

/** 文件写入抽象（写 SRT 临时文件） */
export interface FileWriter {
  writeText(filePath: string, content: string): Promise<void>
  /** 删除文件（可选；导出完成后清理 SRT 临时文件用） */
  delete?(filePath: string): Promise<void>
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
    private readonly ds: DataSource,
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

    // 状态闭环（2026-09-16 P0-CM2）：导出开始 → composing；成功后写
    // composedVideoPath + completed（stage-gate ⑥ 的判定依据此前是幽灵列恒 undefined）
    const episodeId = await this.resolveEpisodeId(input.episodeScriptId)
    if (episodeId) {
      await advanceEpisodeStatus(this.ds, episodeId, 'composing').catch(() => {})
    }

    const width = input.width ?? DEFAULT_WIDTH
    const height = input.height ?? DEFAULT_HEIGHT

    // ⑥ 用户可在时间线勾选/取消每个分镜是否入最终成片：仅保留 includeInFinal=true
    const flatShots = timeline.scenes
      .flatMap((s) => s.shots)
      .filter((s) => s.includeInFinal !== false)

    if (flatShots.length === 0) {
      throw new Error('导出阻断：当前没有任何"入选"分镜，请在时间线上勾选至少一个')
    }

    // 视频片段制（2026-09-04）：入选分镜已分段 → 按片段合并成合成单元，
    // 段内不 xfade（视频模型保证连贯）；无 segment 的存量项目回退现有逐镜路径。
    const { units, unitShotIds } = await this.buildExportUnits(flatShots)
    const exportShots = units

    // 入选单元中若有缺视频的，提前阻断（buildEpisodeTimeline.missingVideoStoryboardIds
    // 是全分镜的，过滤后要重新计算）
    const missingInSelected = exportShots
      .filter((s) => !s.videoPath)
      .map((s) => s.storyboardId)
    if (missingInSelected.length > 0) {
      throw new Error(
        `导出阻断：${missingInSelected.length} 个入选${unitShotIds ? '片段' : '分镜'}尚未生成视频（${
          missingInSelected.slice(0, 3).join(', ')
        }${missingInSelected.length > 3 ? '...' : ''}）`,
      )
    }
    // 把 user-rel 相对路径解析为绝对路径再交给 ffmpeg
    const fileInputs = exportShots.map((s) => resolveUserRelPath(s.videoPath!))

    // 配音混入（2026-09-16 P0-CM1）：收集每单元的 TTS 音频（对白按 storyboard.dialogueIds
    // → dialogues[].audioAsset；旁白挂到各场景首个入选单元），作为附加文件输入混入该单元音轨
    const extraAudioFiles = await this.collectUnitAudioFiles(exportShots, unitShotIds)
    for (const files of extraAudioFiles) {
      for (const f of files) fileInputs.push(resolveUserRelPath(f))
    }

    // 音轨探测（runner 支持时）：任一输入无音轨 → 该路用 anullsrc 静音占位
    let audioFlags: boolean[] | undefined
    let lavfiInputs: string[] | undefined
    if (typeof this.ffmpegRunner.probeHasAudio === 'function') {
      audioFlags = await Promise.all(fileInputs.slice(0, exportShots.length).map((p) => this.ffmpegRunner.probeHasAudio!(p)))
      lavfiInputs = buildSilentInputSpecs(audioFlags)
    }

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
      shots: exportShots,
      width,
      height,
      srtPath,
      audioFlags,
      extraAudioFiles,
    })

    const outputArgs = buildOutputArgs({ srtPath })

    const result = await this.ffmpegRunner.run({
      inputs: fileInputs,
      lavfiInputs,
      filterComplex,
      outputArgs,
      outputPath: input.outputPath,
    })

    // 字幕已烧入成片，临时 SRT 不再需要（删除失败不影响导出结果；
    // 导出失败时保留 SRT 便于诊断）
    if (srtPath && typeof this.fileWriter.delete === 'function') {
      try {
        await this.fileWriter.delete(srtPath)
      } catch {
        /* 清理失败仅忽略 */
      }
    }
    srtPath = undefined

    // 导出成功 → 写 composedVideoPath（user-rel 优先）+ completed 终态（P0-CM2）
    if (episodeId) {
      try {
        const dataPath = getPathProvider().getDataPath()
        const rel = path.relative(dataPath, input.outputPath)
        const relPath = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : input.outputPath
        const repo = this.ds.getRepository(VideoEpisodeEntity)
        await repo.update(
          { id: episodeId } as any,
          { composedVideoPath: relPath, status: 'completed', updatedAt: new Date() },
        )
      } catch {
        /* 状态回写失败不影响导出产物 */
      }
    }

    return {
      outputPath: result.outputPath,
      durationSec: result.durationSec || timeline.totalDurationSec,
      srtPath,
      timeline,
    }
  }

  /** episodeScriptId → episodeId（状态回写用；找不到返回 null 不阻断导出） */
  private async resolveEpisodeId(episodeScriptId: string): Promise<string | null> {
    try {
      const script = await this.ds
        .getRepository(EpisodeScriptEntity)
        .findOne({ where: { id: episodeScriptId } as any })
      return script?.episodeId ?? null
    } catch {
      return null
    }
  }

  /**
   * 收集每个导出单元的配音音频文件（2026-09-16 P0-CM1）：
   *   - 对白：单元内各分镜 dialogueIds ∩ scene.dialogues[].audioAsset.audioPath
   *   - 旁白：scene.narrationAudioPath 挂到该场景的**首个**入选单元
   * 无任何配音的单元返回空数组（该单元只保留视频自带音轨/静音占位）。
   */
  private async collectUnitAudioFiles(
    exportShots: TimelineShot[],
    unitShotIds: string[][] | null,
  ): Promise<string[][]> {
    const result: string[][] = exportShots.map(() => [])
    try {
      const sceneIds = [...new Set(exportShots.map((s) => s.sceneId))]
      if (sceneIds.length === 0) return result
      const scenes = await this.ds
        .getRepository(SceneScriptEntity)
        .find({ where: { id: In(sceneIds) } as any })
      const sceneMap = new Map(scenes.map((s) => [s.id, s]))
      const storyboards = await this.ds
        .getRepository(StoryboardEntity)
        .find({ where: { sceneScriptId: In(sceneIds) } as any })
      const dialogueIdsBySb = new Map(
        storyboards.map((sb) => [sb.id, ((sb as any).dialogueIds as string[] | null) ?? []]),
      )

      const narrationAttached = new Set<string>()
      for (let i = 0; i < exportShots.length; i++) {
        const shotIds = unitShotIds ? unitShotIds[i] : [exportShots[i].storyboardId]
        const scene = sceneMap.get(exportShots[i].sceneId)
        const dialogues = ((scene?.dialogues ?? []) as Array<{ id?: string; audioAsset?: { audioPath?: string } }>)
        const files: string[] = []

        for (const sid of shotIds) {
          for (const did of dialogueIdsBySb.get(sid) ?? []) {
            const d = dialogues.find((x) => x?.id === did)
            if (d?.audioAsset?.audioPath) files.push(d.audioAsset.audioPath)
          }
        }

        // 旁白挂场景首个入选单元
        if (scene && (scene as any).narrationAudioPath && !narrationAttached.has(scene.id)) {
          narrationAttached.add(scene.id)
          files.unshift(String((scene as any).narrationAudioPath))
        }

        result[i] = files
      }
    } catch {
      // 配音收集失败不阻断导出（成片退回无 TTS 音轨）
    }
    return result
  }

  /**
   * 把入选分镜合并成"片段级合成单元"（视频片段制 2026-09-04）：
   *   - 任一入选分镜带 segmentId → 同 segment 的分镜合并为一个单元，
   *     视频用 segment.video_path，时长用 segment.duration（缺失回退分镜时长求和）；
   *     单元转场取组内首镜的 transition（即段间保持现有转场行为，段内不 xfade）。
   *   - 同 segment 的分镜被 exclude 拆成不连续两段时仍合并为一个单元
   *     （片段视频是整段产物，无法按镜裁剪）。
   *   - 全部入选分镜都没有 segmentId（存量未分段项目）→ 返回 null，
   *     调用方回退现有逐镜 xfade 路径，行为与改造前完全一致。
   * 返回 unitShotIds：每单元包含的分镜 ID（配音收集按镜定位对白用）。
   */
  private async buildExportUnits(
    flatShots: TimelineShot[],
  ): Promise<{ units: TimelineShot[]; unitShotIds: string[][] | null }> {
    if (!flatShots.some((s) => s.segmentId)) {
      return { units: flatShots, unitShotIds: null }
    }

    const segmentIds = [
      ...new Set(flatShots.map((s) => s.segmentId).filter((v): v is string => !!v)),
    ]
    const segRepo = this.ds.getRepository(EpVideoSegmentEntity)
    const segments = await segRepo.find({
      where: segmentIds.map((id) => ({ id }) as any),
    })
    const segMap = new Map(segments.map((s) => [s.id, s]))

    const units: TimelineShot[] = []
    const unitShotIds: string[][] = []
    const unitBySegment = new Map<string, number>()
    for (const shot of flatShots) {
      if (!shot.segmentId) {
        // 未分段分镜：保持单镜单元（混合态过渡兼容）
        units.push({ ...shot })
        unitShotIds.push([shot.storyboardId])
        continue
      }
      const existingIdx = unitBySegment.get(shot.segmentId)
      if (existingIdx !== undefined) {
        // segment.duration（实际视频时长）优先；缺失才按分镜时长求和
        if (segMap.get(shot.segmentId)?.duration == null) {
          const existing = units[existingIdx]
          existing.durationSec += shot.durationSec
          existing.endSec = existing.startSec + existing.durationSec
        }
        unitShotIds[existingIdx].push(shot.storyboardId)
        continue
      }
      const seg = segMap.get(shot.segmentId)
      const unit: TimelineShot = {
        ...shot,
        storyboardId: shot.segmentId, // 缺失阻断信息里展示片段 ID
        videoPath: seg?.videoPath ?? null,
        durationSec: seg?.duration ?? shot.durationSec,
      }
      unit.endSec = unit.startSec + unit.durationSec
      unitBySegment.set(shot.segmentId, units.length)
      units.push(unit)
      unitShotIds.push([shot.storyboardId])
    }
    return { units, unitShotIds }
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
  /** 统一帧率（复核修复 P1-7：xfade 要求两路 fps 一致，i2v 产物各异）；缺省 30 */
  fps?: number
  /** 每个视频输入是否含音轨；缺省视为全部有音轨（旧行为，兼容既有测试/mock runner） */
  audioFlags?: boolean[]
  /**
   * 每个导出单元的配音音频文件数（2026-09-16 P0-CM1）。
   * 这些文件作为附加输入排在全部视频输入与 anullsrc 占位之后；
   * 与 shots 对齐，无配音单元为空数组。
   */
  extraAudioFiles?: string[][]
}): string {
  const { shots, width, height, srtPath } = args
  const fps = args.fps ?? 30
  const audioFlags = args.audioFlags
  const extraAudioFiles = args.extraAudioFiles
  const parts: string[] = []

  // 输入流编号约定（与 runner 的物理顺序一致：文件输入在前、lavfi 追加在后）：
  //   [0..n-1]                      视频文件输入
  //   [n..n+extraTotal-1]           配音文件（按单元顺序平铺）
  //   [n+extraTotal..]              anullsrc 静音占位（buildSilentInputSpecs 顺序）
  const videoCount = shots.length
  const extraTotal = (extraAudioFiles ?? []).reduce((n, f) => n + f.length, 0)
  const audioLabel = (i: number): string => {
    if (!audioFlags || audioFlags[i]) return `[${i}:a]`
    const silentBefore = audioFlags.slice(0, i).filter((f) => !f).length
    return `[${videoCount + extraTotal + silentBefore}:a]`
  }

  // 1. 每个输入 scale + fps 归一到统一参数；命名 [v0_norm], [v1_norm], ...
  for (let i = 0; i < shots.length; i++) {
    parts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,fps=${fps},pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}_n]`,
    )
  }

  if (shots.length === 1) {
    // 单段：直接 [v0_n]
    parts.push(applySubtitlesIfAny('[v0_n]', srtPath, '[outv]'))
  } else {
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
  }

  // 4. 音轨（2026-09-16 P0-RD1/RD5 重写）：
  //    - 每路音源先 aresample=48000 + aformat 归一采样率/声道——旧实现 anullsrc 占位
  //      写死 44.1k，与真实 48k 音轨进同一 concat 滤镜图必败（混合 provider 场景必现）；
  //    - 每单元混音后 apad+atrim 到「时长 − 与下一段的重叠」，与 xfade 视频时间轴严格对齐
  //      （旧实现音频全长 concat，视频逐转场扣减，每个 0.5s 转场累积 0.5s 音画漂移）；
  //    - 单元内多音源（视频自带音轨 + TTS 对白/旁白）用 amix 合成。
  const normChain = 'aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000'
  const unitAudioLen = (i: number): number => {
    const isLast = i === shots.length - 1
    const nextTransition = isLast ? null : shots[i + 1].transition
    const plan = nextTransition ? toFfmpegTransition(nextTransition) : null
    const overlap = plan?.durationSec ?? 0
    return round3(Math.max(0.5, shots[i].durationSec - overlap))
  }
  let extraCursor = videoCount
  const unitLabels: string[] = []
  for (let i = 0; i < shots.length; i++) {
    const len = unitAudioLen(i)
    const sources: string[] = [audioLabel(i)]
    const extraCount = extraAudioFiles?.[i]?.length ?? 0
    for (let k = 0; k < extraCount; k++) {
      sources.push(`[${extraCursor}:a]`)
      extraCursor++
    }
    // 单源：归一 + 对齐一条链直通；多源：逐源归一 → amix → 再对齐
    let head: string
    if (sources.length === 1) {
      head = sources[0]
    } else {
      const normalized = sources
        .map((label, si) => `${label}${normChain}[as${i}_${si}]`)
        .join(';')
      parts.push(normalized)
      // amix 缺省 normalize 会把总音量除以输入数——环境音 + 人声场景可接受，
      // 避免使用旧版 ffmpeg 不支持的 normalize=0 选项
      parts.push(
        `[as${i}_0]${sources.slice(1).map((_, k) => `[as${i}_${k + 1}]`).join('')}amix=inputs=${sources.length}:duration=longest[am${i}]`,
      )
      head = `[am${i}]`
    }
    parts.push(`${head}${normChain},apad,atrim=0:${len},asetpts=N/SR/TB[au${i}]`)
    unitLabels.push(`[au${i}]`)
  }
  if (shots.length === 1) {
    parts.push(`[au0]anull[outa]`)
  } else {
    parts.push(`${unitLabels.join('')}concat=n=${shots.length}:v=0:a=1[outa]`)
  }

  return parts.join(';')
}

/**
 * 为缺音轨的输入生成 anullsrc 静音占位 spec（复核修复 P1-7）。
 * 返回数组按"第 j 个无音轨输入"顺序排列，runner 需把它追加在文件输入之后；
 * filter 端流编号约定见 buildFilterComplex.audioLabel。
 *
 * 2026-09-16 P0-RD1：采样率 44100 → 48000——concat 滤镜要求各路采样率一致，
 * 写死 44.1k 的占位与真实 48k 音轨（主流 t2v 产物）混排时滤镜图初始化即报
 * "Impossible to convert between formats"；归一后仍由 filter 端 aresample 兜底。
 */
export function buildSilentInputSpecs(audioFlags?: boolean[]): string[] {
  if (!audioFlags) return []
  const missing = audioFlags.filter((f) => !f).length
  return Array.from({ length: missing }, () => 'anullsrc=r=48000:cl=stereo')
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
