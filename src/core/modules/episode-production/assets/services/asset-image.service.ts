/**
 * asset_image 表统一图谱 CRUD（spec §3.8）
 * @module modules/episode-production/assets/services/asset-image
 *
 * 封装 asset_image 表的通用读写操作：
 * - 按 (asset_type, asset_id) 取全部图 / 按 category 过滤
 * - 加图 / 删图 / 改图
 * - 标 main（自动把同 asset 的旧 main 降为 view）
 * - 取主图（无则 null）
 *
 * 后续所有具体资产 service（character / location / item / portrait）通过
 * 此 service 读写图谱，不直接 touch typeorm，保持业务层与 ORM 解耦。
 */

import * as fs from 'fs'
import { randomBytes } from 'crypto'
import type { DataSource, Repository } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { resolveAssetPath, isAbsoluteAssetPath } from '@core/utils/asset-path'
import {
  AssetImageEntity,
  type AssetType,
  type AssetImageCategory,
} from '@core/database/entities/episode-production/asset-image.entity'

export type { AssetType, AssetImageCategory }

/** 提示词保存入参（有图更新行；无图创建 imagePath='' 的占位行承载提示词） */
export interface SavePromptInput {
  assetType: AssetType
  assetId: string
  /** 占位行的用途分类（无已有行时使用；main 之外的 slot 如 view/variant） */
  category: AssetImageCategory
  /** 占位行 label（对应图集 slot，如 front_half / variant_1；main slot 传 null） */
  label?: string | null
  prompt: string
}

/** 添加一张图的入参 */
export interface AddImageInput {
  assetType: AssetType
  assetId: string
  category: AssetImageCategory
  imagePath: string
  isMain?: boolean
  label?: string
  prompt?: string
  negativePrompt?: string
  thumbnailPath?: string
  derivedFromImageId?: string
  sortOrder?: number
  /** 扩展元数据（写入时 JSON 序列化为 text 列） */
  metadata?: Record<string, unknown>
  userId?: string | null
}

/**
 * 统一图谱（asset_image）CRUD 服务。
 *
 * 不承载业务逻辑（业务规则放在 character/location/item-asset.service 等具体资产 service 中）。
 */
export class AssetImageService {
  constructor(private readonly ds: DataSource) {}

  private get repo(): Repository<AssetImageEntity> {
    return this.ds.getRepository(AssetImageEntity)
  }

  /** 生成 ai_xxxx 格式的图片 ID */
  private generateId(): string {
    return `ai_${randomBytes(8).toString('hex')}`
  }

