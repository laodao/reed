/**
 * 步骤0 阶段2：LwVectorIndexRepository 测试
 * @description 双方言（sqlite + postgres）验证 CRUD / 各删除方式 / getContentHashes / countByProject
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwVectorIndexRepository } from '@core/database/repositories/lw-vector-index.repository'

describe.each(getTestDialects())('LwVectorIndexRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwVectorIndexRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwVectorIndexRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getByEntity', async () => {
    const r = await repo.create({
      projectId: 'p1',
      entityType: 'character',
      entityId: 'c1',
      chunkId: 'chunk_1',
      contentHash: 'hash_a',
      preview: '林锋（主角）',
    })
    expect(r.id).toBeTruthy()
    expect(r.chunkId).toBe('chunk_1')
    expect(r.entityType).toBe('character')

    const list = await repo.getByEntity('p1', 'character', 'c1')
    expect(list).toHaveLength(1)
    expect(list[0].contentHash).toBe('hash_a')
  })

  it('一个实体可有多 chunk（章节切片）', async () => {
    await repo.batchCreate([
      { projectId: 'p1', entityType: 'chapter', entityId: 'o1', chapterNumber: 3, chunkId: 'ch_1', preview: '片段1' },
      { projectId: 'p1', entityType: 'chapter', entityId: 'o1', chapterNumber: 3, chunkId: 'ch_2', preview: '片段2' },
      { projectId: 'p1', entityType: 'chapter', entityId: 'o1', chapterNumber: 3, chunkId: 'ch_3', preview: '片段3' },
    ])
    const list = await repo.getByEntity('p1', 'chapter', 'o1')
    expect(list).toHaveLength(3)
  })

  it('getByChapter 按章节号过滤', async () => {
    await repo.batchCreate([
      { projectId: 'p1', entityType: 'chapter', entityId: 'o1', chapterNumber: 1, chunkId: 'c1' },
      { projectId: 'p1', entityType: 'chapter', entityId: 'o2', chapterNumber: 2, chunkId: 'c2' },
      { projectId: 'p1', entityType: 'chapter', entityId: 'o3', chapterNumber: 2, chunkId: 'c3' },
    ])
    const list = await repo.getByChapter('p1', 2)
    expect(list).toHaveLength(2)
    expect(list.map(r => r.chunkId).sort()).toEqual(['c2', 'c3'])
  })

  it('deleteByChunkIds 批量删', async () => {
    await repo.batchCreate([
      { projectId: 'p1', entityType: 'character', entityId: 'c1', chunkId: 'ck1' },
      { projectId: 'p1', entityType: 'character', entityId: 'c2', chunkId: 'ck2' },
      { projectId: 'p1', entityType: 'character', entityId: 'c3', chunkId: 'ck3' },
    ])
    const n = await repo.deleteByChunkIds(['ck1', 'ck2'])
    expect(n).toBe(2)
    expect(await repo.getByProject('p1')).toHaveLength(1)
  })

  it('deleteByChunkIds 空数组返回 0', async () => {
    expect(await repo.deleteByChunkIds([])).toBe(0)
  })

  it('deleteByEntity 删某实体的全部 chunk', async () => {
    await repo.batchCreate([
      { projectId: 'p1', entityType: 'chapter', entityId: 'o1', chapterNumber: 1, chunkId: 'a' },
      { projectId: 'p1', entityType: 'chapter', entityId: 'o1', chapterNumber: 1, chunkId: 'b' },
      { projectId: 'p1', entityType: 'chapter', entityId: 'o2', chapterNumber: 2, chunkId: 'c' },
    ])
    const n = await repo.deleteByEntity('p1', 'chapter', 'o1')
    expect(n).toBe(2)
    expect(await repo.getByEntity('p1', 'chapter', 'o1')).toHaveLength(0)
    expect(await repo.getByEntity('p1', 'chapter', 'o2')).toHaveLength(1)
  })

  it('deleteByChapter 按章节删', async () => {
    await repo.batchCreate([
      { projectId: 'p1', entityType: 'chapter', entityId: 'o1', chapterNumber: 3, chunkId: 'a' },
      { projectId: 'p1', entityType: 'chapter', entityId: 'o2', chapterNumber: 3, chunkId: 'b' },
      { projectId: 'p1', entityType: 'chapter', entityId: 'o3', chapterNumber: 4, chunkId: 'c' },
    ])
    const n = await repo.deleteByChapter('p1', 3)
    expect(n).toBe(2)
    expect(await repo.getByChapter('p1', 3)).toHaveLength(0)
    expect(await repo.getByChapter('p1', 4)).toHaveLength(1)
  })

  it('deleteByProject 删整个项目', async () => {
    await repo.batchCreate([
      { projectId: 'p1', entityType: 'character', entityId: 'c1', chunkId: 'a' },
      { projectId: 'p2', entityType: 'character', entityId: 'c2', chunkId: 'b' },
    ])
    const n = await repo.deleteByProject('p1')
    expect(n).toBe(1)
    expect(await repo.getByProject('p1')).toHaveLength(0)
    expect(await repo.getByProject('p2')).toHaveLength(1)
  })

  it('getContentHashes 返回 Map<chunkId, hash>', async () => {
    await repo.batchCreate([
      { projectId: 'p1', entityType: 'character', entityId: 'c1', chunkId: 'ck1', contentHash: 'h1' },
      { projectId: 'p1', entityType: 'character', entityId: 'c1', chunkId: 'ck2', contentHash: 'h2' },
      { projectId: 'p1', entityType: 'character', entityId: 'c1', chunkId: 'ck3', contentHash: null },
    ])
    const map = await repo.getContentHashes('p1', 'character', 'c1')
    expect(map.size).toBe(2) // null hash 不进 map
    expect(map.get('ck1')).toBe('h1')
    expect(map.get('ck2')).toBe('h2')
    expect(map.has('ck3')).toBe(false)
  })

  it('getChunkIdsByEntity', async () => {
    await repo.batchCreate([
      { projectId: 'p1', entityType: 'chapter', entityId: 'o1', chapterNumber: 1, chunkId: 'x' },
      { projectId: 'p1', entityType: 'chapter', entityId: 'o1', chapterNumber: 1, chunkId: 'y' },
    ])
    const ids = await repo.getChunkIdsByEntity('p1', 'chapter', 'o1')
    expect(ids.sort()).toEqual(['x', 'y'])
  })

  it('countByProject 统计', async () => {
    await repo.batchCreate([
      { projectId: 'p1', entityType: 'character', entityId: 'c1', chunkId: 'a' },
      { projectId: 'p1', entityType: 'character', entityId: 'c2', chunkId: 'b' },
      { projectId: 'p2', entityType: 'character', entityId: 'c3', chunkId: 'c' },
    ])
    expect(await repo.countByProject('p1')).toBe(2)
    expect(await repo.countByProject('p2')).toBe(1)
    expect(await repo.countByProject('p3')).toBe(0)
  })

  it('项目隔离：不同 projectId 互不干扰', async () => {
    await repo.create({ projectId: 'p1', entityType: 'character', entityId: 'c1', chunkId: 'ck1' })
    await repo.create({ projectId: 'p2', entityType: 'character', entityId: 'c1', chunkId: 'ck2' })
    const p1 = await repo.getByProject('p1')
    const p2 = await repo.getByProject('p2')
    expect(p1).toHaveLength(1)
    expect(p1[0].chunkId).toBe('ck1')
    expect(p2).toHaveLength(1)
    expect(p2[0].chunkId).toBe('ck2')
  })

  it('UNIQUE(chunkId)：重复 chunkId 抛错', async () => {
    await repo.create({ projectId: 'p1', entityType: 'character', entityId: 'c1', chunkId: 'dup' })
    await expect(
      repo.create({ projectId: 'p1', entityType: 'character', entityId: 'c2', chunkId: 'dup' }),
    ).rejects.toThrow()
  })
})
