/**
 * 地点资产 variant 常量
 * @module core/modules/episode-production/assets/constants/location-variants
 *
 * 时间 / 天气 / 角度三类 variant 的权威列表。前端选项面板、派生工具、prompt 拼接、
 * UI 显示标签等所有场景必须 import 同一份，禁止在各处重复硬编码。
 *
 * 双端共用：core 包，PC + Web 渲染端 + 后端 service 都能 import。
 */

/** 时间维度 variant 值（equirectangular 全景与普通图谱共用） */
export const LOCATION_TIME_VARIANTS = [
  { value: 'morning', cn: '清晨' },
  { value: 'noon', cn: '正午' },
  { value: 'afternoon', cn: '下午' },
  { value: 'evening', cn: '黄昏' },
  { value: 'night', cn: '夜晚' },
  { value: 'dawn', cn: '黎明' },
  { value: 'dusk', cn: '日暮' },
] as const

/** 天气维度 variant 值 */
export const LOCATION_WEATHER_VARIANTS = [
  { value: 'sunny', cn: '晴' },
  { value: 'cloudy', cn: '多云' },
  { value: 'rainy', cn: '雨' },
  { value: 'snowy', cn: '雪' },
  { value: 'foggy', cn: '雾' },
  { value: 'stormy', cn: '暴风' },
] as const

/** 角度维度 variant 值（地点常用机位） */
export const LOCATION_ANGLE_VARIANTS = [
  { value: 'wide_shot', cn: '远景' },
  { value: 'entrance', cn: '入口' },
  { value: 'interior_a', cn: '室内 A' },
  { value: 'interior_b', cn: '室内 B' },
] as const

export type LocationTimeVariant =
  (typeof LOCATION_TIME_VARIANTS)[number]['value']
export type LocationWeatherVariant =
  (typeof LOCATION_WEATHER_VARIANTS)[number]['value']
export type LocationAngleVariant =
  (typeof LOCATION_ANGLE_VARIANTS)[number]['value']

/** 仅取 value 列表（给 GalleryEditor 类组件用，不需要中文标签时） */
export const LOCATION_TIME_VALUES: readonly LocationTimeVariant[] =
  LOCATION_TIME_VARIANTS.map((v) => v.value)
export const LOCATION_WEATHER_VALUES: readonly LocationWeatherVariant[] =
  LOCATION_WEATHER_VARIANTS.map((v) => v.value)
export const LOCATION_ANGLE_VALUES: readonly LocationAngleVariant[] =
  LOCATION_ANGLE_VARIANTS.map((v) => v.value)
