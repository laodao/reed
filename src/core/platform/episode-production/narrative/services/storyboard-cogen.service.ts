/**
 * 分镜与资产识别联合生成 service（tasks/2026-09-16-storyboard-asset-cogen · D1/D2/D4）
 * @module platform/episode-production/narrative/services/storyboard-cogen.service
 *
 * 编排（按场景串行）：
 *   1. generateCogenForScene：一次 LLM 调用产出「资产清单 + 分镜」（D1），
 *      schema 校验 + 纠错重试 1 次（D4-1）；
 *   2. D2 绑定构造（代码侧，不让模型回填 ID）：按名（standaloneName/overrideName）
 *      匹配项目现有 binding，命中复用；未命中调既有 createStandalone 建绑定
 *      （描述来自响应资产卡）；
 *   3. 替换式写分镜：先删该场景旧分镜再插入（与旧「批量生成分镜」一致），
 *      characters[].characterId = binding.id，locationBindingIds/itemBindingIds 填上；
 *   4. 回填 scene.characters[].characterBindingId、scene_characters.character_binding_id、
 *      scene.location_binding_id；
 *   5. D4-2 断言：落库后复读，任一 characterId 为空 → throw。
 *
 * H13：每场景开始/完成/失败经 onProgress 回调上报（handler 转成
 * ep:cogen-progress 事件推 renderer）。
 *
 * 写库时机：全部写库在「本场景生成 + 校验成功之后」才执行，失败保留旧分镜；
 * 单场景失败不阻断后续场景（结果聚合 error 字段返回）。
 */

import type { DataSource } from 'typeorm'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { SceneCharacterEntity } from '@core/database/entities/episode-production/scene-character.entity'
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { StoryboardRepository } from '@core/database/repositories/storyboard.repository'
import { getCurrentUserId } from '@core/context/user-context'
import type { SceneScript, StoryboardCharacter } from '@shared/types/episode-production'
import { CharacterAssetService } from '@core/platform/episode-production/assets/services/character-asset.service'
import { LocationAssetService } from '@core/platform/episode-production/assets/services/location-asset.service'
import { ItemAssetService } from '@core/platform/episode-production/assets/services/item-asset.service'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { generateCogenForScene } from '../ai/storyboard-cogen'
import type { CogenExistingAsset, CogenOutput } from '../ai/storyboard-cogen'
import { normalizeShotNumbers } from './storyboard.service'

/** 单场景联合生成结果 */
export interface CogenSceneResult {
  sceneId: string
  sceneNumber: number
  shotCount: number
  createdBindings: Array<{ kind: 'character' | 'location' | 'item'; id: string; name: string }>
  reusedBindings: Array<{ kind: 'character' | 'location' | 'item'; id: string; name: string }>
  error?: string
}

/** 整集联合生成结果（单场景失败不阻断，error 聚合在各自条目上） */
export interface CogenEpisodeResult {
  episodeId: string
  results: CogenSceneResult[]
}

/** H13：逐场景进度事件（handler 侧经 webContents.send('ep:cogen-progress') 推到 renderer） */
export interface CogenProgressEvent {
  episodeId: string
  sceneNumber: number
  totalScenes: number
  status: 'start' | 'done' | 'error'
  error?: string
}

/** binding 名 → 快照（按 standaloneName/overrideName 索引，跨场景去重的依据） */
interface BindingSnapshot {
  id: string
  name: string
  description: string | null
}

/** cogen 位置词 → 分镜 characters[].position 坐标（与旧 AI 输出 shape 一致） */
const POSITION_MAP: Record<string, { x: number; y: number; scale: number }> = {
  left: { x: 25, y: 50, scale: 1 },
  center: { x: 50, y: 50, scale: 1 },
  right: { x: 75, y: 50, scale: 1 },
}

export class StoryboardCogenService {
  constructor(private readonly ds: DataSource) {}

  private get storyboardRepo(): StoryboardRepository {
    return new StoryboardRepository(this.ds)
  }

