/**
 * 地点资产生成的硬约束 prompt
 * @module platform/episode-production/assets/prompts/location-constraints
 *
 * 角度变体（angle_variant）特殊要求：光照、时间、天气都跟参考图（主图）保持一致。
 * time_variant / weather_variant 不在此约束内 —— 它们本来就是要换光线/天气。
 *
 * 双端共用：core 包，不依赖 fs / browser API。
 */

/**
 * 角度变体专用：锁定光照 / 时间 / 天气，仅改视角。
 * 中英双写。
 */
export const ANGLE_VARIANT_LOCK_SUFFIX = [
  '光照与参考图保持一致（match lighting from reference image, identical lighting intensity, same light source direction, same color temperature）',
  '时间不变（same time of day as reference）',
  '天气不变（same weather condition as reference）',
  '仅改变机位视角（only change camera angle, keep all other elements identical）',
].join('，')

/** 角度变体专用 negative */
export const ANGLE_VARIANT_LOCK_NEGATIVE = [
  'different lighting',
  'lighting change',
  'lighting shift',
  'different time of day',
  'sunrise',
  'sunset',
  'dawn',
  'dusk',
  'night scene',
  'weather change',
  'rain',
  'snow',
  'fog',
  'storm',
].join(', ')

/** 把光照锁追加到主 prompt 末尾。已包含则不重复。 */
export function appendAngleLightingLock(prompt: string): string {
  const trimmed = (prompt ?? '').trim()
  if (!trimmed) return ANGLE_VARIANT_LOCK_SUFFIX
  if (trimmed.includes(ANGLE_VARIANT_LOCK_SUFFIX)) return trimmed
  return `${trimmed}，${ANGLE_VARIANT_LOCK_SUFFIX}`
}

/** 合并 negative：用户已传 + 角度锁 */
export function mergeAngleLightingNegative(userNegative?: string | null): string {
  const u = (userNegative ?? '').trim()
  if (!u) return ANGLE_VARIANT_LOCK_NEGATIVE
  return `${u}, ${ANGLE_VARIANT_LOCK_NEGATIVE}`
}

/**
 * 地点无人硬约束（spec 2026-05-07）：
 * 业务规则要求所有 location 域图（主图 / angle / time / weather / panorama）
 * 强制不出现人物。约束注入收口在 service 层，renderer 不重复加。
 */
export const LOCATION_NO_HUMAN_SUFFIX =
  '场景中不能有任何人物，仅环境本身（no people, empty scene, environment only, uninhabited landscape, no characters present）'

export const LOCATION_NO_HUMAN_NEGATIVE = [
  'person',
  'people',
  'human',
  'character',
  'figure',
  'portrait',
  'crowd',
  'silhouette',
  'body',
  'man',
  'woman',
  'child',
  'pedestrian',
].join(', ')

/** 把无人约束追加到主 prompt 末尾。已包含则不重复。 */
export function appendLocationNoHumanConstraint(prompt: string): string {
  const trimmed = (prompt ?? '').trim()
  if (!trimmed) return LOCATION_NO_HUMAN_SUFFIX
  if (trimmed.includes(LOCATION_NO_HUMAN_SUFFIX)) return trimmed
  return `${trimmed}，${LOCATION_NO_HUMAN_SUFFIX}`
}

/** 合并 negative：用户已传 + 无人约束。 */
export function mergeLocationNoHumanNegative(userNegative?: string | null): string {
  const u = (userNegative ?? '').trim()
  if (!u) return LOCATION_NO_HUMAN_NEGATIVE
  return `${u}, ${LOCATION_NO_HUMAN_NEGATIVE}`
}

/**
 * 地点主图基础构图锚点（spec：主图作为角度/时间/天气派生图的基准）。
 * 主图建立稳定的正面全景视角、完整场地、顺光自然，避免派生后机位漂移。
 */
