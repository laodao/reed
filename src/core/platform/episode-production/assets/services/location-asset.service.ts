/**
 * 地点资产 service（spec §3.7 + §3.4 变体降级）
 * @module platform/episode-production/assets/services/location-asset
 *
 * 包装 location_binding 的业务读写。两块核心能力：
 *
 * 1. getEffectiveData()：双源投影
 *    - linked_lw：name/description 走 override → lw → locationName 兜底；
 *      与 character 不同，lw_story_locations 自带 description 列，所以
 *      description 走 lw 投影而非"仅来自 override"
 *    - standalone：直接读 standalone_*
 *
 * 2. pickBestVariant()：spec §3.4 角度/时间/天气变体降级
 *    - 评分：angle +4 / time +2 / weather +1（angle 权重最高）
 *    - score>0 取最大分；全 0 落到主图；都没有则 null
 *
 * 注：本 service 只包业务逻辑，不引入 IPC / preload / Electron-only 依赖，
 * PC + Web 双端共用；P3a Task 9 IPC layer 包装暴露。
 *
 * 不含 panorama_360 / panorama_snapshot 处理，留 P3c。
 */

import { randomBytes } from 'crypto'
import type { DataSource, Repository } from 'typeorm'
import { LocationBindingEntity } from '@core/database/entities/episode-production/location-binding.entity'
import { LwLocationEntity } from '@core/database/entities/lw-location.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import type { AssetImageService } from './asset-image.service'
import type { EffectiveLocationData } from '@shared/types/episode-production/domain.types'
import { getProjectStyleAnchorsAsJson } from './project-style.helper'

/** 新建 standalone 地点入参 */
export interface CreateStandaloneLocationInput {
  projectId: string
  name: string
  description?: string
  userId?: string | null
}

/** 新建 linked_lw 地点入参 */
export interface CreateLinkedLwLocationInput {
  projectId: string
  lwLocationId: string
  /** 项目内的展示名（写入 location_name 列；可与 lw.name 不同） */
  name: string
  initialOverride?: {
    name?: string
    description?: string
  }
  userId?: string | null
}

/** updateOverride 接受的 patch（null 表示清空 override） */
export type LocationOverridePatch = Partial<{
  name: string | null
  description: string | null
}>

/** updateStandalone 接受的 patch */
export type LocationStandalonePatch = Partial<{
  name: string
  description: string
}>

/** FU5-C3 场景类型 + 规模 + 氛围 + 风格锚点 + 默认时间/天气 patch */
export type LocationExtraPatch = Partial<{
  locationType: string | null
  scale: string | null
  baseDescription: string | null
  moodTags: string[] | null
  styleAnchors: string[] | null
  timeOfDay: string | null
  weather: string | null
}>

/** pickBestVariant 输入：场景维度（任意子集） */
export interface PickVariantInput {
  /** 时间标签（如 'morning' / 'evening' / 'noon'） */
  time?: string
  /** 天气标签（如 'sunny' / 'rain' / 'snow'） */
  weather?: string
  /** 镜头/视角标签（如 'front' / 'top' / 'side'） */
  angle?: string
}

/**
 * asset_image 的 metadata 解析结果（pickBestVariant 用到的子集）。
 * 实际 metadata 在 entity 中是 text 列，本 service 内部 JSON.parse 后按此 shape 用。
 */
interface VariantMetadata {
  time?: string
  weather?: string
  angle?: string
}

/**
 * 地点资产业务 service。
 *
 * 不直接对外暴露 typeorm 实体写入；图谱相关读取走注入的 AssetImageService。
 */
export class LocationAssetService {
  constructor(
    private readonly ds: DataSource,
    private readonly imageSvc: AssetImageService,
  ) {}

  private get bindingRepo(): Repository<LocationBindingEntity> {
    return this.ds.getRepository(LocationBindingEntity)
  }

