/**
 * EpisodeMp4ExporterService 单测（P6-T4）
 *
 * 用 mock FfmpegRunner + FileWriter 验证：
 * - 时间线装配 + ffmpeg 命令构造 + writeText 调用
 * - missingVideoStoryboardIds 阻断（spec §2.3 末端硬锁）
 * - 单段 vs 多段 filter_complex 拼装差异
 * - burnSubtitles=true 时 srt 文件被写 + filter 含 subtitles=
 * - 转场 fade/dissolve 出现在 filter_complex 中
 *
 * pure helper 单测：
 * - buildFilterComplex 单段 / 多段 / 字幕
 * - buildOutputArgs 输出参数符合预期
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import {
  EpisodeMp4ExporterService,
  buildFilterComplex,
  buildSilentInputSpecs,
  buildOutputArgs,
  type FfmpegRunner,
  type FileWriter,
} from '@core/platform/episode-production/compose/episode-mp4-exporter.service'
import type { TimelineShot } from '@core/platform/episode-production/compose/timeline-builder.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [SceneScriptEntity, SceneDialogueEntity, StoryboardEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedHappyTimeline(ds: DataSource): Promise<void> {
  await ds.getRepository(SceneScriptEntity).save({
    id: 's1',
    episodeScriptId: 'es1',
    sceneNumber: 1,
    location: '茶馆',
    locationBindingId: null,
    locationType: 'interior',
    timeOfDay: 'morning',
    weather: null,
    sceneDescription: '',
    mood: null,
    lighting: null,
    characters: null,
    originalText: '',
    narration: '清晨茶馆',
    dialogues: [{ id: 'd1', text: '老板，来碗茶', characterName: '张三' }],
    actions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  await ds.getRepository(StoryboardEntity).save([
    {
      id: 'sb1',
      sceneScriptId: 's1',
      shotNumber: 1,
      shotType: 'medium',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      movementDuration: null,
      frameDescription: '',
      subject: null,
      composition: null,
      characters: null,
      narrationId: null,
      dialogueIds: [],
      actionIds: [],
      frameImage: null,
      frameImageId: null,
      videoPath: '/tmp/v1.mp4',
      duration: 3,
      transition: '{}',
      transitionType: null,
      transitionDurationMs: null,
      transitionDirection: null,
      transitionEasing: null,
      transitionColor: null,
      status: 'pending',
      keyframeCount: 2,
      videoProviderId: null,
      videoModelId: null,
      videoMode: null,
      use3dStaging: 0,
      stagingLayoutId: null,
      backgroundRefImageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'sb2',
      sceneScriptId: 's1',
      shotNumber: 2,
      shotType: 'close',
      cameraAngle: 'eye_level',
      cameraMovement: 'static',
      movementDuration: null,
      frameDescription: '',
      subject: null,
      composition: null,
      characters: null,
      narrationId: null,
      dialogueIds: [],
      actionIds: [],
      frameImage: null,
      frameImageId: null,
      videoPath: '/tmp/v2.mp4',
      duration: 3,
      transition: '{}',
      transitionType: 'dissolve',
      transitionDurationMs: 500,
      transitionDirection: null,
      transitionEasing: null,
      transitionColor: null,
      status: 'pending',
      keyframeCount: 2,
      videoProviderId: null,
      videoModelId: null,
      videoMode: null,
      use3dStaging: 0,
      stagingLayoutId: null,
      backgroundRefImageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as any)
}

function makeMockRunner(): FfmpegRunner & {
  run: ReturnType<typeof vi.fn>
} {
  return {
    run: vi.fn(async (args) => ({
      outputPath: args.outputPath,
      durationSec: 6,
    })),
  } as any
}

function makeMockFileWriter(): FileWriter & {
  writeText: ReturnType<typeof vi.fn>
} {
  return {
    writeText: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    getTempPath: (suffix: string) => `/tmp/test_subtitle${suffix}`,
  } as any
}

describe('EpisodeMp4ExporterService', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('两段视频 + 转场：调 ffmpeg 一次，filter 含 dissolve', async () => {
    await seedHappyTimeline(ds)
    const runner = makeMockRunner()
    const writer = makeMockFileWriter()
    const svc = new EpisodeMp4ExporterService(ds, runner, writer)

    const result = await svc.exportEpisodeToMp4({
      episodeScriptId: 'es1',
      outputPath: '/tmp/out.mp4',
    })

    expect(runner.run).toHaveBeenCalledTimes(1)
    const callArgs = runner.run.mock.calls[0][0]
    expect(callArgs.inputs).toEqual(['/tmp/v1.mp4', '/tmp/v2.mp4'])
    expect(callArgs.filterComplex).toContain('xfade=transition=dissolve')
    expect(callArgs.filterComplex).toContain('duration=0.5')
    expect(callArgs.outputPath).toBe('/tmp/out.mp4')
    expect(result.outputPath).toBe('/tmp/out.mp4')
    expect(result.timeline.totalDurationSec).toBe(6)
    // 默认不烧字幕
    expect(writer.writeText).not.toHaveBeenCalled()
  })

  it('burnSubtitles=true：写 SRT 临时文件 + filter 含 subtitles=', async () => {
    await seedHappyTimeline(ds)
    const runner = makeMockRunner()
    const writer = makeMockFileWriter()
    const svc = new EpisodeMp4ExporterService(ds, runner, writer)

    const result = await svc.exportEpisodeToMp4({
      episodeScriptId: 'es1',
      outputPath: '/tmp/out.mp4',
      burnSubtitles: true,
    })

    expect(writer.writeText).toHaveBeenCalledTimes(1)
    const writeArgs = writer.writeText.mock.calls[0]
    expect(writeArgs[0]).toBe('/tmp/test_subtitle.srt')
    expect(writeArgs[1]).toContain('张三：老板，来碗茶') // SRT 内容
    // 复核修复：字幕已烧入成片，SRT 临时文件导出成功即清理（srtPath 不再外泄）
    expect(result.srtPath).toBeUndefined()
    expect(writer.delete).toHaveBeenCalledWith('/tmp/test_subtitle.srt')

    const filterComplex = runner.run.mock.calls[0][0].filterComplex
    expect(filterComplex).toContain("subtitles='/tmp/test_subtitle.srt'")
  })

  it('missingVideoStoryboardIds > 0 → 抛错（导出阻断）', async () => {
    await seedHappyTimeline(ds)
    // 把 sb2 的 videoPath 清空
    await ds
      .getRepository(StoryboardEntity)
      .update({ id: 'sb2' }, { videoPath: null })

    const svc = new EpisodeMp4ExporterService(
      ds,
      makeMockRunner(),
      makeMockFileWriter(),
    )

    await expect(
      svc.exportEpisodeToMp4({
        episodeScriptId: 'es1',
        outputPath: '/tmp/out.mp4',
      }),
    ).rejects.toThrow(/导出阻断/)
  })

  it('空场景集 → 抛错（来自 timeline-builder）', async () => {
    const svc = new EpisodeMp4ExporterService(
      ds,
      makeMockRunner(),
      makeMockFileWriter(),
    )
    await expect(
      svc.exportEpisodeToMp4({
        episodeScriptId: 'es_ghost',
        outputPath: '/tmp/out.mp4',
      }),
    ).rejects.toThrow(/没有任何场景/)
  })
})

describe('buildFilterComplex (pure)', () => {
  function makeShot(overrides: Partial<TimelineShot> = {}): TimelineShot {
    return {
      storyboardId: 'sb',
      sceneId: 's',
      shotNumber: 1,
      startSec: 0,
      endSec: 3,
      durationSec: 3,
      videoPath: '/v.mp4',
      transition: null,
      ...overrides,
    }
  }

  it('单段：含 scale + null 串 + anull', () => {
    const fc = buildFilterComplex({
      shots: [makeShot({ shotNumber: 1 })],
      width: 1280,
      height: 720,
    })
    expect(fc).toContain('scale=1280:720')
    expect(fc).toContain('[v0_n]null[outv]')
    // 2026-09-16 P0-RD1：单段音轨也走 48k 归一 + apad/atrim 对齐链
    expect(fc).toContain(
      '[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,apad,atrim=0:3,asetpts=N/SR/TB[au0]',
    )
    expect(fc).toContain('[au0]anull[outa]')
  })

  it('两段 + cut（无 transition）：xfade=fade duration=0', () => {
    const fc = buildFilterComplex({
      shots: [
        makeShot({ shotNumber: 1, durationSec: 3 }),
        makeShot({ shotNumber: 2, transition: { type: 'cut', duration: 0 } }),
      ],
      width: 1920,
      height: 1080,
    })
    // cut 时 plan.xfadeName=null，buildFilterComplex 兜底为 'fade'
    expect(fc).toContain('xfade=transition=fade')
    expect(fc).toContain('duration=0')
  })

  it('两段 + dissolve 0.5s：offset=cum-dur', () => {
    const fc = buildFilterComplex({
      shots: [
        makeShot({ shotNumber: 1, durationSec: 4 }),
        makeShot({
          shotNumber: 2,
          transition: { type: 'dissolve', duration: 500 },
        }),
      ],
      width: 1920,
      height: 1080,
    })
    expect(fc).toContain('xfade=transition=dissolve:duration=0.5:offset=3.5')
  })

  it('字幕：含 subtitles= filter 和音频 concat', () => {
    const fc = buildFilterComplex({
      shots: [
        makeShot({ shotNumber: 1 }),
        makeShot({ shotNumber: 2, transition: { type: 'fade', duration: 500 } }),
      ],
      width: 1920,
      height: 1080,
      srtPath: '/tmp/x.srt',
    })
    expect(fc).toContain("subtitles='/tmp/x.srt'")
    // 单元音频按 xfade 扣减对齐（shot0 len=3-0.5=2.5），concat 单元产物
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa]')
    expect(fc).toContain('atrim=0:2.5')
    expect(fc).toContain('atrim=0:3')
  })
})

describe('buildFilterComplex 音轨/帧率（复核修复 P1-7）', () => {
  function makeShot(overrides: Partial<TimelineShot> = {}): TimelineShot {
    return {
      storyboardId: 'sb',
      sceneId: 's',
      shotNumber: 1,
      startSec: 0,
      endSec: 3,
      durationSec: 3,
      videoPath: '/v.mp4',
      transition: null,
      ...overrides,
    }
  }

  it('缺省 audioFlags：保持旧行为（全部 [i:a]）', () => {
    const fc = buildFilterComplex({
      shots: [makeShot(), makeShot({ shotNumber: 2 })],
      width: 1280,
      height: 720,
    })
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa]')
    expect(fc).toContain('[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000')
    expect(fc).toContain('[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000')
  })

  it('部分无音轨：无音轨输入映射到静音占位流（编号 = 文件数起顺延）', () => {
    const fc = buildFilterComplex({
      shots: [makeShot(), makeShot({ shotNumber: 2 })],
      width: 1280,
      height: 720,
      audioFlags: [true, false],
    })
    // 第 2 路无音轨 → 用静音占位输入（文件数 2 + 第 0 个静音 = 流 2）
    expect(fc).toContain('[2:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000')
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa]')
    // 静音占位规格与 audioFlags 对齐（2026-09-16 P0-RD1：44100 → 48000 与主流 t2v 音轨一致）
    expect(buildSilentInputSpecs([true, false])).toEqual(['anullsrc=r=48000:cl=stereo'])
    expect(buildSilentInputSpecs([false, false])).toEqual([
      'anullsrc=r=48000:cl=stereo',
      'anullsrc=r=48000:cl=stereo',
    ])
    expect(buildSilentInputSpecs(undefined)).toEqual([])
  })

  it('全部无音轨：concat 全部走静音占位流', () => {
    const fc = buildFilterComplex({
      shots: [makeShot(), makeShot({ shotNumber: 2 })],
      width: 1280,
      height: 720,
      audioFlags: [false, false],
    })
    expect(fc).toContain('[2:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000')
    expect(fc).toContain('[3:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000')
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa]')
  })

  it('配音混入（P0-CM1）：附加文件按单元归一 + amix + 输入编号 = 视频数+占位数顺延', () => {
    const fc = buildFilterComplex({
      shots: [makeShot(), makeShot({ shotNumber: 2 })],
      width: 1280,
      height: 720,
      audioFlags: [true, false],
      extraAudioFiles: [['a.wav', 'b.wav'], ['c.wav']],
    })
    // 物理输入顺序：视频(0,1) → 配音文件(2,3,4) → 静音占位(5)；
    // 单元0 音源 = [0:a] + [2:a] + [3:a]（视频自带音轨在前），单元1 = 占位[5:a] + [4:a]
    expect(fc).toContain('[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000[as0_0]')
    expect(fc).toContain('[2:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000[as0_1]')
    expect(fc).toContain('[3:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000[as0_2]')
    expect(fc).toContain('[as0_0][as0_1][as0_2]amix=inputs=3:duration=longest[am0]')
    expect(fc).toContain('[5:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000[as1_0]')
    expect(fc).toContain('[4:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000[as1_1]')
    expect(fc).toContain('[as1_0][as1_1]amix=inputs=2:duration=longest[am1]')
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa]')
  })

  it('scale 链带 fps 归一（xfade 要求两路 fps 一致）', () => {
    const fc = buildFilterComplex({
      shots: [makeShot()],
      width: 1280,
      height: 720,
    })
    expect(fc).toContain('fps=30')
  })
})

describe('buildOutputArgs', () => {
  it('包含 -map [outv]/[outa] / libx264 / aac / pix_fmt yuv420p / faststart', () => {
    const args = buildOutputArgs({})
    expect(args.includes('-map')).toBe(true)
    expect(args.some((a) => a === '[outv]')).toBe(true)
    expect(args.some((a) => a === '[outa]')).toBe(true)
    expect(args.includes('libx264')).toBe(true)
    expect(args.includes('aac')).toBe(true)
    expect(args.includes('yuv420p')).toBe(true)
    expect(args.some((a) => a.includes('faststart'))).toBe(true)
  })
})
