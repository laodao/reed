/**
 * PanoramaSnapshotService 单测（P3c Task 3）
 * @module tests/unit/episode-production/assets/panorama-snapshot.service
 *
 * 3 个用例覆盖 spec §4.5.10 step 3 视角截图落盘：
 * - createSnapshot: 写文件（mock writer 收 cleanBase64 + targetDir + fileName）
 *                   + 写 asset_image (category='panorama_snapshot', metadata 解 JSON 后含 yaw/pitch/fov/sourcePanoramaImageId)
 * - listSnapshotsForLocation: 创建 2 个 snapshot 后列表长度 2
 * - deleteSnapshot: 删一个后列表长度 0
 *
 * 通过 MockWriter 注入 SnapshotFileWriter 抽象接口（不真实写文件），
 * 验证 service 对底层 fs 的编排逻辑，与真实 fs 解耦（PC 端用 Electron 主进程 fs，Web 端用 web-server fs）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import {
  PanoramaSnapshotService,
  type SnapshotFileWriter,
} from '@core/platform/episode-production/assets/services/panorama-snapshot.service'

async function buildDb(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetImageEntity],
    synchronize: true,
  })
  await ds.initialize()
  return ds
}

interface WriteCall {
  base64: string
  targetDir: string
  fileName: string
}

class MockWriter implements SnapshotFileWriter {
  saved: WriteCall[] = []
  async writeBase64Image(opts: WriteCall): Promise<string> {
    this.saved.push(opts)
    return `${opts.targetDir}/${opts.fileName}`
  }
}

describe('PanoramaSnapshotService', () => {
  let ds: DataSource
  let imageSvc: AssetImageService
  let writer: MockWriter
  let svc: PanoramaSnapshotService

  beforeEach(async () => {
    ds = await buildDb()
    imageSvc = new AssetImageService(ds)
    writer = new MockWriter()
    svc = new PanoramaSnapshotService(imageSvc, writer, '/data/panoramas')
  })

  afterEach(async () => {
    if (ds.isInitialized) await ds.destroy()
  })

  it('createSnapshot: 写文件 + 写 asset_image (category=panorama_snapshot)', async () => {
    const result = await svc.createSnapshot({
      locationBindingId: 'lb1',
      sourcePanoramaImageId: 'ai_pano1',
      viewpoint: { yaw: -15, pitch: -25, fov: 50 },
      base64Image: 'data:image/jpeg;base64,iVBORw0KGgo...',
    })

    // writer 收到 cleanBase64（已剥 data URL 前缀）+ targetDir + fileName
    expect(writer.saved).toHaveLength(1)
    expect(writer.saved[0].base64).toBe('iVBORw0KGgo...')
    expect(writer.saved[0].targetDir).toBe('/data/panoramas')
    expect(writer.saved[0].fileName).toMatch(/^snapshot-snap_[0-9a-f]{16}\.jpg$/)

    // asset_image 落表
    const list = await imageSvc.listByCategory(
      'location',
      'lb1',
      'panorama_snapshot',
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      assetType: 'location',
      assetId: 'lb1',
      category: 'panorama_snapshot',
      isMain: 0,
    })
    expect(list[0].imagePath).toBe(
      writer.saved[0].targetDir + '/' + writer.saved[0].fileName,
    )
    expect(list[0].label).toBe('yaw-15_pitch-25_fov50')
    expect(result.id).toBe(list[0].id)

    // metadata JSON.parse 后含 yaw/pitch/fov/sourcePanoramaImageId
    expect(list[0].metadata).toBeDefined()
    expect(list[0].metadata).not.toBeNull()
    const meta = JSON.parse(list[0].metadata as string)
    expect(meta).toEqual({
      yaw: -15,
      pitch: -25,
      fov: 50,
      sourcePanoramaImageId: 'ai_pano1',
    })
  })

  it('listSnapshotsForLocation: 创建 2 个 snapshot 后列表长度 2', async () => {
    await svc.createSnapshot({
      locationBindingId: 'lb1',
      sourcePanoramaImageId: 'ai_pano1',
      viewpoint: { yaw: 0, pitch: 0, fov: 60 },
      base64Image: 'a',
    })
    await svc.createSnapshot({
      locationBindingId: 'lb1',
      sourcePanoramaImageId: 'ai_pano1',
      viewpoint: { yaw: 30, pitch: 0, fov: 60 },
      base64Image: 'b',
    })
    const list = await svc.listSnapshotsForLocation('lb1')
    expect(list).toHaveLength(2)
  })

  it('deleteSnapshot: 删一个后列表长度 0', async () => {
    const s = await svc.createSnapshot({
      locationBindingId: 'lb1',
      sourcePanoramaImageId: 'p1',
      viewpoint: { yaw: 0, pitch: 0, fov: 60 },
      base64Image: 'a',
    })
    await svc.deleteSnapshot(s.id)
    const list = await svc.listSnapshotsForLocation('lb1')
    expect(list).toHaveLength(0)
  })
})
