/**
 * 360 全景文件上传 service
 * @module platform/episode-production/assets/services/panorama-upload
 *
 * 接收"已读到内存的字节流"，校验为合法 360 全景图（image/{jpeg,png,webp}，比例≈2:1），
 * 写到 dataPath/panoramas/<random>.<ext>，再调用 PanoramaGeneratorService.uploadFor 落表。
 *
 * 双端共用：buffer 来源由 adapter 决定
 *   - Web：multer 解析 multipart/form-data
 *   - PC（Electron）：通过 IPC 把 base64 字节传过来
 *
 * 图像 metadata 探测经 common/sharp-worker 子进程（sharp/libvips 崩 Electron 主进程修复）；
 * 其余仅依赖 Node fs + IPathProvider；不引 multer / express，
 * 也不引 IPC，保持 core 纯净，PC + Web 双端可调用。
 */

import { randomBytes } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { workerProbe } from '@core/platform/episode-production/common/sharp-worker'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import type { IPathProvider } from '@core/interfaces/path.interface'
import type { PanoramaGeneratorService } from './panorama-generator.service'

/** 允许的图像 MIME / sharp format */
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'] as const
type AllowedFormat = (typeof ALLOWED_FORMATS)[number]

/** equirectangular 比例容忍度：2:1 ± 2%（即 1.96–2.04） */
const ASPECT_MIN = 1.96
const ASPECT_MAX = 2.04

/** 单文件硬上限：50MB（约可装 8K 极致画质 panorama） */
const MAX_BYTES = 50 * 1024 * 1024

export interface PanoramaUploadInput {
  /** 文件字节流（已加载到内存） */
  buffer: Buffer
  /** 原始文件名，仅用于 fallback 取扩展名；service 会用 sharp 探测真实 format 决定落盘 ext */
  fileName: string
  /** 关联的地点 binding ID */
  locationBindingId: string
  /** 多租户 user ID，service 直接透传给 imageService */
  userId?: string | null
  /** 可选 label（不传则空） */
  label?: string | null
}

/**
 * 校验失败抛出此错误，外层适配器（multer route / IPC handler）映射到合适的状态码 / 文案。
 */
export class PanoramaUploadValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'EMPTY'
      | 'TOO_LARGE'
      | 'BAD_FORMAT'
      | 'BAD_ASPECT'
      | 'BAD_DIMENSIONS',
  ) {
    super(message)
    this.name = 'PanoramaUploadValidationError'
  }
}

export class PanoramaUploadService {
  constructor(
    private readonly pathProvider: IPathProvider,
    private readonly panoramaGenerator: PanoramaGeneratorService,
  ) {}

  /**
   * 主流程：
   * 1) 体积校验（防止 50MB+ 滥用）
   * 2) sharp 探测 format / width / height
   * 3) format 白名单
   * 4) 比例校验（必须接近 2:1，否则 photo-sphere-viewer 渲染会扭曲）
   * 5) 写入 dataPath/panoramas/<rand>.<ext>
   * 6) 调 panoramaGenerator.uploadFor 落 asset_images 表
   */
  async upload(input: PanoramaUploadInput): Promise<AssetImageEntity> {
    if (!input.buffer || input.buffer.byteLength === 0) {
      throw new PanoramaUploadValidationError('文件为空', 'EMPTY')
    }
    if (input.buffer.byteLength > MAX_BYTES) {
      throw new PanoramaUploadValidationError(
        `文件超过 ${MAX_BYTES / 1024 / 1024}MB 上限`,
        'TOO_LARGE',
      )
    }

    // sharp 探测走 worker 子进程；null = 无法解析（损坏或格式不支持）
    const metadata = await workerProbe({ bufferBase64: input.buffer.toString('base64') })
    if (!metadata) {
      throw new PanoramaUploadValidationError(
        '无法解析图像（损坏或格式不支持）',
        'BAD_FORMAT',
      )
    }

    const format = metadata.format
    if (!format || !ALLOWED_FORMATS.includes(format as AllowedFormat)) {
      throw new PanoramaUploadValidationError(
        `不支持的图像格式：${format ?? '未知'}（仅支持 jpeg/png/webp）`,
        'BAD_FORMAT',
      )
    }

    const { width, height } = metadata
    if (!width || !height) {
      throw new PanoramaUploadValidationError(
        '无法读取图像尺寸',
        'BAD_DIMENSIONS',
      )
    }
    const aspect = width / height
    if (aspect < ASPECT_MIN || aspect > ASPECT_MAX) {
      throw new PanoramaUploadValidationError(
        `图像比例 ${width}×${height} (≈${aspect.toFixed(2)}:1) 不符合 360 全景要求（应≈2:1）`,
        'BAD_ASPECT',
      )
    }

    // 写入：dataPath/panoramas/<rand>.<ext>
    const ext = format === 'jpeg' ? 'jpg' : format
    const fileId = `pano_${randomBytes(8).toString('hex')}`
    const relPath = path.posix.join('panoramas', `${fileId}.${ext}`)
    const dataPath = this.pathProvider.getDataPath()
    const absPath = path.join(dataPath, relPath)

    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, input.buffer)

    // 落表：复用 PanoramaGeneratorService.uploadFor（已经支持 imagePath 参数）
    return await this.panoramaGenerator.uploadFor({
      locationBindingId: input.locationBindingId,
      imagePath: relPath,
      userId: input.userId,
    })
  }
}
