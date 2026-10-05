/**
 * ep-agent-actions 批量片段视频单测（2026-10-04 一致性修复第三批 · 审计 V3）
 *
 * 批量路径改走片段级 SegmentVideoService.generateForSegment（尊重 renderPath=assetRef
 * 缺省）后覆盖：
 * - 目标筛选按「缺视频的片段」：completed+videoPath 不重生成；generating/inFlight 排除；
 *   片内分镜均已有单镜视频（旧单镜路径产物）的片段也不重烧（双口径思想保留）
 * - 无片段时先 recompute 分段再生成
 * - 分页 VIDEO_BATCH_LIMIT=4 + started 语义（动作立即返回"已启动"，终态补发 action:done）
 * - ctx.signal 步边界中止：在途段不打断、未开始项不再启动且 inFlight 登记解除
 * - 显式 storyboardId 仍走旧单镜路径（VideoSegmentService.generateForStoryboard），不变
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

const segmentSvcMock = vi.hoisted(() => ({
  generateForSegment: vi.fn(),
}))
vi.mock('@core/platform/episode-production/render/video/segment-video.service', () => ({
  SegmentVideoService: class {
    generateForSegment = segmentSvcMock.generateForSegment
  },
}))

const segmentationMock = vi.hoisted(() => ({
  preview: vi.fn(),
  recompute: vi.fn(),
}))
vi.mock('@core/platform/episode-production/render/video/ep-segmentation.service', () => ({
  EpSegmentationService: class {
    preview = segmentationMock.preview
    recompute = segmentationMock.recompute
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

function segItem(
  id: string,
  opts: { status?: string; videoPath?: string | null; seq?: number; storyboardIds?: string[] } = {},
): any {
  return {
    segmentId: id,
    seq: opts.seq ?? 1,
    sceneId: 's1',
    sceneNumber: 1,
    sceneLocation: '',
    status: opts.status ?? 'pending',
    shotCount: (opts.storyboardIds ?? ['sb1']).length,
    estDuration: 6,
    videoPath: opts.videoPath ?? null,
    duration: null,
    storyboardIds: opts.storyboardIds ?? ['sb1'],
  }
}

function previewOf(segments: any[]): any {
  return { episodeId: 've1', budgetSec: 15, sceneCount: 1, totalShotCount: segments.length, segments }
}

const SEGMENT_RESULT = {
  segmentId: 'segX',
  match: { mode: 'assetRef2video', degraded: false, trace: ['assetRef2video'] },
  output: { videoPath: 'video-segments/segX.mp4', durationSec: 6 },
  prompt: 'p',
  keyframesUsed: [],
  completedStoryboardIds: ['sb1'],
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

/** 等后台批量循环（微任务链 + 立即 resolve 的 mock）跑完 */
const flush = () => new Promise((r) => setTimeout(r, 0))

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: any) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function batchDoneMessages(ctx: any): string[] {
  return ctx.emit.mock.calls
    .map((c: any[]) => c[0])
    .filter((e: any) => e?.type === 'action:done')
    .map((e: any) => e.summary?.message ?? '')
}

