/**
 * 物品资产 service（spec §3.7）
 * @module modules/episode-production/assets/services/item-asset
 *
 * 包装 item_binding 的业务读写。核心是 getEffectiveData()：
 *   - linked_lw 模式：投影 lw_item.name/description + override 覆盖；
 *     与 location 类似（lw_story_items 自带 description 列），description 也参与投影；
 *   - standalone 模式：直接读 standalone_name / standalone_description。
 *
 * 上层（剧本 / 分镜 / 渲染）统一通过 getEffectiveData 拿"最终生效的物品字段"，
 * 不需要关心数据来自 lw 还是 standalone。
 *
 * 物品没有变体降级（图集结构简单），**不**实现 pickBestVariant。
 *
 * 注：此 service 只包业务逻辑，不引入 IPC / preload / Electron-only 依赖，
 * PC + Web 双端共用；后续 IPC layer 在 Task 9 包装暴露。
 */

import { randomBytes } from 'crypto'
import type { DataSource, Repository } from 'typeorm'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'
import type { EffectiveItemData } from '@shared/types/episode-production/domain.types'
import { getProjectStyleAnchorsAsJson } from './project-style.helper'

/** 新建 standalone 物品入参 */
export interface CreateStandaloneItemInput {
  projectId: string
  name: string
  description?: string
  userId?: string | null
}

/** 新建 linked_lw 物品入参 */
export interface CreateLinkedLwItemInput {
  projectId: string
  lwItemId: string
  /** 项目内的展示名（写入 item_name 列；可与 lw.name 不同） */
  name: string
  initialOverride?: {
    name?: string
    description?: string
  }
  userId?: string | null
}

/** updateOverride 接受的 patch（null 表示清空 override） */
export type ItemOverridePatch = Partial<{
  name: string | null
  description: string | null
}>

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** updateStandalone 接受的 patch */
export type ItemStandalonePatch = Partial<{
  name: string
  description: string
}>

/**
 * 物品资产业务 service。
 *
 * 不直接对外暴露 typeorm 实体写入，所有"业务有效字段"通过 getEffectiveData 统一投影。
 */
export class ItemAssetService {
  constructor(private readonly ds: DataSource) {}

  private get bindingRepo(): Repository<ItemBindingEntity> {
    return this.ds.getRepository(ItemBindingEntity)
  }

  private get lwRepo(): Repository<LwItemEntity> {
    return this.ds.getRepository(LwItemEntity)
  }

  /** 生成 ib_<16hex> 格式的 binding ID */
  private generateId(): string {
    return `ib_${randomBytes(8).toString('hex')}`
  }

  /** 按 ID 取 binding 原始记录（不做投影） */
  async getById(id: string): Promise<ItemBindingEntity | null> {
    return await this.bindingRepo.findOne({ where: { id } })
  }