  /**
   * 新增一张图。
   * - 自动生成 `ai_<16hex>` 格式 ID
   * - isMain=true 时只置 1，调用方负责保证同 asset 唯一性（如需切换请用 setAsMain）
   */
  async addImage(input: AddImageInput): Promise<AssetImageEntity> {
    const entity = this.repo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      assetType: input.assetType,
      assetId: input.assetId,
      category: input.category,
      label: input.label ?? null,
      prompt: input.prompt ?? null,
      negativePrompt: input.negativePrompt ?? null,
      imagePath: input.imagePath,
      thumbnailPath: input.thumbnailPath ?? null,
      isMain: input.isMain ? 1 : 0,
      derivedFromImageId: input.derivedFromImageId ?? null,
      sortOrder: input.sortOrder ?? 0,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: new Date(),
      updatedAt: null,
    })
    return await this.repo.save(entity)
  }

  /** 列出某 asset 的全部图（按 sort_order 升序，相同 sort_order 按 created_at 升序） */
  /** 全量图像相对路径（评审 #57：孤儿参考图清扫用，不做用户过滤——文件清扫按路径比对） */
  async listAllImagePaths(): Promise<string[]> {
    const rows = await this.repo.find({ select: { imagePath: true } })
    return rows.map(r => r.imagePath).filter((p): p is string => !!p)
  }

  async listByAsset(
    assetType: AssetType,
    assetId: string,
  ): Promise<AssetImageEntity[]> {
    return await this.repo.find({
      where: { assetType, assetId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    })
  }

  /** 按 category 过滤同 asset 下的图 */
  async listByCategory(
    assetType: AssetType,
    assetId: string,
    category: AssetImageCategory,
  ): Promise<AssetImageEntity[]> {
    return await this.repo.find({
      where: { assetType, assetId, category },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    })
  }

  /** 取该 asset 的主图（is_main=1）；无则返回 null */
  async getMainImage(
    assetType: AssetType,
    assetId: string,
  ): Promise<AssetImageEntity | null> {
    return await this.repo.findOne({
      where: { assetType, assetId, isMain: 1 },
    })
  }

  /**
   * 把指定图设为该 asset 的主图：
   * 1. 先把同 (asset_type, asset_id) 下原有 main 改为 isMain=0 + category='view'
   * 2. 再把目标图置 isMain=1 + category='main'
   *
   * 不在事务里跑（SQLite/PG 不支持嵌套事务的兼容性问题），调用方需要事务隔离时自行包裹。
   */
  async setAsMain(imageId: string): Promise<void> {
    const target = await this.repo.findOne({ where: { id: imageId } })
    if (!target) {
      throw new Error(`AssetImage 不存在: ${imageId}`)
    }

    // 1. 把同 asset 之前的 main 全部降级为 view
    await this.repo
      .createQueryBuilder()
      .update(AssetImageEntity)
      .set({ isMain: 0, category: 'view' })
      .where(
        'asset_type = :assetType AND asset_id = :assetId AND is_main = :one AND id <> :targetId',
        {
          assetType: target.assetType,
          assetId: target.assetId,
          one: 1,
          targetId: imageId,
        },
      )
      .execute()

    // 2. 目标图升为 main
    await this.repo.update(
      { id: imageId },
      { isMain: 1, category: 'main', updatedAt: new Date() },
    )
  }

  /** 按 ID 取单张图（spec 2026-05-09 派生时按 baseImageId 反查基图） */
  async getById(imageId: string): Promise<AssetImageEntity | null> {
    return await this.repo.findOne({ where: { id: imageId } })
  }

  /** 删除单张图（方案A：连同落盘的图片文件与缩略图一并清理） */
  async deleteImage(imageId: string): Promise<void> {
    const target = await this.repo.findOne({ where: { id: imageId } })
    if (target) {
      deleteImageFiles(target.imagePath, target.thumbnailPath)
    }
    await this.repo.delete({ id: imageId })
  }

  /**
   * spec 2026-05-09 多主图模型：仅切换"默认主图"标记（is_main 字段），不动 category。
   *
   * 场景：location 域允许多张 category='main'（label 区分），其中只有一张 is_main=1
   * 作为评分都不命中时的兜底。用户切换默认主图时调本方法 — 与 setAsMain 不同，
   * 不会把旧主图降级到 category='view'，所有主图保持 category='main'。
   *
   * 旧的 setAsMain 兼容老 character / item 单主图模型继续保留。
   */
  async switchDefaultMain(imageId: string): Promise<void> {
    const target = await this.repo.findOne({ where: { id: imageId } })
    if (!target) {
      throw new Error(`AssetImage 不存在: ${imageId}`)
    }

    // 1. 把同 asset 已有的 isMain=1（除目标外）全部降为 0
    await this.repo
      .createQueryBuilder()
      .update(AssetImageEntity)
      .set({ isMain: 0 })
      .where(
        'asset_type = :assetType AND asset_id = :assetId AND is_main = :one AND id <> :targetId',
        {
          assetType: target.assetType,
          assetId: target.assetId,
          one: 1,
          targetId: imageId,
        },
      )
      .execute()

    // 2. 目标图标记为默认主图（category 保持原值，应该为 'main'）
    await this.repo.update(
      { id: imageId },
      { isMain: 1, updatedAt: new Date() },
    )
  }

  /**
   * 更新单图 metadata（spec 2026-05-09）— 主图 / 变体都可填维度信息（angle/time/weather/...）
   * 让评分系统在场景维度匹配时命中。
   *
   * 传 null 清空 metadata。
   */
  async updateMetadata(
    imageId: string,
    metadata: Record<string, unknown> | null,
  ): Promise<void> {
    await this.repo.update(
      { id: imageId },
      {
        metadata: metadata ? JSON.stringify(metadata) : null,
        updatedAt: new Date(),
      },
    )
  }

  /**
   * 局部更新一张图的字段（不涉及主图切换，仅用于 label / prompt / sortOrder / metadata 等修改）。
   *
   * 主图切换请使用 `setAsMain`，避免直接传 `isMain` 破坏唯一性。
   */
  async updateImage(
    imageId: string,
    patch: Partial<
      Pick<
        AssetImageEntity,
        | 'label'
        | 'prompt'
        | 'negativePrompt'
        | 'imagePath'
        | 'thumbnailPath'
        | 'sortOrder'
        | 'metadata'
        | 'derivedFromImageId'
      >
    >,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return
    const result = await this.repo.update(
      { id: imageId },
      { ...patch, updatedAt: new Date() },
    )
    if (result && result.affected === 0) {
      throw new Error(`AssetImage 不存在: ${imageId}`)
    }
  }

  /**
   * 保存某 asset 某个图集 slot 的提示词。
   *
   * 目标行解析：
   *   - label 有值（view/variant slot，如 front_half / variant_1）：只按 label 精确匹配，
   *     无匹配则创建对应 slot 的占位行（imagePath=''）。绝不兜底到主图（避免写错行）。
   *   - label 为空（main slot）：isMain=1 的默认主图 → 最早的 category='main' 行 →
   *     创建 main 占位行。
   *
   * 占位行 imagePath 为空字符串，前端按 `!!imagePath` 判定仍为"待生成"；
   * 生成主图时会被复用（见 MainImageGeneratorService.generateMain），不会产生孤儿行。
   */
  async savePrompt(input: SavePromptInput): Promise<AssetImageEntity> {
    if (!input.prompt.trim()) {
      throw new Error('提示词不能为空')
    }

    const slotLabel = input.label?.trim() || null

    // ── 非 main slot：只按 label 精确匹配 ──
    if (slotLabel) {
      const target = await this.repo.findOne({
        where: {
          assetType: input.assetType,
          assetId: input.assetId,
          label: slotLabel,
        },
      })
      if (target) {
        await this.repo.update(
          { id: target.id },
          { prompt: input.prompt, updatedAt: new Date() },
        )
        return (await this.repo.findOne({ where: { id: target.id } })) as AssetImageEntity
      }
      return await this.createPlaceholder(input, slotLabel)
    }

    // ── main slot：默认主图 → 最早 main 行 → 占位行 ──
    let target = await this.repo.findOne({
      where: { assetType: input.assetType, assetId: input.assetId, isMain: 1 },
    })
    if (!target) {
      target = await this.repo.findOne({
        where: { assetType: input.assetType, assetId: input.assetId, category: 'main' },
        order: { createdAt: 'ASC' },
      })
    }
    if (target) {
      await this.repo.update(
        { id: target.id },
        { prompt: input.prompt, updatedAt: new Date() },
      )
      return (await this.repo.findOne({ where: { id: target.id } })) as AssetImageEntity
    }
    return await this.createPlaceholder(input, null)
  }

  /** 创建 imagePath='' 的占位行（承载待生成提示词） */
  private async createPlaceholder(
    input: SavePromptInput,
    label: string | null,
  ): Promise<AssetImageEntity> {
    const entity = this.repo.create({
      id: this.generateId(),
      userId: getCurrentUserId() ?? null,
      assetType: input.assetType,
      assetId: input.assetId,
      category: input.category,
      label,
      imagePath: '',
      thumbnailPath: null,
      // 占位行一律 isMain=0：避免 getMainImage（isMain=1）把无图行当主图返回给消费方；
      // 前端 imageByLabel 的 category='main' 兜底仍能选中它作为当前编辑对象。
      isMain: 0,
      sortOrder: 0,
      derivedFromImageId: null,
      prompt: input.prompt,
      negativePrompt: null,
      createdAt: new Date(),
      updatedAt: null,
    } as Partial<AssetImageEntity>)
    return await this.repo.save(entity)
  }
}

