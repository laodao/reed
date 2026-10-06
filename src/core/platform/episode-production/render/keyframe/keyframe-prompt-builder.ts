/**
 * keyframe-prompt-builder
 * @module platform/episode-production/render/keyframe/keyframe-prompt-builder
 * @description 把分镜 + 资产引用组合成图像生成提示词。
 *
 * 两个入口：
 *   - buildImagePrompt：单帧老入口（V2 兼容），按 long_writing_character_id 关联角色
 *   - buildKeyframePrompt（P5-T5 新）：多帧版本。接受预解析的 ResolvedCharacterRef / Location /
 *     Item，叠加 frameRole + timePercent 时刻语言（来自 keyframe-chain-strategy.describeFrameMoment）
 *     生成区分开始/中间/结束的提示词。
 *
 * 多帧版本依赖：
 *   - 调用方先用 ReferenceResolver 把 binding ID → effective data
 *   - 配合 reference-image-selector 选 ref 图（不在 prompt 里直接处理图，prompt-only 责任分离）
 *   - 配合 keyframe-chain-strategy 拿 timePercent + role
 */

import type {
  Storyboard,
  SceneScript,
  CharacterBinding,
  LocationBinding
} from '@shared/types/story-to-video.types'
import type {
  EffectiveCharacterData,
  EffectiveLocationData,
  EffectiveItemData,
} from '@shared/types/episode-production'
import {
  findLensFocalPreset,
  findAperturePreset,
  findCameraStylePreset,
} from '../../assets/constants/lens-presets'
import { findLightingPreset } from '../../assets/constants/lighting-presets'
import {
  describeFrameMoment,
  type KeyframeRole,
} from './keyframe-chain-strategy'
import { renderEraAnchor, resolveEraProfile } from '../../prompts/era-profiles'
import { describeCharacterRace } from '../../assets/prompts/asset-identity-prompt'

/**
 * 图像风格配置
 */
export interface StyleConfig {
  stylePrefix: string      // 风格前缀
  qualitySuffix: string    // 质量后缀
  negativePrompt: string   // 负面提示词
}

/**
 * F4 / C6（2026-09-20，人物一致性修复）：当该帧带角色参考图时使用的风格前缀。
 * PRESET_STYLES.cinematic 的写实电影词（"professional photography, movie scene"）
 * 会把 Q 版等非写实角色参考图写实化——风格词压过参考图。有角色参考图时改用
 * "与参考图保持一致"前缀，把风格决定权交给参考图；无参考图时仍用 styleConfig.stylePrefix。
 */
export const REFERENCE_MATCH_STYLE_PREFIX =
  '画面风格、人物外观与参考图保持一致（match the reference images exactly: same character face, hairstyle, outfit and art style）'

/**
 * 预设风格配置
 */
export const PRESET_STYLES: Record<string, StyleConfig> = {
  cinematic: {
    stylePrefix: 'cinematic, high quality, 8k, professional photography, movie scene',
    qualitySuffix: 'masterpiece, best quality, highly detailed',
    negativePrompt: 'low quality, blurry, distorted, ugly, bad anatomy, watermark, signature'
  },
  anime: {
    stylePrefix: 'anime style, detailed anime art, high quality, vibrant colors',
    qualitySuffix: 'masterpiece, best quality, detailed illustration',
    negativePrompt: 'low quality, bad anatomy, blurry, ugly, deformed, watermark'
  },
  realistic: {
    stylePrefix: 'photorealistic, ultra realistic, 8k, raw photo, professional photography',
    qualitySuffix: 'highly detailed, sharp focus, natural lighting',
    negativePrompt: 'cartoon, anime, illustration, painting, drawing, low quality, blurry'
  },
  fantasy: {
    stylePrefix: 'fantasy art, magical, ethereal, epic fantasy scene, digital art',
    qualitySuffix: 'highly detailed, cinematic, dramatic lighting',
    negativePrompt: 'modern, urban, realistic, low quality, blurry, watermark'
  },
  ancient_chinese: {
    stylePrefix: 'ancient Chinese style, traditional Chinese painting, elegant, classical',
    qualitySuffix: 'masterpiece, high quality, detailed, artistic',
    negativePrompt: 'modern, western, low quality, blurry, deformed'
  }
}

/**
 * 获取景别 Prompt
 */
