/**
 * LW 批次 5：lw-memory + lw-memory-entity
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwMemoryRepository } from '@core/database/repositories/lw-memory.repository'
import { LwMemoryEntityRepository } from '@core/database/repositories/lw-memory-entity.repository'

describe.each(getTestDialects())('LW Memory [%s]', dialect => {
  let tds: TestDataSource
  let memories: LwMemoryRepository
  let memoryEntities: LwMemoryEntityRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    memories = new LwMemoryRepository(tds.ds)
    memoryEntities = new LwMemoryEntityRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ Memory ============

  it('create + getById', async () => {
    const m = await memories.create({
      projectId: 'p1',
      memoryType: 'character_event',
      title: 'T',
      description: 'D',
      chapterNumber: 5,
      importance: 'critical',
      involvedEntities: [
        { type: 'character', id: 'c1', name: 'CA' },
      ],
    } as any)
    expect(m.title).toBe('T')
    expect(m.isActive).toBe(true)
    const got = await memories.getById(m.id)
    expect(got!.id).toBe(m.id)
    expect(got!.involvedEntities).toHaveLength(1)
  })

  it('getByProjectId 排序：chapter_number ASC, created_at ASC', async () => {
    await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'A',
      description: '', chapterNumber: 2, importance: 'normal',
      involvedEntities: [],
    } as any)
    await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'B',
      description: '', chapterNumber: 1, importance: 'normal',
      involvedEntities: [],
    } as any)
    const list = await memories.getByProjectId('p1')
    expect(list.map(m => m.title)).toEqual(['B', 'A'])
  })

  it('getMemoriesBeforeChapter 仅 active + chapter < n', async () => {
    const m1 = await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'old',
      description: '', chapterNumber: 1, importance: 'normal',
      involvedEntities: [],
    } as any)
    await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'now',
      description: '', chapterNumber: 5, importance: 'normal',
      involvedEntities: [],
    } as any)
    const m3 = await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'old-inactive',
      description: '', chapterNumber: 1, importance: 'normal',
      involvedEntities: [],
    } as any)
    await memories.toggleActive(m3.id) // m3 -> inactive

    const list = await memories.getMemoriesBeforeChapter('p1', 5)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(m1.id)
  })

  it('update + 实体关联表同步', async () => {
    const m = await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'T',
      description: '', chapterNumber: 1, importance: 'normal',
      involvedEntities: [{ type: 'character', id: 'c1', name: 'A' }],
    } as any)
    expect(await memories.getEntities(m.id)).toHaveLength(1)

    await memories.update(m.id, {
      involvedEntities: [
        { type: 'character', id: 'c1', name: 'A' },
        { type: 'location', id: 'l1', name: 'L' },
      ],
    } as any)
    const ents = await memories.getEntities(m.id)
    expect(ents).toHaveLength(2)
  })

  it('toggleActive 切换状态', async () => {
    const m = await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'T',
      description: '', chapterNumber: 1, importance: 'normal',
      involvedEntities: [],
    } as any)
    expect(m.isActive).toBe(true)
    const after = await memories.toggleActive(m.id)
    expect(after!.isActive).toBe(false)
  })

  it('delete 级联删除关联表', async () => {
    const m = await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'T',
      description: '', chapterNumber: 1, importance: 'normal',
      involvedEntities: [{ type: 'character', id: 'c1', name: 'A' }],
    } as any)
    await memories.delete(m.id)
    expect(await memories.getById(m.id)).toBeNull()
    expect(await memories.getEntities(m.id)).toHaveLength(0)
  })

  it('getMemoriesByEntity 通过关联表反查', async () => {
    const m1 = await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'M1',
      description: '', chapterNumber: 1, importance: 'normal',
      involvedEntities: [{ type: 'character', id: 'c1', name: 'A' }],
    } as any)
    await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'M2',
      description: '', chapterNumber: 2, importance: 'normal',
      involvedEntities: [{ type: 'location', id: 'l1', name: 'L' }],
    } as any)
    const list = await memories.getMemoriesByEntity('p1', 'character', 'c1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(m1.id)
  })

  it('deleteByProjectId 级联清理关联表', async () => {
    await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'M1',
      description: '', chapterNumber: 1, importance: 'normal',
      involvedEntities: [{ type: 'character', id: 'c1', name: 'A' }],
    } as any)
    const n = await memories.deleteByProjectId('p1')
    expect(n).toBe(1)
    const ms = await memories.getByProjectId('p1')
    expect(ms).toHaveLength(0)
  })

  it('getMemoryStats 按 type/importance 计数', async () => {
    await memories.create({
      projectId: 'p1', memoryType: 'character_event', title: 'M1',
      description: '', chapterNumber: 1, importance: 'critical',
      involvedEntities: [],
    } as any)
    await memories.create({
      projectId: 'p1', memoryType: 'general', title: 'M2',
      description: '', chapterNumber: 2, importance: 'normal',
      involvedEntities: [],
    } as any)
    const stats = await memories.getMemoryStats('p1')
    expect(stats.total).toBe(2)
    expect(stats.active).toBe(2)
    expect(stats.byType.character_event).toBe(1)
    expect(stats.byImportance.critical).toBe(1)
  })

  // ============ MemoryEntity (relation table) ============

  it('MemoryEntity: add/getEntitiesByMemoryIds 批量', async () => {
    await memoryEntities.add('m1', { type: 'character', id: 'c1', name: 'A' })
    await memoryEntities.add('m1', { type: 'location', id: 'l1', name: 'L' })
    await memoryEntities.add('m2', { type: 'character', id: 'c2', name: 'B' })
    const map = await memoryEntities.getEntitiesByMemoryIds(['m1', 'm2', 'm3'])
    expect(map.get('m1')).toHaveLength(2)
    expect(map.get('m2')).toHaveLength(1)
    expect(map.get('m3')).toHaveLength(0)
  })

  it('MemoryEntity: add 幂等（UNIQUE 触发去重）', async () => {
    await memoryEntities.add('m1', { type: 'character', id: 'c1', name: 'A' })
    await memoryEntities.add('m1', { type: 'character', id: 'c1', name: 'A' })
    expect(await memoryEntities.getEntitiesByMemoryId('m1')).toHaveLength(1)
  })

  it('MemoryEntity: replaceAll 整组替换', async () => {
    await memoryEntities.batchAdd('m1', [
      { type: 'character', id: 'c1', name: 'A' },
      { type: 'character', id: 'c2', name: 'B' },
    ])
    await memoryEntities.replaceAll('m1', [
      { type: 'location', id: 'l1', name: 'L' },
    ])
    const list = await memoryEntities.getEntitiesByMemoryId('m1')
    expect(list).toHaveLength(1)
    expect(list[0].type).toBe('location')
  })
})
