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
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import {
  StoryboardKeyframeRepository,
  type StoryboardKeyframe,
  type KeyframeReferenceOverride,
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
 * 把 storyboard.referenceImageIds（JSON 字符串或对象）解析成
 * KeyframeReferenceOverride[]。shape：`{ "${kind}:${bindingId}": imageId }`。
 *
 * 任意解析失败 / 非合法 kind / 缺值 → 跳过该项，不抛错（生成不能因脏数据中断）。
 */
function parseSbReferenceImageIds(
  raw: string | Record<string, string> | null | undefined,
): KeyframeReferenceOverride[] {
  if (!raw) return []
  let obj: Record<string, string> | null = null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        obj = parsed as Record<string, string>
      }
    } catch {
      return []
    }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw
  }
  if (!obj) return []
  const out: KeyframeReferenceOverride[] = []
  for (const [key, imageId] of Object.entries(obj)) {
    if (!imageId || typeof imageId !== 'string') continue
    const sep = key.indexOf(':')
    if (sep <= 0) continue
    const kind = key.slice(0, sep) as KeyframeReferenceOverride['kind']
    const bindingId = key.slice(sep + 1)
    if (!bindingId) continue
    if (kind !== 'character' && kind !== 'location' && kind !== 'item') continue
    out.push({ kind, bindingId, imageId })
  }
  return out
}

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
  /**
   * P5-T26 (spec §4.5.7)：用户额外提示词，每张关键帧 prompt 都会带上。
   * 例如批量生成时用户希望"全部画面更暖色调"。
   */
  userPrompt?: string | null
}

export interface RegenerateKeyframeInput {
  keyframeId: string
  styleName?: keyof typeof PRESET_STYLES
  /**
   * P5-T26 (spec §4.5.7)：用户重生成单帧时的"如何修改"提示词。
   * 例如"让角色更愤怒" / "镜头拉近" / "背景虚化"。
   */
  userPrompt?: string | null
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

    /*
     * 用户在 ⑤ 制作 stage 为本分镜挑选的资产参考图覆盖（spec storyboard.referenceImageIds）。
     * 这里把 storyboard 级 overrides 转成每帧生成时通用的 KeyframeReferenceOverride[]，
     * 整批关键帧都用同一组挑图作为参考，并写回每个 keyframe.referenceOverrides 让后续
     * 单帧重生（regenerateKeyframe）也能复用。用户后续仍可在 KeyframeReferencePicker
     * 单独覆盖某一帧 — 单帧 override 优先级更高，由 keyframeRepo.update 直接覆盖。
     */
    const sbLevelOverrides = parseSbReferenceImageIds((sb as any).referenceImageIds)

    const created: StoryboardKeyframe[] = []
    for (const planItem of plan) {
      const kf = await this.generateOneKeyframe({
        storyboard: sb,
        scene,
        plan: planItem,
        sceneAssets,
        styleConfig,
        userPrompt: input.userPrompt ?? null,
        referenceOverrides: sbLevelOverrides.length > 0 ? sbLevelOverrides : null,
      })
      created.push(kf)
      if (sbLevelOverrides.length > 0) {
        await this.keyframeRepo.update(kf.id, { referenceOverrides: sbLevelOverrides })
      }
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

    // FU5-A9-L4：用户提示词 fallback —
    // 调用方不传 userPrompt 时（重生成无新提示词），从旧帧 userPromptOverride 读，
    // 让上次保存的"调整方向"在重生成时仍生效，不丢失。
    const effectiveUserPrompt =
      input.userPrompt !== undefined
        ? input.userPrompt
        : (old as any).userPromptOverride ?? null

    // 阶段 2：旧帧上的 referenceOverrides 也透传给生成 — 用户挑过图就尊重选择
    const oldDto = await this.keyframeRepo.getById(input.keyframeId)
    const referenceOverrides = oldDto?.referenceOverrides ?? null

    // 删旧帧再写新帧（保持 frameIndex 唯一性 / id 不复用）
    await this.keyframeRepo.delete(old.id)
    const created = await this.generateOneKeyframe({
      storyboard: sb,
      scene,
      plan: planItem,
      sceneAssets,
      styleConfig,
      userPrompt: effectiveUserPrompt,
      referenceOverrides,
    })
    // 把旧 override 持久化到新帧（generateOneKeyframe 不会自动写）
    if (referenceOverrides && referenceOverrides.length > 0) {
      await this.keyframeRepo.update(created.id, {
        referenceOverrides,
      })
    }
    return created
  }