  /**
   * 整集联合生成分镜（逐场景串行：第 1 场景建资产，后续场景按名复用）。
   *
   * @param onProgress H13：每场景开始/完成/失败回调（handler 转成 ep:cogen-progress
   *   事件推 renderer）；回调异常被吞掉，不阻断生成。
   * @throws 剧集/剧本/场景不存在，或项目未配置 scriptModel（D3：不静默落回默认模型）
   */
  async cogenStoryboardsForEpisode(
    episodeId: string,
    onProgress?: (event: CogenProgressEvent) => void,
  ): Promise<CogenEpisodeResult> {
    // ─── 加载链：episode → script → scenes；episode → project.config.scriptModel ───
    const episode = await this.ds
      .getRepository(VideoEpisodeEntity)
      .findOne({ where: { id: episodeId } })
    if (!episode) throw new Error(`剧集不存在：${episodeId}`)
    if (!episode.scriptId) throw new Error('剧集还没有剧本，请先在「剧本」页生成剧本')

    const script = await this.ds
      .getRepository(EpisodeScriptEntity)
      .findOne({ where: { id: episode.scriptId } })
    if (!script) throw new Error(`剧本不存在：${episode.scriptId}`)

    const scenes = await this.ds.getRepository(SceneScriptEntity).find({
      where: { episodeScriptId: script.id },
      order: { sceneNumber: 'ASC' },
    })
    if (scenes.length === 0) throw new Error('没有场景，请先在「剧本」页拆分场景')

    const project = await this.ds
      .getRepository(VideoProjectEntity)
      .findOne({ where: { id: episode.projectId } })
    if (!project) throw new Error(`项目不存在：${episode.projectId}`)

    const scriptModel = (project.config as any)?.scriptModel as
      | { providerConfigId?: string; modelId?: string }
      | undefined
    if (!scriptModel?.providerConfigId || !scriptModel?.modelId) {
      throw new Error(
        '未配置剧本生成模型：请先到 Studio 顶栏「设置」中为项目配置剧本生成模型（scriptModel），再批量生成分镜',
      )
    }
    const providerConfigId = scriptModel.providerConfigId
    const modelId = scriptModel.modelId

    // ─── 项目现有 binding 快照（按名索引；随建随更新，跨场景去重） ───
    const projectId = project.id
    const userId = getCurrentUserId()
    const charSvc = new CharacterAssetService(this.ds)
    const locSvc = new LocationAssetService(this.ds, new AssetImageService(this.ds))
    const itemSvc = new ItemAssetService(this.ds)

    const charIndex = new Map<string, BindingSnapshot>()
    const locIndex = new Map<string, BindingSnapshot>()
    const itemIndex = new Map<string, BindingSnapshot>()

    for (const b of await charSvc.listByProject(projectId)) {
      const name = b.standaloneName ?? b.overrideName
      if (name) {
        charIndex.set(name, {
          id: b.id,
          name,
          description: b.standaloneDescription ?? b.overrideDescription ?? null,
        })
      }
    }
    for (const b of await locSvc.listByProject(projectId)) {
      const name = b.standaloneName ?? b.overrideName
      if (name) {
        locIndex.set(name, {
          id: b.id,
          name,
          description: b.standaloneDescription ?? b.overrideDescription ?? null,
        })
      }
    }
    for (const b of await itemSvc.listByProject(projectId)) {
      const name = b.standaloneName ?? b.overrideName
      if (name) {
        itemIndex.set(name, {
          id: b.id,
          name,
          description: b.standaloneDescription ?? b.overrideDescription ?? null,
        })
      }
    }

    /** 当前快照 → 注入 prompt 的已有资产清单（每场景重建，含前序场景新建资产） */
    const buildExistingAssets = (): CogenExistingAsset[] => [
      ...[...charIndex.values()].map((b) => ({
        kind: 'character' as const,
        id: b.id,
        name: b.name,
        description: b.description,
      })),
      ...[...locIndex.values()].map((b) => ({
        kind: 'location' as const,
        id: b.id,
        name: b.name,
        description: b.description,
      })),
      ...[...itemIndex.values()].map((b) => ({
        kind: 'item' as const,
        id: b.id,
        name: b.name,
        description: b.description,
      })),
    ]

    // ─── 逐场景串行 ───
    const results: CogenSceneResult[] = []
    const totalScenes = scenes.length
    const emitProgress = (
      sceneNumber: number,
      status: CogenProgressEvent['status'],
      error?: string,
    ): void => {
      try {
        onProgress?.({ episodeId, sceneNumber, totalScenes, status, error })
      } catch {
        /* 进度推送失败不阻断生成 */
      }
    }
    for (const scene of scenes) {
      const result: CogenSceneResult = {
        sceneId: scene.id,
        sceneNumber: scene.sceneNumber,
        shotCount: 0,
        createdBindings: [],
        reusedBindings: [],
      }
      results.push(result)

      emitProgress(scene.sceneNumber, 'start')
      try {
        // 1) LLM 联合生成（含校验 + 纠错重试 1 次；失败抛错，本场景不写库）
        const output = await generateCogenForScene(
          scene as unknown as SceneScript,
          buildExistingAssets(),
          providerConfigId,
          modelId,
        )

        // 2) D2 绑定构造：按名复用 / createStandalone 新建
        const charBindings = await this.resolveCharacterBindings(
          output,
          charIndex,
          charSvc,
          projectId,
          userId,
          result,
        )
        const locationBinding = await this.resolveLocationBinding(
          output,
          locIndex,
          locSvc,
          projectId,
          userId,
          result,
        )
        const itemBindings = await this.resolveItemBindings(
          output,
          itemIndex,
          itemSvc,
          projectId,
          userId,
          result,
        )

        // 3) 替换式写分镜（删旧 → 插新；仅在生成+校验成功后执行）
        await this.replaceSceneStoryboards(scene.id, output, charBindings, locationBinding.id, itemBindings)

        // 4) 回填场景级绑定字段
        await this.backfillSceneBindings(scene, charBindings, locationBinding.id)

        // 5) D4-2 断言：落库后复读，characterId 必须全部非空
        await this.assertCharacterIdsFilled(scene.id)

        result.shotCount = output.shots.length
        console.log(
          `[StoryboardCogenService] 场景 ${scene.sceneNumber} 完成：${output.shots.length} 个分镜，` +
            `新建绑定 ${result.createdBindings.length}，复用 ${result.reusedBindings.length}`,
        )
        emitProgress(scene.sceneNumber, 'done')
      } catch (e: any) {
        // 单场景失败不阻断后续场景；旧分镜保留（删旧发生在生成成功之后）
        result.error = e?.message ?? '联合生成失败（未知异常）'
        console.error(`[StoryboardCogenService] 场景 ${scene.sceneNumber} 失败：`, e)
        emitProgress(scene.sceneNumber, 'error', result.error)
      }
    }

    // 状态闭环（同 ep:generate-storyboards 的 P0-CM2 写法）：分镜已生成 → storyboarding
    if (results.some((r) => !r.error)) {
      try {
        const { advanceEpisodeStatus } = await import(
          '@core/platform/episode-production/workflow/episode-status-advance'
        )
        await advanceEpisodeStatus(this.ds, episodeId, 'storyboarding')
      } catch {
        /* 状态推进失败不阻断分镜结果 */
      }
    }

    return { episodeId, results }
  }

