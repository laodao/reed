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

/** 孤儿参考图判定年龄：落盘超过 24h 且无引用才删（评审 #57） */
const ORPHAN_SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** 清扫节流间隔：最多每 6 小时一次 */
const ORPHAN_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000
/** 上次实际清扫时间（模块级，跨实例共享） */
let lastOrphanSweepAt = 0

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
    // 评审 #57：落盘后顺手做一次节流清扫（最多每 6 小时一次，失败不影响本次保存）
    void this.sweepOrphanReferenceFilesIfDue().catch(() => undefined)
    return { path: relPath }
  }

  /**
   * 评审 #57：清理孤儿参考图。saveReferenceFile 落盘后若前端未提交，
   * ref- 文件会永久滞留堆积。清扫规则：asset-images/ 下 ref- 前缀文件，
   * mtime 早于 maxAgeMs（默认 24h）且未被任何 asset_images.image_path 引用 → 删除。
   * @returns 扫描数与已删除文件（相对路径）
   */
  async sweepOrphanReferenceFiles(opts: { maxAgeMs?: number } = {}): Promise<{ scanned: number; deleted: string[] }> {
    const maxAgeMs = opts.maxAgeMs ?? ORPHAN_SWEEP_MAX_AGE_MS
    const dir = path.join(this.pathProvider.getDataPath(), 'asset-images')
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      return { scanned: 0, deleted: [] } // 目录不存在（还没上传过）→ 无事可扫
    }
    const refFiles = names.filter(n => n.startsWith('ref-'))
    if (refFiles.length === 0) return { scanned: 0, deleted: [] }
    const referenced = new Set(await this.imageService.listAllImagePaths())
    const cutoff = Date.now() - maxAgeMs
    const deleted: string[] = []
    for (const name of refFiles) {
      const rel = `asset-images/${name}`
      if (referenced.has(rel)) continue
      const abs = path.join(dir, name)
      const st = await fs.stat(abs).catch(() => null)
      if (!st || st.mtimeMs > cutoff) continue // 太新：可能仍在流程中
      await fs.unlink(abs).catch(() => undefined)
      deleted.push(rel)
    }
    return { scanned: refFiles.length, deleted }
  }

  /** 节流版清扫（模块级时间戳，最多每 6 小时实际执行一次） */
  private async sweepOrphanReferenceFilesIfDue(): Promise<void> {
    const now = Date.now()
    if (now - lastOrphanSweepAt < ORPHAN_SWEEP_INTERVAL_MS) return
    lastOrphanSweepAt = now
    await this.sweepOrphanReferenceFiles()
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