function getShotTypePrompt(shotType: string): string {
  const shotTypeMap: Record<string, string> = {
    extreme_long: 'extreme long shot, vast landscape, establishing shot',
    long: 'long shot, full scene visible, wide angle',
    full: 'full shot, showing entire body, full figure',
    medium: 'medium shot, showing from waist up',
    medium_close: 'medium close-up shot, showing from chest up',
    close: 'close-up shot, face and shoulders, detailed facial features',
    extreme_close: 'extreme close-up, detailed face, intense emotion',
    detail: 'extreme detail shot, macro photography, intricate details'
  }
  return shotTypeMap[shotType] || ''
}

/**
 * 获取镜头角度 Prompt
 */
function getCameraAnglePrompt(angle: string): string {
  const angleMap: Record<string, string> = {
    eye_level: 'eye level angle, natural perspective',
    high: 'high angle, looking down, bird eye perspective',
    low: 'low angle, looking up, dramatic perspective',
    dutch: 'dutch angle, tilted frame, dynamic composition',
    birds_eye: 'birds eye view, overhead shot, top down view',
    worms_eye: 'worms eye view, extreme low angle'
  }
  return angleMap[angle] || ''
}

/**
 * 构建图像生成 Prompt
 */
export function buildImagePrompt(
  storyboard: Storyboard,
  scene: SceneScript,
  characterBindings: CharacterBinding[],
  locationBindings: LocationBinding[],
  styleConfig: StyleConfig
): string {
  const parts: string[] = []

  // 1. 风格前缀
  parts.push(styleConfig.stylePrefix)

  // 2. 场景描述
  parts.push(scene.sceneDescription)

  // 3. 地点描述（新增）
  // 从场景的 location 字段匹配地点绑定
  const locationBinding = locationBindings.find(
    b => b.locationName === scene.location
  )
  if (locationBinding?.generateConfig?.baseDescription) {
    parts.push(`location: ${locationBinding.generateConfig.baseDescription}`)
  }

  // 4. 分镜画面描述
  if (storyboard.frameDescription) {
    parts.push(storyboard.frameDescription)
  }

  // 5. 主体描述
  if (storyboard.subject) {
    parts.push(`main subject: ${storyboard.subject}`)
  }

  // 6. 角色描述
  for (const char of storyboard.characters) {
    const binding = characterBindings.find(
      b => b.longWritingCharacterId === char.characterId
    )

    // 角色基础描述
    if (binding?.generateConfig?.baseDescription) {
      parts.push(binding.generateConfig.baseDescription)
    }

    // 角色表情
    if (char.expression) {
      parts.push(`${char.expression} expression`)
    }

    // 角色动作
    if (char.action) {
      parts.push(char.action)
    }
  }

  // 7. 氛围和光线
  if (scene.mood) {
    parts.push(`${scene.mood} atmosphere`)
  }

  // 8. 时间和天气
  if (scene.timeOfDay) {
    parts.push(`${scene.timeOfDay} lighting`)
  }
  if (scene.weather) {
    parts.push(scene.weather)
  }

  // 9. 构图
  if (storyboard.composition) {
    parts.push(storyboard.composition)
  }

  // 10. 镜头语言
  parts.push(getShotTypePrompt(storyboard.shotType))
  parts.push(getCameraAnglePrompt(storyboard.cameraAngle))

  // 11. 质量后缀
  parts.push(styleConfig.qualitySuffix)

  return parts.join(', ')
}

// ============================================================
// P5-T5 多关键帧 prompt（新入口，与 buildImagePrompt 并存）
// ============================================================

/** 一个出场角色的解析结果（caller 通过 ReferenceResolver 取得） */
export interface ResolvedCharacterRef {
  bindingId: string
  effective: EffectiveCharacterData
  /** 该角色在本场景中的状态（出自 SceneCharacter） */
  sceneRole?: {
    expression?: string | null
    action?: string | null
    outfit?: string | null
    position?: string | null
  }
}

export interface ResolvedLocationRef {
  bindingId: string
  effective: EffectiveLocationData
}

export interface ResolvedItemRef {
  bindingId: string
  effective: EffectiveItemData
  /** 物品在本场景的上下文（held / on_table / 等） */
  context?: string
}

