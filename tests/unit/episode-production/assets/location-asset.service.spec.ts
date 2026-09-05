/**
 * LocationAssetService 单测（P3a Task 5）
 * @module tests/unit/episode-production/assets/location-asset.service
 *
 * 3 个用例覆盖地点资产的核心契约：
 * 1. linked_lw 模式 getEffectiveData：投影 lw_location.name/description + override 覆盖
 * 2. pickBestVariant：spec §3.4 三层降级（精确匹配 → 部分匹配 → 主图兜底）
 * 3. createStandalone + createLinkedLw + updateOverride 完整生命周期
 *
 * 注意：lw_story_locations 与 lw_story_characters 不同，本身就有 description 列，所以
 * linked_lw 模式 description 也会走 override → lw 投影。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { LocationAssetService } from '@core/modules/episode-production/assets/services/location-asset.service'

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

describe('LocationAssetService', () => {
  let ds: DataSource
  let imageSvc: AssetImageService
  let svc: LocationAssetService

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    svc = new LocationAssetService(ds, imageSvc)
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('linked_lw 模式：getEffectiveData 投影 lw_location 字段并被 override 覆盖', async () => {
    await ds.getRepository(LwLocationEntity).save({
      id: 'lwl1',
      projectId: 'lwp1',
      name: '城南茶馆',
      description: '热闹的市井茶馆',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    await ds.getRepository(LocationBindingEntity).save({
      id: 'lb1',
      projectId: 'p1',
      longWritingLocationId: 'lwl1',
      locationName: '城南茶馆',
      sourceType: 'linked_lw',
      overrideDescription: '冷清的午后茶馆',
      generateImages: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    const eff = await svc.getEffectiveData('lb1')
    expect(eff).toMatchObject({
      name: '城南茶馆', // override 未设 → 走 lw.name
      description: '冷清的午后茶馆', // override 覆盖 lw.description
      source: 'linked_lw',
    })
  })

  it('pickBestVariant: spec §3.4 三层降级（精确 / 部分 / 主图兜底）', async () => {
    // 准备一个 location binding（standalone 即可，pickBestVariant 不区分 source）
    await ds.getRepository(LocationBindingEntity).save({
      id: 'lb2',
      projectId: 'p1',
      longWritingLocationId: '',
      locationName: '客栈',
      sourceType: 'standalone',
      standaloneName: '客栈',
      generateImages: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)

    // 主图
    await imageSvc.addImage({
      assetType: 'location',
      assetId: 'lb2',
      category: 'main',
      imagePath: '/img/main.png',
      isMain: true,
    })
    // 变体 A：仅 time=evening
    await imageSvc.addImage({
      assetType: 'location',
      assetId: 'lb2',
      category: 'time_variant',
      label: 'evening',
      imagePath: '/img/evening.png',
      metadata: { time: 'evening' },
    })
    // 变体 B：angle=front + time=evening + weather=rain（满分匹配）
    await imageSvc.addImage({
      assetType: 'location',
      assetId: 'lb2',
      category: 'angle_variant',
      label: 'front-rain-evening',
      imagePath: '/img/front-rain-evening.png',
      metadata: { angle: 'front', time: 'evening', weather: 'rain' },
    })

    // case 1: 精确匹配 → 返回满分变体 B（angle+time+weather=4+2+1=7）
    const exact = await svc.pickBestVariant('lb2', {
      angle: 'front',
      time: 'evening',
      weather: 'rain',
    })
    expect(exact?.imagePath).toBe('/img/front-rain-evening.png')

    // case 2: 部分匹配 → 只 time=evening，A 得 2 分、B 也得 2 分，但 B 还匹配 angle 失败、weather 失败
    //         实际上传 time=evening 时 A=2 / B=2（weather/angle 都不传，未传不计分）
    //         相同分数取查询顺序第一个：A
    const partial = await svc.pickBestVariant('lb2', { time: 'evening' })
    expect(partial?.imagePath).toBe('/img/evening.png')

    // case 3: 全部不匹配 → 兜底主图
    const fallback = await svc.pickBestVariant('lb2', {
      angle: 'top',
      time: 'noon',
      weather: 'snow',
    })
    expect(fallback?.imagePath).toBe('/img/main.png')
  })

  it('createStandalone + createLinkedLw + updateOverride: 完整生命周期', async () => {
    // standalone 创建
    const standalone = await svc.createStandalone({
      projectId: 'p1',
      name: '废弃仓库',
      description: '阴暗潮湿',
    })
    expect(standalone.id).toMatch(/^lb_[0-9a-f]{16}$/)
    expect(standalone.sourceType).toBe('standalone')
    expect(standalone.standaloneName).toBe('废弃仓库')
    expect(standalone.standaloneDescription).toBe('阴暗潮湿')
    // standalone 不绑 lw（migration relax-binding-lw-id-nullable 已开放 nullable）
    expect(standalone.longWritingLocationId).toBeNull()

    let eff = await svc.getEffectiveData(standalone.id)
    expect(eff).toMatchObject({
      name: '废弃仓库',
      description: '阴暗潮湿',
      source: 'standalone',
    })

    // linked_lw 创建
    await ds.getRepository(LwLocationEntity).save({
      id: 'lwl2',
      projectId: 'lwp1',
      name: '皇宫',
      description: '金碧辉煌',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    const linked = await svc.createLinkedLw({
      projectId: 'p1',
      lwLocationId: 'lwl2',
      name: '皇宫',
    })
    expect(linked.sourceType).toBe('linked_lw')
    expect(linked.longWritingLocationId).toBe('lwl2')
    expect(linked.locationName).toBe('皇宫')

    eff = await svc.getEffectiveData(linked.id)
    expect(eff).toMatchObject({
      name: '皇宫',
      description: '金碧辉煌',
      source: 'linked_lw',
    })

    // updateOverride 覆盖 description
    await svc.updateOverride(linked.id, { description: '破败的皇宫' })
    eff = await svc.getEffectiveData(linked.id)
    expect(eff.description).toBe('破败的皇宫')
    expect(eff.name).toBe('皇宫') // override.name 未设，仍走 lw.name

    // listByProject 能取出两条
    const list = await svc.listByProject('p1')
    expect(list.map((b) => b.id).sort()).toEqual(
      [standalone.id, linked.id].sort(),
    )
  })
})