describe('executeGenerateSegmentVideo · 批量按片段生成', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildSegDb()
    videoSvcMock.generateForStoryboard.mockReset()
    segmentSvcMock.generateForSegment.mockReset()
    segmentSvcMock.generateForSegment.mockResolvedValue(SEGMENT_RESULT)
    segmentationMock.preview.mockReset()
    segmentationMock.recompute.mockReset()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('片段 completed+videoPath → 不入选，返回"无需启动"，不触发 recompute', async () => {
    segmentationMock.preview.mockResolvedValue(previewOf([
      segItem('seg1', { status: 'completed', videoPath: 'video-segments/seg1.mp4', storyboardIds: ['sb1'] }),
    ]))
    const ctx = buildCtx(ds, [{ id: 'sb1', shotNumber: 1, status: 'pending', videoPath: null }])

    const [summary] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.message).toContain('无需启动')
    expect(segmentSvcMock.generateForSegment).not.toHaveBeenCalled()
    expect(segmentationMock.recompute).not.toHaveBeenCalled()
  })

  it('缺视频片段入选逐段生成；generating 跳过；片内分镜均已有单镜视频的片段不重烧（双口径）', async () => {
    segmentationMock.preview.mockResolvedValue(previewOf([
      segItem('segC', { status: 'completed', videoPath: 'v/c.mp4', storyboardIds: ['sbC'] }),
      segItem('segG', { status: 'generating', storyboardIds: ['sbG'] }),
      segItem('segOwn', { status: 'pending', storyboardIds: ['sbV'] }),
      segItem('segP', { status: 'pending', seq: 4, storyboardIds: ['sb1'] }),
      segItem('segE', { status: 'error', seq: 5, storyboardIds: ['sb2'] }),
    ]))
    const ctx = buildCtx(ds, [
      { id: 'sbC', shotNumber: 1, status: 'completed', videoPath: null },
      { id: 'sbG', shotNumber: 2, status: 'generating', videoPath: null },
      // 旧单镜路径产物：片段 pending 但分镜自身已有视频 → 导出双口径可用，不重烧
      { id: 'sbV', shotNumber: 3, status: 'completed', videoPath: 'video/sbV.mp4' },
      { id: 'sb1', shotNumber: 4, status: 'pending', videoPath: null },
      { id: 'sb2', shotNumber: 5, status: 'pending', videoPath: null },
    ])

    const [summary] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.data?.started).toBe(true)
    expect(summary.data?.total).toBe(2)
    await flush()

    expect(segmentSvcMock.generateForSegment).toHaveBeenCalledTimes(2)
    expect(segmentSvcMock.generateForSegment.mock.calls[0][0])
      .toEqual({ segmentId: 'segP', providerId: 'pc1', modelId: 'm1' })
    expect(segmentSvcMock.generateForSegment.mock.calls[1][0])
      .toEqual({ segmentId: 'segE', providerId: 'pc1', modelId: 'm1' })
    // 旧单镜批量路径不再使用
    expect(videoSvcMock.generateForStoryboard).not.toHaveBeenCalled()
    expect(batchDoneMessages(ctx).some((m) => m.includes('后台片段视频批次完成：成功 2/2'))).toBe(true)
  })

  it('无片段时先 recompute 分段，再按重算结果生成', async () => {
    segmentationMock.preview.mockResolvedValue(previewOf([]))
    segmentationMock.recompute.mockResolvedValue(previewOf([
      segItem('segR', { status: 'pending', storyboardIds: ['sb9'] }),
    ]))
    const ctx = buildCtx(ds, [{ id: 'sb9', shotNumber: 1, status: 'pending', videoPath: null }])

    const [summary] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.data?.started).toBe(true)
    await flush()

    expect(segmentationMock.recompute).toHaveBeenCalledTimes(1)
    expect(segmentationMock.recompute).toHaveBeenCalledWith('ve1')
    expect(segmentSvcMock.generateForSegment).toHaveBeenCalledTimes(1)
    expect(segmentSvcMock.generateForSegment.mock.calls[0][0])
      .toEqual({ segmentId: 'segR', providerId: 'pc1', modelId: 'm1' })
  })
})

describe('executeGenerateSegmentVideo · 孤儿分镜触发 recompute', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildSegDb()
    segmentSvcMock.generateForSegment.mockReset()
    segmentSvcMock.generateForSegment.mockResolvedValue(SEGMENT_RESULT)
    segmentationMock.preview.mockReset()
    segmentationMock.recompute.mockReset()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('有活段但存在孤儿分镜（重生分镜后旧段 superseded）→ recompute 收编并生成新段', async () => {
    // 场景 A 有活段 seg1；场景 B 新分镜 sb2 不属于任何 live 片段（孤儿）
    segmentationMock.preview.mockResolvedValue(previewOf([
      segItem('seg1', { storyboardIds: ['sb1'] }),
    ]))
    segmentationMock.recompute.mockResolvedValue(previewOf([
      segItem('seg1', { storyboardIds: ['sb1'] }),
      segItem('segNew', { seq: 2, storyboardIds: ['sb2'] }),
    ]))
    const ctx = buildCtx(ds, [
      { id: 'sb1', shotNumber: 1, status: 'pending', videoPath: null },
      { id: 'sb2', shotNumber: 2, status: 'pending', videoPath: null },
    ])

    const [summary] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.data?.started).toBe(true)
    await flush()

    expect(segmentationMock.recompute).toHaveBeenCalledTimes(1)
    expect(segmentationMock.recompute).toHaveBeenCalledWith('ve1')
    const calledIds = segmentSvcMock.generateForSegment.mock.calls.map((c: any[]) => c[0].segmentId)
    expect(calledIds).toEqual(['seg1', 'segNew'])
  })

  it('所有分镜都有 live 归属 → 不触发 recompute，直接按现有片段生成', async () => {
    segmentationMock.preview.mockResolvedValue(previewOf([
      segItem('segP', { storyboardIds: ['sb1'] }),
    ]))
    const ctx = buildCtx(ds, [{ id: 'sb1', shotNumber: 1, status: 'pending', videoPath: null }])

    const [summary] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.data?.started).toBe(true)
    await flush()

    expect(segmentationMock.recompute).not.toHaveBeenCalled()
    expect(segmentSvcMock.generateForSegment).toHaveBeenCalledTimes(1)
    expect(segmentSvcMock.generateForSegment.mock.calls[0][0])
      .toEqual({ segmentId: 'segP', providerId: 'pc1', modelId: 'm1' })
  })

  it('generating 段的分镜计入 live 归属 → 不误判孤儿触发 recompute', async () => {
    segmentationMock.preview.mockResolvedValue(previewOf([
      segItem('segG', { status: 'generating', storyboardIds: ['sbG'] }),
      segItem('segP', { seq: 2, storyboardIds: ['sb1'] }),
    ]))
    const ctx = buildCtx(ds, [
      { id: 'sbG', shotNumber: 1, status: 'generating', videoPath: null },
      { id: 'sb1', shotNumber: 2, status: 'pending', videoPath: null },
    ])

    const [summary] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.data?.started).toBe(true)
    await flush()

    expect(segmentationMock.recompute).not.toHaveBeenCalled()
    expect(segmentSvcMock.generateForSegment).toHaveBeenCalledTimes(1)
    expect(segmentSvcMock.generateForSegment.mock.calls[0][0])
      .toEqual({ segmentId: 'segP', providerId: 'pc1', modelId: 'm1' })
  })
})

