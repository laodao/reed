/**
 * 角色资产 service（spec §3.7）
 * @module modules/episode-production/assets/services/character-asset
 *
 * 包装 character_binding 的业务读写。核心是 getEffectiveData()：
 *   - linked_lw 模式：投影 lw_character 的 name / appearance + override_* 覆盖；
 *     description / outfit 在 lw_story_characters 表中**不存在对应列**，因此
 *     仅来自 binding.overrideDescription / overrideOutfit；
 *   - standalone 模式：直接读 standalone_name / standalone_description。
 *
 * 上层（剧本 / 分镜 / 渲染）统一通过 getEffectiveData 拿"最终生效的角色字段"，
 * 不需要关心数据来自 lw 还是 standalone。
 *
 * 注：此 service 只包业务逻辑，不引入 IPC / preload / Electron-only 依赖，
 * PC + Web 双端共用；后续 IPC layer 在 Task 9 包装暴露。
 */

import { randomBytes } from 'crypto'
import type { DataSource, Repository } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { LwCharacterEntity } from '@core/database/entities/lw-character.entity'
import type { EffectiveCharacterData } from '@shared/types/episode-production/domain.types'

/** 新建 standalone 角色入参 */
export interface CreateStandaloneInput {
  projectId: string
  name: string
  description?: string
  voiceId?: string
  userId?: string | null
}

/** 新建 linked_lw 角色入参（可携带初始 override） */
export interface CreateLinkedLwInput {
  projectId: string
  lwCharacterId: string
  initialOverride?: {
    name?: string
    description?: string
    appearance?: string
    outfit?: string
  }
  userId?: string | null
}

/** updateOverride 接受的部分字段 patch（null 表示清空 override） */
export type OverridePatch = Partial<{
  name: string | null
  description: string | null
  appearance: string | null
  outfit: string | null
}>

/** updateStandalone 接受的部分字段 patch */
export type StandalonePatch = Partial<{
  name: string
  description: string
}>

/** FU5-C2 身份块 + 声音 + 风格锚点 + 备选服装 patch（spec §3.1/3.4/3.6） */
export type CharacterExtraPatch = Partial<{
  alias: string | null
  role: string | null
  gender: string | null
  age: number | null
  race: string | null
  voiceSpeed: number | null
  voicePitch: number | null
  voiceEmotion: string | null
  styleAnchors: string[] | null
  outfitsExtra: string[] | null
}>

/**
 * 角色资产业务 service。
 *
 * 不直接对外暴露 typeorm 实体写入，所有"业务有效字段"通过 getEffectiveData 统一投影。
 */
export class CharacterAssetService {
  constructor(private readonly ds: DataSource) {}

  private get bindingRepo(): Repository<CharacterBindingEntity> {
    return this.ds.getRepository(CharacterBindingEntity)
  }

  private get lwRepo(): Repository<LwCharacterEntity> {
    return this.ds.getRepository(LwCharacterEntity)
  }

  /** 生成 cb_<16hex> 格式的 binding ID */
  private generateId(): string {
    return `cb_${randomBytes(8).toString('hex')}`
  }

  /** 按 ID 取 binding 原始记录（不做投影） */
  async getById(id: string): Promise<CharacterBindingEntity | null> {
    return await this.bindingRepo.findOne({ where: { id } })
  }

