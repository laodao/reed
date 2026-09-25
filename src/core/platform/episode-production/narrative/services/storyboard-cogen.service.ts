/**
 * 分镜与资产识别联合生成 service（tasks/2026-09-16-storyboard-asset-cogen · D1/D2/D4）
 * @module platform/episode-production/narrative/services/storyboard-cogen.service
 *
 * 编排（按场景串行）：
 *   1. generateCogenForScene：一次 LLM 调用产出「资产清单 + 分镜」（D1），
 *      schema 校验 + 纠错重试 1 次（D4-1）；
 *   2. D2 绑定构造（代码侧，不让模型回填 ID）：按名归一化匹配项目现有 binding
 *      （候选名 = getEffectiveData 投影名 + standalone/override/alias/双轨列），
 *      命中复用；未命中调既有 createStandalone 建绑定（描述来自响应资产卡）；
 *   3. 替换式写分镜：先删该场景旧分镜再插入（与旧「批量生成分镜」一致），
 *      characters[].characterId = binding.id，locationBindingIds/itemBindingIds 填上；
 *   4. 回填 scene.characters[].characterBindingId、scene_characters.character_binding_id、
 *      scene.location_binding_id；
 *   5. D4-2 断言：落库后复读，任一 characterId 为空 → throw。
 *
 * O2（2026-09-16 ep-optimization）：默认增量模式——场景已有合格分镜则跳过
 * （force=true 全量重写）；LLM 超时错误 sleep 60s 后原样重试恰好 1 次。
 * O3：按名复用 binding 时若旧描述过薄，用新资产卡描述富化回填（enrichedBindings）。
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
import { cleanupStoryboards } from '../storyboard-cleanup.service'
import {
  normalizeBindingName,
  characterBindingNames,
  locationBindingNames,
  itemBindingNames,
  matchNameIndexWithPrefix,
} from '@core/platform/episode-production/assets/services/binding-name-utils'
import {
  isMacroScaleLocationName,
  containsInteriorScaleWord,
} from '@core/platform/episode-production/assets/prompts/location-constraints'

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
  /** O2 增量模式：已有合格分镜被跳过的场景（force=true 时恒空） */
  skippedScenes: Array<{ sceneId: string; sceneNumber: number }>
  /** O3：复用命中但描述过薄、已用新资产卡描述富化回填的 binding */
  enrichedBindings: Array<{ kind: 'character' | 'location' | 'item'; id: string; name: string }>
}

/** O2：cogen 选项。force=true 全量重写（renderer 批量按钮 / agent 拆镜语义） */
export interface CogenOptions {
  force?: boolean
}

/** H13：逐场景进度事件（handler 侧经 webContents.send('ep:cogen-progress') 推到 renderer） */
export interface CogenProgressEvent {
  episodeId: string
  sceneNumber: number
  totalScenes: number
  status: 'start' | 'done' | 'error'
  error?: string
}

