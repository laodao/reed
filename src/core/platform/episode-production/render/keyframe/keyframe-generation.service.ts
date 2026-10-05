/**
 * 多关键帧生成 service（spec §4.2 / §4.3 / §4.5 · P5-T4）
 * @module platform/episode-production/render/keyframe/keyframe-generation.service
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
import { VideoProjectEntity } from '@core/database/entities/episode-production/video-project.entity'
import { StoryboardKeyframeEntity } from '@core/database/entities/episode-production/storyboard-keyframe.entity'
import {
  StoryboardKeyframeRepository,
  type StoryboardKeyframe,
  type KeyframeReferenceOverride,
} from '@core/database/repositories/storyboard-keyframe.repository'
import { StoryboardCharacterRepository } from '@core/database/repositories/storyboard-character.repository'
import { ImageAssetRepository } from '@core/database/repositories/image-asset.repository'
import { AssetImageService } from '@core/platform/episode-production/assets/services/asset-image.service'
import { CharacterAssetService } from '@core/platform/episode-production/assets/services/character-asset.service'
import { normalizeBindingName } from '@core/platform/episode-production/assets/services/binding-name-utils'
import { ReferenceResolver } from '@core/platform/episode-production/narrative/reference-resolver'
import {
  planKeyframes,
  type KeyframePlan,
} from './keyframe-chain-strategy'
import {
  buildKeyframePrompt,
  PRESET_STYLES,
  REFERENCE_MATCH_STYLE_PREFIX,
  type ResolvedCharacterRef,
  type ResolvedLocationRef,
  type ResolvedItemRef,
  type StyleConfig,
} from './keyframe-prompt-builder'
import { pickReferenceImage } from './reference-image-selector'
import { deleteKeyframeWithAsset } from './keyframe-cleanup'
import { resolveCharacterViewLabel } from './keyframe-view-mapping'
import { parseAssetRefOverrides, replaceAssetRefMarkers, toRefCandidates } from './parse-asset-refs'
import { ReferenceBoardService, type ReferenceBoardResult, type ReferenceBoardMember } from './reference-board.service'
import { runKeyframeMachineChecks, type MachineCheckResult } from './keyframe-machine-checks'
import { KeyframeReviewService, isVisionCapable, type KeyframeReview } from './keyframe-review.service'
import { workerCompositeOntoScene } from '@core/platform/episode-production/common/sharp-worker'
import { toAbsImagePath } from '@core/platform/episode-production/common/image-hash'
import { getModelCapabilities } from '@core/platform/providers/image/model-capabilities'
import { getCoreDatabaseManager } from '@core/database/database-manager.interface'
import { getPathProvider } from '@core/interfaces/path.interface'
import * as fs from 'fs'
import * as path from 'path'
import type { ImageGenerator } from '@core/platform/episode-production/assets/services/gallery-derivation.service'
import { createGalleryImageGenerator, fallbackToReferenceCapableModel } from '@core/platform/episode-production/assets/services/image-provider-adapter'
import type { SceneCharacter } from '@shared/types/episode-production'

const DEFAULT_KEYFRAME_WIDTH = 1024
const DEFAULT_KEYFRAME_HEIGHT = 1024

/**
 * E2（2026-09-21 审核门成真门）：单帧最多拍 3 张（首拍 + 2 次重拍）。
 * 机器校验 / VLM 审核任一不通过 → 问题摘要追加进 prompt 重拍；3 张全失败 →
 * 该帧 metadata.machineCheck/review 落失败证据，视频生成闸门据此拦截，不再静默通过。
 */
const MAX_KEYFRAME_ATTEMPTS = 3

/** collectReferenceImages 选出的参考图（带资产名/类别，拼参考板 + 落库用） */
interface CollectedRefImage {
  id: string
  imagePath: string
  kind: 'character' | 'location' | 'item'
  name: string
}

/**
 * 合成锚定融合指令（2026-09-21 设计转向）：kontext 融合步的 prompt 前缀。
 * 替代 REFERENCE_MATCH_STYLE_PREFIX——参考图是"草稿+贴入人物"的合成图，
 * 要的是融合（统一光影/去贴纸感），不是"与参考图一致"。
 */
const COMPOSITE_FUSION_PREFIX =
  '[合成锚定融合] 将拼贴入画面的人物自然融入场景：统一光影、透视与写实风格，去除贴纸感与白边；' +
  '每个人物的面容、发型、服装必须与贴入形象严格一致；场景布局与背景保持草稿不变；' +
  '画面中不得出现多余人物' +
  '（blend the pasted characters into the scene naturally: unified lighting, perspective and ' +
  'realistic style, no sticker look or white fringes; each character must keep the exact face, ' +
  'hairstyle and outfit of the pasted figure; keep the draft scene layout and background unchanged; ' +
  'no extra people in frame）'

/** 剥掉 prompt 开头的风格前缀（合成锚定的融合步不用"与参考图一致"前缀） */
function stripStylePrefix(prompt: string): string {
  for (const prefix of [REFERENCE_MATCH_STYLE_PREFIX]) {
    if (prompt.startsWith(prefix)) {
      return prompt.slice(prefix.length).replace(/^[,，\s]+/, '')
    }
  }
  return prompt
}

/**
 * 关键帧画幅跟随项目（tasks/2026-09-16-storyboard-asset-cogen D5，消除 F9 的
 * 固定 1024×1024 与 16:9 视频画幅不匹配问题）：
 *   16:9 → 1344×768；9:16 → 768×1344；1:1 / 缺省 → 1024×1024。
 */
function keyframeDimensionsForAspectRatio(
  aspectRatio: string | null | undefined,
): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1344, height: 768 }
    case '9:16':
      return { width: 768, height: 1344 }
    default:
      return { width: DEFAULT_KEYFRAME_WIDTH, height: DEFAULT_KEYFRAME_HEIGHT }
  }
}

/**
 * D：编号参考板的 prompt 说明段（拼板模式时前置到 prompt）。
 * 名单来自拼板输入（顺序即图上编号色块顺序）。
 */
