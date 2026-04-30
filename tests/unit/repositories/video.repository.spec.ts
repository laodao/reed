import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { VideoProjectRepository } from '@core/database/repositories/video-project.repository'
import { VideoEpisodeRepository } from '@core/database/repositories/video-episode.repository'

describe.each(getTestDialects())('Video Project + Episode [%s]', dialect => {
  let tds: TestDataSource
  let projects: VideoProjectRepository
  let episodes: VideoEpisodeRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    projects = new VideoProjectRepository(tds.ds)
    episodes = new VideoEpisodeRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ VideoProject ============

  it('Project: create + getById + epoch ms 时间', async () => {
    const p = await projects.create({
      name: 'P1',
      config: { resolution: '1080p' } as any,
    })
    expect(p.status).toBe('draft')
    expect(typeof p.createdAt).toBe('number')
    expect(p.config).toEqual({ resolution: '1080p' })

    const got = await projects.getById(p.id)
    expect(got!.name).toBe('P1')
  })

  it('Project: getByLongWritingProjectId 过滤', async () => {
    await projects.create({
      name: 'A', longWritingProjectId: 'lw1', config: {} as any,
    })
    await projects.create({
      name: 'B', longWritingProjectId: 'lw1', config: {} as any,
    })
    await projects.create({
      name: 'C', longWritingProjectId: 'lw2', config: {} as any,
    })
    expect((await projects.getByLongWritingProjectId('lw1')).length).toBe(2)
  })

  it('Project: update 部分字段', async () => {
    const p = await projects.create({ name: 'old', config: {} as any })
    const u = await projects.update(p.id, {
      name: 'new',
      status: 'rendering' as any,
      config: { fps: 30 } as any,
    })
    expect(u!.name).toBe('new')
    expect(u!.status).toBe('rendering')
    expect(u!.config).toEqual({ fps: 30 })
  })

  it('Project: delete + exists', async () => {
    const p = await projects.create({ name: 'X', config: {} as any })
    expect(await projects.exists(p.id)).toBe(true)
    expect(await projects.delete(p.id)).toBe(true)
    expect(await projects.exists(p.id)).toBe(false)
  })

  // ============ VideoEpisode ============

  it('Episode: create + getByProjectId（按 episodeNumber 排序）', async () => {
    const p = await projects.create({ name: 'P', config: {} as any })
    await episodes.create({
      projectId: p.id, sourceType: 'outline' as any, outlineId: 'o1',
      episodeNumber: 2, title: 'E2',
    })
    await episodes.create({
      projectId: p.id, sourceType: 'outline' as any, outlineId: 'o2',
      episodeNumber: 1, title: 'E1',
    })

    const list = await episodes.getByProjectId(p.id)
    expect(list.map(e => e.title)).toEqual(['E1', 'E2'])
    expect(list[0].duration).toBe(0)
    expect(list[0].audioTracks).toEqual([])
  })

  it('Episode: createMany 事务批量', async () => {
    const p = await projects.create({ name: 'P', config: {} as any })
    const list = await episodes.createMany([
      { projectId: p.id, sourceType: 'outline' as any, outlineId: 'o1', episodeNumber: 1, title: 'E1' },
      { projectId: p.id, sourceType: 'outline' as any, outlineId: 'o2', episodeNumber: 2, title: 'E2' },
    ])
    expect(list).toHaveLength(2)
    expect(await episodes.countByProjectId(p.id)).toBe(2)
  })

  it('Episode: getByOutlineId 精确查询', async () => {
    const p = await projects.create({ name: 'P', config: {} as any })
    await episodes.create({
      projectId: p.id, sourceType: 'outline' as any, outlineId: 'o-X',
      episodeNumber: 1, title: 'EX',
    })
    const got = await episodes.getByOutlineId(p.id, 'o-X')
    expect(got!.title).toBe('EX')
  })

  it('Episode: update + audioTracks JSON 列', async () => {
    const p = await projects.create({ name: 'P', config: {} as any })
    const e = await episodes.create({
      projectId: p.id, sourceType: 'outline' as any, outlineId: 'o1',
      episodeNumber: 1, title: 'E1',
    })
    await episodes.update(e.id, {
      title: 'E1-new',
      duration: 600,
      audioTracks: [{ id: 't1', path: '/a.mp3' } as any],
    })
    const got = await episodes.getById(e.id)
    expect(got!.title).toBe('E1-new')
    expect(got!.duration).toBe(600)
    expect(got!.audioTracks).toEqual([{ id: 't1', path: '/a.mp3' }])
  })

  it('Episode: 逻辑删除 delete + restore + 查询过滤', async () => {
    const p = await projects.create({ name: 'P', config: {} as any })
    const e = await episodes.create({
      projectId: p.id, sourceType: 'outline' as any, outlineId: 'o1',
      episodeNumber: 1, title: 'E1',
    })
    expect(await episodes.delete(e.id)).toBe(true)
    expect(await episodes.getById(e.id)).toBeNull()
    expect((await episodes.getByProjectId(p.id)).length).toBe(0)
    // count 包含已删除
    expect(await episodes.countByProjectId(p.id)).toBe(1)

    expect(await episodes.restore(e.id)).toBe(true)
    expect(await episodes.getById(e.id)).toBeTruthy()
  })

  it('Episode: deleteByProjectId 批量逻辑删', async () => {
    const p = await projects.create({ name: 'P', config: {} as any })
    await episodes.create({
      projectId: p.id, sourceType: 'outline' as any, outlineId: 'o1',
      episodeNumber: 1, title: 'E1',
    })
    await episodes.create({
      projectId: p.id, sourceType: 'outline' as any, outlineId: 'o2',
      episodeNumber: 2, title: 'E2',
    })
    expect(await episodes.deleteByProjectId(p.id)).toBe(2)
    expect((await episodes.getByProjectId(p.id)).length).toBe(0)
  })

  it('Episode: uploaded 模式（uploadedContent + uploadedCharacters JSON）', async () => {
    const p = await projects.create({ name: 'P', config: {} as any })
    const e = await episodes.create({
      projectId: p.id,
      sourceType: 'uploaded' as any,
      uploadedContent: '小说内容...',
      uploadedCharacters: [{ name: '主角' } as any],
      episodeNumber: 1,
      title: 'E1',
    })
    expect(e.uploadedContent).toBe('小说内容...')
    expect(e.uploadedCharacters).toEqual([{ name: '主角' }])
  })
})
