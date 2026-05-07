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