  /**
   * 用户为某帧手动指定参考图。仅写入 keyframe.referenceOverrides 字段，
   * 不立即重生（UI 控制：用户挑完图后选择"保存"或"保存并重生"）。
   */
  async setReferenceOverrides(
    keyframeId: string,
    overrides: KeyframeReferenceOverride[],
  ): Promise<StoryboardKeyframe> {
    const updated = await this.keyframeRepo.update(keyframeId, {
      referenceOverrides: overrides,
    })
    if (!updated) throw new Error(`Keyframe not found: ${keyframeId}`)
    return updated
  }

  /** 列出某分镜的全部关键帧（按 frame_index 升序）*/
  listKeyframes(storyboardId: string): Promise<StoryboardKeyframe[]> {
    return this.keyframeRepo.listByStoryboard(storyboardId)
  }

  /**
   * 在指定关键帧之后插入一张"extra"帧。
   * - 必须存在 after 帧的下一帧（不能在序列末尾追加 — 末尾用"全部重新生成"调 keyframeCount+1）
   * - 新帧的 timePercent 取 (after + next) / 2
   * - frameIndex = after.frameIndex + 1；后续所有帧 frameIndex += 1
   * - frameRole = 'extra'，参考链按 plan 复用现有生成路径
   */
  async insertBetween(input: {
    storyboardId: string
    afterKeyframeId: string
    styleName?: keyof typeof PRESET_STYLES
    userPrompt?: string | null
  }): Promise<StoryboardKeyframe> {
    const all = await this.keyframeRepo.listByStoryboard(input.storyboardId)
    if (all.length === 0) throw new Error('该分镜还没有关键帧，先点"生成关键帧"')
    const sorted = [...all].sort((a, b) => a.frameIndex - b.frameIndex)
    const afterIdx = sorted.findIndex((k) => k.id === input.afterKeyframeId)
    if (afterIdx === -1) throw new Error(`afterKeyframeId 不在该分镜：${input.afterKeyframeId}`)
    if (afterIdx === sorted.length - 1) {
      throw new Error('已是最后一帧；如需追加请改"关键帧数"后重生')
    }
    const after = sorted[afterIdx]
    const next = sorted[afterIdx + 1]
    const newTimePercent = (after.timePercent + next.timePercent) / 2
    const newFrameIndex = after.frameIndex + 1

    // 把 next 及之后所有帧 frameIndex += 1（避免唯一约束冲突时按"先大后小"避让；
    // 当前 entity 没唯一约束，直接 update 所有 frameIndex >= next 的）
    const sb = await this.sbRepo.findOne({ where: { id: input.storyboardId } })
    if (!sb) throw new Error(`Storyboard not found: ${input.storyboardId}`)
    const scene = await this.sceneRepo.findOne({ where: { id: sb.sceneScriptId } })
    if (!scene) throw new Error(`SceneScript not found: ${sb.sceneScriptId}`)

    // 倒序 +1 避免冲突（如果将来加唯一约束也兼容）
    const toShift = sorted.slice(afterIdx + 1).slice().reverse()
    for (const kf of toShift) {
      await this.keyframeRepo.update(kf.id, {
        // UpdateKeyframeRequest 没暴露 frameIndex；用底层 repo 直接更新
      } as any)
      // BaseRepository 的 scoped.update 暴露 ⤵ 用 getRepository
      await this.ds
        .getRepository(StoryboardKeyframeEntity)
        .update({ id: kf.id }, { frameIndex: kf.frameIndex + 1 })
    }
    // storyboard.keyframeCount += 1（保持配置一致）
    await this.ds
      .getRepository(StoryboardEntity)
      .update({ id: sb.id }, { keyframeCount: (sb.keyframeCount ?? sorted.length) + 1 })

    // 用现有 plan 同口径构造 plan item（extra）
    // 参考帧用前后两个相邻帧（after / next）的 frameIndex（after 已 shift 后仍 == old after.frameIndex）
    const planItem: KeyframePlan = {
      frameIndex: newFrameIndex,
      timePercent: newTimePercent,
      frameRole: 'extra',
      referenceFrameIndexes: [after.frameIndex, next.frameIndex + 1],
    }

    const styleConfig = this.pickStyle(input.styleName)
    const sceneAssets = await this.resolveSceneAssets(scene, sb.id)
    return await this.generateOneKeyframe({
      storyboard: sb,
      scene,
      plan: planItem,
      sceneAssets,
      styleConfig,
      userPrompt: input.userPrompt ?? null,
    })
  }

