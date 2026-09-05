/**
 * panorama 视角截图 service（spec §4.5.10 step 3）
 * @module platform/episode-production/assets/services/panorama-snapshot
 *
 * 接收前端 photo-sphere-viewer 截的 base64 图 + 视角参数（yaw/pitch/fov）+
 * 来源 panorama_360 图 id，把图片落盘并写入 asset_image (category='panorama_snapshot')。
 *
 * 本 service **不**渲染 360 → 透视图（前端 photo-sphere-viewer 已经截好图），
 * 只承担"剥前缀 + 落盘 + 写元数据"的编排逻辑。
 *
 * 实际的 fs 写入通过依赖注入的 SnapshotFileWriter 抽象接口完成，
 * service 自身保持 PC + Web 双端可用：
 * - PC 端 IPC handler 注入基于 Electron 主进程 fs 的 writer
 * - Web 端 IPC handler 注入基于 web-server fs 的 writer
 */

import { randomBytes } from 'crypto'
import type { AssetImageService } from './asset-image.service'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

/** 透视视角参数（来自 photo-sphere-viewer 当前镜头） */
export interface Viewpoint {
  /** 偏航角，单位度，范围 -180 ~ 180 */
  yaw: number
  /** 俯仰角，单位度，范围 -90 ~ 90 */
  pitch: number
  /** 视场角，单位度，范围 30 ~ 120 */
  fov: number
}

/**
 * 抽象 base64 图片落盘接口（依赖注入）。
 *
 * 实现方负责：把 base64 字符串解码并写入 `<targetDir>/<fileName>`，
 * 返回最终完整路径（绝对路径或相对资源根的可访问路径）。
 *
 * 把 fs 提取成接口而不是直接 import 'fs'，是为了：
 * 1. 单测可以注入 MockWriter 不真实写盘
 * 2. PC / Web 双端各自接入对应实现，不让 core service 直接依赖 platform fs
 */
export interface SnapshotFileWriter {
  /** 把 base64 图存到目录，返回完整路径 */
  writeBase64Image(opts: {
    base64: string
    targetDir: string
    fileName: string
  }): Promise<string>
}

/** createSnapshot 入参 */
export interface CreateSnapshotInput {
  /** 关联的 location_bindings.id */
  locationBindingId: string
  /** 来源 panorama_360 的 asset_image.id（视角截自哪张全景） */
  sourcePanoramaImageId: string
  /** 当前镜头视角（yaw/pitch/fov） */
  viewpoint: Viewpoint
  /** 前端 canvas toDataURL 出的 base64（可含 `data:image/jpeg;base64,` 前缀） */
  base64Image: string
  userId?: string | null
}

/** 剥离 data URL 前缀的正则（兼容 jpeg / png / webp 等任意 image/* mime） */
const DATA_URL_PREFIX_RE = /^data:image\/[a-z]+;base64,/

/**
 * 全景视角截图服务。
 *
 * 用法：
 * ```ts
 * const svc = new PanoramaSnapshotService(imageSvc, fsWriter, '/data/panoramas')
 * await svc.createSnapshot({
 *   locationBindingId: 'lb1',
 *   sourcePanoramaImageId: 'ai_xxx',
 *   viewpoint: { yaw: -15, pitch: -25, fov: 50 },
 *   base64Image: 'data:image/jpeg;base64,...',
 * })
 * ```
 */
export class PanoramaSnapshotService {
  constructor(
    private readonly imageSvc: AssetImageService,
    private readonly writer: SnapshotFileWriter,
    /** 截图落盘目录（如 '/data/panoramas' 或相对 'panoramas'） */
    private readonly snapshotsDir: string,
  ) {}

  /** 生成 snap_xxxx 格式的截图本地 ID（仅用于文件名，不直接当 asset_image.id） */
  private generateSnapshotId(): string {
    return `snap_${randomBytes(8).toString('hex')}`
  }

  /**
   * 创建一张全景视角截图：
   * 1. 生成 `snap_<16hex>` ID 作为文件名后缀（asset_image.id 由 imageSvc.addImage 自己生成）
   * 2. 剥离 base64 的 `data:image/...;base64,` 前缀（如有）
   * 3. 通过 writer 把 base64 落盘到 `<snapshotsDir>/snapshot-<snap_id>.jpg`
   * 4. 写入 asset_image：category='panorama_snapshot'，metadata 存视角 + 来源 id
   *
   * label 格式 `yaw{yaw}_pitch{pitch}_fov{fov}`，便于 UI 列表识别视角。
   */
  async createSnapshot(input: CreateSnapshotInput): Promise<AssetImageEntity> {
    const snapshotId = this.generateSnapshotId()
    const fileName = `snapshot-${snapshotId}.jpg`

    // 去掉前端 toDataURL 自带的 `data:image/jpeg;base64,` 之类前缀，
    // 让 writer 拿到纯 base64 字节
    const cleanBase64 = input.base64Image.replace(DATA_URL_PREFIX_RE, '')

    const fullPath = await this.writer.writeBase64Image({
      base64: cleanBase64,
      targetDir: this.snapshotsDir,
      fileName,
    })

    return await this.imageSvc.addImage({
      assetType: 'location',
      assetId: input.locationBindingId,
      category: 'panorama_snapshot',
      imagePath: fullPath,
      isMain: false,
      label: `yaw${input.viewpoint.yaw}_pitch${input.viewpoint.pitch}_fov${input.viewpoint.fov}`,
      metadata: {
        yaw: input.viewpoint.yaw,
        pitch: input.viewpoint.pitch,
        fov: input.viewpoint.fov,
        sourcePanoramaImageId: input.sourcePanoramaImageId,
      },
      userId: input.userId,
    })
  }

  /** 列出某地点的全部 panorama_snapshot（按 sort_order/created_at 升序） */
  async listSnapshotsForLocation(
    locationBindingId: string,
  ): Promise<AssetImageEntity[]> {
    return await this.imageSvc.listByCategory(
      'location',
      locationBindingId,
      'panorama_snapshot',
    )
  }

  /**
   * 删除一张视角截图（仅删 asset_image 表行）。
   *
   * 注：物理文件由调用方 / IPC handler 决定是否同步清理；
   * service 层不直接 touch fs，避免与 writer 注入责任错位。
   */
  async deleteSnapshot(snapshotImageId: string): Promise<void> {
    await this.imageSvc.deleteImage(snapshotImageId)
  }
}