  private get lwRepo(): Repository<LwLocationEntity> {
    return this.ds.getRepository(LwLocationEntity)
  }

  /** 生成 lb_<16hex> 格式的 binding ID */
  private generateId(): string {
    return `lb_${randomBytes(8).toString('hex')}`
  }

  /** 按 ID 取 binding 原始记录（不做投影） */
  async getById(id: string): Promise<LocationBindingEntity | null> {
    return await this.bindingRepo.findOne({ where: { id } })
  }

  /** 列出某 project 的全部地点 binding（按 created_at 升序） */
  async listByProject(projectId: string): Promise<LocationBindingEntity[]> {
    return await this.bindingRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    })
  }

  /**
   * 取生效地点数据（spec §3.7 双源投影）。
   *
   * - source=standalone：name/description 来自 standalone_*；
   *   兜底用 locationName / '' 占位
   * - source=linked_lw：name/description 走 override → lw → locationName 兜底；
   *   lw_story_locations 自带 description 列，所以 description 也参与投影
   *
   * @throws 当 binding 不存在时抛错，调用方需处理
   */
  async getEffectiveData(bindingId: string): Promise<EffectiveLocationData> {
    const b = await this.bindingRepo.findOne({ where: { id: bindingId } })
    if (!b) throw new Error(`LocationBinding not found: ${bindingId}`)

    const referenceImagePath = (b as any).referenceImagePath ?? null
    // 投影 styleAnchors（spec 2026-05-09 review）：修补之前 main-image-generator 用 eff as any
    // 兜底取该字段的类型契约漏洞 — 现 effective 显式投影出来，调用方按 type 拿。
    const styleAnchors = parseLocationStyleAnchors(b.styleAnchors)

    if (b.sourceType === 'standalone') {
      return {
        name: b.standaloneName ?? b.locationName ?? '(未命名)',
        description: b.standaloneDescription ?? '',
        source: 'standalone',
        styleAnchors,
        referenceImagePath,
      }
    }

    // linked_lw: 投影 lw_location + override 覆盖
    const lw = b.longWritingLocationId
      ? await this.lwRepo.findOne({ where: { id: b.longWritingLocationId } })
      : null

    return {
      name: b.overrideName ?? lw?.name ?? b.locationName ?? '(未命名)',
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

  /**
   * 按场景维度（time/weather/angle）从该 binding 的图谱中挑最匹配变体（spec §3.4）。
   *
   * 评分规则：angle 匹配 +4 / time 匹配 +2 / weather 匹配 +1
   * - 取所有 location 资产图，过滤掉 main 后逐张评分
   * - 选 score>0 中分数最大的；相同分数取查询顺序第一个
   * - 若全部变体 score=0 → 返回主图（兜底）
   * - 若主图也没有 → null
   *
   * 变体图 metadata 假设格式 `{ time, weather, angle }`，从 entity.metadata（text）
   * JSON.parse 出来；解析失败按"无 metadata"处理（不计分）。
   */
  async pickBestVariant(
    bindingId: string,
    input: PickVariantInput,
  ): Promise<AssetImageEntity | null> {
    const all = await this.imageSvc.listByAsset('location', bindingId)
    const main = all.find((img) => img.isMain === 1) ?? null
    const variants = all.filter((img) => img.isMain !== 1)

    let best: AssetImageEntity | null = null
    let bestScore = 0
    for (const img of variants) {
      const meta = this.parseMetadata(img.metadata)
      let score = 0
      if (input.angle && meta.angle === input.angle) score += 4
      if (input.time && meta.time === input.time) score += 2
      if (input.weather && meta.weather === input.weather) score += 1
      if (score > bestScore) {
        best = img
        bestScore = score
      }
    }

    if (best) return best
    return main
  }

  /** 解析 asset_image.metadata 文本列为 VariantMetadata；失败/空返回空对象 */
  private parseMetadata(raw: string | null): VariantMetadata {
    if (!raw) return {}
    // 防御性：sqlite 下 metadata 是 text；运行时不太可能拿到 object，但留兜底
    if (typeof raw === 'object') return raw as VariantMetadata
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object') {
        return parsed as VariantMetadata
      }
      return {}
    } catch {
      return {}
    }
  }

  /** 新建 standalone 地点（独立地点，不绑定 lw_location） */
  async createStandalone(
    input: CreateStandaloneLocationInput,
  ): Promise<LocationBindingEntity> {
    const styleAnchors = await getProjectStyleAnchorsAsJson(this.ds, input.projectId)
    const entity = this.bindingRepo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      projectId: input.projectId,
      // standalone 模式不绑 lw_location（migration relax-binding-lw-id-nullable 已开放 nullable）
      longWritingLocationId: null,
      locationName: input.name,
      sourceType: 'standalone',
      standaloneName: input.name,
      standaloneDescription: input.description ?? null,
      styleAnchors,
      generateImages: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<LocationBindingEntity>)
    return await this.bindingRepo.save(entity)
  }

  /** 新建 linked_lw 地点（绑定到既有 lw_location；可选携带初始 override） */
  async createLinkedLw(
    input: CreateLinkedLwLocationInput,
  ): Promise<LocationBindingEntity> {
    const ov = input.initialOverride ?? {}
    const styleAnchors = await getProjectStyleAnchorsAsJson(this.ds, input.projectId)
    const entity = this.bindingRepo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      projectId: input.projectId,
      longWritingLocationId: input.lwLocationId,
      locationName: input.name,
      sourceType: 'linked_lw',
      overrideName: ov.name ?? null,
      overrideDescription: ov.description ?? null,
      styleAnchors,
      generateImages: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<LocationBindingEntity>)
    return await this.bindingRepo.save(entity)
  }

  /**
   * 更新 linked_lw 模式的 override 字段（仅传入 key 才会更新；显式传 null 清空 override）。
   */
  async updateOverride(
    bindingId: string,
    override: LocationOverridePatch,
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
    patch: LocationStandalonePatch,
  ): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if ('name' in patch && patch.name !== undefined)
      update.standaloneName = patch.name
    if ('description' in patch && patch.description !== undefined)
      update.standaloneDescription = patch.description
    await this.bindingRepo.update(bindingId, update)
  }

  /** 删除一个地点 binding（级联清 asset_image 行与落盘文件，同 character-asset） */
  async delete(bindingId: string): Promise<void> {
    await this.bindingRepo.delete(bindingId)
    for (const img of await this.imageSvc.listByAsset('location', bindingId)) {
      await this.imageSvc.deleteImage(img.id)
    }
  }

  /** FU5-C3 一次性更新场景类型 + 规模 + 氛围 + 风格锚点 + 默认时间/天气 */
  async updateExtra(bindingId: string, patch: LocationExtraPatch): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if ('locationType' in patch) update.locationType = patch.locationType ?? null
    if ('scale' in patch) update.scale = patch.scale ?? null
    if ('baseDescription' in patch)
      update.baseDescription = patch.baseDescription ?? null
    if ('moodTags' in patch) {
      update.moodTags = patch.moodTags ? JSON.stringify(patch.moodTags) : null
    }
    if ('styleAnchors' in patch) {
      update.styleAnchors = patch.styleAnchors
        ? JSON.stringify(patch.styleAnchors)
        : null
    }
    if ('timeOfDay' in patch) update.timeOfDay = patch.timeOfDay ?? null
    if ('weather' in patch) update.weather = patch.weather ?? null
    await this.bindingRepo.update(bindingId, update)
  }
}

/**
 * 安全解析 location.style_anchors 为 string[]。
 * DB 字段是 text；存的是 JSON 数组字符串（与 character / item 同口径）。
 * 解析失败返回空数组。
 */
function parseLocationStyleAnchors(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    }
    return []
  } catch {
    return []
  }
}