export const LOCATION_BASE_COMPOSITION_SUFFIX =
  '标准场地全景（wide establishing shot of the location, front view, entire space visible），' +
  '水平构图、地平线稳定（level camera, stable horizon, straight-on composition），' +
  '自然均匀光照、无明显透视畸变（natural even daylight, no extreme lens distortion, no fisheye）'

const LOCATION_BASE_COMPOSITION_NEGATIVE = [
  'extreme close-up',
  'drastic angle',
  'extreme wide distortion',
  'fisheye',
  'tilted horizon',
  'upside down',
  'overhead top-down',
  'extreme low angle',
].join(', ')

/** 把地点主图基础构图追加到主 prompt 末尾。已包含则不重复。 */
export function appendLocationBaseComposition(prompt: string): string {
  const trimmed = (prompt ?? '').trim()
  if (!trimmed) return LOCATION_BASE_COMPOSITION_SUFFIX
  if (trimmed.includes(LOCATION_BASE_COMPOSITION_SUFFIX)) return trimmed
  return `${trimmed}，${LOCATION_BASE_COMPOSITION_SUFFIX}`
}

/** 合并地点主图基础构图 negative。 */
export function mergeLocationBaseCompositionNegative(userNegative?: string | null): string {
  const u = (userNegative ?? '').trim()
  if (!u) return LOCATION_BASE_COMPOSITION_NEGATIVE
  return `${u}, ${LOCATION_BASE_COMPOSITION_NEGATIVE}`
}

/*
 * 2026-09-21 地点层级 + 平面布局图先行（B/C）：
 *   - 根地点主图生成前先出俯视平面布局图（category='floor_plan'），主图以它作参考图
 *     还原布局，避免同一地点多张图方位/建筑互相矛盾；
 *   - 子区域（binding.parentId 有值）主图以父级主图作参考图，保同一建筑群风格一致。
 *
 * v3 实测修复（2026-09-21）：
 *   - 平面图按地点尺度分档（建筑群总平面 vs 室内平面），"雪麓山庄"整座门派
 *     曾被画成单个房间；
 *   - 平面图严禁文字（本地模型渲染文字必乱码），删掉"标注主要建筑"类要求；
 *   - 主图以平面图为参考时用变换式指令（俯视示意图 → 地面人视写实场景），
 *     否则 flux-kontext 类编辑模型会照抄平面图风格。
 */

/** 平面图禁文字约束（中英双写；本地模型渲染文字必乱码，v3 实测） */
export const LOCATION_FLOOR_PLAN_NO_TEXT =
  '图上不得出现任何文字、标注、字母、数字、符号、图例' +
  '（no text, no labels, no letters, no numbers, no symbols, no legend on the image）'

/** 宏观尺度（门派/山庄/城池）：建筑群总平面 */
export const LOCATION_FLOOR_PLAN_SITE_SUFFIX =
  '建筑群总平面布局图（aerial site plan, bird\'s-eye view of the entire building complex），' +
  '鸟瞰整座建筑群，展现主要院落、殿堂、道路、山门的相对位置，无人物，示意风格，简洁线条与色块'

/** 室内尺度（房间/厅堂）：室内平面 */
export const LOCATION_FLOOR_PLAN_INTERIOR_SUFFIX =
  '室内平面布局图（top-down orthographic floor plan of the interior space），' +
  '展现家具与功能区域的相对位置，无人物，示意风格，简洁线条与色块'

/** 宏观尺度关键词（scale/locationType/名字命中 → 建筑群总平面） */
const FLOOR_PLAN_MACRO_KEYWORDS = [
  '门派', '山庄', '建筑群', '城池', '城', '镇', '村', '寨', '宫', '观', '派', '门', '谷', '府邸', '庄园',
]
/** 室内尺度关键词（命中 → 室内平面） */
const FLOOR_PLAN_INTERIOR_KEYWORDS = [
  '房', '屋', '室', '阁', '斋', '堂', '厅', 'interior', '室内', '内景',
]

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k))
}

/**
 * 宏观尺度地点名判定（山庄/城/派/门/宫/观/寨/镇/村/谷等）。
 * 共用方：平面图尺度分档（本文件）+ storyboard-cogen O3 富化回填守卫
 * （宏观地点不能被室内尺度的子场景描述污染）。
 */