describe('executeGenerateSegmentVideo · 批量分页与 started 语义', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildSegDb()
    segmentSvcMock.generateForSegment.mockReset()
    segmentationMock.preview.mockReset()
    segmentationMock.recompute.mockReset()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('6 个缺视频片段 → 只启动 4 个（VIDEO_BATCH_LIMIT），立即返回 started 并带续跑回执', async () => {
    const segs = ['seg1', 'seg2', 'seg3', 'seg4', 'seg5', 'seg6'].map((id, i) =>
      segItem(id, { seq: i + 1, storyboardIds: [`sb${i + 1}`] }))
    segmentationMock.preview.mockResolvedValue(previewOf(segs))
    const deferreds: Array<ReturnType<typeof deferred<any>>> = []
    segmentSvcMock.generateForSegment.mockImplementation(() => {
      const d = deferred<any>()
      deferreds.push(d)
      return d.promise
    })
    const ctx = buildCtx(ds, segs.map((_, i) => ({ id: `sb${i + 1}`, shotNumber: i + 1, status: 'pending', videoPath: null })))

    // started 语义：产物未落地（deferred 未 resolve）动作已返回
    const [summary] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.data).toMatchObject({ started: true, batch: 4, total: 6 })
    expect(summary.message).toContain('已启动 4/6 个片段视频')
    expect(summary.message).toContain('剩余 2 个未生成（本轮上限 4，再次调用继续）')
    expect(batchDoneMessages(ctx).some((m) => m.includes('批次完成'))).toBe(false)

    // 逐段放行：每 resolve 一段才启动下一段，全程只碰前 4 个片段
    for (let i = 0; i < 4; i++) {
      expect(deferreds.length).toBe(i + 1)
      deferreds[i].resolve(SEGMENT_RESULT)
      await flush()
    }
    expect(segmentSvcMock.generateForSegment).toHaveBeenCalledTimes(4)
    const calledIds = segmentSvcMock.generateForSegment.mock.calls.map((c: any[]) => c[0].segmentId)
    expect(calledIds).toEqual(['seg1', 'seg2', 'seg3', 'seg4'])
    expect(batchDoneMessages(ctx).some((m) => m.includes('后台片段视频批次完成：成功 4/4'))).toBe(true)
  })

  it('在途片段（inFlight）不重复启动：批次进行中再次调用返回"无需启动"', async () => {
    segmentationMock.preview.mockResolvedValue(previewOf([
      segItem('seg1', { storyboardIds: ['sb1'] }),
      segItem('seg2', { seq: 2, storyboardIds: ['sb2'] }),
    ]))
    const deferreds: Array<ReturnType<typeof deferred<any>>> = []
    segmentSvcMock.generateForSegment.mockImplementation(() => {
      const d = deferred<any>()
      deferreds.push(d)
      return d.promise
    })
    const ctx = buildCtx(ds, [
      { id: 'sb1', shotNumber: 1, status: 'pending', videoPath: null },
      { id: 'sb2', shotNumber: 2, status: 'pending', videoPath: null },
    ])

    const [first] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(first.data).toMatchObject({ started: true, batch: 2, total: 2 })

    const [second] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(second.status).toBe('ok')
    expect(second.message).toContain('无需启动')
    expect(segmentSvcMock.generateForSegment).toHaveBeenCalledTimes(1) // 仅第一段的调用（第二段等首段落地）

    for (const d of deferreds) { d.resolve(SEGMENT_RESULT); await flush() }
    await flush()
  })

  it('批次在途时 ctx.signal 中止：步边界停启、未开始项 inFlight 解除、回执带中止说明', async () => {
    segmentationMock.preview.mockResolvedValue(previewOf([
      segItem('seg1', { storyboardIds: ['sb1'] }),
      segItem('seg2', { seq: 2, storyboardIds: ['sb2'] }),
      segItem('seg3', { seq: 3, storyboardIds: ['sb3'] }),
    ]))
    const deferreds: Array<ReturnType<typeof deferred<any>>> = []
    segmentSvcMock.generateForSegment.mockImplementation(() => {
      const d = deferred<any>()
      deferreds.push(d)
      return d.promise
    })
    const ctx = buildCtx(ds, [
      { id: 'sb1', shotNumber: 1, status: 'pending', videoPath: null },
      { id: 'sb2', shotNumber: 2, status: 'pending', videoPath: null },
      { id: 'sb3', shotNumber: 3, status: 'pending', videoPath: null },
    ])
    ctx.signal = { aborted: false }

    const [first] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(first.data).toMatchObject({ started: true, batch: 3, total: 3 })
    expect(segmentSvcMock.generateForSegment).toHaveBeenCalledTimes(1) // 串行：停在 seg1

    // 首段在途时用户取消/超时 → 首段无法打断，后续不再启动
    ctx.signal.aborted = true
    deferreds[0].resolve(SEGMENT_RESULT)
    await flush()
    await flush()

    expect(segmentSvcMock.generateForSegment).toHaveBeenCalledTimes(1) // seg2/seg3 未启动
    const doneMsg = batchDoneMessages(ctx).find((m) => m.includes('批次完成'))
    expect(doneMsg).toContain('后台片段视频批次完成：成功 1/3')
    expect(doneMsg).toContain('执行被中止（取消/超时），未开始的项不再启动')

    // 未开始项的在途登记已解除：再次调用（signal 复位）可正常续跑全部缺视频片段
    ctx.signal.aborted = false
    segmentSvcMock.generateForSegment.mockResolvedValue(SEGMENT_RESULT)
    const [second] = await executeEpActions(ctx, [BATCH_ACTION], STATE_WITH_STORYBOARDS)
    expect(second.data).toMatchObject({ started: true, batch: 3, total: 3 })
    await flush()
  })
})

