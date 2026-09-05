/**
 * 跨项目角色库 service（spec 2026-05-09 ep-redesign §3.2 D2 · P-7）
 *
 * 流程：
 *   - addToLibrary: 项目内 binding → 拷 snapshot + 拷图到 user-assets/{id}/ → 写 user_assets 行
 *   - listLibrary: 列出当前用户的库
 *   - createFromLibrary: 从库引用到新项目 → 创建普通 binding（拷 snapshot；不动原 binding）
 *   - syncBackToLibrary: 用户主动"同步回库"（不自动）
 *   - deleteFromLibrary: 删 user_assets 行 + 删整个 user-assets/{id}/ 目录
 *
 * 多租户：通过 user_id 字段隔离；走 ds.getRepository（裸 repo）— 调用方需在 IPC 层传 userId。
 */

import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import type { DataSource } from 'typeorm'
import { UserAssetEntity } from '@core/database/entities/episode-production/user-asset.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'

export interface AddToLibraryInput {
  bindingId: string
  bindingType: 'character' | 'location' | 'item'
  /** 用户上传的图存储根目录（{userData}/user-assets/） */
  storageRoot: string
  userId?: string | null
}

export interface CreateFromLibraryInput {
  userAssetId: string
  targetProjectId: string
  /** 项目级 asset 图存储根目录（{userData}/asset-images/{projectId}/） */
  projectAssetRoot: string
  userId?: string | null
}

export class UserAssetService {
  constructor(private readonly ds: DataSource) {}

  private generateId(): string {
    return `ua_${randomBytes(8).toString('hex')}`
  }

  private generateBindingId(prefix: 'cb' | 'lb' | 'ib'): string {
    return `${prefix}_${randomBytes(8).toString('hex')}`
  }

  private getBindingRepo(type: 'character' | 'location' | 'item') {
    if (type === 'character') return this.ds.getRepository(CharacterBindingEntity)
    if (type === 'location') return this.ds.getRepository(LocationBindingEntity)
    return this.ds.getRepository(ItemBindingEntity)
  }

