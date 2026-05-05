/**
 * 多关键帧生成 service（spec §4.2 / §4.3 / §4.5 · P5-T4）
 * @module modules/episode-production/render/keyframe/keyframe-generation.service
 *
 * 把 P5-T5 buildKeyframePrompt + P5-T6 reference-image-selector + P5-T7 chain-strategy
 * 串起来，按"开始 → 结束 → 中间"链式顺序为分镜生成 N 张关键帧，落盘 + 写
 * image_assets + storyboard_keyframe 行。
 *
 * 流程（generateKeyframesForStoryboard）：
 *   1. 加载 storyboard + scene + 解析所有引用资产（ReferenceResolver）
 *   2. plan = planKeyframes(keyframeCount)（生成顺序 + 参考帧依赖）
 *   3. 删旧的 storyboard_keyframe 行
 *   4. 按 plan 顺序逐帧：
 *      a. 对每个出场角色 / 地点 / 道具调 pickReferenceImage 选 ref 图（不传 provider，
 *         provider 协议各异；后续按需传入）
 *      b. 调 buildKeyframePrompt 拼提示词（含时刻语言）
 *      c. 调 ImageGenerator 生成图（落盘）
 *      d. 写 image_assets 记录
 *      e. 写 storyboard_keyframe 行
 *   5. 返回所有 keyframe 列表
 *
 * regenerateKeyframe：
 *   - 仅重生成单帧，不触发 propagation。propagation 由 caller (UI) 决定。
 *
 * PC + Web 双端共用。Provider 通过依赖注入（默认走 createGalleryImageGenerator）。
 */

import type { DataSource, Repository } from 'typeorm'
import { StoryboardEntity } from '@core/database/entities/episode-production/storyboard.entity'
import { SceneScriptEntity } from '@core/database/entities/episode-production/scene-script.entity'
import { EpisodeScriptEntity } from '@core/database/entities/episode-production/episode-script.entity'
import { VideoEpisodeEntity } from '@core/database/entities/episode-production/video-episode.entity'
import {
  StoryboardKeyframeRepository,
  type StoryboardKeyframe,
} from '@core/database/repositories/storyboard-keyframe.repository'
import { StoryboardCharacterRepository } from '@core/database/repositories/storyboard-character.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import { AssetImageService } from '@core/modules/episode-production/assets/services/asset-image.service'
import { ReferenceResolver } from '@core/modules/episode-production/narrative/reference-resolver'
import {
  planKeyframes,
  type KeyframePlan,
} from './keyframe-chain-strategy'
import {
  buildKeyframePrompt,
  PRESET_STYLES,
  type ResolvedCharacterRef,
  type ResolvedLocationRef,
  type ResolvedItemRef,
  type StyleConfig,
} from './keyframe-prompt-builder'
import { pickReferenceImage } from './reference-image-selector'
import type { ImageGenerator } from '@core/modules/episode-production/assets/services/gallery-derivation.service'
import { createGalleryImageGenerator } from '@core/modules/episode-production/assets/services/image-provider-adapter'
import type { SceneCharacter } from '@shared/types/episode-production'

const DEFAULT_KEYFRAME_WIDTH = 1024
const DEFAULT_KEYFRAME_HEIGHT = 1024

/**
 * P5-T31：把 storyboard_characters 表的 position { x, y, scale } 映射回
 * 字符串（spec §4.5.3 character 配置语义：left/center/right + 缩放）。
 *
 * 关键帧 prompt-builder 期待 sceneRole.position 是字符串描述。
 */
function positionToString(
  pos: { x: number; y: number; scale: number } | undefined,
): string | null {
  if (!pos) return null
  const x = pos.x
  const horizontal = x < 33 ? 'left' : x > 66 ? 'right' : 'center'
  const scaleHint =
    pos.scale > 1.2 ? ' close-up' : pos.scale < 0.8 ? ' distant' : ''
  return `${horizontal}${scaleHint}`
}

export interface GenerateKeyframesInput {
  storyboardId: string
  /** 风格预设 key，默认 cinematic */
  styleName?: keyof typeof PRESET_STYLES
  /** 强制使用的 keyframeCount（不传则用 storyboard.keyframeCount，未设置默认 3） */
  keyframeCountOverride?: number
}

export interface RegenerateKeyframeInput {
  keyframeId: string
  styleName?: keyof typeof PRESET_STYLES
}

/**
 * 多关键帧生成服务。注入 DataSource + 可选 ImageGenerator（默认用项目通用 provider 适配器）。
 */