export function isMacroScaleLocationName(name: string | null | undefined): boolean {
  return !!name && containsAny(name, FLOOR_PLAN_MACRO_KEYWORDS)
}

/** 文本是否含室内尺度词（书房/房间/内景/卧室/室/阁/斋/堂/厅等，经上方关键词表覆盖） */
export function containsInteriorScaleWord(text: string | null | undefined): boolean {
  return !!text && containsAny(text, FLOOR_PLAN_INTERIOR_KEYWORDS)
}

/**
 * 平面图尺度分档 + 禁文字：返回完整平面图 prompt 后缀。
 *
 * 分档规则：
 *   1. scale / locationType 优先：含宏观关键词或"大/巨" → site；含室内关键词或"小" → interior；
 *   2. 否则按名字猜：室内关键词 → interior；宏观关键词 → site；
 *   3. 都不命中 → site（地点默认按宏观场景处理，室内是少数）。
 */
export function buildLocationFloorPlanSuffix(input: {
  scale?: string | null
  locationType?: string | null
  name?: string | null
}): string {
  const meta = `${input.scale ?? ''} ${input.locationType ?? ''}`
  const name = input.name ?? ''
  let tier: 'site' | 'interior'
  if (
    containsAny(meta, FLOOR_PLAN_MACRO_KEYWORDS) ||
    meta.includes('巨大') ||
    /(^|[^小])大/.test(meta)
  ) {
    tier = 'site'
  } else if (containsAny(meta, FLOOR_PLAN_INTERIOR_KEYWORDS) || meta.includes('小')) {
    tier = 'interior'
  } else if (containsAny(name, FLOOR_PLAN_INTERIOR_KEYWORDS)) {
    tier = 'interior'
  } else {
    // 名字命中宏观 / 都不命中 → site（默认宏观）
    tier = 'site'
  }
  const tierSuffix =
    tier === 'site' ? LOCATION_FLOOR_PLAN_SITE_SUFFIX : LOCATION_FLOOR_PLAN_INTERIOR_SUFFIX
  return `${tierSuffix}，${LOCATION_FLOOR_PLAN_NO_TEXT}`
}

/**
 * 主图以平面布局图为参考时的变换式指令（v3 实测：flux-kontext 类编辑模型
 * 给单参考图会照抄，"保持布局一致"压不住；必须显式要求视角/质感变换）。
 */
export const LOCATION_FLOOR_PLAN_REFERENCE_SUFFIX =
  '将参考的俯视平面布局图转换为地面人视角度的写实电影质感场景画面，' +
  '保持布局结构与建筑相对位置一致，严禁输出俯视视角、示意图、线稿、平面图风格' +
  '（transform the reference top-down floor plan into a realistic cinematic scene from ' +
  'ground-level human perspective, keep layout structure and relative positions of buildings, ' +
  'strictly no top-down view, no schematic, no line-art, no floor-plan style）'

/** 子区域主图以父级主图为参考时的 prompt 后缀 */
export const LOCATION_PARENT_REFERENCE_SUFFIX =
  '与参考图为同一建筑群/同一地点的不同区域，保持建筑风格、材质、色调一致' +
  '（a different area of the same building complex / location as the reference image, ' +
  'keep architectural style, materials and color tone consistent）'

/** 幂等追加通用 helper（已含 suffix 则不重复） */
function appendSuffixOnce(prompt: string, suffix: string): string {
  const trimmed = (prompt ?? '').trim()
  if (!trimmed) return suffix
  if (trimmed.includes(suffix)) return trimmed
  return `${trimmed}，${suffix}`
}

export function appendLocationFloorPlanReference(prompt: string): string {
  return appendSuffixOnce(prompt, LOCATION_FLOOR_PLAN_REFERENCE_SUFFIX)
}

export function appendLocationParentReference(prompt: string): string {
  return appendSuffixOnce(prompt, LOCATION_PARENT_REFERENCE_SUFFIX)
}

