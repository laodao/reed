/**
 * LW 批次 6：lw-entity-state + lw-chapter-state-summary
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwEntityStateRepository } from '@core/database/repositories/lw-entity-state.repository'
import { LwChapterStateSummaryRepository } from '@core/database/repositories/lw-chapter-state-summary.repository'

describe.each(getTestDialects())('LW EntityState [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwEntityStateRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwEntityStateRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById', async () => {
    const s = await repo.create({
      projectId: 'p1',
      entityType: 'character',
      entityId: 'c1',
      entityName: 'A',
      chapterNumber: 1,
      stateSummary: 'ok',
      keyChanges: ['k1'],
    } as any)
    expect(s.id).toBeDefined()
    const got = await repo.getById(s.id)
    expect(got!.keyChanges).toEqual(['k1'])
  })

  it('getEntityStateAtChapter 取 chapter <= n 中最近的', async () => {
    await repo.create({
      projectId: 'p1', entityType: 'character', entityId: 'c1',
      entityName: 'A', chapterNumber: 1, stateSummary: 's1', keyChanges: [],
    } as any)
    await repo.create({
      projectId: 'p1', entityType: 'character', entityId: 'c1',
      entityName: 'A', chapterNumber: 3, stateSummary: 's3', keyChanges: [],
    } as any)
    await repo.create({
      projectId: 'p1', entityType: 'character', entityId: 'c1',
      entityName: 'A', chapterNumber: 7, stateSummary: 's7', keyChanges: [],
    } as any)
    const got = await repo.getEntityStateAtChapter('p1', 'character', 'c1', 5)
    expect(got!.stateSummary).toBe('s3')
  })

  it('upsert 重复 (project+type+id+chapter) 不新建', async () => {
    await repo.upsert({
      projectId: 'p1', entityType: 'character', entityId: 'c1',
      entityName: 'A', chapterNumber: 1, stateSummary: 'v1', keyChanges: [],
    } as any)
    await repo.upsert({
      projectId: 'p1', entityType: 'character', entityId: 'c1',
      entityName: 'A', chapterNumber: 1, stateSummary: 'v2', keyChanges: ['x'],
    } as any)
    const list = await repo.getByProjectId('p1')
    expect(list).toHaveLength(1)
    expect(list[0].stateSummary).toBe('v2')
    expect(list[0].keyChanges).toEqual(['x'])
  })

  it('getLatestEntityState 返回最新章节快照', async () => {
    await repo.create({
      projectId: 'p1', entityType: 'character', entityId: 'c1',
      entityName: 'A', chapterNumber: 1, stateSummary: 'v1', keyChanges: [],
    } as any)
    await repo.create({
      projectId: 'p1', entityType: 'character', entityId: 'c1',
      entityName: 'A', chapterNumber: 5, stateSummary: 'v5', keyChanges: [],
    } as any)
    const latest = await repo.getLatestEntityState('p1', 'character', 'c1')
    expect(latest!.stateSummary).toBe('v5')
  })

  it('batchCreate 走 upsert + 事务', async () => {
    const list = await repo.batchCreate([
      { projectId: 'p1', entityType: 'character', entityId: 'c1', entityName: 'A',
        chapterNumber: 1, stateSummary: 's1', keyChanges: [] } as any,
      { projectId: 'p1', entityType: 'location', entityId: 'l1', entityName: 'L',
        chapterNumber: 1, stateSummary: 'sl', keyChanges: [] } as any,
    ])
    expect(list).toHaveLength(2)
  })

  it('getSnapshotStats: byEntityType + byChapter', async () => {
    await repo.create({
      projectId: 'p1', entityType: 'character', entityId: 'c1', entityName: 'A',
      chapterNumber: 1, stateSummary: 's', keyChanges: [],
    } as any)
    await repo.create({
      projectId: 'p1', entityType: 'item', entityId: 'i1', entityName: 'I',
      chapterNumber: 2, stateSummary: 's', keyChanges: [],
    } as any)
    const stats = await repo.getSnapshotStats('p1')
    expect(stats.total).toBe(2)
    expect(stats.byEntityType.character).toBe(1)
    expect(stats.byEntityType.item).toBe(1)
    expect(stats.byChapter[1]).toBe(1)
    expect(stats.byChapter[2]).toBe(1)
  })

  it('deleteByChapterNumber + deleteByProjectId', async () => {
    await repo.create({
      projectId: 'p1', entityType: 'character', entityId: 'c1', entityName: 'A',
      chapterNumber: 1, stateSummary: 's', keyChanges: [],
    } as any)
    await repo.create({
      projectId: 'p1', entityType: 'character', entityId: 'c2', entityName: 'B',
      chapterNumber: 2, stateSummary: 's', keyChanges: [],
    } as any)
    expect(await repo.deleteByChapterNumber('p1', 1)).toBe(1)
    expect((await repo.getByProjectId('p1'))).toHaveLength(1)
    expect(await repo.deleteByProjectId('p1')).toBe(1)
  })
})

describe.each(getTestDialects())('LW ChapterStateSummary [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwChapterStateSummaryRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwChapterStateSummaryRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getByOutlineId', async () => {
    const s = await repo.create({
      projectId: 'p1', outlineId: 'o1', chapterNumber: 1,
      storyTime: '某日早上', currentLocation: '城A',
      characterStates: 'cs', pendingEvents: 'pe', keyChanges: 'kc',
    } as any)
    const got = await repo.getByOutlineId('o1')
    expect(got!.id).toBe(s.id)
  })

  it('upsert 同 outlineId 更新而非新建', async () => {
    await repo.upsert({
      projectId: 'p1', outlineId: 'o1', chapterNumber: 1,
      storyTime: 't1', currentLocation: 'A', characterStates: '',
      pendingEvents: '', keyChanges: '',
    } as any)
    await repo.upsert({
      projectId: 'p1', outlineId: 'o1', chapterNumber: 2,
      storyTime: 't2', currentLocation: 'B', characterStates: '',
      pendingEvents: '', keyChanges: '',
    } as any)
    const all = await repo.getByProjectId('p1')
    expect(all).toHaveLength(1)
    expect(all[0].chapterNumber).toBe(2)
    expect(all[0].storyTime).toBe('t2')
  })

  it('getLatest / getLatestBeforeChapter', async () => {
    await repo.create({
      projectId: 'p1', outlineId: 'o1', chapterNumber: 1,
      storyTime: 't', currentLocation: '', characterStates: '',
      pendingEvents: '', keyChanges: '',
    } as any)
    await repo.create({
      projectId: 'p1', outlineId: 'o2', chapterNumber: 5,
      storyTime: 't', currentLocation: '', characterStates: '',
      pendingEvents: '', keyChanges: '',
    } as any)
    expect((await repo.getLatest('p1'))!.chapterNumber).toBe(5)
    expect((await repo.getLatestBeforeChapter('p1', 5))!.chapterNumber).toBe(1)
  })

  it('deleteByOutlineId + deleteByProjectId', async () => {
    await repo.create({
      projectId: 'p1', outlineId: 'o1', chapterNumber: 1,
      storyTime: 't', currentLocation: '', characterStates: '',
      pendingEvents: '', keyChanges: '',
    } as any)
    await repo.create({
      projectId: 'p1', outlineId: 'o2', chapterNumber: 2,
      storyTime: 't', currentLocation: '', characterStates: '',
      pendingEvents: '', keyChanges: '',
    } as any)
    expect(await repo.deleteByOutlineId('o1')).toBe(true)
    expect((await repo.getByProjectId('p1'))).toHaveLength(1)
    expect(await repo.deleteByProjectId('p1')).toBe(1)
  })
})