  /** 列出某 project 的全部角色 binding（按 created_at 升序） */
  async listByProject(projectId: string): Promise<CharacterBindingEntity[]> {
    return await this.bindingRepo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    })
  }

  /**
   * 取生效角色数据（spec §3.7 双源投影核心）。
   *
   * - source=standalone：name/description 来自 standalone_*；appearance/outfit 不投影；
   * - source=linked_lw：name/appearance 走 override → lw 投影；
   *   description/outfit **仅来自 override**（lw_story_characters 表中无对应列）。
   *
   * @throws 当 binding 不存在时抛错，调用方需处理
   */
  async getEffectiveData(bindingId: string): Promise<EffectiveCharacterData> {
    const b = await this.bindingRepo.findOne({ where: { id: bindingId } })
    if (!b) throw new Error(`CharacterBinding not found: ${bindingId}`)

    /** 把 binding 上设定卡字段的"剩余部分"打平输出（alias/role/gender/age/race/锚点/备选服装） */
    const setupFields = {
      alias: b.alias ?? null,
      role: b.role ?? null,
      gender: b.gender ?? null,
      age: b.age ?? null,
      race: (b as any).race ?? null,
      styleAnchors: parseJsonArray(b.styleAnchors),
      outfitsExtra: parseJsonArray(b.outfitsExtra),
    }

    if (b.sourceType === 'standalone') {
      return {
        name: b.standaloneName ?? '(未命名)',
        description: b.standaloneDescription ?? '',
        appearance: undefined,
        outfit: undefined,
        voiceId: b.voiceId ?? null,
        portraitId: b.portraitId ?? null,
        source: 'standalone',
        ...setupFields,
      }
    }

    // linked_lw: 投影 lw_character + override 覆盖
    const lw = b.longWritingCharacterId
      ? await this.lwRepo.findOne({ where: { id: b.longWritingCharacterId } })
      : null

    return {
      name: b.overrideName ?? lw?.name ?? '(未命名)',
      // lw_story_characters 没有 description 列，仅来自 override
      description: b.overrideDescription ?? '',
      appearance: b.overrideAppearance ?? lw?.appearance ?? undefined,
      // lw_story_characters 没有 outfit 列，仅来自 override
      outfit: b.overrideOutfit ?? undefined,
      voiceId: b.voiceId ?? null,
      portraitId: b.portraitId ?? null,
      source: 'linked_lw',
      ...setupFields,
    }
  }

  /** 新建 standalone 角色（独立角色，不绑定 lw） */
  async createStandalone(
    input: CreateStandaloneInput,
  ): Promise<CharacterBindingEntity> {
    const entity = this.bindingRepo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      projectId: input.projectId,
      // standalone 模式不绑 lw_character（migration relax-binding-lw-id-nullable 已开放 nullable）
      longWritingCharacterId: null,
      sourceType: 'standalone',
      voiceConfig: {},
      voiceId: input.voiceId ?? null,
      standaloneName: input.name,
      standaloneDescription: input.description ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<CharacterBindingEntity>)
    return await this.bindingRepo.save(entity)
  }

  /** 新建 linked_lw 角色（绑定到既有 lw_character；可选携带初始 override） */
  async createLinkedLw(
    input: CreateLinkedLwInput,
  ): Promise<CharacterBindingEntity> {
    const ov = input.initialOverride ?? {}
    const entity = this.bindingRepo.create({
      id: this.generateId(),
      userId: input.userId ?? null,
      projectId: input.projectId,
      longWritingCharacterId: input.lwCharacterId,
      sourceType: 'linked_lw',
      voiceConfig: {},
      overrideName: ov.name ?? null,
      overrideDescription: ov.description ?? null,
      overrideAppearance: ov.appearance ?? null,
      overrideOutfit: ov.outfit ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Partial<CharacterBindingEntity>)
    return await this.bindingRepo.save(entity)
  }

  /**
   * 更新 linked_lw 模式的 override 字段（仅传入 key 才会更新；显式传 null 清空 override）。
   */
  async updateOverride(
    bindingId: string,
    override: OverridePatch,
  ): Promise<void> {
    const patch: Record<string, unknown> = { updatedAt: new Date() }
    if ('name' in override) patch.overrideName = override.name ?? null
    if ('description' in override)
      patch.overrideDescription = override.description ?? null
    if ('appearance' in override)
      patch.overrideAppearance = override.appearance ?? null
    if ('outfit' in override) patch.overrideOutfit = override.outfit ?? null
    await this.bindingRepo.update(bindingId, patch)
  }

  /** 更新 standalone 模式的 standalone 字段 */
  async updateStandalone(
    bindingId: string,
    patch: StandalonePatch,
  ): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if ('name' in patch && patch.name !== undefined)
      update.standaloneName = patch.name
    if ('description' in patch && patch.description !== undefined)
      update.standaloneDescription = patch.description
    await this.bindingRepo.update(bindingId, update)
  }

  /** 设置 / 清空角色绑定的语音 ID */
  async setVoice(bindingId: string, voiceId: string | null): Promise<void> {
    await this.bindingRepo.update(bindingId, {
      voiceId,
      updatedAt: new Date(),
    })
  }

  /** 设置 / 清空角色绑定的肖像 ID */
  async setPortrait(
    bindingId: string,
    portraitId: string | null,
  ): Promise<void> {
    await this.bindingRepo.update(bindingId, {
      portraitId,
      updatedAt: new Date(),
    })
  }

  /** 删除一个角色 binding */
  async delete(bindingId: string): Promise<void> {
    await this.bindingRepo.delete(bindingId)
  }

  /**
   * FU5-C2 一次性更新身份块 + 声音参数 + 风格锚点 + 备选服装。
   * 仅 patch 里出现的 key 才更新；styleAnchors / outfitsExtra 数组转 JSON 字符串。
   */
  async updateExtra(bindingId: string, patch: CharacterExtraPatch): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if ('alias' in patch) update.alias = patch.alias ?? null
    if ('role' in patch) update.role = patch.role ?? null
    if ('gender' in patch) update.gender = patch.gender ?? null
    if ('age' in patch) update.age = patch.age ?? null
    if ('race' in patch) update.race = patch.race ?? null
    if ('voiceSpeed' in patch) update.voiceSpeed = patch.voiceSpeed ?? null
    if ('voicePitch' in patch) update.voicePitch = patch.voicePitch ?? null
    if ('voiceEmotion' in patch) update.voiceEmotion = patch.voiceEmotion ?? null
    if ('styleAnchors' in patch) {
      update.styleAnchors = patch.styleAnchors
        ? JSON.stringify(patch.styleAnchors)
        : null
    }
    if ('outfitsExtra' in patch) {
      update.outfitsExtra = patch.outfitsExtra
        ? JSON.stringify(patch.outfitsExtra)
        : null
    }
    await this.bindingRepo.update(bindingId, update)
  }
}

/** 把 JSON 字符串解析成 string[]；失败 / null / 不是数组 都返回 null（不再 [] 以区分"未设置"vs"显式空"） */
function parseJsonArray(s: string | null | undefined): string[] | null {
  if (!s) return null
  try {
    const v = JSON.parse(s)
    if (!Array.isArray(v)) return null
    const arr = v.filter((x): x is string => typeof x === 'string')
    return arr.length === 0 ? null : arr
  } catch {
    return null
  }
}
