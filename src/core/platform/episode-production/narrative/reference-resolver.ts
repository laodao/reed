/**
 * 叙事域引用解析器（spec §4.1 + §4.8）
 * @module platform/episode-production/narrative/reference-resolver
 *
 * 把"剧本里写的 binding ID"解析为"渲染时要消费的 effective data"：
 *
 *   character_binding_id → { 生效角色字段 + 主图 }
 *   location_binding_id  → { 生效地点字段 + 主图 }
 *   item_binding_id      → { 生效物品字段 + 主图 }
 *
 * 设计要点：
 * - 双源投影逻辑（linked_lw + override / standalone）由 *AssetService.getEffectiveData()
 *   承担，本 resolver 只是 thin facade，避免重复实现
 * - 主图通过 asset_image 表 (asset_type, asset_id, is_main=1) 查询
 * - 解析失败（binding 不存在）返回 null 而不抛错，validator 据此判断"违例"
 * - 解析"成功但主图未生成"是合法状态：mainImage = null，validator 仍可标违例
 *
 * 上层使用：
 * - script-completeness.validator (P4-T3)：批量解析所有引用，按 null / mainImage 判违例
 * - keyframe-prompt-builder (P5)：拼提示词时用 effective.name / description / appearance
 * - 视频/音频生成域：拿 voiceId / 主图路径
 *
 * 此 service 只包业务逻辑，不引入 IPC / preload / Electron-only 依赖，PC + Web 双端共用。
 */

import type { DataSource } from 'typeorm'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { CharacterAssetService } from '@core/platform/episode-production/assets/services/character-asset.service'
import { LocationAssetService } from '@core/platform/episode-production/assets/services/location-asset.service'
import { ItemAssetService } from '@core/platform/episode-production/assets/services/item-asset.service'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import type {
  EffectiveCharacterData,
  EffectiveLocationData,
  EffectiveItemData,
} from '@shared/types/episode-production/domain.types'

/** 引用类型 */
export type ReferenceKind = 'character' | 'location' | 'item'

/** 待解析的引用（resolveBatch 入参） */
export interface ReferenceRef {
  kind: ReferenceKind
  bindingId: string
}

/** character 引用解析结果 */
export interface ResolvedCharacterReference {
  kind: 'character'
  bindingId: string
  effective: EffectiveCharacterData
  /** 主图（is_main=1）；尚未生成时为 null */
  mainImage: AssetImageEntity | null
}

/** location 引用解析结果 */
export interface ResolvedLocationReference {
  kind: 'location'
  bindingId: string
  effective: EffectiveLocationData
  mainImage: AssetImageEntity | null
}

/** item 引用解析结果 */
export interface ResolvedItemReference {
  kind: 'item'
  bindingId: string
  effective: EffectiveItemData
  mainImage: AssetImageEntity | null
}

/** 解析结果联合类型 */
export type ResolvedReference =
  | ResolvedCharacterReference
  | ResolvedLocationReference
  | ResolvedItemReference

/**
 * 解析失败（binding 不存在）时的占位记录。
 * Validator 用 found=false 判违例；调用方拿 effective 字段会返回兜底空字符串。
 */
export interface UnresolvedReference {
  kind: ReferenceKind
  bindingId: string
  found: false
  reason: string
}

/** 批量解析结果项（保持顺序） */
export type BatchResolveItem =
  | (ResolvedReference & { found: true })
  | UnresolvedReference

/**
 * 引用解析服务。
 *
 * 内部惰性持有四个底层 service（character / location / item / image），按需调用。
 * 不缓存（数据可能在用户编辑过程中变化）；批量解析时同 binding 自动去重。
 */
export class ReferenceResolver {
  private readonly characterSvc: CharacterAssetService
  private readonly locationSvc: LocationAssetService
  private readonly itemSvc: ItemAssetService
  private readonly imageSvc: AssetImageService

  constructor(ds: DataSource) {
    this.imageSvc = new AssetImageService(ds)
    this.characterSvc = new CharacterAssetService(ds)
    this.locationSvc = new LocationAssetService(ds, this.imageSvc)
    this.itemSvc = new ItemAssetService(ds)
  }