/** 多帧 prompt 入参。caller 装配好后传入；builder 是纯函数。 */
export interface BuildKeyframePromptInput {
  // 镜头语言
  shotType: string
  cameraAngle: string
  // 画面内容
  frameDescription: string
  composition?: string | null
  subject?: string | null
  // 场景维度
  sceneDescription: string
  mood?: string | null
  timeOfDay?: string | null
  weather?: string | null
  // 资产引用（已解析）
  characters: ResolvedCharacterRef[]
  location: ResolvedLocationRef | null
  items: ResolvedItemRef[]
  // 时刻（来自 keyframe-chain-strategy.planKeyframes）
  frameRole: KeyframeRole
  timePercent: number
  // 风格
  styleConfig: StyleConfig
  /**
   * P5-T25 (spec §4.5.7)：用户额外提示词
   *
   * 用户在 UI 输入的"如何修改"或"额外要求"（如"角色更愤怒" /
   * "镜头拉近" / "背景虚化"）。会作为单独段拼到 final_prompt 末尾，
   * 位于质量后缀之前，让用户描述能影响 image provider 的输出。
   *
   * 为空时不影响输出；与系统拼接的 style_anchor / shotType / 角色 /
   * 物品 / 氛围 / 构图 等并存（不替代）。
   */
  userPrompt?: string | null
  /**
   * 镜头扩展元数据（spec 2026-05-09 ep-redesign §3.2 B5）：
   * { lensFocalMm, aperture, cameraStyle, lighting } JSON 字符串或对象。
   * builder 解析后按 promptHint 拼到镜头段末尾。
   */
  cameraMetadata?: string | Record<string, unknown> | null
  /**
   * F4 / C6：该帧是否带角色参考图（caller 在选图后传入）。
   * true 时风格前缀从 styleConfig.stylePrefix 换成 REFERENCE_MATCH_STYLE_PREFIX，
   * 避免写实电影风格词把非写实（如 Q 版）角色参考图写实化；false / 缺省维持原前缀。
   */
  hasCharacterReference?: boolean
  /**
   * 剧集故事年代（episode.storyEra；2026-09-21 古风硬约束，雪麓山庄 v2 复盘 F 项）。
   * 命中古/武侠/朝代词时 prompt 末尾追加"严禁现代元素"硬约束 + negative 追加现代物词，
   * 防止古风剧本关键帧出现现代建筑/服饰（实测尾帧崩成现代公园照片）。
   */
  storyEra?: string | null
  /** 剧集故事地域（§3.12：与 storyEra 一起无条件注入时代锚） */
  storyRegion?: string | null
  /**
   * 时代档案键（§2.5 显式配置优先）：项目可直接指定 `ancient_chinese`/`modern`/
   * `near_future`/`period_drama`，不再依赖 storyEra 正则猜测。
   */
  eraProfileKey?: string | null
}

/**
 * 时代约束（2026-10-06 §2.5：删除本文件与 asset-identity-prompt 的双实现在此收敛）。
 *
 * 历史问题：本文件用 20 词正则 + 中文单语后缀 + negative `…power lines, glass`，
 * 资产侧用 10 词正则 + 中英双写后缀 + negative `…electricity, glass curtain wall`——
 * 同一部剧在关键帧与资产图两条链路上得到不同的时代约束（词表互不包含）。
 *
 * 现在统一由 `prompts/era-profiles.ts` 提供：`isAncientEra` 保留为兼容入口，
 * 后缀/负向词改为从档案取（`resolveEraProfile` 支持显式 eraProfileKey 与文本推断）。
 */
export { eraConstraintOf, resolveEraProfile } from '../../prompts/era-profiles'

/** 古风硬约束词段（正向 + 负向）——取自古风档案，保持历史导出名兼容 */
export const ANCIENT_ERA_PROMPT_SUFFIX = resolveEraProfile('ancient_chinese').constraintSuffix
export const ANCIENT_ERA_NEGATIVE_SUFFIX = resolveEraProfile('ancient_chinese').negativeExtra

/**
 * 是否古风年代。
 *
 * @deprecated 2026-10-06（§2.5）：仅作兼容入口。新代码直接用
 * `resolveEraProfile(eraProfileKey, storyEra)` 取档案——
 * 它同时支持显式配置（不再依赖正则猜测）与全部时代（现代/近未来也有锚点）。
 */