export class KeyframeGenerationService {
  private readonly keyframeRepo: StoryboardKeyframeRepository
  private readonly sbCharRepo: StoryboardCharacterRepository
  private readonly imageAssetRepo: ImageAssetRepository
  private readonly resolver: ReferenceResolver
  private readonly imageSvc: AssetImageService
  private readonly imageGenerator: ImageGenerator

  constructor(
    private readonly ds: DataSource,
    imageGenerator?: ImageGenerator,
  ) {
    this.keyframeRepo = new StoryboardKeyframeRepository(ds)
    this.sbCharRepo = new StoryboardCharacterRepository(ds)
    this.imageAssetRepo = new ImageAssetRepository(ds)
    this.resolver = new ReferenceResolver(ds)
    this.imageSvc = new AssetImageService(ds)
    this.imageGenerator = imageGenerator ?? createGalleryImageGenerator()
  }

  private get sbRepo(): Repository<StoryboardEntity> {
    return this.ds.getRepository(StoryboardEntity)
  }

  private get sceneRepo(): Repository<SceneScriptEntity> {
    return this.ds.getRepository(SceneScriptEntity)
  }

  /** 主入口：为分镜生成全部关键帧（按 plan 链式） */
  async generateKeyframesForStoryboard(
    input: GenerateKeyframesInput,
  ): Promise<StoryboardKeyframe[]> {
    const sb = await this.sbRepo.findOne({ where: { id: input.storyboardId } })
    if (!sb) throw new Error(`Storyboard not found: ${input.storyboardId}`)
    const scene = await this.sceneRepo.findOne({ where: { id: sb.sceneScriptId } })
    if (!scene) throw new Error(`SceneScript not found: ${sb.sceneScriptId}`)

    const styleConfig = this.pickStyle(input.styleName)
    const keyframeCount = Math.max(
      1,
      input.keyframeCountOverride ?? sb.keyframeCount ?? 3,
    )
    const plan = planKeyframes(keyframeCount)

    // 解析场景资产（一次性，生成所有帧时复用）
    // P5-T31：传 storyboardId 让 resolveSceneAssets 优先查 storyboard_characters
    // 表（spec §4.5.3 分镜内角色独立配置）
    const sceneAssets = await this.resolveSceneAssets(scene, sb.id)

    // 清掉旧的 keyframe（重新生成全量）
    await this.keyframeRepo.deleteByStoryboard(sb.id)

    const created: StoryboardKeyframe[] = []
    for (const planItem of plan) {
      const kf = await this.generateOneKeyframe({
        storyboard: sb,
        scene,
        plan: planItem,
        sceneAssets,
        styleConfig,
      })
      created.push(kf)
    }
    return created
  }

  /** 重生成指定单帧（不触发传播；UI 决定是否级联） */
  async regenerateKeyframe(
    input: RegenerateKeyframeInput,
  ): Promise<StoryboardKeyframe> {
    const old = await this.keyframeRepo.getById(input.keyframeId)
    if (!old) throw new Error(`Keyframe not found: ${input.keyframeId}`)
    const sb = await this.sbRepo.findOne({ where: { id: old.storyboardId } })
    if (!sb) throw new Error(`Storyboard not found: ${old.storyboardId}`)
    const scene = await this.sceneRepo.findOne({ where: { id: sb.sceneScriptId } })
    if (!scene) throw new Error(`SceneScript not found: ${sb.sceneScriptId}`)

    const styleConfig = this.pickStyle(input.styleName)
    // P5-T31：传 storyboardId（同 generateKeyframesForStoryboard 路径）
    const sceneAssets = await this.resolveSceneAssets(scene, sb.id)

    const keyframeCount = Math.max(1, sb.keyframeCount ?? 3)
    const plan = planKeyframes(keyframeCount)
    const planItem = plan.find((p) => p.frameIndex === old.frameIndex)
    if (!planItem) {
      throw new Error(
        `Keyframe ${input.keyframeId} 的 frameIndex=${old.frameIndex} 超出当前 plan 范围`,
      )
    }

    // 删旧帧再写新帧（保持 frameIndex 唯一性 / id 不复用）
    await this.keyframeRepo.delete(old.id)
    return await this.generateOneKeyframe({
      storyboard: sb,
      scene,
      plan: planItem,
      sceneAssets,
      styleConfig,
    })
  }

  /** 列出某分镜的全部关键帧（按 frame_index 升序）*/
  listKeyframes(storyboardId: string): Promise<StoryboardKeyframe[]> {
    return this.keyframeRepo.listByStoryboard(storyboardId)
  }

  // ─── 内部 ──────────────────────────────────────────────

  private pickStyle(name?: keyof typeof PRESET_STYLES): StyleConfig {
    return PRESET_STYLES[name ?? 'cinematic'] ?? PRESET_STYLES.cinematic
  }