  /**
   * 解析单个 character binding。
   * @returns 解析结果；binding 不存在返回 null
   */
  async resolveCharacter(
    bindingId: string,
  ): Promise<ResolvedCharacterReference | null> {
    let effective: EffectiveCharacterData
    try {
      effective = await this.characterSvc.getEffectiveData(bindingId)
    } catch {
      return null
    }
    const mainImage = await this.findMainImage('character', bindingId)
    return { kind: 'character', bindingId, effective, mainImage }
  }

  /**
   * 解析单个 location binding。
   * @returns 解析结果；binding 不存在返回 null
   */
  async resolveLocation(
    bindingId: string,
  ): Promise<ResolvedLocationReference | null> {
    let effective: EffectiveLocationData
    try {
      effective = await this.locationSvc.getEffectiveData(bindingId)
    } catch {
      return null
    }
    const mainImage = await this.findMainImage('location', bindingId)
    return { kind: 'location', bindingId, effective, mainImage }
  }

  /**
   * 解析单个 item binding。
   * @returns 解析结果；binding 不存在返回 null
   */
  async resolveItem(
    bindingId: string,
  ): Promise<ResolvedItemReference | null> {
    let effective: EffectiveItemData
    try {
      effective = await this.itemSvc.getEffectiveData(bindingId)
    } catch {
      return null
    }
    const mainImage = await this.findMainImage('item', bindingId)
    return { kind: 'item', bindingId, effective, mainImage }
  }

  /**
   * 批量解析。同 (kind, bindingId) 自动去重，返回顺序与入参一致。
   *
   * - 解析成功：found=true + 全字段
   * - binding 不存在：found=false + reason
   *
   * Validator (P4-T3) 用 found=false 直接打"未解析"违例；用 mainImage=null 打"主图缺失"违例。
   */
  async resolveBatch(refs: ReferenceRef[]): Promise<BatchResolveItem[]> {
    // 去重：相同 kind+bindingId 只查一次
    const cache = new Map<string, BatchResolveItem>()

    const dedupedKeys = new Set<string>()
    for (const ref of refs) {
      dedupedKeys.add(this.cacheKey(ref))
    }
    const dedupedRefs: ReferenceRef[] = []
    const seen = new Set<string>()
    for (const ref of refs) {
      const k = this.cacheKey(ref)
      if (seen.has(k)) continue
      seen.add(k)
      dedupedRefs.push(ref)
    }

    // 并发解析每个唯一引用
    await Promise.all(
      dedupedRefs.map(async (ref) => {
        const k = this.cacheKey(ref)
        cache.set(k, await this.resolveOne(ref))
      }),
    )

    // 按入参顺序还原
    return refs.map((ref) => cache.get(this.cacheKey(ref))!)
  }

  /** 单个引用解析（dispatch by kind） */
  private async resolveOne(ref: ReferenceRef): Promise<BatchResolveItem> {
    if (ref.kind === 'character') {
      const r = await this.resolveCharacter(ref.bindingId)
      return r
        ? { ...r, found: true }
        : this.unresolved(ref, 'character_binding 不存在')
    }
    if (ref.kind === 'location') {
      const r = await this.resolveLocation(ref.bindingId)
      return r
        ? { ...r, found: true }
        : this.unresolved(ref, 'location_binding 不存在')
    }
    const r = await this.resolveItem(ref.bindingId)
    return r ? { ...r, found: true } : this.unresolved(ref, 'item_binding 不存在')
  }

  private unresolved(ref: ReferenceRef, reason: string): UnresolvedReference {
    return { kind: ref.kind, bindingId: ref.bindingId, found: false, reason }
  }

  private cacheKey(ref: ReferenceRef): string {
    return `${ref.kind}:${ref.bindingId}`
  }

  /** 查 (asset_type, asset_id) 的主图（is_main=1）；无则 null */
  private async findMainImage(
    assetType: 'character' | 'location' | 'item',
    bindingId: string,
  ): Promise<AssetImageEntity | null> {
    return await this.imageSvc.getMainImage(assetType, bindingId)
  }
}
