/**
 * UploadedEntityService 去重归一单测（2026-09-21）
 * @module tests/unit/episode-production/auto-binding/uploaded-entity
 *
 * 验证 createAndBindUploadedEntities 的跨集去重：
 *   1. 归一化 key（全角空格差异）命中已有 binding → 跳过；
 *   2. 地点前缀归一兜底（"雪麓山庄书房" 复用已有 "书房"，靠 service 内 find-or-create）；
 *   3. 真正的新名字正常创建。
 *
 * getCoreDatabaseManager 整体 mock，底层用真实 sqlite 内存库。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'

let mockDb: Record<string, unknown>

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => mockDb,
}))

import { UploadedEntityService } from '@core/platform/episode-production/auto-binding/uploaded-entity.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [VideoProjectEntity, CharacterBindingEntity, LocationBindingEntity, ItemBindingEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('UploadedEntityService.createAndBindUploadedEntities（归一化去重）', () => {
  let ds: DataSource

  beforeEach(async () => {
    ds = await buildDb()
    mockDb = {
      dataSource: ds,
      characterBindings: {
        getByProjectId: (projectId: string) =>
          ds.getRepository(CharacterBindingEntity).find({ where: { projectId } }),
      },
      locationBindings: {
        getByProjectId: (projectId: string) =>
          ds.getRepository(LocationBindingEntity).find({ where: { projectId } }),
      },
      itemBindings: {
        getByProjectId: (projectId: string) =>
          ds.getRepository(ItemBindingEntity).find({ where: { projectId } }),
      },
    }
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('归一化 key 命中已有 binding → 跳过；新名字正常创建', async () => {
    await ds.getRepository(CharacterBindingEntity).save({
      id: 'cb_exist',
      projectId: 'p1',
      sourceType: 'standalone',
      standaloneName: '沈云萝',
      voiceConfig: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    await UploadedEntityService.createAndBindUploadedEntities(
      'p1',
      'ep1',
      [
        { name: '沈　云萝' }, // 全角空格差异 → 跳过
        { name: '秦越' }, // 新角色 → 创建
      ] as any,
      [],
      [],
    )

    const all = await ds.getRepository(CharacterBindingEntity).find({ where: { projectId: 'p1' } })
    expect(all).toHaveLength(2)
    expect(all.map((b) => b.standaloneName).sort()).toEqual(['沈云萝', '秦越'])
  })

  it('地点前缀归一兜底："雪麓山庄书房" 复用已有 "书房"，不重复落库', async () => {
    const repo = ds.getRepository(LocationBindingEntity)
    await repo.save({
      id: 'lb_manor',
      projectId: 'p1',
      locationName: '雪麓山庄',
      standaloneName: '雪麓山庄',
      sourceType: 'standalone',
      generateImages: 0,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    } as any)
    await repo.save({
      id: 'lb_study',
      projectId: 'p1',
      locationName: '书房',
      standaloneName: '书房',
      sourceType: 'standalone',
      generateImages: 0,
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-02'),
    } as any)

    await UploadedEntityService.createAndBindUploadedEntities(
      'p1',
      'ep1',
      [],
      [{ name: '雪麓山庄书房' }] as any,
      [],
    )

    const all = await repo.find({ where: { projectId: 'p1' } })
    expect(all).toHaveLength(2) // 没有新增第三条
  })

  it('同批次内归一化去重（同一批两个写法只建一条）', async () => {
    await UploadedEntityService.createAndBindUploadedEntities(
      'p1',
      'ep1',
      [],
      [],
      [{ name: '青龙剑' }, { name: '《青龙剑》' }] as any,
    )

    const all = await ds.getRepository(ItemBindingEntity).find({ where: { projectId: 'p1' } })
    expect(all).toHaveLength(1)
  })
})
