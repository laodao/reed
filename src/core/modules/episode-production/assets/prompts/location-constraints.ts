/**
 * 地点资产生成的硬约束 prompt
 * @module modules/episode-production/assets/prompts/location-constraints
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
