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
import { randomBytes } from 'crypto'
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
    public readonly code: 'EMPTY' | 'TOO_LARGE' | 'BAD_FORMAT' | 'BAD_DIMENSIONS' | 'BAD_REF',
  ) {
    super(message)
    this.name = 'MainImageUploadValidationError'
  }
}

/** 资产引用校验：assetType 合法 + assetId 非空（防止 asset_id='' 孤儿行 / 非法类型） */
function requireAssetRef(assetType: string, assetId: string): void {
  if (assetType !== 'character' && assetType !== 'location' && assetType !== 'item') {
    throw new MainImageUploadValidationError(`非法资产类型：${assetType}`, 'BAD_REF')
  }
  if (!assetId || typeof assetId !== 'string' || !assetId.trim()) {
    throw new MainImageUploadValidationError('缺少资产 ID（assetId 不能为空）', 'BAD_REF')
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
    requireAssetRef(input.assetType, input.assetId)
    const relPath = await this.saveImageFile(input.buffer, input.fileName, `${input.assetType}-${input.assetId}`)

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

  /**
   * 上传一张图作为"新增主图"（多主图模型：不替换/降级旧主图）。
   * 文件保存后创建 category='main' 行，再 switchDefaultMain 把 isMain 切到新图
   * （旧主图保持 category='main'、isMain=0，可继续查看/切换）。
   */
  async uploadAdditionalMain(
    input: MainImageUploadInput & { label?: string },
  ): Promise<AssetImageEntity> {
    requireAssetRef(input.assetType, input.assetId)
    const relPath = await this.saveImageFile(input.buffer, input.fileName, `${input.assetType}-${input.assetId}`)

    const newImage = await this.imageService.addImage({
      assetType: input.assetType,
      assetId: input.assetId,
      category: 'main',
      imagePath: relPath,
      isMain: false,
      label: input.label?.trim() || null,
      userId: input.userId,
    })
    // 切默认主图（不动 category，多主图兼容）
    await this.imageService.switchDefaultMain(newImage.id)
    return newImage
  }

  /**
   * 保存参考图文件（不落 asset_image 行）：仅校验 + 写文件，返回相对路径，
   * 供"新增主图（换装）"等场景把用户上传的图作为生成 reference。
   */
  async saveReferenceFile(input: { buffer: Buffer; fileName: string }): Promise<{ path: string }> {
    const relPath = await this.saveImageFile(input.buffer, input.fileName)
    return { path: relPath }
  }

  /** 校验图像 + 写入 asset-images/ 目录，返回相对路径 */
  private async saveImageFile(
    buffer: Buffer,
    _fileName: string,
    owner?: string,
  ): Promise<string> {
    if (!buffer || buffer.byteLength === 0) {
      throw new MainImageUploadValidationError('文件为空', 'EMPTY')
    }
    if (buffer.byteLength > MAX_BYTES) {
      throw new MainImageUploadValidationError(
        `文件超过 ${MAX_BYTES / 1024 / 1024}MB 上限`,
        'TOO_LARGE',
      )
    }

    let metadata: sharp.Metadata
    try {
      metadata = await sharp(buffer).metadata()
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

    const ext = format === 'jpeg' ? 'jpg' : format
    // 文件名带资产归属前缀 + 随机后缀：避免 `main-${ts}` 丢失归属（无法追踪/清理），
    // 也避免同毫秒并发上传互相覆盖。参考图（无归属）用 ref- 前缀。
    const ownerPart = owner ? `${owner}-` : 'ref-'
    const fileName = `${ownerPart}${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`
    const relPath = path.posix.join('asset-images', fileName)
    const dataPath = this.pathProvider.getDataPath()
    const absPath = path.join(dataPath, relPath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, buffer)
    return relPath
  }
}
