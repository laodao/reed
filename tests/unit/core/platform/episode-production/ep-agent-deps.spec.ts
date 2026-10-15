/**
 * ep-agent-deps 单测（2026-09-25 一致性修复 · 审计主题 B）
 *
 * 覆盖 computeEpProductionState 的 storyboardsWithVideo 双口径统计：
 * 分镜自身 videoPath 非空，或所属非 superseded 片段 completed+videoPath 均计入。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { EpVideoSegmentEntity } from '@core/database/entities/episode-production/video-segment.entity'

vi.mock('@core/platform/workflow/datasource/datasource.service', () => ({
  getDataSourceService: () => ({ listEligible: async () => [] }),
  registerDataSourceService: vi.fn(),
}))

import { computeEpProductionState } from '@core/platform/episode-production/agent/ep-agent-deps'

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

function buildDbManager(ds: DataSource, storyboards: any[]) {
  return {
    dataSource: ds,
    videoProjects: { getById: async () => ({ name: 'P' }) },
    videoEpisodes: {
      getById: async () => ({ id: 've1', title: '第 1 集', status: 'producing', scriptId: 'es1' }),
    },
    episodeScripts: { getById: async () => ({ id: 'es1', synopsis: null, scriptContent: null }) },
    sceneScripts: { getByEpisodeScriptId: async () => [{ id: 's1', location: '茶馆' }] },
    storyboards: { getBySceneScriptId: async () => storyboards },
    storyboardKeyframes: { listByStoryboard: async () => [] },
  }
}

async function seedSegment(
  ds: DataSource,
  seg: { id: string; seq: number; status: string; videoPath?: string | null },
): Promise<void> {
  const now = new Date()
  await ds.getRepository(EpVideoSegmentEntity).save({
    id: seg.id,
    episodeId: 've1',
    sceneId: 's1',
    seq: seg.seq,
    status: seg.status,
    shotCount: 1,
    videoPath: seg.videoPath ?? null,
    createdAt: now,
    updatedAt: now,
  } as any)
}

describe('computeEpProductionState · storyboardsWithVideo 双口径', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildSegDb()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('分镜自身 videoPath 或所属 completed 片段都计入；superseded/pending 不计', async () => {
    await seedSegment(ds, { id: 'seg1', seq: 1, status: 'completed', videoPath: 'video-segments/seg1.mp4' })
    await seedSegment(ds, { id: 'seg2', seq: 2, status: 'superseded', videoPath: 'video-segments/seg2.mp4' })
    await seedSegment(ds, { id: 'seg3', seq: 3, status: 'pending', videoPath: null })

    const db = buildDbManager(ds, [
      { id: 'sb1', videoPath: '/v1.mp4', segmentId: null },
      { id: 'sb2', videoPath: null, segmentId: 'seg1' },
      { id: 'sb3', videoPath: null, segmentId: 'seg2' },
      { id: 'sb4', videoPath: null, segmentId: 'seg3' },
      { id: 'sb5', videoPath: null, segmentId: null },
    ])

    const state = await computeEpProductionState(db, 'p1', 've1')
    expect(state.storyboards.total).toBe(5)
    expect(state.production!.storyboardsWithVideo).toBe(2)
  })

  it('无 dataSource 时回退为只看分镜自身 videoPath', async () => {
    const db = buildDbManager(null as any, [
      { id: 'sb1', videoPath: '/v1.mp4', segmentId: null },
      { id: 'sb2', videoPath: null, segmentId: 'seg1' },
    ])
    db.dataSource = null

    const state = await computeEpProductionState(db, 'p1', 've1')
    expect(state.storyboards.total).toBe(2)
    expect(state.production!.storyboardsWithVideo).toBe(1)
  })
})