export function isAncientEra(storyEra: string | null | undefined): boolean {
  return resolveEraProfile(null, storyEra).key === 'ancient_chinese'
}

/**
 * 解析本帧应使用的时代档案：显式 eraProfileKey 优先，否则按 storyEra 文本推断。
 */
function eraProfileFor(input: { storyEra?: string | null; eraProfileKey?: string | null }) {
  return resolveEraProfile(input.eraProfileKey, input.storyEra)
}

/** 多帧 prompt 输出：正向 + 负向 */
export interface KeyframePromptOutput {
  prompt: string
  negativePrompt: string
}

/**
 * 拼一帧关键帧的提示词（spec §4.3 + §4.5）。
 *
 * 规则：
 * - 第一段：风格前缀 + 场景描述 + 时刻描述（区分 start/middle/end）
 * - 资产段：location effective + characters effective（含 outfit/expression）+ items
 * - 镜头段：shotType + cameraAngle + composition
 * - 氛围段：mood + timeOfDay + weather
 * - 尾部：质量后缀
 *
 * 不直接处理参考图（image-selector 负责）；prompt 只是文字层。
 */
export function buildKeyframePrompt(
  input: BuildKeyframePromptInput,
): KeyframePromptOutput {
  const parts: string[] = []

  // 1. 风格前缀（F4：有角色参考图时改用"与参考图一致"前缀，风格决定权交给参考图）
  parts.push(
    input.hasCharacterReference
      ? REFERENCE_MATCH_STYLE_PREFIX
      : input.styleConfig.stylePrefix,
  )

  // 2. 场景描述
  if (input.sceneDescription) parts.push(input.sceneDescription)

  // 3. 时刻语言（spec §4.3：区分 start/middle/end 帧的画面侧重）
  parts.push(`[关键帧时刻] ${describeFrameMoment(input.frameRole, input.timePercent)}`)

  // 4. 地点（effective name + description）
  if (input.location) {
    const loc = input.location.effective
    if (loc.name) parts.push(`location: ${loc.name}`)
    if (loc.description) parts.push(loc.description)
  }

  // 4b. 时代锚（§3.12）：无条件注入故事年代/地域。
  // 优化前只有命中古风正则才有时代约束，"1980 年代""近未来"完全无锚——
  // 资产阶段反推的时代设定到这里断链，模型只能自由发挥。
  const eraAnchor = renderEraAnchor({
    storyEra: input.storyEra ?? undefined,
    storyRegion: input.storyRegion ?? undefined,
    eraProfile: eraProfileFor(input),
  })
  if (eraAnchor) parts.push(`[时代背景] ${eraAnchor}`)

  // 5. 画面描述
  if (input.frameDescription) parts.push(input.frameDescription)
  if (input.subject) parts.push(`main subject: ${input.subject}`)

  // 6. 角色（effective + sceneRole 状态）
  // §3.12：身份字段补全——优化前只有 name/appearance/outfit，资产阶段精心反推的
  // 性别/年龄/人种在此断链（D2 身份段与 F1 角色段字段不对称）。
  for (const c of input.characters) {
    const eff = c.effective as typeof c.effective & {
      gender?: string | null
      age?: number | null
      race?: string | null
    }
    const sceneRole = c.sceneRole ?? {}
    const charDesc: string[] = []
    if (eff.name) charDesc.push(eff.name)
    if (eff.gender) charDesc.push(`性别：${eff.gender}`)
    if (typeof eff.age === 'number' && eff.age > 0) charDesc.push(`年龄：${eff.age}`)
    if (eff.race) charDesc.push(`人种：${describeCharacterRace(eff.race)}`)
    if (eff.appearance) charDesc.push(eff.appearance)
    // outfit：sceneRole 优先（场景临时换装），fallback 到 effective.outfit
    const outfit = sceneRole.outfit ?? eff.outfit
    if (outfit) charDesc.push(`wearing ${outfit}`)
    if (sceneRole.expression) charDesc.push(`${sceneRole.expression} expression`)
    if (sceneRole.action) charDesc.push(sceneRole.action)
    if (sceneRole.position) charDesc.push(`positioned ${sceneRole.position}`)
    if (charDesc.length > 0) {
      parts.push(`character: ${charDesc.join(', ')}`)
    }
  }

  // 6b. 角色形象一致性（spec：跨分镜/关键帧保持同一人设）。
  // 明确约束大模型：以参考图 + 上面的角色描述为准，保持面容、衣着、发型、饰品一致，
  // 不得因镜头/时间/景别变化而改变角色的长相与穿搭。
  if (input.characters.length > 0) {
    parts.push(
      '[角色形象一致性] 严格保持上述每个角色的面部特征、衣着、发型、饰品与参考图一致；' +
      '同一角色在不同镜头/景别/时刻下必须容貌、装扮、发型、配饰完全相同，不得改变长相或穿错衣服。',
    )
  }

  // 7. 物品（effective + context）
  for (const it of input.items) {
    const eff = it.effective
    const itemDesc: string[] = []
    if (eff.name) itemDesc.push(eff.name)
    if (eff.description) itemDesc.push(eff.description)
    if (it.context) itemDesc.push(`(${it.context})`)
    if (itemDesc.length > 0) {
      parts.push(`prop: ${itemDesc.join(' ')}`)
    }
  }

  // 8. 氛围 / 时间 / 天气
  if (input.mood) parts.push(`${input.mood} atmosphere`)
  if (input.timeOfDay) parts.push(`${input.timeOfDay} lighting`)
  if (input.weather) parts.push(input.weather)

  // 9. 构图
  if (input.composition) parts.push(input.composition)

  // 10. 镜头语言
  const shot = getShotTypePrompt(input.shotType)
  if (shot) parts.push(shot)
  const angle = getCameraAnglePrompt(input.cameraAngle)
  if (angle) parts.push(angle)

  // 10b. 镜头扩展（spec 2026-05-09 ep-redesign §3.2 B5）：焦距 / 光圈 / 相机风格 / 打光
  const camMetaHints = buildCameraMetadataPromptHints(input.cameraMetadata)
  if (camMetaHints.length > 0) parts.push(...camMetaHints)

  // 11. 用户额外提示词（P5-T25 · spec §4.5.7）
  // 让用户在 UI 输入的"调整方向"段进入 prompt（位于质量后缀之前，
  // 作为最高优先级的"用户意图"参考给 image provider）
  if (input.userPrompt && input.userPrompt.trim()) {
    parts.push(`[user direction] ${input.userPrompt.trim()}`)
  }

  // 12. 质量后缀
  parts.push(input.styleConfig.qualitySuffix)

  // 13. 时代约束（§2.5/§3.12）：由时代档案驱动——古风给硬约束，其他时代加时代锚
  const eraProfile = eraProfileFor(input)
  if (eraProfile.constraintSuffix) parts.push(eraProfile.constraintSuffix)

  return {
    prompt: parts.filter(Boolean).join(', '),
    negativePrompt: eraProfile.negativeExtra
      ? `${input.styleConfig.negativePrompt}, ${eraProfile.negativeExtra}`
      : input.styleConfig.negativePrompt,
  }
}