  /**
   * 列出当前用户的库（按 createdAt 倒序，最新加入的在前）。
   */
  async listLibrary(input: {
    assetType?: 'character' | 'location' | 'item'
    keyword?: string
    userId?: string | null
  }): Promise<UserAssetEntity[]> {
    const repo = this.ds.getRepository(UserAssetEntity)
    const where: any = { userId: input.userId ?? null }
    if (input.assetType) where.assetType = input.assetType
    let rows = await repo.find({ where, order: { createdAt: 'DESC' } })
    if (input.keyword?.trim()) {
      const k = input.keyword.trim().toLowerCase()
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(k) ||
          (r.description ?? '').toLowerCase().includes(k),
      )
    }
    return rows
  }

  /**
   * 加入我的库：拷 binding snapshot + 拷图到 user-assets/{id}/ → 写 user_assets 行。
   */
  async addToLibrary(input: AddToLibraryInput): Promise<UserAssetEntity> {
    const bindingRepo = this.getBindingRepo(input.bindingType)
    const binding: any = await bindingRepo.findOne({ where: { id: input.bindingId } as any })
    if (!binding) throw new Error(`binding 不存在：${input.bindingId}`)

    // 1. 取 binding 全字段做 snapshot（去掉 id / userId / projectId / 时间戳）
    const { id: _id, userId: _u, projectId: _p, createdAt: _c, updatedAt: _u2, ...snap } = binding
    void _id; void _u; void _p; void _c; void _u2

    // 2. 取 binding 关联的 asset_image 列表（仅 main + view + 用户标记的形象组成员）
    const imageRepo = this.ds.getRepository(AssetImageEntity)
    const images = await imageRepo.find({
      where: { assetType: input.bindingType, assetId: input.bindingId } as any,
    })

    // 3. 拷图到 user-assets/{newId}/ 目录
    const newId = this.generateId()
    const destDir = path.join(input.storageRoot, newId)
    await fs.mkdir(destDir, { recursive: true })
    const imagePaths: string[] = []
    for (const img of images) {
      const srcPath = img.imagePath
      if (!srcPath) continue
      try {
        const absSrc = path.isAbsolute(srcPath) ? srcPath : path.resolve(srcPath)
        await fs.access(absSrc)  // 确认存在
        const filename = `${img.id}-${path.basename(absSrc)}`
        const destPath = path.join(destDir, filename)
        await fs.copyFile(absSrc, destPath)
        imagePaths.push(destPath)
      } catch {
        // 源图不存在 → 跳过（容错）
      }
    }

    // 4. 写 user_assets
    const now = Date.now()
    const repo = this.ds.getRepository(UserAssetEntity)
    const entity = repo.create({
      id: newId,
      userId: input.userId ?? null,
      assetType: input.bindingType,
      name:
        snap.standaloneName ??
        snap.overrideName ??
        binding.name ??
        '(未命名)',
      description:
        snap.standaloneDescription ??
        snap.overrideDescription ??
        null,
      snapshot: snap,
      imagePaths: imagePaths.length > 0 ? imagePaths : null,
      sourceBindingId: input.bindingId,
      createdAt: now,
      updatedAt: now,
    })
    return await repo.save(entity)
  }

  /**
   * 从我的库引用到新项目：拷 snapshot 创建 binding（standalone 类型），拷图到 project asset 目录。
   *
   * 不动原 user_asset；用户在新项目改 binding 不影响库。
   */
  async createFromLibrary(input: CreateFromLibraryInput): Promise<{ bindingId: string }> {
    const repo = this.ds.getRepository(UserAssetEntity)
    const where: any = { id: input.userAssetId }
    if (input.userId !== undefined) where.userId = input.userId ?? null
    const userAsset = await repo.findOne({ where })
    if (!userAsset) throw new Error(`user_asset 不存在或无权访问：${input.userAssetId}`)

    const snap = userAsset.snapshot ?? {}
    const newBindingId = this.generateBindingId(
      userAsset.assetType === 'character' ? 'cb'
        : userAsset.assetType === 'location' ? 'lb' : 'ib',
    )

    // 拷图：把 user-assets/{userAssetId}/ 目录下的图拷到 project asset 根目录
    const destDir = path.join(input.projectAssetRoot, input.targetProjectId, newBindingId)
    await fs.mkdir(destDir, { recursive: true })
    const newImagePaths: string[] = []
    if (Array.isArray(userAsset.imagePaths)) {
      for (const src of userAsset.imagePaths) {
        try {
          await fs.access(src)
          const dest = path.join(destDir, path.basename(src))
          await fs.copyFile(src, dest)
          newImagePaths.push(dest)
        } catch {
          // 容错
        }
      }
    }

    // 创建 binding（用 snapshot 填字段；source_type='standalone'）
    const bindingRepo = this.getBindingRepo(userAsset.assetType)
    const now = new Date()
    const bindingPatch: any = {
      ...snap,
      id: newBindingId,
      userId: input.userId ?? null,
      projectId: input.targetProjectId,
      sourceType: 'standalone',
      sourceUserAssetId: userAsset.id,  // 反指（character_bindings 现无此字段；后续 follow-up 加列）
      createdAt: now,
      updatedAt: now,
    }
    // long_writing_character_id / portrait_id / voice_config 等技术字段保留
    if (!bindingPatch.voiceConfig) bindingPatch.voiceConfig = {}
    if (userAsset.assetType === 'character' && !bindingPatch.longWritingCharacterId) {
      bindingPatch.longWritingCharacterId = null
    }
    delete bindingPatch.sourceUserAssetId  // 暂时跳过（无字段；后续 follow-up）

    await bindingRepo.save(bindingPatch as any)

    // 把拷过来的图作为 asset_image 行写入 binding（仅落 imagePath；prompt/category 用 'main' 默认）
    if (newImagePaths.length > 0) {
      const imageRepo = this.ds.getRepository(AssetImageEntity)
      for (let i = 0; i < newImagePaths.length; i++) {
        await imageRepo.save({
          id: `ai_${randomBytes(8).toString('hex')}`,
          userId: input.userId ?? null,
          assetType: userAsset.assetType,
          assetId: newBindingId,
          category: i === 0 ? 'main' : 'view',
          label: i === 0 ? null : `view-${i}`,
          imagePath: newImagePaths[i],
          isMain: i === 0 ? 1 : 0,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
        } as any)
      }
    }

    return { bindingId: newBindingId }
  }

  /**
   * 删除：删 DB 行 + 删整个 user-assets/{id}/ 目录。
   */
  async deleteFromLibrary(input: {
    userAssetId: string
    storageRoot: string
    userId?: string | null
  }): Promise<void> {
    const repo = this.ds.getRepository(UserAssetEntity)
    const where: any = { id: input.userAssetId }
    if (input.userId !== undefined) where.userId = input.userId ?? null
    const ua = await repo.findOne({ where })
    if (!ua) return  // 不存在或无权 → 静默 noop

    const dir = path.join(input.storageRoot, input.userAssetId)
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    await repo.delete(input.userAssetId)
  }
}
