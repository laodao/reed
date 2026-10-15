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
import * as fs from 'fs'
import * as os from 'os'
import * as nodePath from 'path'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import {
  EpisodeMp4ExporterService,
  buildFilterComplex,
  buildSilentInputSpecs,
  buildOutputArgs,
  computeExportUnitTimes,
  buildExportSubtitleTimeline,
  type FfmpegRunner,
  type FileWriter,
} from '@core/platform/episode-production/compose/episode-mp4-exporter.service'
import type { Timeline, TimelineShot } from '@core/platform/episode-production/compose/timeline-builder.service'
import { registerPathProvider, type IPathProvider } from '@core/interfaces/path.interface'

/** 最小 path provider stub（成功回写要算 user-rel 路径） */
class StubPathProvider implements IPathProvider {
  constructor(private readonly dataPath: string) {}
  getUserDataPath(): string { return this.dataPath }
  getAppDataPath(): string { return this.dataPath }
  getTempPath(): string { return this.dataPath }
  getDataPath(): string { return this.dataPath }
  getSubDirectories(): never { throw new Error('not used') }
  getSubDirectoryPath(): never { throw new Error('not used') }
  toAssetUrl(rel: string): string { return `/assets/${rel}` }
}

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      SceneScriptEntity,
      SceneDialogueEntity,
      StoryboardEntity,
      EpisodeScriptEntity,
      VideoEpisodeEntity,
    ],
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

/**
 * D1/D3 用播种：单场景 2 镜各 4s（sb2 dissolve 500ms），场景 2 条对白
 * （无 links 表 → 字幕走均分：sb1←d1，sb2←d2），无旁白文本。
 */