/**
 * 拼装镜头扩展元数据 promptHint（spec 2026-05-09 ep-redesign §3.2 B5）。
 *
 * 接受 storyboards.metadata（JSON 字符串或对象），按 lensFocalMm / aperture /
 * cameraStyle / lighting 顺序查 preset，返回 promptHint 数组。
 *
 * 老分镜 metadata=null 或字段缺失 → 返回空数组（向后兼容；不影响输出）。
 */
function buildCameraMetadataPromptHints(
  raw: string | Record<string, unknown> | null | undefined,
): string[] {
  if (!raw) return []
  let meta: Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw)
      if (!v || typeof v !== 'object' || Array.isArray(v)) return []
      meta = v as Record<string, unknown>
    } catch {
      return []
    }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    meta = raw
  } else {
    return []
  }

  const hints: string[] = []
  const focal = findLensFocalPreset(meta.lensFocalMm as string)
  if (focal) hints.push(focal.promptHint)
  const aperture = findAperturePreset(meta.aperture as string)
  if (aperture) hints.push(aperture.promptHint)
  const style = findCameraStylePreset(meta.cameraStyle as string)
  if (style) hints.push(style.promptHint)
  const lit = findLightingPreset(meta.lighting as string)
  if (lit) hints.push(lit.promptHint)
  return hints
}