  // ==================== D2 绑定构造 ====================

  /**
   * 角色：按名匹配现有 binding（standaloneName/overrideName）→ 命中复用；
   * 未命中 createStandalone（描述来自资产卡，含服饰；性别/年龄写入身份块）。
   */
  private async resolveCharacterBindings(
    output: CogenOutput,
    index: Map<string, BindingSnapshot>,
    svc: CharacterAssetService,
    projectId: string,
    userId: string | null,
    result: CogenSceneResult,
  ): Promise<Map<string, BindingSnapshot>> {
    const resolved = new Map<string, BindingSnapshot>()
    for (const c of output.assets.characters) {
      let snap = index.get(c.name)
      if (snap) {
        result.reusedBindings.push({ kind: 'character', id: snap.id, name: c.name })
      } else {
        // 描述用资产卡：外貌/服饰描述并入 standaloneDescription，定妆图与分镜共用（消除 F12 漂移）
        const description = c.outfit ? `${c.description}\n服饰：${c.outfit}` : c.description
        const created = await svc.createStandalone({
          projectId,
          name: c.name,
          description,
          age: c.age,
          gender: c.gender,
          userId,
        })
        snap = { id: created.id, name: c.name, description }
        index.set(c.name, snap)
        result.createdBindings.push({ kind: 'character', id: snap.id, name: c.name })
      }
      resolved.set(c.name, snap)
    }
    return resolved
  }

