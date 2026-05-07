/**
 * 项目级资产聚合视图（FU5-C1 / spec §3.9）
 * @module modules/episode-production/assets/services/asset-project-summary
 *
 * 给 ② 资产盘点页用的聚合服务：
 * 一次性拿一个项目下所有 binding 的"主图状态 + 图谱细分计数"，
 * 解锁原 AssetStageView 中 readyCount / overallProgress / galleryCompletion
 * 写死为 0 的占位（spec §3.D-3）。
 *
 * 不直接用 Repository.list（已 user_id scope），保持 PC + Web 双端共用。
 */

import { In, type DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { ItemBindingEntity } from '@core/database/entities/episode-production/item-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { LwItemEntity } from '@core/database/entities/lw-item.entity'

export interface BindingSummary {
  /** binding.id */
  bindingId: string
  /** 显示名（standalone 走 *Name；linked_lw 走 lwName 或 binding 名） */
  name: string
  sourceType: 'linked_lw' | 'standalone'
  hasMain: boolean
  /** 已有主图时给前端的缩略图路径（thumbnail 优先，否则 imagePath；URL 由前端 toImageUrl 适配双端） */
  mainImagePath?: string
  galleryCount: number
  /**
   * 按 category 细分计数（spec §3.5 / §3.7）：
   *   character — view / expression / outfit / pose
   *   location  — time_variant / weather_variant / angle_variant / panorama_360 / panorama_snapshot
   *   item      — view / context
   */
  categoryCounts: Record<string, number>
}

export interface VoiceSummary {
  voiceId: string
  name: string
  type: 'system' | 'cloned'
  /** 已绑定到哪些角色（角色名称数组） */
  boundCharacterNames: string[]
}

export interface ProjectAssetSummary {
  characters: BindingSummary[]
  locations: BindingSummary[]
  items: BindingSummary[]
  /** 注：voice 是项目无关的，4 类聚合时直接列项目相关角色绑定的 voice + 全局可用 voice */
  voices: VoiceSummary[]
  /** 全局聚合：3 类 binding 主图齐备数 / 总数（不含 voice） */
  totals: {
    bindingTotal: number
    bindingWithMain: number
    galleryTotal: number
    /** 0~100 的图谱完整度（基于每个 binding 的 desired count vs actual） */
    galleryCompletionPct: number
  }
}

/** 角色 / 地点 / 物品 每类期望的"图谱完整度"分母（spec §3.5/3.7 默认值；可按项目策略后续 override） */
const DESIRED_CATEGORY_COUNT: Record<
  'character' | 'location' | 'item',
  Record<string, number>
> = {
  character: {
    view: 6, // front / 3q_left / 3q_right / side_l / side_r / back
    expression: 6, // neutral / angry / happy / sad / surprised / confused
    outfit: 3, // 默认 + 备选 1 + 备选 2
    pose: 4, // standing / sitting / walking / fighting
  },
  location: {
    time_variant: 7, // morning / noon / afternoon / evening / night / dawn / dusk
    weather_variant: 6, // sunny / cloudy / rainy / snowy / foggy / stormy
    angle_variant: 4, // wide_shot / entrance / interior_a / interior_b
  },
  item: {
    view: 4,
    context: 2,
  },
}

export class AssetProjectSummaryService {
  constructor(private readonly ds: DataSource) {}

  async summarizeProject(projectId: string): Promise<ProjectAssetSummary> {
    const charRepo = this.ds.getRepository(CharacterBindingEntity)
    const locRepo = this.ds.getRepository(LocationBindingEntity)
    const itemRepo = this.ds.getRepository(ItemBindingEntity)
    const imgRepo = this.ds.getRepository(AssetImageEntity)

    const [chars, locs, items] = await Promise.all([
      charRepo.find({ where: { projectId } }),
      locRepo.find({ where: { projectId } }),
      itemRepo.find({ where: { projectId } }),
    ])

    // linked_lw binding 的"显示名"在 LW 表里——批量预取避免 N+1。
    // 不存在 lwId（standalone）或 LW 已被删除时，fallback 到 binding 自身字段，最后才到 id。
    const lwCharNames = await this.fetchLwNames(
      LwCharacterEntity,
      chars.map((b) => b.longWritingCharacterId),
    )
    const lwLocNames = await this.fetchLwNames(
      LwLocationEntity,
      locs.map((b) => (b as any).longWritingLocationId as string | null),
    )
    const lwItemNames = await this.fetchLwNames(
      LwItemEntity,
      items.map((b) => (b as any).longWritingItemId as string | null),
    )

    const characters = await Promise.all(
      chars.map((b) =>
        this.summarizeBinding(imgRepo, 'character', {
          id: b.id,
          name: this.resolveDisplayName({
            sourceType: b.sourceType,
            standaloneName: b.standaloneName,
            overrideName: (b as any).overrideName,
            lwName: lwCharNames.get(b.longWritingCharacterId ?? ''),
            id: b.id,
          }),
          sourceType: (b.sourceType as 'linked_lw' | 'standalone') ?? 'standalone',
        }),
      ),
    )

    const locations = await Promise.all(
      locs.map((b) =>
        this.summarizeBinding(imgRepo, 'location', {
          id: b.id,
          name: this.resolveDisplayName({
            sourceType: (b as any).sourceType,
            standaloneName: (b as any).standaloneName,
            overrideName: (b as any).overrideName,
            lwName: lwLocNames.get((b as any).longWritingLocationId ?? ''),
            id: b.id,
          }),
          sourceType: (b.sourceType as 'linked_lw' | 'standalone') ?? 'standalone',
        }),
      ),
    )

    const itemSummaries = await Promise.all(
      items.map((b) =>
        this.summarizeBinding(imgRepo, 'item', {
          id: b.id,
          name: this.resolveDisplayName({
            sourceType: (b as any).sourceType,
            standaloneName: (b as any).standaloneName,
            overrideName: (b as any).overrideName,
            lwName: lwItemNames.get((b as any).longWritingItemId ?? ''),
            id: b.id,
          }),
          sourceType: (b.sourceType as 'linked_lw' | 'standalone') ?? 'standalone',
        }),
      ),
    )

    // voices：项目无关，但项目内绑定的 voice 优先；这里先返回空数组，由 IPC handler
    // 用 VoiceAssetService 填充（避免本 service 跨域依赖）。
    const voices: VoiceSummary[] = []

    const all = [...characters, ...locations, ...itemSummaries]
    const bindingTotal = all.length
    const bindingWithMain = all.filter((b) => b.hasMain).length
    const galleryTotal = all.reduce((acc, b) => acc + b.galleryCount, 0)

    // 图谱完整度：sum(actual / desired) / N，其中 desired 由类型决定
    let weighted = 0
    let denom = 0
    for (const b of characters) {
      const desired = sumDesired('character')
      if (desired > 0) {
        weighted += Math.min(b.galleryCount / desired, 1)
        denom++
      }
    }
    for (const b of locations) {
      const desired = sumDesired('location')
      if (desired > 0) {
        weighted += Math.min(b.galleryCount / desired, 1)
        denom++
      }
    }
    for (const b of itemSummaries) {
      const desired = sumDesired('item')
      if (desired > 0) {
        weighted += Math.min(b.galleryCount / desired, 1)
        denom++
      }
    }
    const galleryCompletionPct =
      denom === 0 ? 0 : Math.floor((weighted / denom) * 100)

    return {
      characters,
      locations,
      items: itemSummaries,
      voices,
      totals: {
        bindingTotal,
        bindingWithMain,
        galleryTotal,
        galleryCompletionPct,
      },
    }
  }

  /**
   * 根据 binding 的来源类型挑选显示名。
   * - standalone：用 standaloneName（独立创建时填的）
   * - linked_lw：override 优先（用户改过名字）；其次 LW 表的真实名（最常见）；最后才 fallback 到 id
   * 没有 sourceType / 老数据兜底：standalone → linked_lw 的 fallback 链都试一遍
   */
  private resolveDisplayName(input: {
    sourceType: string | null | undefined
    standaloneName: string | null | undefined
    overrideName: string | null | undefined
    lwName: string | undefined
    id: string
  }): string {
    if (input.sourceType === 'standalone') {
      return input.standaloneName?.trim() || input.id
    }
    // linked_lw 或未知 sourceType（老数据）
    return (
      input.overrideName?.trim() ||
      input.lwName?.trim() ||
      input.standaloneName?.trim() ||
      input.id
    )
  }

  /**
   * 批量按 id IN 查询 LW 实体的 name 字段，返回 id → name 的 Map。
   * 入参 ids 可能含 null / undefined / 重复，先去噪。空集合直接返回空 Map（不查 DB）。
   */
  private async fetchLwNames<T extends { id: string; name: string }>(
    entityClass: new () => T,
    rawIds: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = Array.from(new Set(rawIds.filter((x): x is string => !!x)))
    if (ids.length === 0) return new Map()
    const repo = this.ds.getRepository(entityClass)
    const rows = await repo.find({ where: { id: In(ids) } as any })
    return new Map(rows.map((r) => [r.id, r.name]))
  }

  private async summarizeBinding(
    imgRepo: any,
    assetType: 'character' | 'location' | 'item',
    binding: { id: string; name: string; sourceType: 'linked_lw' | 'standalone' },
  ): Promise<BindingSummary> {
    const imgs: AssetImageEntity[] = await imgRepo.find({
      where: { assetType, assetId: binding.id },
    })
    const mainImg = imgs.find((i) => i.isMain === 1)
    const galleryCount = imgs.length
    const categoryCounts: Record<string, number> = {}
    for (const img of imgs) {
      categoryCounts[img.category] = (categoryCounts[img.category] ?? 0) + 1
    }
    // 缩略图优先：thumbnailPath 在旧数据里可能是空字符串而非 null，
    // 必须用 .trim() 判断后再回退到 imagePath，否则前端会拿到空 URL。
    let mainImagePath: string | undefined
    if (mainImg) {
      const thumb = (mainImg.thumbnailPath ?? '').trim()
      const main = (mainImg.imagePath ?? '').trim()
      mainImagePath = thumb || main || undefined
    }
    return {
      bindingId: binding.id,
      name: binding.name,
      sourceType: binding.sourceType,
      hasMain: !!mainImg,
      mainImagePath,
      galleryCount,
      categoryCounts,
    }
  }
}

function sumDesired(kind: 'character' | 'location' | 'item'): number {
  return Object.values(DESIRED_CATEGORY_COUNT[kind]).reduce(
    (acc, v) => acc + v,
    0,
  )
}
