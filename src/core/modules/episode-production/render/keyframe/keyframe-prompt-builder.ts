/**
 * keyframe-prompt-builder
 * @module modules/episode-production/render/keyframe/keyframe-prompt-builder
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
  describeFrameMoment,
  type KeyframeRole,
} from './keyframe-chain-strategy'

/**
 * 图像风格配置
 */
export interface StyleConfig {
  stylePrefix: string      // 风格前缀
  qualitySuffix: string    // 质量后缀
  negativePrompt: string   // 负面提示词
}

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

  // 1. 风格前缀
  parts.push(input.styleConfig.stylePrefix)

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

  // 5. 画面描述
  if (input.frameDescription) parts.push(input.frameDescription)
  if (input.subject) parts.push(`main subject: ${input.subject}`)

  // 6. 角色（effective + sceneRole 状态）
  for (const c of input.characters) {
    const eff = c.effective
    const sceneRole = c.sceneRole ?? {}
    const charDesc: string[] = []
    if (eff.name) charDesc.push(eff.name)
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

  // 11. 用户额外提示词（P5-T25 · spec §4.5.7）
  // 让用户在 UI 输入的"调整方向"段进入 prompt（位于质量后缀之前，
  // 作为最高优先级的"用户意图"参考给 image provider）
  if (input.userPrompt && input.userPrompt.trim()) {
    parts.push(`[user direction] ${input.userPrompt.trim()}`)
  }

  // 12. 质量后缀
  parts.push(input.styleConfig.qualitySuffix)

  return {
    prompt: parts.filter(Boolean).join(', '),
    negativePrompt: input.styleConfig.negativePrompt,
  }
}