/**
 * 删除 asset_image 落盘的图片文件（原图 + 缩略图）。
 *
 * 方案A：删除图集记录时顺带清理磁盘文件，避免"重新生成主图"把旧图片留在磁盘上。
 * 安全假定：每次生成 / 上传都会写一个唯一文件名（timestamp + random），
 * 因此同一 asset_image 行独占其图片文件，删除不会误伤他人的图。
 *
 * 容错：文件不存在 / 解析失败 / 删除失败都抛给调用方？不——这里静默忽略，
 * 让"删记录"这一主操作不因孤儿文件报错而失败；孤儿文件由磁盘清理兜底。
 */
function deleteImageFiles(
  imagePath?: string | null,
  thumbnailPath?: string | null,
): void {
  for (const rel of [imagePath, thumbnailPath]) {
    if (!rel || !rel.trim()) continue
    try {
      const abs = resolveAssetPath(rel)
      // 仅在解析为绝对路径时才删：dataPath 提供者缺失时 resolveAssetPath 会原样返回相对路径，
      // 此时强行 unlink 会误伤进程工作目录下的同名文件，这里跳过。
      if (abs && isAbsoluteAssetPath(abs) && fs.existsSync(abs)) {
        fs.unlinkSync(abs)
      }
    } catch (e) {
      console.warn('[AssetImage] 删除图片文件失败（忽略）:', rel, e)
    }
  }
}
