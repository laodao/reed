/**
 * 资产主图文件上传 service
 * @module modules/episode-production/assets/services/main-image-upload
 *
 * 接收"已读到内存的字节流"，校验为合法图像（image/{jpeg,png,webp}，≤20MB），
 * 写到 dataPath/asset-images/{assetType}-{assetId}-main-{timestamp}.{ext}，
 * 再把旧主图 isMain 置 0，新行写入 isMain=1, category='main'。
 *
 * 双端共用：buffer 来源由 adapter 决定
 *   - Web：multer 解析 multipart/form-data
 *   - PC（Electron）：通过 IPC 把 base64 字节传过来
 *
 * 仅依赖 sharp（探测图像 metadata）+ Node fs + IPathProvider + AssetImageService；
 * 不引 multer / express，也不引 IPC，保持 core 纯净，PC + Web 双端可调用。
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import sharp from 'sharp'
import type { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import type { IPathProvider } from '@core/interfaces/path.interface'
import type { AssetImageService, AssetType } from './asset-image.service'

/** 允许的图像 MIME / sharp format */
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'] as const
type AllowedFormat = (typeof ALLOWED_FORMATS)[number]

/** 单文件硬上限：20MB */
const MAX_BYTES = 20 * 1024 * 1024

export interface MainImageUploadInput {
  /** 资产类型：character / location / item */
  assetType: AssetType
  /** 资产 binding ID */
  assetId: string
  /** 文件字节流（已加载到内存） */
  buffer: Buffer
  /** 原始文件名，仅用于 fallback 取扩展名；service 用 sharp 探测真实 format 决定落盘 ext */
  fileName: string
  /** 多租户 user ID */
  userId?: string | null
}

/**
 * 校验失败抛出此错误，外层适配器（multer route / IPC handler）映射到合适的状态码 / 文案。
 */
export class MainImageUploadValidationError extends Error {
  constructor(
    message: string,
    public readonly code: 'EMPTY' | 'TOO_LARGE' | 'BAD_FORMAT' | 'BAD_DIMENSIONS',
  ) {
    super(message)
    this.name = 'MainImageUploadValidationError'
  }
}

export class MainImageUploadService {
  constructor(
    private readonly pathProvider: IPathProvider,
    private readonly imageService: AssetImageService,
  ) {}

  /**
   * 主流程：
   * 1) 体积校验（防止 20MB+ 滥用）
   * 2) sharp 探测 format / width / height
   * 3) format 白名单（jpeg/png/webp）
   * 4) 写入 dataPath/asset-images/{assetType}-{assetId}-main-{timestamp}.{ext}
   * 5) 旧主图 isMain 置 0（通过 AssetImageService.setAsMain 自动处理）
   * 6) 新行写入 isMain=1, category='main'
   */
  async upload(input: MainImageUploadInput): Promise<AssetImageEntity> {
    if (!input.buffer || input.buffer.byteLength === 0) {
      throw new MainImageUploadValidationError('文件为空', 'EMPTY')
    }
    if (input.buffer.byteLength > MAX_BYTES) {
      throw new MainImageUploadValidationError(
        `文件超过 ${MAX_BYTES / 1024 / 1024}MB 上限`,
        'TOO_LARGE',
      )
    }

    let metadata: sharp.Metadata
    try {
      metadata = await sharp(input.buffer).metadata()
    } catch (e) {
      throw new MainImageUploadValidationError(
        `无法解析图像（损坏或格式不支持）：${(e as Error).message}`,
        'BAD_FORMAT',
      )
    }

    const format = metadata.format
    if (!format || !ALLOWED_FORMATS.includes(format as AllowedFormat)) {
      throw new MainImageUploadValidationError(
        `不支持的图像格式：${format ?? '未知'}（仅支持 jpeg/png/webp）`,
        'BAD_FORMAT',
      )
    }

    const { width, height } = metadata
    if (!width || !height) {
      throw new MainImageUploadValidationError('无法读取图像尺寸', 'BAD_DIMENSIONS')
    }

    // 写入：dataPath/asset-images/{assetType}-{assetId}-main-{timestamp}.{ext}
    const ext = format === 'jpeg' ? 'jpg' : format
    const timestamp = Date.now()
    const fileName = `${input.assetType}-${input.assetId}-main-${timestamp}.${ext}`
    const relPath = path.posix.join('asset-images', fileName)
    const dataPath = this.pathProvider.getDataPath()
    const absPath = path.join(dataPath, relPath)

    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, input.buffer)

    // 先写新图，再调 setAsMain 使旧主图 isMain→0，新图 isMain→1
    const newImage = await this.imageService.addImage({
      assetType: input.assetType,
      assetId: input.assetId,
      category: 'main',
      imagePath: relPath,
      isMain: false, // 先写 false，下一步 setAsMain 会置 1
      userId: input.userId,
    })

    // setAsMain 会把同 asset 下的旧主图 isMain→0，本图置 isMain→1, category→'main'
    await this.imageService.setAsMain(newImage.id)

    // 重新取更新后的 entity 返回
    return (await this.imageService.getMainImage(input.assetType, input.assetId))!
  }
}
