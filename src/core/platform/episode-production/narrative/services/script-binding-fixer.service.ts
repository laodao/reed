/**
 * 剧本 binding 修复 service（spec §4.1 强约束补齐 · P5/P6-FU1）
 * @module platform/episode-production/narrative/services/script-binding-fixer.service
 *
 * 处理历史数据残留：旧 scene.characters JSON 里 characterBindingId 为
 * null（AI 识别的角色名 vs 项目 character_bindings 库不一致）。
 *
 * P4 resolveBindingId 已让新生成 scenes 自动填 binding_id；本 service
 * 提供"事后修复"入口，让用户主动触发。
 *
 * 流程：
 *   1. scanUnbound(episodeScriptId) → 返回 scene.characters / dialogues 中
 *      缺 binding_id 的角色名清单 + 已存在的 binding 候选
 *   2. fixByNameMatch(episodeScriptId) → 按 characterName 匹配现有
 *      character_bindings.standaloneName / overrideName，命中则填回
 *   3. createMissingBindings(episodeScriptId) → 为还未匹配的角色名自动
 *      创建 standalone binding 并填回（用户确认后）
 */

import type { DataSource } from 'typeorm'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { CharacterBindingEntity } from '@core/database/entities/episode-production/character-binding.entity'
import { getCurrentUserId } from '@core/context/user-context'
import { CharacterAssetService } from '@core/platform/episode-production/assets/services/character-asset.service'
import {
  normalizeBindingName,
  characterBindingNames,
  buildBindingNameIndex,
} from '@core/platform/episode-production/assets/services/binding-name-utils'

interface UnboundCharRef {
  /** 出现在哪个 scene */
  sceneId: string
  sceneNumber: number
  /** AI 识别的名字 */
  characterName: string
  /** 出现位置（characters / dialogues） */
  source: 'characters' | 'dialogues' | 'actions'
}

interface ScanResult {
  unbound: UnboundCharRef[]
  /** 项目下现有 character_bindings 候选（名字 → id） */
  candidates: Array<{ id: string; name: string }>
}

interface FixResult {
  /** 通过 name 匹配填回的引用数 */
  matched: number
  /** 仍未匹配的 characterName 集合 */
  stillUnboundNames: string[]
}

interface CreateMissingResult {
  /** 新建的 standalone binding 列表 */
  created: Array<{ id: string; name: string }>
  /** 通过新建并填回的引用数 */
  filled: number
}

export class ScriptBindingFixerService {
  constructor(private readonly ds: DataSource) {}

  /**
   * 扫描某 episode_script 下所有 scene 的 characters / dialogues / actions，
   * 找出 characterBindingId 为空但有 characterName 的引用。
   */
  async scanUnbound(episodeScriptId: string): Promise<ScanResult> {
    const scenes = await this.ds
      .getRepository(SceneScriptEntity)
      .find({ where: { episodeScriptId } })

    const unbound: UnboundCharRef[] = []
    for (const scene of scenes) {
      const chars = (scene.characters as any[] | null) ?? []
      for (const c of chars) {
        if (!c?.characterBindingId && c?.characterName) {
          unbound.push({
            sceneId: scene.id,
            sceneNumber: (scene as any).sceneNumber ?? 0,
            characterName: c.characterName,
            source: 'characters',
          })
        }
      }
      const dlgs = ((scene as any).dialogues as any[] | null) ?? []
      for (const d of dlgs) {
        if (!d?.characterBindingId && d?.characterName) {
          unbound.push({
            sceneId: scene.id,
            sceneNumber: (scene as any).sceneNumber ?? 0,
            characterName: d.characterName,
            source: 'dialogues',
          })
        }
      }
      const acts = ((scene as any).actions as any[] | null) ?? []
      for (const a of acts) {
        if (!a?.characterBindingId && a?.characterName) {
          unbound.push({
            sceneId: scene.id,
            sceneNumber: (scene as any).sceneNumber ?? 0,
            characterName: a.characterName,
            source: 'actions',
          })
        }
      }
    }

    // 加载项目候选
    const candidates: Array<{ id: string; name: string }> = []
    if (scenes.length > 0) {
      const projectId = await this.resolveProjectId(scenes[0].episodeScriptId)
      if (projectId) {
        const bindings = await this.ds
          .getRepository(CharacterBindingEntity)
          .find({ where: { projectId } })
        for (const b of bindings) {
          const name = b.standaloneName ?? (b as any).overrideName ?? null
          if (name) candidates.push({ id: b.id, name })
        }
      }
    }

    return { unbound, candidates }
  }