/**
 * spec 2026-05-09 review：变体维度锁（'variant' 新派生路径专用）
 *
 * 旧 angle_variant 路径只锁"光照 / 时间 / 天气"。新模型合并到 'variant' 后，
 * 用户用 metadata 标注本次变体改的是哪个维度（angle/time/weather），其他维度应保持
 * 与基图一致，以避免"派一张雨夜结果机位也变了"。
 *
 * 规则：
 *   - metadata 含 angle，缺 time/weather → 锁 time + weather（保持光线 / 天气）
 *   - metadata 含 time，缺 angle/weather → 锁 angle + weather（保持机位 / 天气）
 *   - metadata 含 weather，缺 angle/time → 锁 angle + time（保持机位 / 时间）
 *   - 含两个维度 → 锁剩下那个
 *   - 含三个维度 → 不锁（用户三个都要改）
 *   - 全空 → 不锁（自由派生）
 *
 * 注：判断"含某维度"以 metadata 里该 key 非空字符串为准。
 */
type DimensionKey = 'angle' | 'time' | 'weather'

interface VariantDimensionLockResult {
  /** 应当被锁定（保持不变）的维度 */
  locked: DimensionKey[]
  /** 应当被改动（用户在此变体中关注的）维度 */
  changed: DimensionKey[]
}

function detectVariantDimensions(
  metadata: Record<string, unknown> | null | undefined,
): VariantDimensionLockResult {
  if (!metadata || typeof metadata !== 'object') {
    return { locked: [], changed: [] }
  }
  const has = (k: DimensionKey): boolean => {
    const v = (metadata as any)[k]
    return typeof v === 'string' && v.trim().length > 0
  }
  const allKeys: DimensionKey[] = ['angle', 'time', 'weather']
  const changed = allKeys.filter(has)
  // 三个都标了 → 不锁
  if (changed.length === 3 || changed.length === 0) {
    return { locked: [], changed }
  }
  const locked = allKeys.filter((k) => !has(k))
  return { locked, changed }
}

const DIMENSION_LOCK_TEXT: Record<DimensionKey, string> = {
  angle: '机位与构图保持一致（same camera angle, same composition, same point of view）',
  time: '时间与光线保持一致（same time of day, identical lighting intensity, same color temperature）',
  weather: '天气保持一致（same weather condition, no rain, no snow, no fog if reference is clear）',
}

const DIMENSION_LOCK_NEGATIVE: Record<DimensionKey, string[]> = {
  angle: ['different camera angle', 'angle change', 'different composition', 'different framing'],
  time: ['different time of day', 'sunrise change', 'sunset change', 'lighting change', 'different lighting'],
  weather: ['weather change', 'sudden rain', 'sudden snow', 'different weather'],
}

/**
 * 把对应锁定维度的 prompt 段附加到主 prompt 末尾（已含则不重复）。
 * 锁列表为空时返回原 prompt，零开销。
 */
export function appendVariantDimensionLock(
  prompt: string,
  metadata: Record<string, unknown> | null | undefined,
): string {
  const { locked } = detectVariantDimensions(metadata)
  if (locked.length === 0) return (prompt ?? '').trim()
  const trimmed = (prompt ?? '').trim()
  const suffix = locked.map((k) => DIMENSION_LOCK_TEXT[k]).join('，')
  if (!trimmed) return suffix
  if (trimmed.includes(suffix)) return trimmed
  return `${trimmed}，${suffix}`
}

/** 合并锁定维度的 negative 到现有 negativePrompt */
export function mergeVariantDimensionLockNegative(
  userNegative: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): string {
  const { locked } = detectVariantDimensions(metadata)
  const u = (userNegative ?? '').trim()
  if (locked.length === 0) return u
  const lockNegative = locked.flatMap((k) => DIMENSION_LOCK_NEGATIVE[k]).join(', ')
  if (!u) return lockNegative
  return `${u}, ${lockNegative}`
}