  /** 地点：同角色逻辑（恰好一个） */
  private async resolveLocationBinding(
    output: CogenOutput,
    index: Map<string, BindingSnapshot>,
    svc: LocationAssetService,
    projectId: string,
    userId: string | null,
    result: CogenSceneResult,
  ): Promise<BindingSnapshot> {
    const loc = output.assets.location
    let snap = index.get(loc.name)
    if (snap) {
      result.reusedBindings.push({ kind: 'location', id: snap.id, name: loc.name })
    } else {
      const created = await svc.createStandalone({
        projectId,
        name: loc.name,
        description: loc.description,
        userId,
      })
      snap = { id: created.id, name: loc.name, description: loc.description }
      index.set(loc.name, snap)
      result.createdBindings.push({ kind: 'location', id: snap.id, name: loc.name })
    }
    return snap
  }

  /** 物品：同角色逻辑 */
  private async resolveItemBindings(
    output: CogenOutput,
    index: Map<string, BindingSnapshot>,
    svc: ItemAssetService,
    projectId: string,
    userId: string | null,
    result: CogenSceneResult,
  ): Promise<Map<string, BindingSnapshot>> {
    const resolved = new Map<string, BindingSnapshot>()
    for (const it of output.assets.items) {
      let snap = index.get(it.name)
      if (snap) {
        result.reusedBindings.push({ kind: 'item', id: snap.id, name: it.name })
      } else {
        const created = await svc.createStandalone({
          projectId,
          name: it.name,
          description: it.description,
          userId,
        })
        snap = { id: created.id, name: it.name, description: it.description }
        index.set(it.name, snap)
        result.createdBindings.push({ kind: 'item', id: snap.id, name: it.name })
      }
      resolved.set(it.name, snap)
    }
    return resolved
  }

  // ==================== 写库 ====================

  /**
   * 替换式写分镜：先删该场景旧分镜，再按 cogen 输出插入新分镜。
   * characters[].characterId = binding.id（代码构造，D2）；shotNumber 强制 1..N。
   */
  private async replaceSceneStoryboards(
    sceneId: string,
    output: CogenOutput,
    charBindings: Map<string, BindingSnapshot>,
    locationBindingId: string,
    itemBindings: Map<string, BindingSnapshot>,
  ): Promise<void> {
    await this.storyboardRepo.deleteBySceneScriptId(sceneId)

    // shotNumber 按数组顺序强制重排为 1..N（与旧批量生成一致，防跳号）
    for (const shot of normalizeShotNumbers(
      output.shots.map((s) => ({ ...s, shotNumber: 0 })),
    )) {
      const characters: StoryboardCharacter[] = shot.characters.map((c) => {
        const binding = charBindings.get(c.name)
        if (!binding) {
          // 校验已保证 name ⊆ 资产清单；这里是代码侧兜底，绝不写空 ID
          throw new Error(`分镜角色 "${c.name}" 未解析到 binding（不应发生，校验已拦截）`)
        }
        return {
          characterId: binding.id,
          position: POSITION_MAP[c.position ?? 'center'] ?? POSITION_MAP.center,
          expression: c.expression,
          action: c.action,
          facing: (c.facing ?? 'front') as StoryboardCharacter['facing'],
        }
      })

      const itemBindingIds = shot.itemNames
        .map((n) => itemBindings.get(n)?.id)
        .filter((id): id is string => !!id)

      const created = await this.storyboardRepo.create({
        sceneScriptId: sceneId,
        shotNumber: shot.shotNumber,
        shotType: shot.shotType as any,
        cameraAngle: shot.cameraAngle as any,
        cameraMovement: shot.cameraMovement as any,
        frameDescription: shot.frameDescription,
        subject: shot.subject,
        composition: shot.composition,
        characters,
        dialogueIds: [],
        actionIds: [],
        duration: shot.duration,
        transition: { type: 'cut', duration: 500 },
      })

      // create 入参不含 binding 覆盖字段（沿用旧 repo 签名），创建后补写
      await this.storyboardRepo.update(created.id, {
        locationBindingIds: [locationBindingId],
        itemBindingIds,
      })
    }
  }

