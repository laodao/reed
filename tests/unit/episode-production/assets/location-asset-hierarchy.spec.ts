/**
 * LocationAssetService · 地点层级（2026-09-21 B：parent_id 推断与挂载）
 * @module tests/unit/episode-production/assets/location-asset-hierarchy
 *
 * 覆盖：
 * - createStandalone：名字前缀自动推断父级（"雪麓山庄闺房" → "雪麓山庄"）；
 *   显式 parentId 入参覆盖推断；显式 null 关闭推断；无前缀时 parentId=null
 * - createLinkedLw：同样的推断规则
 * - updateExtra parentId：挂载 / 解除 / 防自挂 / 防环
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { LocationAssetService } from '@core/platform/episode-production/assets/services/location-asset.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [VideoProjectEntity, LocationBindingEntity, LwLocationEntity, AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

describe('LocationAssetService · 地点层级', () => {
  let ds: DataSource
  let svc: LocationAssetService

  beforeEach(async () => {
    ds = await buildDb()
    svc = new LocationAssetService(ds, new AssetImageService(ds))
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('createStandalone：前缀自动推断父级', async () => {
    const parent = await svc.createStandalone({ projectId: 'p1', name: '雪麓山庄' })
    const child = await svc.createStandalone({ projectId: 'p1', name: '雪麓山庄闺房' })
    expect(parent.parentId).toBeNull()
    expect(child.parentId).toBe(parent.id)
  })

  it('createStandalone：显式 parentId 覆盖推断；显式 null 关闭推断', async () => {
    const a = await svc.createStandalone({ projectId: 'p1', name: '雪麓山庄' })
    const b = await svc.createStandalone({ projectId: 'p1', name: '白鹿城' })
    // 显式指定父级为白鹿城（覆盖自动推断的雪麓山庄）
    const c1 = await svc.createStandalone({
      projectId: 'p1',
      name: '雪麓山庄演武场',
      parentId: b.id,
    })
    expect(c1.parentId).toBe(b.id)
    // 显式 null → 不推断，保持根地点
    const c2 = await svc.createStandalone({
      projectId: 'p1',
      name: '雪麓山庄书房',
      parentId: null,
    })
    expect(c2.parentId).toBeNull()
    expect(a.parentId).toBeNull()
  })

  it('createLinkedLw：同样按名字前缀推断父级', async () => {
    const parent = await svc.createStandalone({ projectId: 'p1', name: '雪麓山庄' })
    await ds.getRepository(LwLocationEntity).save({
      id: 'lwl1',
      projectId: 'lwp1',
      name: '雪麓山庄厨房',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    const child = await svc.createLinkedLw({
      projectId: 'p1',
      lwLocationId: 'lwl1',
      name: '雪麓山庄厨房',
    })
    expect(child.parentId).toBe(parent.id)
  })

  it('updateExtra parentId：挂载 / 解除 / 防自挂 / 防环', async () => {
    const root = await svc.createStandalone({ projectId: 'p1', name: '雪麓山庄' })
    const mid = await svc.createStandalone({
      projectId: 'p1',
      name: '东院',
      parentId: null,
    })
    const leaf = await svc.createStandalone({ projectId: 'p1', name: '东院厢房', parentId: null })

    // 挂载：东院 → 雪麓山庄；厢房 → 东院
    await svc.updateExtra(mid.id, { parentId: root.id })
    await svc.updateExtra(leaf.id, { parentId: mid.id })
    expect((await svc.getById(mid.id))?.parentId).toBe(root.id)
    expect((await svc.getById(leaf.id))?.parentId).toBe(mid.id)

    // 防自挂
    await expect(svc.updateExtra(root.id, { parentId: root.id })).rejects.toThrow(/自己/)
    // 防环：雪麓山庄 → 厢房（厢房的祖先链含雪麓山庄）
    await expect(svc.updateExtra(root.id, { parentId: leaf.id })).rejects.toThrow(/环/)
    // 父级不存在
    await expect(svc.updateExtra(root.id, { parentId: 'lb_missing' })).rejects.toThrow(/不存在/)

    // 解除挂载
    await svc.updateExtra(mid.id, { parentId: null })
    expect((await svc.getById(mid.id))?.parentId).toBeNull()
  })
})