  /**
   * 解析场景资产引用（chars / location / items）一次，逐帧复用。
   *
   * P5-T31（spec §4.5.3 分镜内角色独立配置）：
   *   - 优先查 storyboard_characters 表（分镜级独立配置：position/expression/
   *     facing/action）→ 用之
   *   - 回退到 scene.characters JSON（V2 兼容；旧剧本走这条）
   *
   * 这样同场景多分镜可以有不同 expression/action（spec §4.5.9 实操示例）。
   */
  private async resolveSceneAssets(
    scene: SceneScriptEntity,
    storyboardId: string,
  ): Promise<{
    characters: Array<ResolvedCharacterRef>
    location: ResolvedLocationRef | null
    items: ResolvedItemRef[]
  }> {
    // location（spec §4.5.2 一场景多分镜共享地点；本 task 不接 angle 变体，
    // location 仍是场景级；spec §4.5.7 提到的"分镜级 angle 选取"留 follow-up）
    let location: ResolvedLocationRef | null = null
    if (scene.locationBindingId) {
      const r = await this.resolver.resolveLocation(scene.locationBindingId)
      if (r) {
        location = { bindingId: r.bindingId, effective: r.effective }
      }
    }

    // characters：先查分镜级 storyboard_characters 表
    const sbChars = await this.sbCharRepo.getByStoryboardId(storyboardId)
    const characters: ResolvedCharacterRef[] = []

    if (sbChars.length > 0) {
      // 分镜级独立配置存在 → 用之（spec §4.5.3）
      for (const sc of sbChars) {
        const r = await this.resolver.resolveCharacter(sc.characterId)
        if (!r) continue
        characters.push({
          bindingId: r.bindingId,
          effective: r.effective,
          sceneRole: {
            expression: sc.expression ?? null,
            action: sc.action ?? null,
            outfit: null, // storyboard_characters 暂不含 outfit；可走角色 effective.outfit
            position: positionToString(sc.position),
            facing: sc.facing ?? null,
          } as any,
        })
      }
    } else {
      // 回退：分镜级未配置 → 用场景级 scene.characters JSON
      const sceneChars = (scene.characters as SceneCharacter[] | null) ?? []
      for (const sc of sceneChars) {
        if (!sc.characterBindingId) continue
        const r = await this.resolver.resolveCharacter(sc.characterBindingId)
        if (!r) continue
        characters.push({
          bindingId: r.bindingId,
          effective: r.effective,
          sceneRole: {
            expression: sc.expression ?? null,
            action: sc.action ?? null,
            outfit: sc.outfit ?? null,
            position: sc.position ?? null,
          },
        })
      }
    }

    // items：从 scene.characters[*].props 合成（spec §4.1 道具挂在角色身上）
    // 分镜级独立 props 暂不在 storyboard_characters entity 字段范围；留 follow-up
    const sceneCharsForItems =
      (scene.characters as SceneCharacter[] | null) ?? []
    const items: ResolvedItemRef[] = []
    for (const sc of sceneCharsForItems) {
      const props = sc.props ?? []
      for (const p of props) {
        if (typeof p === 'string') continue
        if (!p.itemBindingId) continue
        const r = await this.resolver.resolveItem(p.itemBindingId)
        if (!r) continue
        items.push({ bindingId: r.bindingId, effective: r.effective })
      }
    }

    return { characters, location, items }
  }

