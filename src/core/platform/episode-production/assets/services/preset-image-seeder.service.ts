/**
 * 预设角色形象图按需生成（spec 2026-05-09 ep-redesign §3.2 D3 follow-up）
 *
 * 不在 seed migration 中跑（避免每次安装就 12 次 image gen 浪费配额）；
 * 改为运行时按需 — 用户首次打开"🎭 内置形象"tab 或点"批量生成"时调本 service。
 *
 * 流程：
 *   1. 给定 preset_id：取 binding effective 字段 → 拼 prompt
 *   2. 调 MainImageGeneratorService.generateMain（character 走现有硬约束链路）
 *   3. 落 asset_image (assetType=character, assetId=presetId, category=main, isMain=1)
 *   4. 已有 → 直接跳过（幂等）
 *
 * 多租户：preset 是全局共享（user_id IS NULL），所以预设的 asset_image 也用 user_id=NULL 落库；
 *         用户自己引用预设时（D3 createBindingFromPreset）会拷一份到 user 自己的 asset_image。
 */

import type { DataSource } from 'typeorm'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { AssetImageEntity } from '@core/database/entities/episode-production/asset-image.entity'
import { MainImageGeneratorService } from './main-image-generator.service'
import { AssetImageService } from './asset-image.service'
import { createGalleryImageGenerator } from './image-provider-adapter'
import { buildAssetIdentityPrompt } from '../prompts/asset-identity-prompt'

export interface SeedResult {
  presetId: string
  status: 'created' | 'skipped' | 'failed'
  imagePath?: string
  error?: string
}

export class PresetImageSeederService {
  constructor(private readonly ds: DataSource) {}

  /**
   * 确保某 preset 有主图；已有跳过，没有调 image gen 生成。
   */
  async ensureMainImageFor(presetId: string): Promise<SeedResult> {
    const bindingRepo = this.ds.getRepository(CharacterBindingEntity)
    const imageRepo = this.ds.getRepository(AssetImageEntity)

    const binding = await bindingRepo.findOne({ where: { id: presetId } })
    if (!binding) {
      return { presetId, status: 'failed', error: 'preset binding 不存在' }
    }
    if (binding.isPreset !== 1) {
      return { presetId, status: 'failed', error: '该 binding 不是 preset_digital 类型' }
    }

    // 幂等：已有 main → 跳过
    const existing = await imageRepo.findOne({
      where: { assetType: 'character', assetId: presetId, isMain: 1 },
    })
    if (existing) {
      return { presetId, status: 'skipped', imagePath: existing.imagePath }
    }

    // 拼 prompt（同主图生成路径，effective 投影后调 buildAssetIdentityPrompt）
    const eff: any = {
      name: binding.standaloneName,
      description: binding.standaloneDescription,
      gender: binding.gender,
      age: binding.age,
      race: binding.race,
      appearance: binding.overrideAppearance,
      styleAnchors: this.parseStyleAnchors(binding.styleAnchors),
    }
    const identity = buildAssetIdentityPrompt('character', eff, null)
    const prompt = identity || (binding.standaloneName ?? 'a person')

    // 调 image gen（character 硬约束 / 身份保持由 main-image-generator 内部加；
    // 但当前 generateMain 入口对 character 不加 framing 硬约束 — 那是 renderer 加的。
    // 这里直接调，prompt 含中英风格锚点已足够）
    const imageSvc = new AssetImageService(this.ds)
    const svc = new MainImageGeneratorService(imageSvc, createGalleryImageGenerator(), this.ds)
    try {
      const created = await svc.generateMain({
        assetType: 'character',
        assetId: presetId,
        prompt,
        userId: null,  // 全局共享
      })
      return { presetId, status: 'created', imagePath: created.imagePath }
    } catch (e: any) {
      return { presetId, status: 'failed', error: e?.message ?? String(e) }
    }
  }

  /**
   * 批量生成所有 preset 的主图。
   * 串行执行（避免 provider rate limit）；任一失败不阻断，返回 SeedResult[]。
   */
  async ensureAllPresetImages(): Promise<SeedResult[]> {
    const presets = await this.listPresets()
    const results: SeedResult[] = []
    for (const p of presets) {
      const r = await this.ensureMainImageFor(p.id)
      results.push(r)
    }
    return results
  }

  /** 列所有预设角色（只读，绕 BaseRepository scope） */
  async listPresets(): Promise<CharacterBindingEntity[]> {
    const repo = this.ds.getRepository(CharacterBindingEntity)
    return await repo.find({
      where: {
        // user_id IS NULL + is_preset=1 + source_type='preset_digital'
        userId: null as any,
        isPreset: 1,
        sourceType: 'preset_digital',
      } as any,
      order: { createdAt: 'ASC' },
    })
  }

  private parseStyleAnchors(raw: string | null | undefined): string[] {
    if (!raw) return []
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  }
}
