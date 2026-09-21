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

/* ══════════════════════════════════════════════════════════════════════
 * 2026-09-21 F：资产图守设定（prompt 侧强制，无多模态验收）
 *
 * 背景事故（vp_1789922608027_am0itsdzp）：掌门资产主图没遵守"50岁"设定画成 40 岁；
 * 古风项目"演武场"生成成荒漠。renderer 传入的 prompt 通常已含
 * buildAssetIdentityPrompt 的身份段，但用户手工编辑 override / 派生 viewHint 路径
 * 会丢设定关键词。以下两个能力在 service 层做"缺失补全"（关键词存在性检查，
 * 已含不重复追加）：
 *   1. appendAssetSettingAnchors — 人物身份锚点（年龄/性别/外貌/服饰）或
 *      地点规模/类型/氛围锚点缺失时补一段「设定锚点：…」；
 *   2. appendAncientEraConstraint / mergeAncientEraNegative — storyEra 含古风
 *      关键词时追加"严禁现代元素"硬约束。
 * ══════════════════════════════════════════════════════════════════════ */

/** 性别词存在性检查（中英） */
const GENDER_WORD_PATTERN = /男|女|男性|女性|male|female|boy|girl|man|woman/i
/** 年龄存在性检查（"50岁" / "年过半百" / "age 50" 等） */
const AGE_WORD_PATTERN = /岁|年龄|年纪|age\b|aged/i

function normalizeGenderText(gender: string): string {
  const g = gender.trim()
  switch (g.toLowerCase()) {
    case 'male':
      return '男'
    case 'female':
      return '女'
    default:
      return g
  }
}

/**
 * 资产设定锚点缺失补全：从 effective 数据提取身份/场景锚点，
 * prompt 未包含对应关键词时追加一段「设定锚点：…」。幂等（已含锚点段或各关键词
 * 已在 prompt 中时不重复）。
 *
 * - character：性别 / 年龄 / 人种 / 外貌 / 服装 / 备选服装 →「人物设定锚点」
 * - location：类型 / 规模 / 氛围 →「地点设定锚点」
 * - item：身份段已由 name+description 覆盖，不补（返回原 prompt）
 */
export function appendAssetSettingAnchors(
  assetType: AssetType,
  eff: EffectiveAssetForPrompt | null | undefined,
  prompt: string,
): string {
  const t = (prompt ?? '').trim()
  if (!eff) return t

  if (assetType === 'character') {
    if (t.includes('人物设定锚点')) return t
    const segments: string[] = []
    const gender = eff.gender ? normalizeGenderText(String(eff.gender)) : ''
    if (gender && !GENDER_WORD_PATTERN.test(t)) segments.push(`性别：${gender}`)
    if (eff.age != null) {
      const ageText = String(eff.age)
      if (!t.includes(ageText) && !AGE_WORD_PATTERN.test(t)) {
        segments.push(`年龄：${ageText}岁`)
      }
    }
    if (eff.race) {
      const raceText = describeCharacterRace(String(eff.race))
      // 中文标签（"东亚"）/ 完整描述 / 原始枚举值 任一出现即视为已含
      const raceLabel = raceText.split('（')[0].trim()
      const raceCovered =
        (raceLabel && t.includes(raceLabel)) ||
        (raceText && t.includes(raceText)) ||
        t.includes(String(eff.race).trim())
      if (raceText && !raceCovered) {
        segments.push(`人种：${raceText}`)
      }
    }
    const appearance = (eff.appearance ?? '').toString().trim()
    if (appearance && !t.includes(appearance)) segments.push(`外貌：${appearance}`)
    const outfit = (eff.outfit ?? '').toString().trim()
    if (outfit && !t.includes(outfit)) segments.push(`服装：${outfit}`)
    if (Array.isArray(eff.outfitsExtra) && eff.outfitsExtra.length > 0) {
      const missing = eff.outfitsExtra.filter((o) => !t.includes(String(o).trim()))
      if (missing.length > 0) segments.push(`备选服装：${missing.join(' / ')}`)
    }
    if (segments.length === 0) return t
    const suffix = `人物设定锚点：${segments.join('，')}`
    return t ? `${t}，${suffix}` : suffix
  }

  if (assetType === 'location') {
    if (t.includes('地点设定锚点')) return t
    const segments: string[] = []
    const locationType = (eff.locationType ?? '').toString().trim()
    if (locationType && !t.includes(locationType)) segments.push(`类型：${locationType}`)
    const scale = (eff.scale ?? '').toString().trim()
    if (scale && !t.includes(scale)) segments.push(`规模：${scale}`)
    if (Array.isArray(eff.moodTags) && eff.moodTags.length > 0) {
      const missing = eff.moodTags.filter((m) => !t.includes(String(m).trim()))
      if (missing.length > 0) segments.push(`氛围：${missing.join(' / ')}`)
    }
    if (segments.length === 0) return t
    const suffix = `地点设定锚点：${segments.join('，')}`
    return t ? `${t}，${suffix}` : suffix
  }

  return t
}

/** 古风时代关键词（storyEra 命中任一即判定为古风项目） */
const ANCIENT_ERA_PATTERN = /古|武侠|仙侠|玄幻|宋|唐|汉|明|清|朝代|古装/

/** 古风硬约束 prompt 后缀（中英双写） */
export const ANCIENT_ERA_CONSTRAINT_SUFFIX =
  '严格古代中国风，严禁出现任何现代建筑、现代服饰、现代物品、现代交通工具' +
  '（strictly ancient Chinese style, absolutely no modern buildings, no modern clothing, no modern objects, no modern vehicles）'

/** 古风硬约束 negative */
export const ANCIENT_ERA_NEGATIVE = [
  'modern buildings',
  'modern clothing',
  'cars',
  'electricity',
  'glass curtain wall',
].join(', ')

/** storyEra 是否命中古风关键词 */
export function isAncientEra(era?: string | null): boolean {
  return ANCIENT_ERA_PATTERN.test((era ?? '').trim())
}

/**
 * 古风时代硬约束：storyEra 命中古风关键词时把"严禁现代元素"追加到 prompt 末尾。
 * 幂等；非古风 / 无年代信息时原样返回。
 */
export function appendAncientEraConstraint(prompt: string, era?: string | null): string {
  const t = (prompt ?? '').trim()
  if (!isAncientEra(era)) return t
  if (t.includes(ANCIENT_ERA_CONSTRAINT_SUFFIX)) return t
  return t ? `${t}，${ANCIENT_ERA_CONSTRAINT_SUFFIX}` : ANCIENT_ERA_CONSTRAINT_SUFFIX
}

/** 古风时代硬约束 negative 合并（幂等；非古风原样返回） */
export function mergeAncientEraNegative(
  negative: string | null | undefined,
  era?: string | null,
): string | undefined {
  if (!isAncientEra(era)) return negative ?? undefined
  const u = (negative ?? '').trim()
  if (u.includes(ANCIENT_ERA_NEGATIVE)) return negative ?? undefined
  return u ? `${u}, ${ANCIENT_ERA_NEGATIVE}` : ANCIENT_ERA_NEGATIVE
}