describe('executeGenerateSegmentVideo · 显式 storyboardId 单镜路径不变', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildSegDb()
    videoSvcMock.generateForStoryboard.mockReset()
    videoSvcMock.generateForStoryboard.mockResolvedValue({
      match: { mode: 'text2video' },
      output: { durationSec: 4 },
    })
    segmentSvcMock.generateForSegment.mockReset()
    segmentationMock.preview.mockReset()
    segmentationMock.recompute.mockReset()
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('指定 storyboardId → 仍走 VideoSegmentService.generateForStoryboard，不碰片段路径', async () => {
    const ctx = buildCtx(ds, [{ id: 'sb1', shotNumber: 1, status: 'pending', videoPath: null }])
    const action = {
      type: 'generate_segment_video',
      params: { storyboardId: 'sb1', providerConfigId: 'pc1', modelId: 'm1' },
    } as any

    const [summary] = await executeEpActions(ctx, [action], STATE_WITH_STORYBOARDS)
    expect(summary.status).toBe('ok')
    expect(summary.message).toContain('分镜视频已生成')
    expect(videoSvcMock.generateForStoryboard).toHaveBeenCalledTimes(1)
    expect(videoSvcMock.generateForStoryboard.mock.calls[0][0])
      .toEqual({ storyboardId: 'sb1', providerId: 'pc1', modelId: 'm1' })
    expect(segmentSvcMock.generateForSegment).not.toHaveBeenCalled()
    expect(segmentationMock.preview).not.toHaveBeenCalled()
    expect(segmentationMock.recompute).not.toHaveBeenCalled()
  })
})