  /**
   * 回填场景级绑定（D2-2）：
   *   - scene.characters[].characterBindingId（按 characterName 匹配；清单外新角色追加条目）
   *   - scene_characters.character_binding_id（按 character_name 匹配；缺失行补插）
   *   - scene.location_binding_id
   */
  private async backfillSceneBindings(
    scene: SceneScriptEntity,
    charBindings: Map<string, BindingSnapshot>,
    locationBindingId: string,
  ): Promise<void> {
    // scene.characters JSON
    const chars = ((scene.characters as any[] | null) ?? []).map((c: any) => {
      const binding = c?.characterName ? charBindings.get(c.characterName) : undefined
      return binding && !c.characterBindingId ? { ...c, characterBindingId: binding.id } : c
    })
    const existingNames = new Set(chars.map((c: any) => c?.characterName).filter(Boolean))
    for (const [name, binding] of charBindings) {
      if (!existingNames.has(name)) {
        chars.push({
          characterId: '',
          characterName: name,
          characterBindingId: binding.id,
          position: 'center',
        })
      }
    }

    scene.characters = chars
    scene.locationBindingId = locationBindingId
    scene.updatedAt = new Date()
    await this.ds.getRepository(SceneScriptEntity).save(scene)

    // scene_characters 表（entity 有 character_binding_id 字段）
    const scRepo = this.ds.getRepository(SceneCharacterEntity)
    const rows = await scRepo.find({ where: { sceneScriptId: scene.id } })
    const rowByName = new Map(rows.map((r) => [r.characterName, r]))
    let sortOrder = rows.length
    for (const [name, binding] of charBindings) {
      const row = rowByName.get(name)
      if (row) {
        if (!row.characterBindingId) {
          await scRepo.update({ id: row.id }, { characterBindingId: binding.id })
        }
      } else {
        const userId = getCurrentUserId()
        await scRepo.save(
          scRepo.create({
            id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            userId,
            sceneScriptId: scene.id,
            characterId: '',
            characterBindingId: binding.id,
            characterName: name,
            position: 'center',
            expression: null,
            action: null,
            outfit: null,
            sortOrder: sortOrder++,
          }),
        )
      }
    }
  }

  /** D4-2：落库后复读该场景全部分镜，任一 characters[].characterId 为空 → throw */
  private async assertCharacterIdsFilled(sceneId: string): Promise<void> {
    const storyboards = await this.storyboardRepo.getBySceneScriptId(sceneId)
    for (const sb of storyboards) {
      for (const c of (sb.characters as any[] | null) ?? []) {
        if (!c?.characterId) {
          throw new Error(
            `分镜 ${sb.id}（shot ${sb.shotNumber}）存在空 characterId（角色 "${c?.characterName ?? '?'}"），` +
              '联合生成落库断言失败（D4-2）',
          )
        }
      }
    }
  }
}
