/**
 * 资产身份提示词装配（spec 2026-05-09 review）
 * @module platform/episode-production/assets/prompts/asset-identity-prompt
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

/**
 * 时代特征约束：把故事年代（+地域）追加到 prompt 末尾，
 * 确保人物服饰、发型、妆容符合时代特征。
 *
 * 用途：用户在图集里编辑的提示词通常不含年代；系统拼接（buildAssetIdentityPrompt）
 * 已含「故事年代」段，但用户编辑的 override 需要在此补上，避免生成的人像不符合时代。
 * 已包含相同约束时不重复追加；无年代信息时原样返回。
 */
export function appendEraConstraint(
  prompt: string,
  storyBg?: StoryBackground | null,
): string {
  const era = (storyBg?.era ?? '').toString().trim()
  if (!era) return (prompt ?? '').trim()
  const region = (storyBg?.region ?? '').toString().trim()
  const suffix = region
    ? `人物服饰、发型、妆容符合${era}、${region}的时代特征（period-appropriate clothing, hairstyle and accessories）`
    : `人物服饰、发型、妆容符合${era}的时代特征（period-appropriate clothing, hairstyle and accessories）`
  const t = (prompt ?? '').trim()
  if (!t) return suffix
  if (t.includes(suffix)) return t
  return `${t}，${suffix}`
}

/**
 * 系统自动追加的提示词段（约束 / 身份标记段）。
 * 这些段由拼接代码生成，不应作为"用户内容"展示或二次拼接。
 */
const SYSTEM_SEGMENT_PATTERNS: RegExp[] = [
  // 构图 framing（半身定妆照 / 全身定妆照 / 直立全身 / 上半身）——要求带括号，
  // 避免误删用户自己的话；"全身定妆照"是历史数据里的错误叫法，一并剥离
  /半身定妆照（[^，]*/g,
  /全身定妆照（[^，]*/g,
  /直立全身（[^，]*/g,
  /上半身（[^，]*/g,
  // 背景 / 光照 / 无阴影约束
  /纯白背景（[^，]*/g,
  /纯色背景（[^，]*/g,
  /光照与参考图保持一致（[^，]*/g,
  /正面均匀光照、无任何阴影（[^，]*/g,
  // 身份保持
  /保持人物身份（[^，]*/g,
  // 年代特征约束（人物服饰、发型、妆容符合…）
  /人物服饰、发型、妆容符合[^，]*/g,
  // 身份段里的故事背景标记（故事年代/地域/背景：xxx）
  /故事年代：[^，]*/g,
  /故事地域：[^，]*/g,
  /故事背景：[^，]*/g,
]

/**
 * 从提示词中剥离系统自动追加的段，返回"用户内容"。
 *
 * 用途：图集提示词框只展示 / 编辑用户内容——落库的 prompt 是"用户内容 + 系统约束"
 * 的完整拼接，若把完整拼接回填到输入框，用户再生成时基于它二次拼接，会造成
 * 约束重复追加、以及把其它 slot（如主图的半身约束）串到派生图（全身照）上。
 * 生成前调用方仍会用 appendEraConstraint / appendCharacterConstraints 拼回约束。
 */
export function stripSystemConstraints(prompt: string): string {
  let t = (prompt ?? '').trim()
  for (const re of SYSTEM_SEGMENT_PATTERNS) {
    t = t.replace(re, '')
  }
  // 清理剥离后的残留：连续中文逗号、首尾逗号、多余空白
  return t
    .replace(/，{2,}/g, '，')
    .replace(/^，+|，+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
