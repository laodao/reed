/**
 * EpisodeMp4ExporterService · 视频片段制合成单测（tasks/2026-09-04-ep-video-segment-redesign §6）
 *
 * - 入选分镜已分段 → 按 segment 合并成合成单元：inputs 用 segment.video_path，
 *   段内不 xfade（3 镜 2 段 → 2 inputs + 1 次 xfade）
 * - 段间转场取段内首镜 transition（保持现有行为）
 * - segment.duration 缺失 → 回退分镜时长求和
 * - 全部无 segmentId（存量项目）→ 回退现有逐镜 xfade 路径
 * - 片段缺视频 → 导出阻断
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneDialogueEntity } from '@core/database/entities/episode-production/scene-dialogue.entity'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'
import {
  EpisodeMp4ExporterService,
  type FfmpegRunner,
  type FileWriter,
} from '@core/modules/episode-production/compose/episode-mp4-exporter.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [
      SceneScriptEntity,
      SceneDialogueEntity,
      StoryboardEntity,
      EpVideoSegmentEntity,
    ],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

function shotRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    sceneScriptId: 's1',
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
    videoPath: null,
    duration: 3,
    transition: '{}',
    transitionType: null,
    transitionDurationMs: null,
    transitionDirection: null,
    transitionEasing: null,
    transitionColor: null,
    status: 'completed',
    keyframeCount: 2,
    videoProviderId: null,
    videoModelId: null,
    videoMode: null,
    use3dStaging: 0,
    stagingLayoutId: null,
    backgroundRefImageId: null,
    segmentId: null,
    segmentSeq: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

async function seedScene(ds: DataSource): Promise<void> {
  await ds.getRepository(SceneScriptEntity).save({
    id: 's1',
    episodeScriptId: 'es1',
    sceneNumber: 1,
    location: '工作室',
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
    dialogues: [],
    actions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any)
}

/** 3 镜 2 段：sb1+sb2 → seg1（8s），sb3 → seg2（3s，段间 dissolve） */
async function seedSegmented(ds: DataSource): Promise<void> {
  await seedScene(ds)
  const now = new Date()
  await ds.getRepository(EpVideoSegmentEntity).save([
    {
      id: 'seg1', episodeId: 'ep1', sceneId: 's1', seq: 1, status: 'completed',
      shotCount: 2, estDuration: 6, prompt: null, videoPath: '/tmp/seg1.mp4',
      videoMode: 'text2video', duration: 8, providerId: null, modelId: null,
      error: null, createdAt: now, updatedAt: now, deletedAt: null,
    },
    {
      id: 'seg2', episodeId: 'ep1', sceneId: 's1', seq: 2, status: 'completed',
      shotCount: 1, estDuration: 3, prompt: null, videoPath: '/tmp/seg2.mp4',
      videoMode: 'text2video', duration: 3, providerId: null, modelId: null,
      error: null, createdAt: now, updatedAt: now, deletedAt: null,
    },
  ] as any)
  await ds.getRepository(StoryboardEntity).save([
    shotRow({ id: 'sb1', shotNumber: 1, segmentId: 'seg1', segmentSeq: 1 }),
    shotRow({ id: 'sb2', shotNumber: 2, segmentId: 'seg1', segmentSeq: 2 }),
    shotRow({
      id: 'sb3', shotNumber: 3, segmentId: 'seg2', segmentSeq: 1,
      transitionType: 'dissolve', transitionDurationMs: 500,
    }),
  ] as any)
}

function makeMockRunner(): FfmpegRunner & { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn(async (args) => ({ outputPath: args.outputPath, durationSec: 11 })),
  } as any
}

function makeMockFileWriter(): FileWriter {
  return { writeText: vi.fn(async () => undefined) } as any
}

describe('EpisodeMp4ExporterService · 视频片段制', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('已分段 → 按 segment 合并：2 inputs + 段间 1 次 xfade（段内不 xfade）', async () => {
    await seedSegmented(ds)
    const runner = makeMockRunner()
    const svc = new EpisodeMp4ExporterService(ds, runner, makeMockFileWriter())

    await svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })

    expect(runner.run).toHaveBeenCalledTimes(1)
    const callArgs = runner.run.mock.calls[0][0]
    expect(callArgs.inputs).toEqual(['/tmp/seg1.mp4', '/tmp/seg2.mp4'])
    // 段间转场 = seg2 首镜（sb3）的 dissolve
    expect(callArgs.filterComplex).toContain('xfade=transition=dissolve')
    // 2 个单元只拼 1 次 xfade；offset 用 segment.duration(8) - 0.5
    expect(callArgs.filterComplex.match(/xfade=/g)).toHaveLength(1)
    expect(callArgs.filterComplex).toContain('offset=7.5')
  })

  it('segment.duration 缺失 → 回退分镜时长求和', async () => {
    await seedSegmented(ds)
    await ds.getRepository(EpVideoSegmentEntity).update({ id: 'seg1' }, { duration: null })
    const runner = makeMockRunner()
    const svc = new EpisodeMp4ExporterService(ds, runner, makeMockFileWriter())

    await svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })

    // seg1 时长 = 3+3=6 → offset = 6 - 0.5 = 5.5
    expect(runner.run.mock.calls[0][0].filterComplex).toContain('offset=5.5')
  })

  it('片段缺视频 → 导出阻断', async () => {
    await seedSegmented(ds)
    await ds.getRepository(EpVideoSegmentEntity).update({ id: 'seg2' }, { videoPath: null })
    const svc = new EpisodeMp4ExporterService(ds, makeMockRunner(), makeMockFileWriter())

    await expect(
      svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' }),
    ).rejects.toThrow(/导出阻断/)
  })

  it('全部无 segmentId（存量项目）→ 回退逐镜路径（3 inputs + 2 次 xfade）', async () => {
    await seedScene(ds)
    await ds.getRepository(StoryboardEntity).save([
      shotRow({ id: 'sb1', shotNumber: 1, videoPath: '/tmp/v1.mp4' }),
      shotRow({ id: 'sb2', shotNumber: 2, videoPath: '/tmp/v2.mp4' }),
      shotRow({ id: 'sb3', shotNumber: 3, videoPath: '/tmp/v3.mp4' }),
    ] as any)
    const runner = makeMockRunner()
    const svc = new EpisodeMp4ExporterService(ds, runner, makeMockFileWriter())

    await svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })

    const callArgs = runner.run.mock.calls[0][0]
    expect(callArgs.inputs).toEqual(['/tmp/v1.mp4', '/tmp/v2.mp4', '/tmp/v3.mp4'])
    expect(callArgs.filterComplex.match(/xfade=/g)).toHaveLength(2)
  })

  it('混合态：未分段分镜保持单镜单元', async () => {
    await seedSegmented(ds)
    // sb3 改为未分段单镜（自己的 video_path）
    await ds.getRepository(StoryboardEntity).update(
      { id: 'sb3' },
      { segmentId: null, segmentSeq: null, videoPath: '/tmp/v3.mp4' },
    )
    const runner = makeMockRunner()
    const svc = new EpisodeMp4ExporterService(ds, runner, makeMockFileWriter())

    await svc.exportEpisodeToMp4({ episodeScriptId: 'es1', outputPath: '/tmp/out.mp4' })

    expect(runner.run.mock.calls[0][0].inputs).toEqual(['/tmp/seg1.mp4', '/tmp/v3.mp4'])
  })
})
