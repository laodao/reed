/**
 * 资产身份提示词装配（spec 2026-05-09 review）
 * @module modules/episode-production/assets/prompts/asset-identity-prompt
 *
 * 把"effective 投影 → 身份描述 prompt"的拼装逻辑收口到 core 共享模块，给三个入口共用：
 *   1. renderer/api/main-image-generator.ts  · 主图主入口
 *   2. AddMainImageDialog（多主图入口）       · 之前是分叉装配，现在收口
 *   3. core/.../gallery-derivation.service    · 派生入口，让派生图不再丢失身份信息
 *
 * 设计：纯函数 + 无 IO；上游负责 effective 拉取 + 故事背景拉取；本模块只做字符串拼装。
 *
 * 不做的事：
 *   - 不加硬约束（character / location 各自模块管）
 *   - 不加 negativePrompt（约束模块自己负责）
 *   - 不调 IPC / 不读 store
 */

import { buildStylePromptHint } from '../constants/style-presets'

export type AssetType = 'character' | 'location' | 'item'

/** 故事背景（来自当前 episode；可选注入） */
export interface StoryBackground {
  era?: string | null
  region?: string | null
  extra?: string | null
}

/**
 * effective 投影的最小子集（character / location / item 共有字段 + 各自扩展）。
 * 字段以 unknown 接收避免类型契约不一致（item.styleAnchors 类型与 location 不同）。
 */
export interface EffectiveAssetForPrompt {
  name?: string | null
  description?: string | null
  // character 专属
  alias?: string | null
  role?: string | null
  gender?: string | null
  age?: number | null
  race?: string | null
  appearance?: string | null
  outfit?: string | null
  outfitsExtra?: string[] | null
  // 三类共用
  styleAnchors?: string[] | string | null
  // referenceImagePath 不在此处理；上游另行处理
  [key: string]: unknown
}

/**
 * 安全解析 styleAnchors（可能是数组、JSON 字符串、单个字符串、null）。
 */
function parseStyleAnchors(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return []
    try {
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      }
    } catch {
      return [t]
    }
  }
  return []
}

/**
 * 角色 race 描述：旧英文枚举（east_asian/european/...）双写中英文，自由文本原样输出。
 */
function describeCharacterRace(race: string): string {
  switch (race) {
    case 'east_asian':
      return '东亚（East Asian, Han Chinese / Japanese / Korean facial features）'
    case 'south_asian':
      return '南亚（South Asian, Indian / Pakistani / Bangladeshi facial features）'
    case 'southeast_asian':
      return '东南亚（Southeast Asian, Thai / Vietnamese / Filipino facial features）'
    case 'central_asian':
      return '中亚（Central Asian, Kazakh / Uzbek facial features）'
    case 'european':
      return '欧洲（European / Caucasian facial features）'
    case 'african':
      return '非洲（African, dark skin tone）'
    case 'south_american':
      return '南美（South American, Latin American facial features）'
    default:
      return race?.trim() ?? ''
  }
}

/**
 * 装配资产身份 prompt 段。
 *
 * 输出顺序（与现有 main-image-generator.ts 对齐）：
 *   name, description,
 *   character 专属：性别 / 年龄 / 人种 / 外貌 / 服装 / 备选服装,
 *   风格：styleAnchors（中英双写）,
 *   故事年代 / 故事地域 / 故事背景
 *
 * v3 spec 2026-05-09 ep-redesign §3.2 P-2：alias / role 不进 image prompt（叙事 metadata 解耦）。
 *
 * @param assetType  资产类型
 * @param eff        effective 投影数据
 * @param storyBg    可选 · 故事背景（来自当前 episode）
 * @returns          一个用 `，` 分隔的字符串；空 effective 返回空串
 */
export function buildAssetIdentityPrompt(
  assetType: AssetType,
  eff: EffectiveAssetForPrompt,
  storyBg?: StoryBackground | null,
): string {
  const parts: string[] = []

  if (eff.name) parts.push(String(eff.name).trim())
  if (eff.description) parts.push(String(eff.description).trim())

  if (assetType === 'character') {
    // spec 2026-05-09 ep-redesign §3.2 P-2：alias / role 不进 image prompt
    //   - 别名（"三爷"）对图像生成无影响，是 noise
    //   - 定位（"主角 / 配角 / 反派"）是叙事概念非视觉概念
    // 两者保留在 EffectiveAssetForPrompt 类型中（兼容；调用方仍可读），但不再拼进 prompt。
    if (eff.gender) parts.push(`性别：${String(eff.gender).trim()}`)
    if (eff.age != null) parts.push(`年龄：${eff.age}`)
    if (eff.race) {
      const raceText = describeCharacterRace(String(eff.race))
      if (raceText) parts.push(`人种：${raceText}`)
    }
    if (eff.appearance) parts.push(`外貌：${String(eff.appearance).trim()}`)
    if (eff.outfit) parts.push(`服装：${String(eff.outfit).trim()}`)
    if (Array.isArray(eff.outfitsExtra) && eff.outfitsExtra.length > 0) {
      parts.push(`备选服装：${eff.outfitsExtra.join(' / ')}`)
    }
  }

  // 风格锚点（三类通用）
  const styleHint = buildStylePromptHint(parseStyleAnchors(eff.styleAnchors))
  if (styleHint) parts.push(`风格：${styleHint}`)

  // 故事背景（spec 2026-05-08 ① 内容页）
  if (storyBg) {
    const era = (storyBg.era ?? '').toString().trim()
    const region = (storyBg.region ?? '').toString().trim()
    const extra = (storyBg.extra ?? '').toString().trim()
    if (era) parts.push(`故事年代：${era}`)
    if (region) parts.push(`故事地域：${region}`)
    if (extra) parts.push(`故事背景：${extra}`)
  }

  return parts.filter(Boolean).join('，')
}

/**
 * 在 prompt 前面拼接身份段（如果非空），中间用 `，` 分隔。
 * 上游可以这样用：`prependIdentity(identityPrompt, additionalPrompt)`。
 */
export function prependIdentity(identity: string, body: string): string {
  const i = (identity ?? '').trim()
  const b = (body ?? '').trim()
  if (!i) return b
  if (!b) return i
  return `${i}，${b}`
}
