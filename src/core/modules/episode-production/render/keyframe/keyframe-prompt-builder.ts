/**
 * keyframe-prompt-builder
 * @module modules/episode-production/render/keyframe/keyframe-prompt-builder
 * @description 把分镜 + 资产引用组合成图像生成提示词。
 *              拆自原 story-to-video-resource.service.ts 的 buildImagePrompt 方法。
 *              P3 阶段会扩展为 reference-image-selector + chain strategy；本 phase 仅原样搬运。
 */

import type {
  Storyboard,
  SceneScript,
  CharacterBinding,
  LocationBinding
} from '@shared/types/story-to-video.types'

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