  /** 列出某 project 的全部物品 binding（按 created_at 升序） */
  async listByProject(projectId: string): Promise<ItemBindingEntity[]> {
    return await this.bindingRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    })
  }

  /**
   * 取生效物品数据（spec §3.7 双源投影）。
   *
   * - source=standalone：name/description 来自 standalone_*；
   *   兜底用 itemName / '' 占位
   * - source=linked_lw：name/description 走 override → lw → itemName 兜底；
   *   lw_story_items 自带 description 列，所以 description 也参与投影
   *
   * @throws 当 binding 不存在时抛错，调用方需处理
   */
  async getEffectiveData(bindingId: string): Promise<EffectiveItemData> {
    const b = await this.bindingRepo.findOne({ where: { id: bindingId } })
    if (!b) throw new Error(`ItemBinding not found: ${bindingId}`)

    const styleAnchors = parseJsonArray(b.styleAnchors)
    const referenceImagePath = (b as any).referenceImagePath ?? null
    if (b.sourceType === 'standalone') {
      return {
        name: b.standaloneName ?? b.itemName ?? '(未命名)',
        description: b.standaloneDescription ?? '',
        source: 'standalone',
        styleAnchors,
        referenceImagePath,
      }
    }

    // linked_lw: 投影 lw_item + override 覆盖
    const lw = b.longWritingItemId
      ? await this.lwRepo.findOne({ where: { id: b.longWritingItemId } })
      : null

    return {
      name: b.overrideName ?? lw?.name ?? b.itemName ?? '(未命名)',
      description: b.overrideDescription ?? lw?.description ?? '',
      source: 'linked_lw',
      styleAnchors,
      referenceImagePath,
    }
  }

  /** 设置 / 清空参考图路径（spec 2026-05-09） */
  async setReferenceImagePath(
    bindingId: string,
    path: string | null,
  ): Promise<void> {
    await this.bindingRepo.update(bindingId, {
      referenceImagePath: path,
      updatedAt: new Date(),
    } as any)
  }

  /** 更新风格锚点（与 character/location 对齐 — text JSON 字符串落库） */
  async updateExtra(
    bindingId: string,
    patch: { styleAnchors?: string[] | null },
  ): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if ('styleAnchors' in patch) {
      update.styleAnchors =
        patch.styleAnchors == null
          ? null
          : JSON.stringify(patch.styleAnchors.filter((s) => typeof s === 'string' && s.trim() !== ''))
    }
    await this.bindingRepo.update(bindingId, update)
  }

  /** 新建 standalone 物品（独立物品，不绑定 lw_item） */
  async createStandalone(
    input: CreateStandaloneItemInput,
  ): Promise<ItemBindingEntity> {
    const styleAnchors = await getProjectStyleAnchorsAsJson(this.ds, input.projectId)
    const entity = this.bindingRepo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      projectId: input.projectId,
      // standalone 模式不绑 lw_item（migration relax-binding-lw-id-nullable 已开放 nullable）
      longWritingItemId: null,
      itemName: input.name,
      sourceType: 'standalone',
      standaloneName: input.name,
      standaloneDescription: input.description ?? null,
      styleAnchors,
      generateImages: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<ItemBindingEntity>)
    return await this.bindingRepo.save(entity)
  }

  /** 新建 linked_lw 物品（绑定到既有 lw_item；可选携带初始 override） */
  async createLinkedLw(
    input: CreateLinkedLwItemInput,
  ): Promise<ItemBindingEntity> {
    const ov = input.initialOverride ?? {}
    const styleAnchors = await getProjectStyleAnchorsAsJson(this.ds, input.projectId)
    const entity = this.bindingRepo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      projectId: input.projectId,
      longWritingItemId: input.lwItemId,
      itemName: input.name,
      sourceType: 'linked_lw',
      overrideName: ov.name ?? null,
      overrideDescription: ov.description ?? null,
      styleAnchors,
      generateImages: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<ItemBindingEntity>)
    return await this.bindingRepo.save(entity)
  }

  /**
   * 更新 linked_lw 模式的 override 字段（仅传入 key 才会更新；显式传 null 清空 override）。
   */
  async updateOverride(
    bindingId: string,
    override: ItemOverridePatch,
  ): Promise<void> {
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if ('name' in override) patch.overrideName = override.name ?? null
    if ('description' in override)
      patch.overrideDescription = override.description ?? null
    await this.bindingRepo.update(bindingId, patch)
  }

  /** 更新 standalone 模式的 standalone 字段 */
  async updateStandalone(
    bindingId: string,
    patch: ItemStandalonePatch,
  ): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if ('name' in patch && patch.name !== undefined)
      update.standaloneName = patch.name
    if ('description' in patch && patch.description !== undefined)
      update.standaloneDescription = patch.description
    await this.bindingRepo.update(bindingId, update)
  }

  /** 删除一个物品 binding */
  async delete(bindingId: string): Promise<void> {
    await this.bindingRepo.delete(bindingId)
  }
}