/** binding 名 → 快照（按归一化名字索引，候选名 = getEffectiveData 投影名 + 实体侧 standalone/override/alias/双轨列；跨场景去重的依据） */
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
   * O2 增量模式（默认，opts.force falsy）：场景已有分镜且所有
   * characters[].characterId 非空 → 跳过（计入 skippedScenes，不删不写）；
   * force=true 保持全量重写语义。
   *
   * @param opts O2：{ force?: boolean }
   * @param onProgress H13：每场景开始/完成/失败回调（handler 转成 ep:cogen-progress
   *   事件推 renderer）；回调异常被吞掉，不阻断生成。
   * @throws 剧集/剧本/场景不存在，或项目未配置分镜生成模型（回退剧本生成模型；D3：不静默落回默认模型）
   */
  async cogenStoryboardsForEpisode(
    episodeId: string,
    opts?: CogenOptions,
    onProgress?: (event: CogenProgressEvent) => void,
  ): Promise<CogenEpisodeResult> {
    const ctx = await this.loadEpisodeContext(episodeId)
    const state = await this.buildBindingState(ctx.projectId)

    // ─── 逐场景串行 ───
    const results: CogenSceneResult[] = []
    const skippedScenes: CogenEpisodeResult['skippedScenes'] = []
    const enrichedBindings: CogenEpisodeResult['enrichedBindings'] = []
    const totalScenes = ctx.scenes.length
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
    for (const scene of ctx.scenes) {
      // O2 增量模式：已有分镜且全部 characterId 非空 → 跳过（不删不写）
      if (!opts?.force && (await this.isSceneStoryboardsComplete(scene.id))) {
        skippedScenes.push({ sceneId: scene.id, sceneNumber: scene.sceneNumber })
        console.log(`[StoryboardCogenService] 场景 ${scene.sceneNumber} 已有合格分镜，增量模式跳过`)
        emitProgress(scene.sceneNumber, 'done')
        continue
      }

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
        await this.runSceneCogen(scene, state, ctx, result, enrichedBindings)
        console.log(
          `[StoryboardCogenService] 场景 ${scene.sceneNumber} 完成：${result.shotCount} 个分镜，` +
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
      await this.advanceToStoryboarding(episodeId)
    }

    return { episodeId, results, skippedScenes, enrichedBindings }
  }

  /**
   * S-06 场景级局部重生（tasks/2026-09-16-ep-studio-polish）：
   * 单场景联合生成的公共入口（cogenStoryboardsForEpisode 复用同一套
   * runSceneCogen 逻辑）。语义=替换式重写该场景分镜（等价 force），
   * 失败抛错且旧分镜保留（删旧发生在生成+校验成功之后）。
   *
   * @throws 场景/剧本/剧集不存在，项目未配置分镜生成模型（回退剧本生成模型），或 LLM 生成/校验失败
   */
  async cogenStoryboardsForScene(sceneId: string): Promise<CogenSceneResult> {
    const scene = await this.ds
      .getRepository(SceneScriptEntity)
      .findOne({ where: { id: sceneId } })
    if (!scene) throw new Error(`场景不存在：${sceneId}`)

    const script = await this.ds
      .getRepository(EpisodeScriptEntity)
      .findOne({ where: { id: scene.episodeScriptId } })
    if (!script) throw new Error(`剧本不存在：${scene.episodeScriptId}`)

    const ctx = await this.loadEpisodeContext(script.episodeId)
    const state = await this.buildBindingState(ctx.projectId)

    const result: CogenSceneResult = {
      sceneId: scene.id,
      sceneNumber: scene.sceneNumber,
      shotCount: 0,
      createdBindings: [],
      reusedBindings: [],
    }
    const enrichedBindings: CogenEpisodeResult['enrichedBindings'] = []
    await this.runSceneCogen(scene, state, ctx, result, enrichedBindings)
    console.log(
      `[StoryboardCogenService] 场景 ${scene.sceneNumber} 单独重拆完成：${result.shotCount} 个分镜，` +
        `新建绑定 ${result.createdBindings.length}，复用 ${result.reusedBindings.length}`,
    )
    await this.advanceToStoryboarding(script.episodeId)
    return result
  }

  // ==================== 加载链 / binding 快照 / 单场景执行（整集与单场景入口共用） ====

  /** 单场景执行上下文（loadEpisodeContext 产物） */
  private async loadEpisodeContext(episodeId: string): Promise<{
    scenes: SceneScriptEntity[]
    projectId: string
    providerConfigId: string
    modelId: string
  }> {
    // ─── 加载链：episode → script → scenes；episode → project.config 分镜/剧本模型 ───
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

    // 2026-09-18 修复：cogen 是分镜生成，应消费「分镜生成」模型设置（此前错用
    // scriptModel，设置里的「分镜生成」是死设置）；未配置时回退「剧本生成」模型。
    const cfg = project.config as any
    const storyboardModel = cfg?.storyboardModel as
      | { providerConfigId?: string; modelId?: string }
      | undefined
    const scriptModel = cfg?.scriptModel as
      | { providerConfigId?: string; modelId?: string }
      | undefined
    const chosen =
      storyboardModel?.providerConfigId && storyboardModel?.modelId
        ? storyboardModel
        : scriptModel
    if (!chosen?.providerConfigId || !chosen?.modelId) {
      throw new Error(
        '未配置分镜生成模型：请先到 Studio 顶栏「设置」中为项目配置分镜生成模型（未配置时将回退剧本生成模型），再批量生成分镜',
      )
    }
    return {
      scenes,
      projectId: project.id,
      providerConfigId: chosen.providerConfigId,
      modelId: chosen.modelId,
    }
  }

  /** 项目现有 binding 快照（按归一化名字索引；随建随更新，跨场景去重）+ 资产 service 组 */
  private async buildBindingState(projectId: string): Promise<{
    projectId: string
    userId: string | null
    charSvc: CharacterAssetService
    locSvc: LocationAssetService
    itemSvc: ItemAssetService
    charIndex: Map<string, BindingSnapshot>
    locIndex: Map<string, BindingSnapshot>
    itemIndex: Map<string, BindingSnapshot>
    /** 当前快照 → 注入 prompt 的已有资产清单（每场景重建，含前序场景新建资产） */
    buildExistingAssets: () => CogenExistingAsset[]
  }> {
    const userId = getCurrentUserId()
    const charSvc = new CharacterAssetService(this.ds)
    const locSvc = new LocationAssetService(this.ds, new AssetImageService(this.ds))
    const itemSvc = new ItemAssetService(this.ds)

    const charIndex = new Map<string, BindingSnapshot>()
    const locIndex = new Map<string, BindingSnapshot>()
    const itemIndex = new Map<string, BindingSnapshot>()

    // 2026-09-21 去重归一：索引 key 统一走 normalizeBindingName（trim/全角空格/书名号），
    // 角色含 alias 候选、地点/物品含 location_name/item_name 双轨列；同名重复 binding
    // （历史上识别去重失效产物）取最早创建的——定妆图/资产图都挂在最早的 binding 上，
    // Map 直接 set 会被后来的空 binding 覆盖，分镜绑到无图副本 → 关键帧拿不到角色参考图
    // （雪麓山庄实测根因）。
    const kindLabel = { character: '角色', location: '地点', item: '物品' } as const
    const addToIndex = (
      index: Map<string, BindingSnapshot>,
      kind: keyof typeof kindLabel,
      names: Array<string | null | undefined>,
      snap: BindingSnapshot,
    ): void => {
      for (const raw of names) {
        const key = normalizeBindingName(raw)
        if (!key) continue
        const existing = index.get(key)
        if (existing) {
          if (existing.id !== snap.id) {
            console.warn(
              `[StoryboardCogenService] ${kindLabel[kind]} "${raw}" 存在重复 binding，沿用最早创建的 ${existing.id}（忽略 ${snap.id}）`,
            )
          }
        } else {
          index.set(key, snap)
        }
      }
    }

    // 2026-09-24 一致性修复（A2/A4）：名字/描述统一走 getEffectiveData 投影
    // （linked_lw 的 standaloneName/overrideName 均为 null，旧逻辑直接 continue 跳过，
    // 导致已有角色被重复 createStandalone）；口径与 asset-roster-builder 一致，
    // 单条投影失败跳过 + warn，不阻断。索引仍保留实体侧候选名（alias/双轨列）。
    for (const b of await charSvc.listByProject(projectId)) {
      try {
        const eff = await charSvc.getEffectiveData(b.id)
        addToIndex(charIndex, 'character', [eff.name, ...characterBindingNames(b)], {
          id: b.id,
          name: eff.name,
          description: [eff.description, eff.appearance].filter(Boolean).join(' / ') || null,
        })
      } catch (e) {
        console.warn(
          `[StoryboardCogenService] 角色 binding ${b.id} 投影失败，跳过：`,
          (e as Error).message,
        )
      }
    }
    for (const b of await locSvc.listByProject(projectId)) {
      try {
        const eff = await locSvc.getEffectiveData(b.id)
        addToIndex(locIndex, 'location', [eff.name, ...locationBindingNames(b)], {
          id: b.id,
          name: eff.name,
          description: eff.description || null,
        })
      } catch (e) {
        console.warn(
          `[StoryboardCogenService] 地点 binding ${b.id} 投影失败，跳过：`,
          (e as Error).message,
        )
      }
    }
    for (const b of await itemSvc.listByProject(projectId)) {
      try {
        const eff = await itemSvc.getEffectiveData(b.id)
        addToIndex(itemIndex, 'item', [eff.name, ...itemBindingNames(b)], {
          id: b.id,
          name: eff.name,
          description: eff.description || null,
        })
      } catch (e) {
        console.warn(
          `[StoryboardCogenService] 物品 binding ${b.id} 投影失败，跳过：`,
          (e as Error).message,
        )
      }
    }

    return {
      projectId,
      userId,
      charSvc,
      locSvc,
      itemSvc,
      charIndex,
      locIndex,
      itemIndex,
      buildExistingAssets: () => {
        // 同一 binding 在索引里挂着多个候选名（alias/双轨列），values() 会重复，按 id 去重
        const unique = (index: Map<string, BindingSnapshot>): BindingSnapshot[] => {
          const seen = new Set<string>()
          return [...index.values()].filter((b) => {
            if (seen.has(b.id)) return false
            seen.add(b.id)
            return true
          })
        }
        return [
          ...unique(charIndex).map((b) => ({
            kind: 'character' as const,
            id: b.id,
            name: b.name,
            description: b.description,
          })),
          ...unique(locIndex).map((b) => ({
            kind: 'location' as const,
            id: b.id,
            name: b.name,
            description: b.description,
          })),
          ...unique(itemIndex).map((b) => ({
            kind: 'item' as const,
            id: b.id,
            name: b.name,
            description: b.description,
          })),
        ]
      },
    }
  }

  /**
   * 单场景执行体（整集循环与 S-06 单场景入口共用）：LLM 联合生成 →
   * D2 绑定构造 → 替换式写分镜 → 场景级回填 → D4-2 断言。失败抛错（不写库）。
   */
  private async runSceneCogen(
    scene: SceneScriptEntity,
    state: Awaited<ReturnType<StoryboardCogenService['buildBindingState']>>,
    ctx: { providerConfigId: string; modelId: string },
    result: CogenSceneResult,
    enrichedBindings: CogenEpisodeResult['enrichedBindings'],
  ): Promise<void> {
    // 1) LLM 联合生成（含校验 + 纠错重试 1 次；失败抛错，本场景不写库）
    //    O2：超时类错误 sleep 60s 后原样重试恰好 1 次
    const output = await this.generateWithTimeoutRetry(
      scene,
      state.buildExistingAssets(),
      ctx.providerConfigId,
      ctx.modelId,
    )

    // 2) D2 绑定构造：按名复用 / createStandalone 新建（O3：复用命中但描述过薄时富化回填）
    const charBindings = await this.resolveCharacterBindings(
      output,
      state.charIndex,
      state.charSvc,
      state.projectId,
      state.userId,
      result,
      enrichedBindings,
    )
    const locationBinding = await this.resolveLocationBinding(
      output,
      state.locIndex,
      state.locSvc,
      state.projectId,
      state.userId,
      result,
      enrichedBindings,
    )
    const itemBindings = await this.resolveItemBindings(
      output,
      state.itemIndex,
      state.itemSvc,
      state.projectId,
      state.userId,
      result,
      enrichedBindings,
    )

    // 3) 替换式写分镜（删旧 → 插新；仅在生成+校验成功后执行）
    await this.replaceSceneStoryboards(scene.id, output, charBindings, locationBinding.id, itemBindings)

    // 4) 回填场景级绑定字段
    await this.backfillSceneBindings(scene, charBindings, locationBinding.id)

    // 5) D4-2 断言：落库后复读，characterId 必须全部非空
    await this.assertCharacterIdsFilled(scene.id)

    result.shotCount = output.shots.length
  }

  /** 状态推进（P0-CM2）：分镜已生成 → storyboarding；失败不阻断 */
  private async advanceToStoryboarding(episodeId: string): Promise<void> {
    try {
      const { advanceEpisodeStatus } = await import(
        '@core/platform/episode-production/workflow/episode-status-advance'
      )
      await advanceEpisodeStatus(this.ds, episodeId, 'storyboarding')
    } catch {
      /* 状态推进失败不阻断分镜结果 */
    }
  }

  // ==================== O2 增量判定 / 超时重试 ====================

  /**
   * O2 增量跳过判定：场景已有分镜，且每个分镜 characters[] 里所有
   * characterId 非空 → 视为合格（无人物出镜的空 characters 数组视为合格）。
   */
  private async isSceneStoryboardsComplete(sceneId: string): Promise<boolean> {
    const storyboards = await this.storyboardRepo.getBySceneScriptId(sceneId)
    if (storyboards.length === 0) return false
    return storyboards.every((sb) =>
      ((sb.characters as any[] | null) ?? []).every((c) => !!c?.characterId),
    )
  }

  /**
   * O2 超时自动重试：generateCogenForScene 抛错且消息含 "timed out" / "超时"
   * 时 sleep 60s 后原样重试恰好 1 次（百炼限流类瞬时故障实测 1~2 分钟自愈）。
   * 重试仍失败则原样抛出（含 generateCogenForScene 内部纠错重试，共最多 3 轮 LLM 往返）。
   */
  private async generateWithTimeoutRetry(
    scene: SceneScriptEntity,
    existingAssets: CogenExistingAsset[],
    providerConfigId: string,
    modelId: string,
  ): Promise<CogenOutput> {
    try {
      return await generateCogenForScene(
        scene as unknown as SceneScript,
        existingAssets,
        providerConfigId,
        modelId,
      )
    } catch (e: any) {
      const msg = e?.message ?? ''
      if (!/timed out|超时/i.test(msg)) throw e
      console.log(
        `[StoryboardCogenService] 场景 ${scene.sceneNumber} LLM 请求超时（${msg}），60s 后原样重试 1 次`,
      )
      await new Promise((r) => setTimeout(r, 60_000))
      return await generateCogenForScene(
        scene as unknown as SceneScript,
        existingAssets,
        providerConfigId,
        modelId,
      )
    }
  }

  // ==================== O3 复用资产描述富化回填 ====================

  /** O3 服饰关键词：描述不含其一视为「过薄」（无法约束定妆/分镜文本的服装一致性） */
  private static readonly OUTFIT_KEYWORDS = /[衣袍裙衫装服]/

  /** O3 过薄判定：standaloneDescription 为 null / 长度 < 30 / 不含服饰关键词 */
  private isDescriptionThin(description: string | null): boolean {
    return (
      !description ||
      description.length < 30 ||
      !StoryboardCogenService.OUTFIT_KEYWORDS.test(description)
    )
  }

  /**
   * O3：复用命中的 binding 描述过薄时，用 cogen 响应里的新资产卡描述更新
   * （standaloneDescription = description + "\n服饰：" + outfit，与新建分支同规则）。
   * 更新成功同步快照（后续场景 prompt 注入即见新描述）；失败 warn 不阻断。
   */
  private async enrichBindingIfThin(
    svc: { updateStandalone: (bindingId: string, patch: { description?: string }) => Promise<void> },
    kind: 'character' | 'location' | 'item',
    snap: BindingSnapshot,
    newDescription: string,
    enriched: CogenEpisodeResult['enrichedBindings'],
  ): Promise<void> {
    if (!this.isDescriptionThin(snap.description)) return
    if (!newDescription || newDescription === snap.description) return
    /*
     * O3 富化污染守卫（2026-09-21 v3 实测）：宏观尺度地点（山庄/城/派/门/宫…）
     * 不能被室内尺度的子场景描述回填——实测"掌门书房内景"的描述被回填进根地点
     * 「雪麓山庄」（因其描述过薄），导致平面图 prompt 用了室内尺度。
     * 名字本身含室内词（如"掌门书房"）时守卫不拦——它本来就是室内地点。
     */
    if (
      kind === 'location' &&
      isMacroScaleLocationName(snap.name) &&
      !containsInteriorScaleWord(snap.name) &&
      containsInteriorScaleWord(newDescription)
    ) {
      console.warn(
        `[StoryboardCogenService] 富化回填跳过：宏观尺度地点 "${snap.name}" 的新描述含室内尺度词，` +
          `疑似子场景描述污染（${snap.id}），保持原描述`,
      )
      return
    }
    try {
      await svc.updateStandalone(snap.id, { description: newDescription })
      snap.description = newDescription
      enriched.push({ kind, id: snap.id, name: snap.name })
      console.log(
        `[StoryboardCogenService] 复用 ${kind} "${snap.name}" 描述过薄，已用新资产卡富化回填（${snap.id}）`,
      )
    } catch (e) {
      console.warn(
        `[StoryboardCogenService] 富化回填失败（不阻断）：${kind} "${snap.name}"（${snap.id}）`,
        e,
      )
    }
  }

  // ==================== D2 绑定构造 ====================

  /**
   * 角色：按归一化名字匹配现有 binding → 命中复用；索引未命中再用
   * svc.findByName 兜底一次（含 alias 候选）；仍未命中 createStandalone
   * （service 内含 find-or-create；描述来自资产卡，含服饰；性别/年龄写入身份块）。
   */
  private async resolveCharacterBindings(
    output: CogenOutput,
    index: Map<string, BindingSnapshot>,
    svc: CharacterAssetService,
    projectId: string,
    userId: string | null,
    result: CogenSceneResult,
    enriched: CogenEpisodeResult['enrichedBindings'],
  ): Promise<Map<string, BindingSnapshot>> {
    const resolved = new Map<string, BindingSnapshot>()
    for (const c of output.assets.characters) {
      const key = normalizeBindingName(c.name)
      let snap = index.get(key)
      if (!snap) {
        // 兜底：索引按构建时快照，可能漏掉别名/双轨列以外的历史命名，再查一次库
        const found = await svc.findByName(projectId, c.name)
        if (found) {
          snap = {
            id: found.id,
            name: c.name,
            description: found.standaloneDescription ?? found.overrideDescription ?? null,
          }
          index.set(key, snap)
        }
      }
      // 描述用资产卡：外貌/服饰描述并入 standaloneDescription，定妆图与分镜共用（消除 F12 漂移）
      const description = c.outfit ? `${c.description}\n服饰：${c.outfit}` : c.description
      if (snap) {
        result.reusedBindings.push({ kind: 'character', id: snap.id, name: c.name })
        // O3：复用命中但旧描述过薄 → 用新资产卡描述富化回填（不动定妆图）
        await this.enrichBindingIfThin(svc, 'character', snap, description, enriched)
      } else {
        const created = await svc.createStandalone({
          projectId,
          name: c.name,
          description,
          age: c.age,
          gender: c.gender,
          userId,
        })
        snap = { id: created.id, name: c.name, description }
        index.set(key, snap)
        result.createdBindings.push({ kind: 'character', id: snap.id, name: c.name })
      }
      resolved.set(c.name, snap)
    }
    return resolved
  }

  /** 地点：同角色逻辑（恰好一个），额外支持前缀归一（"雪麓山庄书房" 命中已有 "书房"） */
  private async resolveLocationBinding(
    output: CogenOutput,
    index: Map<string, BindingSnapshot>,
    svc: LocationAssetService,
    projectId: string,
    userId: string | null,
    result: CogenSceneResult,
    enriched: CogenEpisodeResult['enrichedBindings'],
  ): Promise<BindingSnapshot> {
    const loc = output.assets.location
    const key = normalizeBindingName(loc.name)
    let snap = matchNameIndexWithPrefix(index, key)
    if (!snap) {
      const found = await svc.findByName(projectId, loc.name)
      if (found) {
        snap = {
          id: found.id,
          name: loc.name,
          description: found.standaloneDescription ?? found.overrideDescription ?? null,
        }
        index.set(key, snap)
      }
    }
    if (snap) {
      result.reusedBindings.push({ kind: 'location', id: snap.id, name: loc.name })
      await this.enrichBindingIfThin(svc, 'location', snap, loc.description, enriched)
    } else {
      const created = await svc.createStandalone({
        projectId,
        name: loc.name,
        description: loc.description,
        userId,
      })
      snap = { id: created.id, name: loc.name, description: loc.description }
      index.set(key, snap)
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
    enriched: CogenEpisodeResult['enrichedBindings'],
  ): Promise<Map<string, BindingSnapshot>> {
    const resolved = new Map<string, BindingSnapshot>()
    for (const it of output.assets.items) {
      const key = normalizeBindingName(it.name)
      let snap = index.get(key)
      if (!snap) {
        const found = await svc.findByName(projectId, it.name)
        if (found) {
          snap = {
            id: found.id,
            name: it.name,
            description: found.standaloneDescription ?? found.overrideDescription ?? null,
          }
          index.set(key, snap)
        }
      }
      if (snap) {
        result.reusedBindings.push({ kind: 'item', id: snap.id, name: it.name })
        await this.enrichBindingIfThin(svc, 'item', snap, it.description, enriched)
      } else {
        const created = await svc.createStandalone({
          projectId,
          name: it.name,
          description: it.description,
          userId,
        })
        snap = { id: created.id, name: it.name, description: it.description }
        index.set(key, snap)
        result.createdBindings.push({ kind: 'item', id: snap.id, name: it.name })
      }
      resolved.set(it.name, snap)
    }
    return resolved
  }

  // ==================== 写库 ====================

  /**
   * 替换式写分镜：先删该场景旧分镜（cleanupStoryboards 级联清关键帧/图，
   * 受影响片段置 superseded），再按 cogen 输出插入新分镜。
   * characters[].characterId = binding.id（代码构造，D2）；shotNumber 强制 1..N。
   */
  private async replaceSceneStoryboards(
    sceneId: string,
    output: CogenOutput,
    charBindings: Map<string, BindingSnapshot>,
    locationBindingId: string,
    itemBindings: Map<string, BindingSnapshot>,
  ): Promise<void> {
    const oldStoryboards = await this.storyboardRepo.getBySceneScriptId(sceneId)
    await cleanupStoryboards(this.ds, oldStoryboards.map(sb => sb.id))

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
        dialogueIds: Array.isArray(shot.dialogueIds) ? shot.dialogueIds.filter(Boolean) : [],
        actionIds: [],
        duration: shot.duration,
        transition: { type: 'cut', duration: 500 },
      })

      // create 入参不含 binding 覆盖字段（沿用旧 repo 签名），创建后补写
      await this.storyboardRepo.update(created.id, {
        locationBindingIds: [locationBindingId],
        itemBindingIds,
      })

      // 一致性修复 v3（A3）：对白承接落库 storyboard_dialogue_links（字幕镜头级分配的数据源）
      for (let i = 0; i < (shot.dialogueIds ?? []).length; i++) {
        const dlgId = shot.dialogueIds[i]
        if (!dlgId) continue
        await this.ds.query(
          `INSERT OR REPLACE INTO storyboard_dialogue_links (id, storyboard_id, dialogue_id, sort_order) VALUES (?, ?, ?, ?)`,
          [`sdl_${Math.random().toString(36).slice(2, 12)}`, created.id, String(dlgId), i],
        )
      }
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
