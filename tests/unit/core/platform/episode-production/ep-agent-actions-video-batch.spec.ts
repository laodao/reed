/**
 * ep-agent-actions 批量分镜视频目标筛选单测（2026-09-25 一致性修复 · 审计主题 B 评审收尾）
 *
 * 覆盖 executeGenerateSegmentVideo 批量路径的双口径筛选：
 * - 分镜无 videoPath 但所属片段 completed+videoPath → 不入选（不重复生成）
 * - 所属片段 superseded → 仍入选（片段已被替换，导出不会用它）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'

vi.mock('@core/platform/workflow/datasource/datasource.service', () => ({
  getDataSourceService: () => ({ listEligible: async () => [] }),
  registerDataSourceService: vi.fn(),
}))

vi.mock('@core/platform/episode-production/render/video/adapter-factory', () => ({
  createAdapterForProviderWithReason: async () => ({ adapter: { fake: true }, reason: '' }),
}))

const videoSvcMock = vi.hoisted(() => ({
  generateForStoryboard: vi.fn(),
}))
vi.mock('@core/platform/episode-production/render/video/video-segment.service', () => ({
  VideoSegmentService: class {
    generateForStoryboard = videoSvcMock.generateForStoryboard
  },
}))

import { executeEpActions } from '@core/platform/episode-production/agent/ep-agent-actions'

async function buildSegDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [EpVideoSegmentEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

async function seedSegment(
  ds: DataSource,
  seg: { id: string; status: string; videoPath?: string | null },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(EpVideoSegmentEntity).save({
    id: seg.id,
    episodeId: 've1',
    sceneId: 's1',
    seq: 1,
    status: seg.status,
    shotCount: 1,
    videoPath: seg.videoPath ?? null,
    createdAt: now,
    updatedAt: now,
  } as any)
}

function buildCtx(ds: DataSource, storyboards: any[]) {
  const db = {
    dataSource: ds,
    videoProjects: { getById: async () => ({ id: 'p1', config: {} }) },
    videoEpisodes: { getById: async () => ({ id: 've1', scriptId: 'es1', status: 'producing' }) },
    episodeScripts: { getById: async () => ({ id: 'es1' }) },
    sceneScripts: { getByEpisodeScriptId: async () => [{ id: 's1' }] },
    storyboards: { getBySceneScriptId: async () => storyboards },
    storyboardKeyframes: { listByStoryboard: async () => [] },
  }
  return {
    projectId: 'p1',
    episodeId: 've1',
    db,
    ai: null,
    emit: vi.fn(),
  } as any
}

const STATE_WITH_STORYBOARDS = {
  episode: { id: 've1', hasScript: true },
  scenes: { total: 1, countWithBindings: 0, locations: [] },
  storyboards: { total: 1, scenesCovered: 1, scenesTotal: 1 },
  assets: { characters: { count: 0, names: [] }, locations: { count: 0, names: [] }, items: { count: 0, names: [] } },
} as any

const BATCH_ACTION = {
  type: 'generate_segment_video',
  params: { providerConfigId: 'pc1', modelId: 'm1' },
} as any

describe('executeGenerateSegmentVideo · 批量目标双口径筛选', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildSegDb()
    videoSvcMock.generateForStoryboard.mockReset()
    videoSvcMock.generateForStoryboard.mockResolvedValue({
      match: { mode: 'text2video' },
      output: { durationSec: 4 },
    })
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('分镜无 videoPath 但片段 completed+videoPath → 不入选，返回"无需启动"', async () => {
    await seedSegment(ds, { id: 'seg1', status: 'completed', videoPath: 'video-segments/seg1.mp4' })
    const ctx = buildCtx(ds, [
      { id: 'sb1', shotNumber: 1, status: 'pending', videoPath: null, segmentId: 'seg1' },
    ])

    const [summary] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.message).toContain('无需启动')
    expect(videoSvcMock.generateForStoryboard).not.toHaveBeenCalled()
  })

  it('所属片段 superseded → 仍入选为生成目标', async () => {
    await seedSegment(ds, { id: 'seg1', status: 'superseded', videoPath: 'video-segments/seg1.mp4' })
    const ctx = buildCtx(ds, [
      { id: 'sb1', shotNumber: 1, status: 'pending', videoPath: null, segmentId: 'seg1' },
    ])

    const [summary] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.message).toContain('已启动')
    expect(summary.data?.total).toBe(1)
    expect(videoSvcMock.generateForStoryboard).toHaveBeenCalledTimes(1)
    expect(videoSvcMock.generateForStoryboard.mock.calls[0][0]).toMatchObject({ storyboardId: 'sb1' })
  })
})