  /**
   * 用户在 ⑤ 制作 stage 点"添加关键帧"对话框：
   *   选定一个 frameIndex（在 1..keyframeCount 范围、当前还没生成的索引）+ 描述（userPrompt），
   *   生成该索引的单张关键帧。
   *
   * 行为：
   *   - 如果 frameIndex 已存在 → 抛错让 UI 提示用户改用"重生成"
   *   - 如果 frameIndex 越界（<=0 或 > keyframeCount）→ 抛错
   *   - 否则按当前 keyframeCount 的 plan 找到该 frameIndex 对应的 plan item，
   *     调 generateOneKeyframe 生成
   *
   * 参考帧依赖完全继承 plan（首帧无参考，末帧参考首帧，中间帧参考首尾）；
   * 但用户 prompt 会附加到该帧 prompt。
   */
  async generateKeyframeAtIndex(input: {
    storyboardId: string
    frameIndex: number
    userPrompt?: string | null
    styleName?: keyof typeof PRESET_STYLES
  }): Promise<StoryboardKeyframe> {
    const sb = await this.sbRepo.findOne({ where: { id: input.storyboardId } })
    if (!sb) throw new Error(`Storyboard not found: ${input.storyboardId}`)
    const scene = await this.sceneRepo.findOne({ where: { id: sb.sceneScriptId } })
    if (!scene) throw new Error(`SceneScript not found: ${sb.sceneScriptId}`)

    const keyframeCount = Math.max(1, sb.keyframeCount ?? 3)
    if (input.frameIndex < 1 || input.frameIndex > keyframeCount) {
      throw new Error(
        `frameIndex=${input.frameIndex} 超出范围 1..${keyframeCount}（当前分镜关键帧数）`,
      )
    }

    const existing = await this.keyframeRepo.listByStoryboard(input.storyboardId)
    const dup = existing.find((k) => k.frameIndex === input.frameIndex)
    if (dup) {
      throw new Error(
        `frameIndex=${input.frameIndex} 已存在关键帧（${dup.id}）；如需替换请用"重生成此帧"`,
      )
    }

    const plan = planKeyframes(keyframeCount)
    const planItem = plan.find((p) => p.frameIndex === input.frameIndex)
    if (!planItem) {
      throw new Error(
        `planKeyframes 未给出 frameIndex=${input.frameIndex} 的 plan item（keyframeCount=${keyframeCount}）`,
      )
    }

    const styleConfig = this.pickStyle(input.styleName)
    const sceneAssets = await this.resolveSceneAssets(scene, sb.id)
    // 复用 storyboard 级资产参考图覆盖
    const sbLevelOverrides = parseSbReferenceImageIds((sb as any).referenceImageIds)

    const created = await this.generateOneKeyframe({
      storyboard: sb,
      scene,
      plan: planItem,
      sceneAssets,
      styleConfig,
      userPrompt: input.userPrompt ?? null,
      referenceOverrides: sbLevelOverrides.length > 0 ? sbLevelOverrides : null,
    })
    if (sbLevelOverrides.length > 0) {
      await this.keyframeRepo.update(created.id, { referenceOverrides: sbLevelOverrides })
    }
    return created
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
    /** P5-T26 用户额外提示词，传给 prompt-builder */
    userPrompt?: string | null
    /** 阶段 2：用户挑图覆盖 — 命中 (kind, bindingId) 的资产直接用指定 imageId 查图；其余走自动评分 */
    referenceOverrides?: KeyframeReferenceOverride[] | null
  }): Promise<StoryboardKeyframe> {
    const { storyboard, scene, plan, sceneAssets, styleConfig, userPrompt } = args

    // 选 ref 图：先看用户 override，再走自动评分兜底
    const refImages = await this.collectReferenceImages(
      sceneAssets,
      scene,
      args.referenceOverrides ?? null,
    )

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
      userPrompt,
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
    // FU5-A9-L4：持久化 userPrompt → keyframe.userPromptOverride，
    // 让用户重生成时不丢失（之前每次都得重输入）
    return await this.keyframeRepo.create({
      storyboardId: storyboard.id,
      frameIndex: plan.frameIndex,
      timePercent: plan.timePercent,
      frameRole: plan.frameRole,
      imageAssetId: ia.id,
      prompt: promptOut.prompt,
      negativePrompt: promptOut.negativePrompt,
      userPromptOverride: userPrompt && userPrompt.trim() ? userPrompt.trim() : null,
    })
  }

  /**
   * 给场景资产挑参考图。每类资产先看 override，没有再按维度评分挑变体。
   *
   * @param overrides 用户挑图覆盖列表；命中的 (kind, bindingId) 直接用指定 imageId
   *                  查图（找不到 imageId 则回退到自动评分）。
   */
  private async collectReferenceImages(
    assets: {
      characters: ResolvedCharacterRef[]
      location: ResolvedLocationRef | null
      items: ResolvedItemRef[]
    },
    scene: SceneScriptEntity,
    overrides: KeyframeReferenceOverride[] | null = null,
  ): Promise<Array<{ id: string; imagePath: string }>> {
    const refs: Array<{ id: string; imagePath: string }> = []
    const overrideMap = new Map<string, string>()
    for (const o of overrides ?? []) {
      overrideMap.set(`${o.kind}:${o.bindingId}`, o.imageId)
    }

    /** 命中 override 时按 imageId 拉一次 asset_image；找不到/不匹配时返回 null 让外层走 fallback */
    const tryOverride = async (
      kind: 'character' | 'location' | 'item',
      bindingId: string,
    ): Promise<{ id: string; imagePath: string } | null> => {
      const imageId = overrideMap.get(`${kind}:${bindingId}`)
      if (!imageId) return null
      const list = await this.imageSvc.listByAsset(kind, bindingId)
      const hit = list.find((img) => img.id === imageId)
      if (!hit) return null
      return { id: hit.id, imagePath: hit.imagePath }
    }

    if (assets.location) {
      const ov = await tryOverride('location', assets.location.bindingId)
      if (ov) {
        refs.push(ov)
      } else {
        const r = await pickReferenceImage(this.imageSvc, {
          kind: 'location',
          bindingId: assets.location.bindingId,
          dims: { time: scene.timeOfDay, weather: scene.weather ?? undefined },
        })
        if (r.image) refs.push({ id: r.image.id, imagePath: r.image.imagePath })
      }
    }
    for (const c of assets.characters) {
      const ov = await tryOverride('character', c.bindingId)
      if (ov) {
        refs.push(ov)
        continue
      }
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
      const ov = await tryOverride('item', it.bindingId)
      if (ov) {
        refs.push(ov)
        continue
      }
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