async function seedTwoShotDialogue(ds: DataSource): Promise<void> {
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
    narration: null,
    dialogues: [
      { id: 'd1', text: '第一句台词', characterName: '张三' },
      { id: 'd2', text: '第二句台词', characterName: '李四' },
    ],
    actions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
  const shot = (id: string, shotNumber: number, extra: Record<string, unknown> = {}) => ({
    id,
    sceneScriptId: 's1',
    shotNumber,
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
    videoPath: `/tmp/${id}.mp4`,
    duration: 4,
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
    ...extra,
  })
  await ds.getRepository(StoryboardEntity).save([
    shot('sb1', 1),
    shot('sb2', 2, { transitionType: 'dissolve', transitionDurationMs: 500 }),
  ] as any)
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

  // ==================== 状态闭环 + 配音健壮性（0916 晚 review 修复） ====================

  /** es1 → ep1 链路播种（状态回写路径此前因实体未注册在测试中是死代码） */
  async function seedEpisodeChain(status = 'producing'): Promise<void> {
    await ds.getRepository(EpisodeScriptEntity).save({
      id: 'es1',
      projectId: 'p1',
      episodeId: 'ep1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(VideoEpisodeEntity).save({
      id: 'ep1',
      projectId: 'p1',
      episodeNumber: 1,
      title: '第一集',
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
  }

  async function episodeStatus(): Promise<string | null> {
    const ep = await ds
      .getRepository(VideoEpisodeEntity)
      .findOne({ where: { id: 'ep1' } as any })
    return (ep as any)?.status ?? null
  }

  it('导出成功：composing→completed + composedVideoPath 回写', async () => {
    await seedHappyTimeline(ds)
    await seedEpisodeChain('producing')
    registerPathProvider(() => new StubPathProvider('/tmp'))
    const runner = makeMockRunner()
    const svc = new EpisodeMp4ExporterService(ds, runner, makeMockFileWriter())

    await svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })

    expect(await episodeStatus()).toBe('completed')
    const ep = await ds.getRepository(VideoEpisodeEntity).findOne({ where: { id: 'ep1' } as any })
    expect((ep as any).composedVideoPath).toBeTruthy()
  })

  it('ffmpeg 失败：composing 回退 producing（不再恒卡 ⑥）', async () => {
    await seedHappyTimeline(ds)
    await seedEpisodeChain('producing')
    const runner = makeMockRunner()
    runner.run = vi.fn(async () => {
      throw new Error('ffmpeg boom')
    })
    const svc = new EpisodeMp4ExporterService(ds, runner, makeMockFileWriter())

    await expect(
      svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' }),
    ).rejects.toThrow('ffmpeg boom')
    expect(await episodeStatus()).toBe('producing')
  })

  it('校验阻断（缺视频）：不推进 composing（推进后置到校验之后）', async () => {
    await seedHappyTimeline(ds)
    await seedEpisodeChain('producing')
    await ds.getRepository(StoryboardEntity).update({ id: 'sb2' }, { videoPath: null })
    const svc = new EpisodeMp4ExporterService(ds, makeMockRunner(), makeMockFileWriter())

    await expect(
      svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' }),
    ).rejects.toThrow(/导出阻断/)
    expect(await episodeStatus()).toBe('producing')
  })

  it('TTS 产物坏文件剔除：缺失的旁白/对白不进 ffmpeg 输入，导出继续', async () => {
    await seedHappyTimeline(ds)
    await seedEpisodeChain('producing')
    // d1 → 真实临时文件；d2 → 不存在的路径；旁白 → 不存在的路径
    const realWav = nodePath.join(os.tmpdir(), `ep-export-tts-${Date.now()}.wav`)
    fs.writeFileSync(realWav, 'fake')
    try {
      await ds.getRepository(SceneScriptEntity).update({ id: 's1' } as any, {
        narrationAudioPath: '/tmp/__missing_narration.wav',
        dialogues: [
          { id: 'd1', text: '老板，来碗茶', characterName: '张三', audioAsset: { audioPath: realWav } },
          { id: 'd2', text: '好嘞', characterName: '李四', audioAsset: { audioPath: '/tmp/__missing_d2.wav' } },
        ],
      } as any)
      await ds.getRepository(StoryboardEntity).update({ id: 'sb1' }, { dialogueIds: ['d1', 'd2'] } as any)

      const runner = makeMockRunner()
      const svc = new EpisodeMp4ExporterService(ds, runner, makeMockFileWriter())
      await svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })

      const inputs = runner.run.mock.calls[0][0].inputs
      // 视频两路 + 唯一真实存在的 TTS 文件；坏文件被剔除而非让 ffmpeg 打不开输入
      expect(inputs).toEqual(['/tmp/v1.mp4', '/tmp/v2.mp4', realWav])
      // 单条人声：不进 concat，与视频轨 amix
      expect(runner.run.mock.calls[0][0].filterComplex).toContain(
        'amix=inputs=2:duration=longest:normalize=0',
      )
    } finally {
      fs.unlinkSync(realWav)
    }
  })

  // ==================== X4：配音落库 user-rel 路径的读取兼容 ====================

  it('X4：user-rel 配音路径按 dataPath 拼回；存量绝对路径原样兼容', async () => {
    await seedHappyTimeline(ds)
    await seedEpisodeChain('producing')
    const dataPath = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'ep-x4-data-'))
    const legacyAbs = nodePath.join(os.tmpdir(), `ep-x4-legacy-${Date.now()}.wav`)
    const relNarr = 'episode-production/audio/s1/narration.wav'
    const relDlg = 'episode-production/audio/s1/d1.wav'
    try {
      fs.mkdirSync(nodePath.join(dataPath, 'episode-production/audio/s1'), { recursive: true })
      fs.writeFileSync(nodePath.join(dataPath, relNarr), 'fake')
      fs.writeFileSync(nodePath.join(dataPath, relDlg), 'fake')
      fs.writeFileSync(legacyAbs, 'fake')

      await ds.getRepository(SceneScriptEntity).update({ id: 's1' } as any, {
        // 新数据：user-rel 相对路径
        narrationAudioPath: relNarr,
        dialogues: [
          { id: 'd1', text: '老板，来碗茶', characterName: '张三', audioAsset: { audioPath: relDlg } },
          // 存量数据：绝对路径
          { id: 'd2', text: '好嘞', characterName: '李四', audioAsset: { audioPath: legacyAbs } },
        ],
      } as any)
      await ds.getRepository(StoryboardEntity).update({ id: 'sb1' }, { dialogueIds: ['d1', 'd2'] } as any)
      registerPathProvider(() => new StubPathProvider(dataPath))

      const runner = makeMockRunner()
      const svc = new EpisodeMp4ExporterService(ds, runner, makeMockFileWriter())
      await svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })

      const inputs = runner.run.mock.calls[0][0].inputs
      // user-rel 拼回 dataPath 成绝对路径；存量绝对路径原样进入输入
      expect(inputs).toEqual([
        '/tmp/v1.mp4',
        '/tmp/v2.mp4',
        nodePath.join(dataPath, relNarr),
        nodePath.join(dataPath, relDlg),
        legacyAbs,
      ])
    } finally {
      fs.rmSync(dataPath, { recursive: true, force: true })
      fs.rmSync(legacyAbs, { force: true })
    }
  })

  it('X4：数据目录迁移后（换 dataPath）同一 user-rel 配音记录解析到新数据根', async () => {
    await seedHappyTimeline(ds)
    await seedEpisodeChain('producing')
    const relNarr = 'episode-production/audio/s1/narration.wav'
    const dirA = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'ep-x4-mig-a-'))
    const dirB = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'ep-x4-mig-b-'))
    try {
      // 模拟迁移：同一相对路径的产物文件随数据目录从 A 搬到 B
      for (const dir of [dirA, dirB]) {
        fs.mkdirSync(nodePath.join(dir, 'episode-production/audio/s1'), { recursive: true })
        fs.writeFileSync(nodePath.join(dir, relNarr), 'fake')
      }
      await ds.getRepository(SceneScriptEntity).update({ id: 's1' } as any, {
        narrationAudioPath: relNarr,
      } as any)

      // 迁移前：dataPath = dirA
      registerPathProvider(() => new StubPathProvider(dirA))
      const runnerA = makeMockRunner()
      await new EpisodeMp4ExporterService(ds, runnerA, makeMockFileWriter())
        .exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })
      expect(runnerA.run.mock.calls[0][0].inputs).toContain(nodePath.join(dirA, relNarr))

      // 迁移后：dataPath = dirB，同一 user-rel 记录解析到新根（绝对路径落库时此处会被剔除 → 无声）
      registerPathProvider(() => new StubPathProvider(dirB))
      const runnerB = makeMockRunner()
      await new EpisodeMp4ExporterService(ds, runnerB, makeMockFileWriter())
        .exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })
      const inputsB = runnerB.run.mock.calls[0][0].inputs
      expect(inputsB).toContain(nodePath.join(dirB, relNarr))
      expect(inputsB).not.toContain(nodePath.join(dirA, relNarr))
    } finally {
      fs.rmSync(dirA, { recursive: true, force: true })
      fs.rmSync(dirB, { recursive: true, force: true })
    }
  })

  // ==================== D1：烧录字幕时间轴与成片对齐 ====================

  it('D1：有转场时字幕 cue 按扣减后的成片时间轴（dissolve 0.5s → 第 2 镜对白 3.5s 起，修复前漂移 0.5s）', async () => {
    await seedTwoShotDialogue(ds)
    const runner = makeMockRunner()
    const writer = makeMockFileWriter()
    const svc = new EpisodeMp4ExporterService(ds, runner, writer)

    await svc.exportEpisodeToMp4({
      episodeScriptId: 'es1',
      outputPath: '/tmp/out.mp4',
      burnSubtitles: true,
    })

    const srt = writer.writeText.mock.calls[0][1] as string
    // sb2（4s 起）前有 dissolve 0.5s → 成片时间轴上 3.5s 起、7.5s 止；
    // 修复前基于全量展示时间线是 00:00:04,000 --> 00:00:08,000（每转场漂 ~0.5s）
    expect(srt).toContain('00:00:03,500 --> 00:00:07,500\n李四：第二句台词')
    expect(srt).not.toContain('00:00:04,000 --> 00:00:08,000')
    // 第 1 镜对白不受影响
    expect(srt).toContain('00:00:00,000 --> 00:00:04,000\n张三：第一句台词')
  })

  it('D1：未入选镜头（includeInFinal=0）的字幕不进 SRT', async () => {
    await seedTwoShotDialogue(ds)
    await ds.getRepository(StoryboardEntity).update({ id: 'sb2' }, { includeInFinal: 0 } as any)
    const runner = makeMockRunner()
    const writer = makeMockFileWriter()
    const svc = new EpisodeMp4ExporterService(ds, runner, writer)

    await svc.exportEpisodeToMp4({
      episodeScriptId: 'es1',
      outputPath: '/tmp/out.mp4',
      burnSubtitles: true,
    })

    const srt = writer.writeText.mock.calls[0][1] as string
    expect(srt).toContain('张三：第一句台词')
    expect(srt).not.toContain('第二句台词')
    // 成片只有 sb1 一路输入
    expect(runner.run.mock.calls[0][0].inputs).toEqual(['/tmp/sb1.mp4'])
  })

  // ==================== D3：旁白音频排在单元内对白之前 ====================

  it('D3：旁白音频排在单元内对白之前（与字幕侧"旁白显示在最前"一致）', async () => {
    await seedTwoShotDialogue(ds)
    const narrationWav = nodePath.join(os.tmpdir(), `ep-export-narr-${Date.now()}.wav`)
    const dialogueWav = nodePath.join(os.tmpdir(), `ep-export-dlg-${Date.now()}.wav`)
    fs.writeFileSync(narrationWav, 'fake')
    fs.writeFileSync(dialogueWav, 'fake')
    try {
      await ds.getRepository(SceneScriptEntity).update({ id: 's1' } as any, {
        narrationAudioPath: narrationWav,
        dialogues: [
          { id: 'd1', text: '第一句台词', characterName: '张三', audioAsset: { audioPath: dialogueWav } },
          { id: 'd2', text: '第二句台词', characterName: '李四' },
        ],
      } as any)
      await ds.getRepository(StoryboardEntity).update({ id: 'sb1' }, { dialogueIds: ['d1'] } as any)

      const runner = makeMockRunner()
      const svc = new EpisodeMp4ExporterService(ds, runner, makeMockFileWriter())
      await svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })

      // 物理输入顺序：视频(0,1) → 旁白(2) → 对白(3)；修复前旁白排在对白之后
      const inputs = runner.run.mock.calls[0][0].inputs
      expect(inputs).toEqual(['/tmp/sb1.mp4', '/tmp/sb2.mp4', narrationWav, dialogueWav])
      // 人声 concat 顺序：旁白是单元 0 的第 1 路人声（[2:a]→[vs0_0]），对白是第 2 路
      const fc = runner.run.mock.calls[0][0].filterComplex as string
      expect(fc).toContain('[2:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[vs0_0]')
      expect(fc).toContain('[3:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[vs0_1]')
      expect(fc).toContain('[vs0_0][vs0_1]concat=n=2:v=0:a=1[vn0]')
    } finally {
      fs.unlinkSync(narrationWav)
      fs.unlinkSync(dialogueWav)
    }
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
    // P-D：归一链含 loudnorm（I=-16/TP=-1.5/LRA=11 单遍动态）防 amix 叠加爆音
    expect(fc).toContain('loudnorm=I=-16:TP=-1.5:LRA=11')
    expect(fc).toContain(
      '[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:3,asetpts=N/SR/TB[au0]',
    )
    expect(fc).toContain('[au0]anull[outa_mix];[outa_mix]alimiter=limit=0.94:level=false[outa]')
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
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa_mix];[outa_mix]alimiter=limit=0.94:level=false[outa]')
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
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa_mix];[outa_mix]alimiter=limit=0.94:level=false[outa]')
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
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa_mix];[outa_mix]alimiter=limit=0.94:level=false[outa]')
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
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa_mix];[outa_mix]alimiter=limit=0.94:level=false[outa]')
  })

  it('配音混入（P0-CM1）：人声按顺序 concat 成一条轨再 amix（不叠音）+ normalize=0', () => {
    const fc = buildFilterComplex({
      shots: [makeShot(), makeShot({ shotNumber: 2 })],
      width: 1280,
      height: 720,
      audioFlags: [true, false],
      extraAudioFiles: [['a.wav', 'b.wav'], ['c.wav']],
    })
    // 物理输入顺序：视频(0,1) → 配音文件(2,3,4) → 静音占位(5)；
    // 单元0 人声 = [2:a][3:a] 逐路归一后 concat（旧实现同时 amix 叠音、且 concat 前不归一
    // 混采样率必炸），再与视频轨 [0:a] amix；单元1 单条人声 [4:a] 不需 concat，与占位 [5:a] amix
    expect(fc).toContain('[2:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[vs0_0]')
    expect(fc).toContain('[3:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[vs0_1]')
    expect(fc).toContain('[vs0_0][vs0_1]concat=n=2:v=0:a=1[vn0]')
    expect(fc).toContain('[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[an0]')
    expect(fc).toContain('[an0][vn0]amix=inputs=2:duration=longest:normalize=0[am0]')
    expect(fc).toContain('[4:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[vn1]')
    expect(fc).toContain('[5:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11[an1]')
    expect(fc).toContain('[an1][vn1]amix=inputs=2:duration=longest:normalize=0[am1]')
    expect(fc).toContain('[au0][au1]concat=n=2:v=0:a=1[outa_mix];[outa_mix]alimiter=limit=0.94:level=false[outa]')
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

describe('computeExportUnitTimes / buildExportSubtitleTimeline (D1 pure)', () => {
  function makeShot(overrides: Partial<TimelineShot> = {}): TimelineShot {
    return {
      storyboardId: 'sb',
      sceneId: 's1',
      shotNumber: 1,
      startSec: 0,
      endSec: 3,
      durationSec: 3,
      videoPath: '/v.mp4',
      transition: null,
      includeInFinal: true,
      segmentId: null,
      ...overrides,
    }
  }

  it('无转场 / cut：单元紧挨排列，不扣减', () => {
    const times = computeExportUnitTimes([
      makeShot({ storyboardId: 'sb1', durationSec: 4 }),
      makeShot({ storyboardId: 'sb2', durationSec: 4, transition: { type: 'cut', duration: 0 } }),
    ])
    expect(times).toEqual([
      { startSec: 0, endSec: 4 },
      { startSec: 4, endSec: 8 },
    ])
  })

  it('非 cut 转场链：offset = cumulativeDur - transition.duration（与 buildFilterComplex 同源）', () => {
    const times = computeExportUnitTimes([
      makeShot({ storyboardId: 'sb1', durationSec: 4 }),
      makeShot({ storyboardId: 'sb2', durationSec: 4, transition: { type: 'dissolve', duration: 500 } }),
      makeShot({ storyboardId: 'sb3', durationSec: 4, transition: { type: 'fade', duration: 1000 } }),
    ])
    // buildFilterComplex 对应 xfade offset=3.5 / offset=6.5
    expect(times).toEqual([
      { startSec: 0, endSec: 4 },
      { startSec: 3.5, endSec: 7.5 },
      { startSec: 6.5, endSec: 10.5 },
    ])
  })

  it('segment 合并单元：单元区间按成员原始时长比例切分；未进单元的分镜被剔除', () => {
    const sb1 = makeShot({ storyboardId: 'sb1', shotNumber: 1, startSec: 0, endSec: 3, segmentId: 'seg1' })
    const sb2 = makeShot({ storyboardId: 'sb2', shotNumber: 2, startSec: 3, endSec: 6, segmentId: 'seg1' })
    const sb3 = makeShot({
      storyboardId: 'sb3', shotNumber: 3, startSec: 6, endSec: 9,
      transition: { type: 'dissolve', duration: 500 },
    })
    const sb4 = makeShot({ storyboardId: 'sb4', shotNumber: 4, startSec: 9, endSec: 12, includeInFinal: false })
    const timeline: Timeline = {
      episodeScriptId: 'es1',
      totalDurationSec: 12,
      missingVideoStoryboardIds: [],
      scenes: [{
        sceneId: 's1', sceneNumber: 1, startSec: 0, endSec: 12, durationSec: 12,
        shots: [sb1, sb2, sb3, sb4],
      }],
    }
    // 导出单元：seg1（sb1+sb2 合并，segment.duration=8）+ sb3 单镜
    const units: TimelineShot[] = [
      { ...sb1, storyboardId: 'seg1', durationSec: 8, endSec: 8 },
      { ...sb3 },
    ]
    const sub = buildExportSubtitleTimeline({ units, unitShotIds: [['sb1', 'sb2'], ['sb3']], timeline })

    expect(sub.scenes).toHaveLength(1)
    const shots = sub.scenes[0].shots
    // sb4 未入选 → 剔除
    expect(shots.map((s) => s.storyboardId)).toEqual(['sb1', 'sb2', 'sb3'])
    // seg1 单元 [0,8] 按 3:3 比例切分
    expect(shots[0]).toMatchObject({ startSec: 0, endSec: 4, durationSec: 4 })
    expect(shots[1]).toMatchObject({ startSec: 4, endSec: 8, durationSec: 4 })
    // sb3 扣转场 0.5s 后 7.5s 起
    expect(shots[2]).toMatchObject({ startSec: 7.5, endSec: 10.5, durationSec: 3 })
    // 场景边界与总时长按成片时间轴重算
    expect(sub.scenes[0]).toMatchObject({ startSec: 0, endSec: 10.5, durationSec: 10.5 })
    expect(sub.totalDurationSec).toBe(10.5)
  })
})