  /** 生成一帧并落库 */
  private async generateOneKeyframe(args: {
    storyboard: StoryboardEntity
    scene: SceneScriptEntity
    plan: KeyframePlan
    sceneAssets: {
      characters: ResolvedCharacterRef[]
      location: ResolvedLocationRef | null
      items: ResolvedItemRef[]
    }
    styleConfig: StyleConfig
  }): Promise<StoryboardKeyframe> {
    const { storyboard, scene, plan, sceneAssets, styleConfig } = args

    // 选 ref 图（每个出场角色 / 地点 / 道具按维度评分挑变体）
    // ref 图当前不传给 provider（ImageGenerator 接口未暴露 referenceImagePaths），
    // 但仍提前做选择以便 metadata / 后续 provider 升级使用
    const refImages = await this.collectReferenceImages(sceneAssets, scene)

    // 拼提示词
    const promptOut = buildKeyframePrompt({
      shotType: storyboard.shotType,
      cameraAngle: storyboard.cameraAngle,
      frameDescription: storyboard.frameDescription,
      composition: storyboard.composition,
      subject: storyboard.subject,
      sceneDescription: scene.sceneDescription,
      mood: scene.mood,
      timeOfDay: scene.timeOfDay,
      weather: scene.weather,
      characters: sceneAssets.characters,
      location: sceneAssets.location,
      items: sceneAssets.items,
      frameRole: plan.frameRole,
      timePercent: plan.timePercent,
      styleConfig,
    })

    // 调 image generator 生成图（label 用 frame 角色 + frameIndex 便于追踪）
    const generated = await this.imageGenerator.generate({
      referenceImagePaths: refImages.map((r) => r.imagePath),
      prompt: promptOut.prompt,
      negativePrompt: promptOut.negativePrompt,
      label: `keyframe_${plan.frameRole}_${plan.frameIndex}`,
    })

    // 写 image_assets 记录（type='generated'，子类型放 metadata.subType）
    const projectId = await this.resolveProjectIdForScene(scene)
    const ia = await this.imageAssetRepo.create({
      projectId,
      type: 'generated',
      prompt: promptOut.prompt,
      negativePrompt: promptOut.negativePrompt,
      imagePath: generated.imagePath,
      thumbnailPath: generated.thumbnailPath ?? undefined,
      width: DEFAULT_KEYFRAME_WIDTH,
      height: DEFAULT_KEYFRAME_HEIGHT,
      metadata: {
        subType: 'storyboard_keyframe',
        storyboardId: storyboard.id,
        frameIndex: plan.frameIndex,
        frameRole: plan.frameRole,
        referenceImageIds: refImages.map((r) => r.id),
      },
    })

    // 写 storyboard_keyframe 行
    return await this.keyframeRepo.create({
      storyboardId: storyboard.id,
      frameIndex: plan.frameIndex,
      timePercent: plan.timePercent,
      frameRole: plan.frameRole,
      imageAssetId: ia.id,
      prompt: promptOut.prompt,
      negativePrompt: promptOut.negativePrompt,
    })
  }

  /** 给场景资产挑参考图（每类资产取最匹配变体），返回打中的 asset_image 列表 */
  private async collectReferenceImages(
    assets: {
      characters: ResolvedCharacterRef[]
      location: ResolvedLocationRef | null
      items: ResolvedItemRef[]
    },
    scene: SceneScriptEntity,
  ): Promise<Array<{ id: string; imagePath: string }>> {
    const refs: Array<{ id: string; imagePath: string }> = []

    if (assets.location) {
      const r = await pickReferenceImage(this.imageSvc, {
        kind: 'location',
        bindingId: assets.location.bindingId,
        dims: { time: scene.timeOfDay, weather: scene.weather ?? undefined },
      })
      if (r.image) refs.push({ id: r.image.id, imagePath: r.image.imagePath })
    }
    for (const c of assets.characters) {
      const sceneRole = c.sceneRole ?? {}
      const r = await pickReferenceImage(this.imageSvc, {
        kind: 'character',
        bindingId: c.bindingId,
        dims: {
          expression: sceneRole.expression ?? undefined,
          outfit: sceneRole.outfit ?? c.effective.outfit ?? undefined,
        },
      })
      if (r.image) refs.push({ id: r.image.id, imagePath: r.image.imagePath })
    }
    for (const it of assets.items) {
      const r = await pickReferenceImage(this.imageSvc, {
        kind: 'item',
        bindingId: it.bindingId,
        dims: {},
      })
      if (r.image) refs.push({ id: r.image.id, imagePath: r.image.imagePath })
    }
    return refs
  }

  /**
   * 反查真实 projectId（image_assets.project_id 字段）：
   * scene → episode_script → episode → project（spec §1.4 实体关系）
   *
   * 链路任一环缺失都 throw 暴露真实错误——不再静默写入 'unknown'，
   * 因为那会让 image_assets 表沉积"孤儿记录"，UI 后续按 projectId 过滤时找不到。
   */
  private async resolveProjectIdForScene(scene: SceneScriptEntity): Promise<string> {
    const epScript = await this.ds
      .getRepository(EpisodeScriptEntity)
      .findOne({ where: { id: scene.episodeScriptId } })
    if (!epScript) {
      throw new Error(
        `EpisodeScript not found for scene ${scene.id} (episodeScriptId=${scene.episodeScriptId})`,
      )
    }
    const ep = await this.ds
      .getRepository(VideoEpisodeEntity)
      .findOne({ where: { id: (epScript as any).episodeId } })
    if (!ep) {
      throw new Error(
        `VideoEpisode not found for episodeScript ${epScript.id} (episodeId=${(epScript as any).episodeId})`,
      )
    }
    const projectId = (ep as any).projectId
    if (!projectId) {
      throw new Error(`VideoEpisode ${ep.id} 缺 projectId（DB 数据异常）`)
    }
    return projectId
  }
}