function buildBoardPromptNote(members: ReferenceBoardMember[]): string {
  const kindLabel: Record<ReferenceBoardMember['kind'], string> = {
    character: '角色',
    location: '场景',
    item: '物品',
  }
  const list = members.map((m) => `${m.slot}号=${m.name}（${kindLabel[m.kind]}）`).join('、')
  return (
    `[编号参考板] 参考图是一张编号参考板，从左到右依次是：${list}。` +
    `画面中出现的对应人物/场景/物品必须与对应编号图的形象严格一致。` +
    // R1（2026-09-21 v3 实锤）：编辑模型会直接把板当输出（白底分栏+编号徽章进成片），
    // 必须显式禁止复刻板结构
    `参考图仅用于核对人物/场景形象。严禁输出参考图本身的分栏布局、白色底、编号标记；` +
    `输出必须是单一完整的电影场景画面` +
    `（the reference is only for identity check: strictly do NOT reproduce the board itself — ` +
    `no panel grid layout, no white background, no number badges; ` +
    `output must be one single complete cinematic scene）`
  )
}

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
  private readonly boardService: ReferenceBoardService
  private readonly reviewService: KeyframeReviewService

  constructor(
    private readonly ds: DataSource,
    imageGenerator?: ImageGenerator,
    deps?: {
      boardService?: ReferenceBoardService
      reviewService?: KeyframeReviewService
      /** 合成锚定产物落盘的数据目录（可注入，单测用临时目录；缺省走 PathProvider） */
      compositeDataPath?: () => string
    },
  ) {
    this.keyframeRepo = new StoryboardKeyframeRepository(ds)
    this.sbCharRepo = new StoryboardCharacterRepository(ds)
    this.imageAssetRepo = new ImageAssetRepository(ds)
    this.resolver = new ReferenceResolver(ds)
    this.imageSvc = new AssetImageService(ds)
    this.imageGenerator = imageGenerator ?? createGalleryImageGenerator()
    this.boardService = deps?.boardService ?? new ReferenceBoardService()
    this.reviewService = deps?.reviewService ?? new KeyframeReviewService(ds)
    this.compositeDataPath = deps?.compositeDataPath ?? null
  }

  private readonly compositeDataPath: (() => string) | null

  private get sbRepo(): Repository<StoryboardEntity> {
    return this.ds.getRepository(StoryboardEntity)
  }

  private get sceneRepo(): Repository<SceneScriptEntity> {
    return this.ds.getRepository(SceneScriptEntity)
  }

  /**
   * 确保分镜有关键帧记录（不生成图片）。
   *
   * 用于制作界面进入时自动创建空的关键帧记录，让用户可以先挑图再生成。
   * - 如果已存在且数量匹配 → 直接返回现有记录
   * - 如果数量不足 → 补齐缺失的帧
   * - 如果不存在 → 创建全部帧记录
   *
   * @returns 关键帧列表（按 frameIndex 升序）
   */
  async ensureEmptyKeyframes(storyboardId: string): Promise<StoryboardKeyframe[]> {
    const sb = await this.sbRepo.findOne({ where: { id: storyboardId } })
    if (!sb) throw new Error(`Storyboard not found: ${storyboardId}`)

    const keyframeCount = Math.max(1, sb.keyframeCount ?? 3)
    const plan = planKeyframes(keyframeCount)

    // 获取现有的关键帧记录
    const existing = await this.keyframeRepo.listByStoryboard(storyboardId)
    const existingIndexes = new Set(existing.map((k) => k.frameIndex))

    // 找出缺失的帧索引
    const missing = plan.filter((p) => !existingIndexes.has(p.frameIndex))

    if (missing.length === 0) {
      // 全部存在，返回排序后的列表
      return existing.sort((a, b) => a.frameIndex - b.frameIndex)
    }

    // 创建缺失的空关键帧记录
    for (const planItem of missing) {
      await this.keyframeRepo.create({
        storyboardId,
        frameIndex: planItem.frameIndex,
        timePercent: planItem.timePercent,
        frameRole: planItem.frameRole,
        imageAssetId: null,
        prompt: null,
        referenceOverrides: null,
        userPromptOverride: null,
      })
    }

    // 返回完整的列表
    return await this.keyframeRepo.listByStoryboard(storyboardId)
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

    // D4-3 空绑定守卫：场景名单有角色但一个绑定都解析不出来 → 拒绝生成
    await this.assertCharactersBound(scene, sb, sceneAssets)

    // D5：关键帧画幅跟随项目 config.aspectRatio（入口取一次，逐帧复用）
    const dimensions = await this.resolveKeyframeDimensions(scene)

    /*
     * 用户在 ⑤ 制作 stage 为本分镜挑选的资产参考图覆盖（spec storyboard.referenceImageIds）。
     * 这里把 storyboard 级 overrides 转成每帧生成时通用的 KeyframeReferenceOverride[]，
     * 整批关键帧都用同一组挑图作为参考，并写回每个 keyframe.referenceOverrides 让后续
     * 单帧重生（regenerateKeyframe）也能复用。用户后续仍可在 KeyframeReferencePicker
     * 单独覆盖某一帧 — 单帧 override 优先级更高，由 keyframeRepo.update 直接覆盖。
     */
    const sbLevelOverrides = parseSbReferenceImageIds((sb as any).referenceImageIds)

    // 打通：frameDescription 里的 @[名字@索引] 显式指定参考图 → 覆盖该资产的自动选图。
    // 与 storyboard.referenceImageIds 合并（@[..] 命中同名资产时优先）。生成不能因解析失败中断。
    let effectiveOverrides = sbLevelOverrides
    try {
      const refOverrides = await parseAssetRefOverrides(
        (sb as any).frameDescription ?? '',
        toRefCandidates(sceneAssets as any),
        this.imageSvc,
      )
      if (refOverrides.length > 0) {
        const byKey = new Map(sbLevelOverrides.map((o) => [`${o.kind}:${o.bindingId}`, o]))
        for (const o of refOverrides) byKey.set(`${o.kind}:${o.bindingId}`, o)
        effectiveOverrides = [...byKey.values()]
      }
    } catch (e) {
      console.error('[keyframe-generation] 解析 @[名字@索引] 失败，忽略：', e)
    }

    // 复核修复 P1-8：不再"先删旧帧再生成"（原实现生成中途失败，旧帧行连数据引用
    // 一起丢，磁盘图成孤儿）——先全部生成新帧，成功后换入：删旧行 + 回收旧图；
    // frameIndex 无唯一约束，新旧行共存安全
    const oldRows = await this.keyframeRepo.listByStoryboard(sb.id)

    const created: StoryboardKeyframe[] = []
    try {
      for (const planItem of plan) {
        const kf = await this.generateOneKeyframe({
          storyboard: sb,
          scene,
          plan: planItem,
          sceneAssets,
          styleConfig,
          dimensions,
          userPrompt: input.userPrompt ?? null,
          referenceOverrides: effectiveOverrides.length > 0 ? effectiveOverrides : null,
        })
        created.push(kf)
        if (effectiveOverrides.length > 0) {
          await this.keyframeRepo.update(kf.id, { referenceOverrides: effectiveOverrides })
        }
      }
    } catch (e) {
      // 失败：回滚本轮半成品新帧（保留旧帧），写回 error 状态
      for (const kf of created) {
        try {
          await deleteKeyframeWithAsset(this.ds, kf.id)
        } catch { /* 回收容错，不掩盖原错误 */ }
      }
      await this.sbRepo.update(sb.id, { status: 'error', updatedAt: new Date() })
      throw e
    }
    // 全部成功 → 换入：删旧行（按 id，不波及本轮新行）并回收旧图
    for (const old of oldRows) {
      try {
        await deleteKeyframeWithAsset(this.ds, old.id)
      } catch { /* 回收容错 */ }
    }
    // 全部关键帧生成成功 → 分镜状态置 image_ready（与单图路径
    // handleGenerateStoryboardImage 的写回一致；此前本路径不写 status，
    // 导致列表状态停留在"待生成"）
    await this.sbRepo.update(sb.id, { status: 'image_ready', updatedAt: new Date() })
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

    // D4-3 空绑定守卫（同 generateKeyframesForStoryboard）：无绑定不进入图像生成
    await this.assertCharactersBound(scene, sb, sceneAssets)

    // D5：关键帧画幅跟随项目 config.aspectRatio
    const dimensions = await this.resolveKeyframeDimensions(scene)

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

    // 复核修复 P1-8：先生成新帧，成功后再删旧帧并回收旧图（原实现先删后生成，
    // AI 失败连旧帧数据一起丢；frameIndex 无唯一约束，新旧共存安全）
    const created = await this.generateOneKeyframe({
      storyboard: sb,
      scene,
      plan: planItem,
      sceneAssets,
      styleConfig,
      dimensions,
      userPrompt: effectiveUserPrompt,
      referenceOverrides,
    })
    // 把旧 override 持久化到新帧（generateOneKeyframe 不会自动写）
    if (referenceOverrides && referenceOverrides.length > 0) {
      await this.keyframeRepo.update(created.id, {
        referenceOverrides,
      })
    }
    await deleteKeyframeWithAsset(this.ds, old.id)
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
   * S-05 影响面统计：某资产 binding 被关键帧 / 分镜引用的面。
   *
   * 统计口径（选实现成本最低的 LIKE 文本口径，注释留存）：
   * - keyframes：storyboard_keyframe.reference_overrides JSON 文本 LIKE '%bindingId%' 的行
   *   ——即用户精细挑图（referenceOverrides）显式引用该资产的关键帧；
   *   自动评分选中的引用不落 overrides，不在此口径内。
   * - storyboards：分镜 JSON 列 LIKE '%bindingId%' 的分镜数
   *   ——character 查 characters（[].characterId）；location 查 location_binding_ids；
   *   item 查 item_binding_ids。bindingId 带 cb_/lb_/ib_ 前缀，天然区分 kind。
   *
   * 返回 keyframeIds 供级联重生逐个调 regenerateKeyframe。
   */
  async countAssetReferences(
    kind: 'character' | 'location' | 'item',
    bindingId: string,
  ): Promise<{ keyframes: number; storyboards: number; keyframeIds: string[] }> {
    const pat = `%${bindingId}%`
    const kfRows = await this.ds
      .getRepository(StoryboardKeyframeEntity)
      .createQueryBuilder('kf')
      .where('kf.reference_overrides LIKE :pat', { pat })
      .getMany()

    const sbColumn =
      kind === 'character'
        ? 'characters'
        : kind === 'location'
          ? 'location_binding_ids'
          : 'item_binding_ids'
    const storyboards = await this.ds
      .getRepository(StoryboardEntity)
      .createQueryBuilder('sb')
      .where(`sb.${sbColumn} LIKE :pat`, { pat })
      .getCount()

    return {
      keyframes: kfRows.length,
      storyboards,
      keyframeIds: kfRows.map((r) => r.id),
    }
  }

  /**
   * S-05 级联重生：对 referenceOverrides 引用该资产的全部 storyboard_keyframe 行
   * 逐个调 regenerateKeyframe。串行执行（避免并发打爆图 provider），单帧失败跳过继续。
   */
  async regenerateKeyframesReferencingAsset(
    kind: 'character' | 'location' | 'item',
    bindingId: string,
  ): Promise<{ total: number; succeeded: number; failed: number }> {
    const { keyframeIds } = await this.countAssetReferences(kind, bindingId)
    let succeeded = 0
    let failed = 0
    for (const keyframeId of keyframeIds) {
      try {
        await this.regenerateKeyframe({ keyframeId })
        succeeded++
      } catch (e) {
        failed++
        console.warn(
          `[keyframe-generation] 级联重生跳过失败帧 ${keyframeId}（资产 ${kind}:${bindingId}）:`,
          e,
        )
      }
    }
    return { total: keyframeIds.length, succeeded, failed }
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
      await this.ds
        .getRepository(StoryboardKeyframeEntity)
        .update({ id: kf.id }, { frameIndex: kf.frameIndex + 1 })
    }
    // storyboard.keyframeCount += 1（复核修复：先读后 +1 回写是无锁 RMW，并发插入
    // 会丢更新——改 SQL 原子自增）
    await this.ds
      .getRepository(StoryboardEntity)
      .increment({ id: sb.id } as any, 'keyframeCount', 1)

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
    // D4-3 守卫补挂（0916 晚 review：insertExtraKeyframe/generateKeyframeAtIndex 两入口
    // 此前漏挂——「插入中间帧/按索引补帧」仍会空参考纯文生图静默降级）
    await this.assertCharactersBound(scene, sb, sceneAssets)
    const dimensions = await this.resolveKeyframeDimensions(scene)
    return await this.generateOneKeyframe({
      storyboard: sb,
      scene,
      plan: planItem,
      sceneAssets,
      styleConfig,
      dimensions,
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
    // D4-3 守卫补挂（同 insertExtraKeyframe——按索引补帧也不能静默降级）
    await this.assertCharactersBound(scene, sb, sceneAssets)
    const dimensions = await this.resolveKeyframeDimensions(scene)
    // 复用 storyboard 级资产参考图覆盖
    const sbLevelOverrides = parseSbReferenceImageIds((sb as any).referenceImageIds)

    const created = await this.generateOneKeyframe({
      storyboard: sb,
      scene,
      plan: planItem,
      sceneAssets,
      styleConfig,
      dimensions,
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
   * D4-3 空绑定守卫（tasks/2026-09-16-storyboard-asset-cogen；2026-09-24 一致性修复 K5 扩展）：
   * 三级角色来源（storyboard_characters 表 / storyboard.characters JSON / scene.characters）
   * 任一声明了角色、但 resolveSceneAssets 连一个角色绑定都解析不出来时直接报错 ——
   * 继续生成只会 referenceImages:[] 纯文生图静默降级（F6 的 else-if 死路 / F8 实测），
   * 成片角色必然漂移。三级来源均无角色（分镜本就无角色）不拦截。
   */
  private async assertCharactersBound(
    scene: SceneScriptEntity,
    storyboard: StoryboardEntity,
    sceneAssets: { characters: ResolvedCharacterRef[] },
  ): Promise<void> {
    if (sceneAssets.characters.length > 0) return
    const sbTableChars = await this.sbCharRepo.getByStoryboardId(storyboard.id)
    const sbJsonChars = (
      ((storyboard as any).characters as Array<Record<string, unknown>> | null) ?? []
    ).filter((raw) => {
      const id = typeof raw?.characterId === 'string' ? raw.characterId.trim() : ''
      const name = typeof raw?.characterName === 'string' ? raw.characterName.trim() : ''
      return id.length > 0 || name.length > 0
    })
    const sceneChars = (scene.characters as SceneCharacter[] | null) ?? []
    if (sbTableChars.length + sbJsonChars.length + sceneChars.length === 0) return
    const sources: string[] = []
    if (sbTableChars.length > 0) sources.push(`storyboard_characters 表 ${sbTableChars.length} 条`)
    if (sbJsonChars.length > 0) sources.push(`storyboard.characters JSON ${sbJsonChars.length} 条`)
    if (sceneChars.length > 0) sources.push(`scene.characters ${sceneChars.length} 条`)
    throw new Error(
      `场景 ${scene.sceneNumber} 声明了角色（${sources.join('、')}），但角色未绑定资产` +
        `（characterBindingId 全部缺失或失效），拒绝生成关键帧。` +
        `请先运行联合分镜生成或绑定修复（ScriptBindingFixer）后再生成。`,
    )
  }

  /**
   * D5：关键帧画幅跟随项目 config.aspectRatio（scene→episode→project 链路取一次）。
   * 链路/配置缺失时回退 1024×1024（不阻塞生成；projectId 缺失会在
   * generateOneKeyframe 写 image_assets 时按原逻辑抛错暴露）。
   */
  private async resolveKeyframeDimensions(
    scene: SceneScriptEntity,
  ): Promise<{ width: number; height: number }> {
    try {
      const projectId = await this.resolveProjectIdForScene(scene)
      const project = await this.ds
        .getRepository(VideoProjectEntity)
        .findOne({ where: { id: projectId } })
      const aspectRatio = (project?.config as { aspectRatio?: string } | null | undefined)
        ?.aspectRatio
      return keyframeDimensionsForAspectRatio(aspectRatio)
    } catch {
      return keyframeDimensionsForAspectRatio(null)
    }
  }

  /** 项目设置里的风格 prompt（config.stylePrompt）→ 拼进关键帧提示词；空/异常 → '' */
  private async resolveProjectStylePrompt(scene: SceneScriptEntity): Promise<string> {
    try {
      const projectId = await this.resolveProjectIdForScene(scene)
      const project = await this.ds
        .getRepository(VideoProjectEntity)
        .findOne({ where: { id: projectId } })
      return ((project?.config as { stylePrompt?: string } | null | undefined)?.stylePrompt ?? '').trim()
    } catch {
      return ''
    }
  }

  /**
   * 解析有效画面模型的 maxReferenceImages（D 拼板判定用；查能力表，不硬编码模型名）。
   * 未钉项目模型 / provider 配置缺失 / 模型未登记能力 → null（不拼板，保持原截断逻辑）。
   */
  private async resolveMaxReferenceImages(
    model: { providerConfigId: string; modelId: string } | null,
  ): Promise<number | null> {
    if (!model) return null
    try {
      const db = getCoreDatabaseManager()
      if (!db.providerConfigs) return null
      const enabled = await db.providerConfigs.getEnabled()
      const cfg = enabled.find((c) => c.id === model.providerConfigId)
      if (!cfg) return null
      const providerType = String(cfg.templateId ?? '').replace('image-', '')
      const cur = ((cfg.models ?? []) as Array<{ id?: string; name?: string }>).find(
        (m) => m.id === model.modelId,
      )
      return getModelCapabilities(providerType, model.modelId, cur?.name).maxReferenceImages
    } catch {
      return null
    }
  }

  /**
   * 合成锚定第 1 步的 T2I 草稿模型：同 provider 下找 textToImage 模型
   * （models[].features.textToImage===true 优先；能力表 maxReferenceImages===0 兜底）。
   * 找不到 → null（调用方 warn 退化为单参考图截断）。
   */
  private async resolveDraftT2IModel(
    editModel: { providerConfigId: string; modelId: string } | null,
  ): Promise<{ providerConfigId: string; modelId: string } | null> {
    if (!editModel) return null
    try {
      const db = getCoreDatabaseManager()
      if (!db.providerConfigs) return null
      const enabled = await db.providerConfigs.getEnabled()
      const cfg = enabled.find((c) => c.id === editModel.providerConfigId)
      if (!cfg) return null
      const providerType = String(cfg.templateId ?? '').replace('image-', '')
      const models = (cfg.models ?? []) as Array<{
        id?: string
        name?: string
        type?: string
        features?: { textToImage?: boolean }
      }>
      for (const m of models) {
        if (!m.id || m.id === editModel.modelId) continue
        if (m.type !== 'image' && m.type !== 'multimodal') continue
        if (m.features?.textToImage === true) {
          return { providerConfigId: editModel.providerConfigId, modelId: m.id }
        }
        try {
          if (getModelCapabilities(providerType, m.id, m.name).maxReferenceImages === 0) {
            return { providerConfigId: editModel.providerConfigId, modelId: m.id }
          }
        } catch {
          // 未登记能力 → 跳过
        }
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * 合成锚定前两步：T2I 场景草稿（无参考图）→ sharp 抠图贴入合成。
   * 返回相对 dataPath 的 draft/composite 路径 + 贴入成员。失败抛错（调用方退化截断）。
   */
  private async buildCompositeAnchor(args: {
    scene: SceneScriptEntity
    basePrompt: string
    negativePrompt: string
    plan: KeyframePlan
    dimensions: { width: number; height: number }
    t2iModel: { providerConfigId: string; modelId: string }
    charRefs: CollectedRefImage[]
  }): Promise<{
    draftPath: string
    compositePath: string
    members: Array<{ assetImageId: string; name: string; slot: number }>
  }> {
    // 1. T2I 场景草稿：原关键帧 prompt（含人物文字描述/构图/景别），不带参考图
    const draft = await this.imageGenerator.generate({
      referenceImagePaths: [],
      prompt: args.basePrompt,
      negativePrompt: args.negativePrompt,
      label: `keyframe_${args.plan.frameRole}_${args.plan.frameIndex}_draft`,
      width: args.dimensions.width,
      height: args.dimensions.height,
      providerConfigId: args.t2iModel.providerConfigId,
      modelId: args.t2iModel.modelId,
    })

    // 2. 角色主图白底抠图贴入合成（worker 子进程；只贴角色，不贴地点/物品图）
    const dataPath = this.compositeDataPath?.() ?? getPathProvider().getDataPath()
    const now = new Date()
    const relDir = path.join(
      'images',
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    )
    const absDir = path.join(dataPath, relDir)
    fs.mkdirSync(absDir, { recursive: true })
    const fileName = `composite_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
    const absOut = path.join(absDir, fileName)
    const draftAbs = toAbsImagePath(draft.imagePath)

    const out = await workerCompositeOntoScene({
      scenePath: draftAbs,
      members: args.charRefs.map((r) => ({
        imagePath: toAbsImagePath(r.imagePath),
        assetImageId: r.id,
        name: r.name,
      })),
      outPath: absOut,
    })

    return {
      draftPath: draft.imagePath,
      compositePath: path.join(relDir, fileName).replace(/\\/g, '/'),
      members: out.members,
    }
  }

  /** 古风硬约束上下文：scene → episode_script → episode 取 storyEra/storyRegion；缺失 → null（不阻塞生成） */
  private async resolveEpisodeEraContext(
    scene: SceneScriptEntity,
  ): Promise<{ storyEra: string | null; storyRegion: string | null }> {
    try {
      const epScript = await this.ds
        .getRepository(EpisodeScriptEntity)
        .findOne({ where: { id: scene.episodeScriptId } })
      if (!epScript) return { storyEra: null, storyRegion: null }
      const ep = await this.ds
        .getRepository(VideoEpisodeEntity)
        .findOne({ where: { id: (epScript as any).episodeId } })
      return {
        storyEra: (ep as any)?.storyEra ?? null,
        storyRegion: (ep as any)?.storyRegion ?? null,
      }
    } catch {
      return { storyEra: null, storyRegion: null }
    }
  }

  /** 重拍废图回收（best-effort）：只删 dataPath 内的生成图，失败静默 */
  private discardGeneratedImage(imagePath: string): void {
    try {
      const dataPath = getPathProvider().getDataPath()
      const abs = path.isAbsolute(imagePath) ? imagePath : path.join(dataPath, imagePath)
      const normalized = path.normalize(abs)
      const prefix = dataPath.endsWith(path.sep) ? dataPath : dataPath + path.sep
      if (!normalized.startsWith(prefix)) return
      if (fs.existsSync(normalized)) fs.unlinkSync(normalized)
    } catch {
      // 回收容错
    }
  }

  /**
   * 项目「画面生成」模型（config.imageModel）→ 关键帧生成的 provider/model 覆盖。
   * 与 main-image-generator.resolveProjectImageModel 同源（那边按资产反查 projectId，
   * 这里 generateOneKeyframe 已持有 projectId，直接查项目）。未配置/异常 → null（自动挑）。
   */
  private async resolveProjectImageModel(
    projectId: string,
  ): Promise<{ providerConfigId: string; modelId: string } | null> {
    try {
      const project = await this.ds
        .getRepository(VideoProjectEntity)
        .findOne({ where: { id: projectId } })
      const im = (project?.config as { imageModel?: { providerConfigId?: string; modelId?: string } } | null | undefined)
        ?.imageModel
      return im?.providerConfigId && im?.modelId
        ? { providerConfigId: im.providerConfigId, modelId: im.modelId }
        : null
    } catch {
      return null
    }
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
    // 加载分镜本身（含 location_binding_ids / item_binding_ids 分镜级覆盖）
    const sb = await this.sbRepo.findOne({ where: { id: storyboardId } })
    const sbLocationOverride = (sb as any)?.locationBindingIds as string[] | null
    const sbItemOverride = (sb as any)?.itemBindingIds as string[] | null

    // location（spec 2026-05-09 分镜级覆盖）：
    //   - storyboard.locationBindingIds 非空 → 用第一个 binding（一般分镜只一个地点）
    //   - 否则回退 scene.locationBindingId
    let location: ResolvedLocationRef | null = null
    const effectiveLocationId =
      sbLocationOverride && sbLocationOverride.length > 0
        ? sbLocationOverride[0]
        : scene.locationBindingId
    if (effectiveLocationId) {
      const r = await this.resolver.resolveLocation(effectiveLocationId)
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
    } else if (Array.isArray(sb?.characters) && sb!.characters.length > 0) {
      /*
       * 第一级回退（spec 2026-05-09 ep-redesign · e2e Bug B 修复）：
       *   storyboard_characters 表空 + storyboard.characters JSON 非空时，
       *   **必须用本分镜的 JSON 字段**，不能直接跳到 scene.characters 整场角色。
       *
       *   旧 bug：fallback 跳过 storyboard.characters → scene.characters →
       *   关键帧 prompt 包含本分镜根本没出场的整场角色（report-shot-1.2.md Bug B）。
       *
       *   解析每条 entry：
       *     - characterId 优先当 binding.id 直接 resolve
       *     - resolve 不到时按生效名归一化反查（兼容 AI 拆分镜直接用名字
       *       不是 binding.id 的常见情况；standalone / linked_lw 双源投影后匹配）
       *     - 都不到 / characterId 空 → 跳过该条（不回退整场）
       *
       *   即使所有 entry 都跳过（characterId 全空），也保持"本分镜无可识别角色"
       *   的事实，不污染 prompt。
       */
      const projectId = await this.resolveProjectIdForScene(scene)
      let charNameIndex: Map<string, string> | null = null
      for (const raw of sb!.characters as Array<Record<string, unknown>>) {
        const characterId =
          typeof raw?.characterId === 'string' ? raw.characterId : ''
        if (!characterId) continue

        let resolved = await this.resolver.resolveCharacter(characterId)
        if (!resolved) {
          // 按生效名归一化反查（项目级；索引惰性建一次，本分镜内复用）
          if (!charNameIndex) charNameIndex = await this.buildCharacterNameIndex(projectId)
          const found = await this.findBindingByName(projectId, characterId, charNameIndex)
          if (found) resolved = await this.resolver.resolveCharacter(found)
        }
        if (!resolved) continue

        const expression =
          typeof raw?.expression === 'string' ? raw.expression : null
        const action = typeof raw?.action === 'string' ? raw.action : null
        const facing = typeof raw?.facing === 'string' ? raw.facing : null
        const positionRaw = raw?.position
        let position: string | null = null
        if (
          positionRaw &&
          typeof positionRaw === 'object' &&
          !Array.isArray(positionRaw) &&
          typeof (positionRaw as any).x === 'number'
        ) {
          position = positionToString(positionRaw as any)
        } else if (typeof positionRaw === 'string') {
          position = positionRaw
        }

        characters.push({
          bindingId: resolved.bindingId,
          effective: resolved.effective,
          sceneRole: {
            expression,
            action,
            outfit: null,
            position,
            facing,
          } as any,
        })
      }
    } else {
      // 第二级回退（极少触发，AI 拆分镜时通常已经填了 storyboard.characters）：
      // 场景级 scene.characters JSON
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

    // items：分镜级覆盖优先（spec 2026-05-09），否则回退 scene.characters[*].props
    const items: ResolvedItemRef[] = []
    if (sbItemOverride && sbItemOverride.length > 0) {
      for (const itemBindingId of sbItemOverride) {
        if (!itemBindingId) continue
        const r = await this.resolver.resolveItem(itemBindingId)
        if (!r) continue
        items.push({ bindingId: r.bindingId, effective: r.effective })
      }
    } else {
      const sceneCharsForItems =
        (scene.characters as SceneCharacter[] | null) ?? []
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
    }

    return { characters, location, items }
  }

  /** 生成一帧并落库（E2：生成 → 机器校验 → VLM 审核 → 不通过重拍，最多 3 张） */
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
    /** D5：关键帧画幅（按项目 config.aspectRatio 推导，入口处取一次传入） */
    dimensions: { width: number; height: number }
    /** P5-T26 用户额外提示词，传给 prompt-builder */
    userPrompt?: string | null
    /** 阶段 2：用户挑图覆盖 — 命中 (kind, bindingId) 的资产直接用指定 imageId 查图；其余走自动评分 */
    referenceOverrides?: KeyframeReferenceOverride[] | null
  }): Promise<StoryboardKeyframe> {
    const { storyboard, scene, plan, sceneAssets, styleConfig, dimensions, userPrompt } = args

    // 选 ref 图：先看用户 override，再走自动评分兜底
    const { refs: refImages } = await this.collectReferenceImages(
      sceneAssets,
      scene,
      args.referenceOverrides ?? null,
      storyboard.shotType,
    )

    // 古风硬约束（F 项）：episode.storyEra 命中古/武侠/朝代词 → prompt/negative 追加禁令
    const eraCtx = await this.resolveEpisodeEraContext(scene)

    // 项目设置的 stylePrompt 追加到关键帧提示词尾部（不覆盖既有结构）
    const projectStyle = await this.resolveProjectStylePrompt(scene)
    // 2026-09-19：关键帧生成接线项目「画面生成」模型（config.imageModel）。
    // 此前不传 provider/model → pickImageModel 自动乱挑（场次2根因：挑中只吃 1 张
    // 参考图的 bailian wan2.7-image，多角色视觉锚丢失）。与资产主图生成
    // （main-image-generator）同一解析序：项目设置 > 自动。
    const projectId = await this.resolveProjectIdForScene(scene)
    const projectImageModel = await this.resolveProjectImageModel(projectId)
    // F1b（2026-09-21）：关键帧带参考图时，钉住的模型若不支持参考图
    // （如 krea2 maxReferenceImages=0 纯 T2I），参考图会被能力截断静默丢弃、
    // 人物视觉锚丢失——与视图/派生同源回退到同 provider 的 I2I 模型（flux-kontext）。
    const effectiveImageModel = refImages.length > 0
      ? await fallbackToReferenceCapableModel(projectImageModel)
      : projectImageModel

    /*
     * 多角色锚定（2026-09-21 设计转向：废弃拼板喂 kontext，改场景优先合成锚定）：
     *   - maxRefs==1 且有角色参考图 → 三步链：T2I 场景草稿（同 provider 的
     *     textToImage 模型，无参考图）→ sharp 白底抠图贴入合成（worker
     *     compositeOntoScene）→ kontext 融合（合成图为唯一参考图 + 融合指令）。
     *     利用编辑模型"保持输入"的天性：输入合成图，输出融合后的完整场景。
     *   - maxRefs==1 但无角色参考图 / 同 provider 无 T2I 模型 / 合成失败 →
     *     warn 退化为原单参考图截断逻辑（adapter 截到第一张）。
     *   - maxRefs>1 且 refs 超出上限 → 保留拼板路径（当前无此配置，留待多参考平台）。
     * 链式衔接：chain-strategy 参考链只在 prompt 层（时刻语言），帧间不互喂图片，不冲突。
     *
     * K2（2026-09-24 一致性修复）：路径预判在拼 prompt 之前完成，风格前缀让位与
     * 实际发送共用同一预算口径——hasCharacterReference 按最终选定模型的
     * maxReferenceImages 预算截断后的存活集判定（截断后无角色参考图存活则不让位，
     * 避免视觉锚 + 风格锚双失）。合成锚定候选路径下全部角色参考图经合成图生效；
     * 运行时若退化（无 T2I 草稿模型 / 合成失败）为单参考图截断，角色参考图排在
     * 首位（collectReferenceImages 角色 → 物品 → 地点），slice(0,1) 仍保住角色，
     * 判定结果不变。
     */
    const maxRefs = await this.resolveMaxReferenceImages(effectiveImageModel)
    const charRefs = refImages.filter((r) => r.kind === 'character')
    const planComposite = refImages.length > 0 && maxRefs === 1 && charRefs.length > 0
    const planBoard =
      !planComposite &&
      refImages.length > 1 &&
      maxRefs !== null &&
      maxRefs > 1 &&
      refImages.length > maxRefs
    const budgetedRefs =
      planComposite || planBoard || maxRefs === null
        ? refImages
        : maxRefs <= 0
          ? []
          : refImages.slice(0, maxRefs)
    // F4：截断后仍有角色参考图存活才让位风格前缀（K2）
    const hasCharacterReference = budgetedRefs.some((r) => r.kind === 'character')

    // 拼提示词
    // K1（2026-09-24 一致性修复）：frameDescription 先剥 @[名字@索引@实体id] 标记为
    // 纯名（与视频链路口径一致）——图像模型不认识 @[..] 引用语法，原样传入只会变噪声
    const promptOut = buildKeyframePrompt({
      shotType: storyboard.shotType,
      cameraAngle: storyboard.cameraAngle,
      frameDescription: replaceAssetRefMarkers(storyboard.frameDescription),
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
      hasCharacterReference,
      // spec 2026-05-09 ep-redesign §3.2 B5 镜头扩展（焦距 / 光圈 / 相机风格 / 打光预设）
      cameraMetadata: (storyboard as any).metadata ?? null,
      storyEra: eraCtx.storyEra,
      storyRegion: eraCtx.storyRegion,
    })

    // 调 image generator 生成图（label 用 frame 角色 + frameIndex 便于追踪）
    const basePrompt = projectStyle ? `${promptOut.prompt}，${projectStyle}` : promptOut.prompt

    let board: ReferenceBoardResult | null = null
    let compositeAnchor: {
      draftPath: string
      compositePath: string
      members: Array<{ assetImageId: string; name: string; slot: number }>
    } | null = null
    let fusionModel: { providerConfigId: string; modelId: string } | null = null
    if (planComposite) {
      const t2iModel = await this.resolveDraftT2IModel(effectiveImageModel)
      if (!t2iModel) {
        console.warn(
          '[keyframe-generation] 同 provider 无 T2I 草稿模型，合成锚定不可用，退化为单参考图截断',
        )
      } else {
        try {
          compositeAnchor = await this.buildCompositeAnchor({
            scene,
            basePrompt,
            negativePrompt: promptOut.negativePrompt,
            plan,
            dimensions,
            t2iModel,
            charRefs,
          })
          fusionModel = effectiveImageModel
        } catch (e) {
          console.warn('[keyframe-generation] 合成锚定失败，退化为单参考图截断:', e)
          compositeAnchor = null
        }
      }
    } else if (planBoard) {
      // 拼板遗留路径：仅多参考平台（maxRefs>1）且 refs 超上限时启用
      try {
        board = await this.boardService.build(
          refImages.map((r) => ({
            imagePath: r.imagePath,
            name: r.name,
            kind: r.kind,
            assetImageId: r.id,
          })),
        )
      } catch (e) {
        console.warn('[keyframe-generation] 参考板拼接失败，退回原截断逻辑:', e)
        board = null
      }
    }
    const referencePaths = compositeAnchor
      ? [compositeAnchor.compositePath]
      : board
        ? [board.path]
        : refImages.map((r) => r.imagePath)
    const boardNote = board ? buildBoardPromptNote(board.members) : ''
    // 合成锚定：融合指令 + 原 prompt 的场景/动作/氛围（剥掉"与参考图一致"风格前缀——
    // 参考图是合成贴图，风格由融合指令定义）
    const fusionBasePrompt = compositeAnchor
      ? `${COMPOSITE_FUSION_PREFIX}\n${stripStylePrefix(basePrompt)}`
      : ''
    const generateModel = compositeAnchor ? fusionModel : effectiveImageModel

    // E2：VLM 审核仅在项目配置了多模态审核模型时启用；纯文本/未配置 → skipped
    const reviewModel = await this.reviewService
      .resolveReviewModelForStoryboard(storyboard.id)
      .catch(() => null)
    const visionReview = !!(reviewModel && isVisionCapable(reviewModel.modelId))

    let generated: Awaited<ReturnType<ImageGenerator['generate']>> | null = null
    let machineCheck: MachineCheckResult | null = null
    let review: KeyframeReview | null = null
    let retryNote = ''
    // K3（2026-09-24 一致性修复）：生效参考图 id 集在循环内每次生成后按
    // effectiveReferencePaths 重算，VLM 审核基准 = 截断后实际生效集（与事后审核
    // keyframe-review 的 referenceImageIdsEffective 优先口径一致）
    let effectiveReferenceImageIds = refImages.map((r) => r.id)
    // K6：实际发送的完整 prompt（含 stylePrompt 尾缀 / boardNote / 融合指令 / retryNote，
    // 以及 adapter 拼的 `, variant: {label}` 尾——实现方回传 sentPrompt 时优先）落库，
    // 事后可还原「当时到底发了什么」
    let actualPrompt = ''
    for (let attempt = 1; attempt <= MAX_KEYFRAME_ATTEMPTS; attempt++) {
      const attemptPrompt =
        (compositeAnchor ? fusionBasePrompt : (boardNote ? `${boardNote}\n` : '') + basePrompt) +
        (retryNote ? `\n[上一张图的问题] ${retryNote}，必须修正` : '')
      generated = await this.imageGenerator.generate({
        referenceImagePaths: referencePaths,
        prompt: attemptPrompt,
        negativePrompt: promptOut.negativePrompt,
        label: `keyframe_${plan.frameRole}_${plan.frameIndex}`,
        width: dimensions.width,
        height: dimensions.height,
        providerConfigId: generateModel?.providerConfigId,
        modelId: generateModel?.modelId,
      })
      actualPrompt = generated.sentPrompt ?? attemptPrompt

      // 生效参考图：adapter 按模型能力截断后返回实际生效路径；缺省=全部生效。
      // 截断差异（选中但未生效）必须落库让 UI 可见——这是"多角色参考图被静默丢弃"的根因面。
      // 拼板/合成锚定模式下参考图全部经板/合成图生效，仍记原始成员 ids。
      effectiveReferenceImageIds = refImages.map((r) => r.id)
      if (!board && !compositeAnchor && generated.effectiveReferencePaths) {
        const effectiveSet = new Set(generated.effectiveReferencePaths)
        effectiveReferenceImageIds = refImages
          .filter((r) => effectiveSet.has(r.imagePath))
          .map((r) => r.id)
      }

      // 机器校验：照抄/空图硬检测（基准 = 原始成员参考图；拼板 R2 追加板复刻；
      // 合成锚定追加 composite_copy 未融合检测）
      machineCheck = await runKeyframeMachineChecks(
        generated.imagePath,
        refImages.map((r) => r.imagePath),
        { boardPath: board?.path ?? null, compositePath: compositeAnchor?.compositePath ?? null },
      )

      // VLM 审核：仅多模态审核模型；机器校验未过不再浪费 VLM 调用
      review = null
      if (machineCheck.pass && visionReview) {
        try {
          review = await this.reviewService.reviewGeneratedImage({
            imagePath: generated.imagePath,
            prompt: promptOut.prompt,
            referenceImageIds: effectiveReferenceImageIds,
            storyboardId: storyboard.id,
            providerConfigId: reviewModel!.providerConfigId,
            modelId: reviewModel!.modelId,
          })
        } catch (e: any) {
          review = {
            status: 'error',
            issues: [e?.message ?? String(e)],
            summary: '校验调用失败',
            model: reviewModel!.modelId,
            reviewedAt: new Date().toISOString(),
          }
        }
      }

      // review 'error' = 审核基础设施失败，重拍无意义，接受本帧（门禁按 error 另行拦截）
      const reviewBlocking = review?.status === 'issues'
      if (machineCheck.pass && !reviewBlocking) break
      if (attempt < MAX_KEYFRAME_ATTEMPTS) {
        const problems = [
          ...machineCheck.failures.map((f) => f.detail),
          ...(reviewBlocking ? review!.issues : []),
        ]
        retryNote = problems.join('；').slice(0, 500)
        console.warn(
          `[keyframe-generation] 帧 ${plan.frameIndex} 第 ${attempt} 张未过校验，重拍：${retryNote}`,
        )
        this.discardGeneratedImage(generated.imagePath)
      }
    }
    if (!review) {
      review = {
        status: 'skipped',
        issues: [],
        summary: machineCheck?.pass
          ? '审核模型非多模态或未配置，仅机器校验'
          : '机器校验未过，未进入 VLM 审核',
        model: reviewModel?.modelId ?? '',
        reviewedAt: new Date().toISOString(),
      }
    }
    if (!generated || !machineCheck) {
      throw new Error('关键帧生成循环异常退出（无产出）')
    }

    // 写 image_assets 记录（type='generated'，子类型放 metadata.subType）
    const ia = await this.imageAssetRepo.create({
      projectId,
      type: 'generated',
      prompt: promptOut.prompt,
      negativePrompt: promptOut.negativePrompt,
      imagePath: generated.imagePath,
      thumbnailPath: generated.thumbnailPath ?? undefined,
      width: dimensions.width,
      height: dimensions.height,
      metadata: {
        subType: 'storyboard_keyframe',
        storyboardId: storyboard.id,
        frameIndex: plan.frameIndex,
        frameRole: plan.frameRole,
        referenceImageIds: refImages.map((r) => r.id),
        referenceImageIdsEffective: effectiveReferenceImageIds,
        resolvedModel: generated.resolvedModel ?? null,
        // K6：实际发送的完整 prompt（末次 attempt；含 stylePrompt/boardNote/融合指令/
        // retryNote 及 adapter 的 variant 尾），事后可还原「当时到底发了什么」
        actualPrompt,
        // D：编号参考板（拼板模式才落，遗留路径：仅多参考平台 refs 超上限时启用）
        ...(board
          ? { referenceBoard: { path: board.path, members: board.members } }
          : {}),
        // 合成锚定（场景优先三步链才落）：草稿 + 合成图 + 贴入成员
        ...(compositeAnchor ? { compositeAnchor } : {}),
        // E：机器校验 + VLM 审核结果（视频生成闸门据此拦截）
        machineCheck,
        review,
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
   * @param shotType 分镜景别（P-A：与角色 facing 一起映射 view 维度，
   *                 让近景镜优先命中半身派生图、远景镜命中全身/主图）
   * @returns refs + hasCharacterReference（选图阶段的原始判定；调用方在 K2 预算
   *          截断后按存活集重算，才决定关键帧 prompt 风格前缀是否让位给参考图）
   */
  private async collectReferenceImages(
    assets: {
      characters: ResolvedCharacterRef[]
      location: ResolvedLocationRef | null
      items: ResolvedItemRef[]
    },
    scene: SceneScriptEntity,
    overrides: KeyframeReferenceOverride[] | null = null,
    shotType?: string | null,
  ): Promise<{ refs: CollectedRefImage[]; hasCharacterReference: boolean }> {
    const refs: CollectedRefImage[] = []
    let hasCharacterReference = false
    const overrideMap = new Map<string, string>()
    for (const o of overrides ?? []) {
      overrideMap.set(`${o.kind}:${o.bindingId}`, o.imageId)
    }

    /** 命中 override 时按 imageId 拉一次 asset_image；找不到/不匹配时返回 null 让外层走 fallback */
    const tryOverride = async (
      kind: 'character' | 'location' | 'item',
      bindingId: string,
      name: string,
    ): Promise<CollectedRefImage | null> => {
      const imageId = overrideMap.get(`${kind}:${bindingId}`)
      if (!imageId) return null
      const list = await this.imageSvc.listByAsset(kind, bindingId)
      const hit = list.find((img) => img.id === imageId)
      if (!hit) return null
      return { id: hit.id, imagePath: hit.imagePath, kind, name }
    }

    for (const c of assets.characters) {
      const charName = c.effective.name ?? ''
      const ov = await tryOverride('character', c.bindingId, charName)
      if (ov) {
        refs.push(ov)
        hasCharacterReference = true
        continue
      }
      const sceneRole = c.sceneRole ?? {}
      const r = await pickReferenceImage(this.imageSvc, {
        kind: 'character',
        bindingId: c.bindingId,
        dims: {
          // P-A：view 由分镜景别 + 角色朝向映射到 AssetGallery 派生槽位 label
          // （正面半身 front_half / 左侧半身 left_3q / 全景左侧 full_left 等）
          view: resolveCharacterViewLabel(
            shotType,
            (sceneRole as { facing?: string | null }).facing ?? null,
          ),
          expression: sceneRole.expression ?? undefined,
          outfit: sceneRole.outfit ?? c.effective.outfit ?? undefined,
        },
      })
      if (r.image) {
        refs.push({ id: r.image.id, imagePath: r.image.imagePath, kind: 'character', name: charName })
        hasCharacterReference = true
      }

      // spec 2026-05-09 ep-redesign §3.2 D1：把 character 的形象组其余成员也加进来
      // 跨分镜稳定参考集，让 provider 多 ref 入参吃满（万相 4 / Seedream 多张）。
      // 跳过已加入 refs 的 image（避免重复）。
      try {
        const setIds = await this.getReferenceSetImageIds(c.bindingId)
        if (setIds.length > 0) {
          const list = await this.imageSvc.listByAsset('character', c.bindingId)
          for (const id of setIds) {
            if (refs.some((rr) => rr.id === id)) continue
            const img = list.find((i) => i.id === id)
            // S-05：形象组补充图同样只收 confirmed=1（定妆确认闸门）
            if (img?.imagePath && img.confirmed === 1) {
              refs.push({ id: img.id, imagePath: img.imagePath, kind: 'character', name: charName })
              hasCharacterReference = true
            }
          }
        }
      } catch {
        // 形象组解析失败不致命；continue
      }
    }
    for (const it of assets.items) {
      const itemName = it.effective.name ?? ''
      const ov = await tryOverride('item', it.bindingId, itemName)
      if (ov) {
        refs.push(ov)
        continue
      }
      const r = await pickReferenceImage(this.imageSvc, {
        kind: 'item',
        bindingId: it.bindingId,
        dims: {},
      })
      if (r.image) refs.push({ id: r.image.id, imagePath: r.image.imagePath, kind: 'item', name: itemName })
    }
    // 地点最后：单图参考的网关（Kontext 单图模式）只取第一张时，优先保住角色/物品身份
    if (assets.location) {
      const locName = assets.location.effective.name ?? ''
      const ov = await tryOverride('location', assets.location.bindingId, locName)
      if (ov) {
        refs.push(ov)
      } else {
        const r = await pickReferenceImage(this.imageSvc, {
          kind: 'location',
          bindingId: assets.location.bindingId,
          dims: { time: scene.timeOfDay, weather: scene.weather ?? undefined },
        })
        if (r.image) refs.push({ id: r.image.id, imagePath: r.image.imagePath, kind: 'location', name: locName })
      }
    }
    return { refs, hasCharacterReference }
  }

  /**
   * Bug B 配套：按生效名归一化反查 character_binding.id（项目级唯一性弱约束 —
   * 若同名多条则取最早创建者）。spec 2026-05-09 ep-redesign · e2e report-shot-1.2.md；
   * 2026-09-24 一致性修复 A3：不再直查 standaloneName 列（linked_lw 该列为 null
   * 永远反查不到），改为项目 binding 列表经 getEffectiveData 投影生效名后匹配。
   *
   * 调用场景：AI 拆分镜时 storyboard.characters JSON 的 characterId 经常填角色名
   * （如"李墨"/"su_bai"）而非真实 binding.id（cb_xxx）；resolveCharacter 直接传
   * 名字会找不到，按生效名归一化反查兜底。
   */
  private async findBindingByName(
    projectId: string,
    name: string,
    nameIndex?: Map<string, string>,
  ): Promise<string | null> {
    if (!projectId || !name) return null
    const key = normalizeBindingName(name)
    if (!key) return null
    const index = nameIndex ?? (await this.buildCharacterNameIndex(projectId))
    return index.get(key) ?? null
  }

  /**
   * 项目内角色"归一化生效名 → bindingId"索引（A3）。
   * 每条 binding 经 CharacterAssetService.getEffectiveData 取生效名
   * （standalone 读 standalone_*；linked_lw 走 override → lw 投影），
   * normalizeBindingName 归一化后建索引；同名多命中取最早创建者
   * （listByProject 按 created_at 升序，先进入者赢）。
   */
  private async buildCharacterNameIndex(projectId: string): Promise<Map<string, string>> {
    const svc = new CharacterAssetService(this.ds)
    const bindings = await svc.listByProject(projectId)
    const index = new Map<string, string>()
    for (const b of bindings) {
      let name: string | null = null
      try {
        name = (await svc.getEffectiveData(b.id)).name
      } catch {
        continue
      }
      const key = normalizeBindingName(name)
      if (key && !index.has(key)) index.set(key, b.id)
    }
    return index
  }

  /**
   * 取 character_binding 的形象组 imageIds（spec 2026-05-09 ep-redesign §3.2 D1）。
   *
   * 简化：这里只读 binding.referenceSetImageIds 字段（用户标记的形象组）；
   * 默认策略（main + view）不在这里复用 — pickReferenceImage 已经按场景维度选了一张代表，
   * 形象组只是补充更多角度让 provider 多 ref 输入更丰富。
   *
   * 如果用户没标记 → 返回 []，本步骤静默跳过；只用 pickReferenceImage 的结果。
   */
  private async getReferenceSetImageIds(bindingId: string): Promise<string[]> {
    const { CharacterBindingEntity } = await import(
      '@core/database/entities/episode-production/character-binding.entity'
    )
    const repo = this.ds.getRepository(CharacterBindingEntity)
    const b = await repo.findOne({ where: { id: bindingId } })
    if (!b?.referenceSetImageIds) return []
    try {
      const v = JSON.parse(b.referenceSetImageIds)
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
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