  /**
   * 按 characterName 匹配现有 character_bindings（standaloneName / overrideName /
   * alias，归一化比较），命中则把 binding_id 填回 scene.characters JSON。
   */
  async fixByNameMatch(episodeScriptId: string): Promise<FixResult> {
    const scan = await this.scanUnbound(episodeScriptId)
    // 归一化名字索引（含 alias 候选；同名多命中取最早创建）
    const nameToId = new Map<string, string>()
    const projectId = await this.resolveProjectId(episodeScriptId)
    if (projectId) {
      const bindings = await this.ds.getRepository(CharacterBindingEntity).find({
        where: { projectId },
        order: { createdAt: 'ASC' },
      })
      const index = buildBindingNameIndex(bindings, characterBindingNames)
      for (const [key, b] of index) nameToId.set(key, b.id)
    }
    // 兼容：扫描候选里的原始名也进索引（不动 UI 候选展示语义）
    for (const c of scan.candidates) {
      const key = normalizeBindingName(c.name)
      if (key && !nameToId.has(key)) nameToId.set(key, c.id)
    }

    let matched = 0
    const stillUnbound = new Set<string>()
    const sceneRepo = this.ds.getRepository(SceneScriptEntity)
    const scenesToUpdate = new Map<string, SceneScriptEntity>()

    const scenes = await sceneRepo.find({ where: { episodeScriptId } })
    for (const scene of scenes) {
      let modified = false

      const chars = ((scene.characters as any[] | null) ?? []).map((c: any) => {
        if (!c?.characterBindingId && c?.characterName) {
          const id = nameToId.get(normalizeBindingName(c.characterName))
          if (id) {
            modified = true
            matched += 1
            return { ...c, characterBindingId: id }
          } else {
            stillUnbound.add(c.characterName)
          }
        }
        return c
      })

      const dlgs = (((scene as any).dialogues as any[] | null) ?? []).map(
        (d: any) => {
          if (!d?.characterBindingId && d?.characterName) {
            const id = nameToId.get(normalizeBindingName(d.characterName))
            if (id) {
              modified = true
              matched += 1
              return { ...d, characterBindingId: id }
            } else {
              stillUnbound.add(d.characterName)
            }
          }
          return d
        },
      )

      const acts = (((scene as any).actions as any[] | null) ?? []).map(
        (a: any) => {
          if (!a?.characterBindingId && a?.characterName) {
            const id = nameToId.get(normalizeBindingName(a.characterName))
            if (id) {
              modified = true
              matched += 1
              return { ...a, characterBindingId: id }
            } else {
              stillUnbound.add(a.characterName)
            }
          }
          return a
        },
      )

      if (modified) {
        ;(scene as any).characters = chars
        ;(scene as any).dialogues = dlgs
        ;(scene as any).actions = acts
        scenesToUpdate.set(scene.id, scene)
      }
    }

    for (const scene of scenesToUpdate.values()) {
      await sceneRepo.save(scene)
    }

    return {
      matched,
      stillUnboundNames: Array.from(stillUnbound),
    }
  }

  /**
   * 为仍未匹配的 characterName 自动创建 standalone character_binding，
   * 然后再次跑 fixByNameMatch 填回。
   *
   * 用户确认后才调用（"自动创建并修复" 按钮）。
   */
  async createMissingBindings(
    episodeScriptId: string,
  ): Promise<CreateMissingResult> {
    const scenes = await this.ds
      .getRepository(SceneScriptEntity)
      .find({ where: { episodeScriptId } })
    if (scenes.length === 0) {
      return { created: [], filled: 0 }
    }

    const projectId = await this.resolveProjectId(scenes[0].episodeScriptId)
    if (!projectId) {
      throw new Error(
        `无法确定 episodeScript ${episodeScriptId} 所属的 projectId`,
      )
    }

    const scan = await this.scanUnbound(episodeScriptId)
    // 已有候选 name set（归一化 key；同名不同写法的不再重复建）
    const existingNames = new Set(
      scan.candidates.map((c) => normalizeBindingName(c.name)).filter(Boolean),
    )

    // 收集还没 binding 的 characterName（按归一化 key 去重）
    const missingNames = new Map<string, string>()
    for (const ref of scan.unbound) {
      const key = normalizeBindingName(ref.characterName)
      if (key && !existingNames.has(key) && !missingNames.has(key)) {
        missingNames.set(key, ref.characterName)
      }
    }

    if (missingNames.size === 0) {
      return { created: [], filled: 0 }
    }

    // 走 CharacterAssetService.createStandalone（2026-09-21 去重归一）：
    // 内部 find-or-create（含 alias 匹配，命中即复用不再新建），且新建时携带
    // styleAnchors 项目风格快照等完整字段——替代原先绕过 service 的裸 repo 直插。
    const charSvc = new CharacterAssetService(this.ds)
    const userId = getCurrentUserId()
    const created: Array<{ id: string; name: string }> = []
    for (const name of missingNames.values()) {
      const binding = await charSvc.createStandalone({ projectId, name, userId })
      created.push({ id: binding.id, name })
    }

    // 再跑一遍 fix 填回
    const fix = await this.fixByNameMatch(episodeScriptId)

    return { created, filled: fix.matched }
  }

  /** scene → episodeScript → episode → project 反查 projectId */
  private async resolveProjectId(
    episodeScriptId: string,
  ): Promise<string | null> {
    const epScript = await this.ds
      .getRepository(EpisodeScriptEntity)
      .findOne({ where: { id: episodeScriptId } })
    if (!epScript) return null
    const ep = await this.ds
      .getRepository(VideoEpisodeEntity)
      .findOne({ where: { id: (epScript as any).episodeId } })
    return ep?.projectId ?? null
  }
}
