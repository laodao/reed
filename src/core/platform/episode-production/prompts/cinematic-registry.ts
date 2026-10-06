/**
 * 剧集制作 · 镜头语言枚举注册表（提示词优化方案 §2.3，原则 P1 单一事实源）
 * @module platform/episode-production/prompts/cinematic-registry
 *
 * 背景：优化前同一批枚举散落在 6 套互不相同的词表里——
 *   - `assets/constants/camera-movements.ts` 的 25 预设（UI 真值）
 *   - `narrative/ai/storyboard-cogen.ts` 内联的 15 值运镜说明
 *   - `narrative/ai/storyboard-generator.ts` AI 填空提示词手写的 24 项（含 11 个虚构值）
 *   - `render/video/segment-planner.ts` 的中文标签表（又一套命名）
 *   - `reference-video/vlm-shot-inferrer.ts` 的 6 值简化枚举
 *   - `shared/types/episode-production/narrative.types.ts` 的 SHOT_LANGUAGE_ENUMS
 *
 * 本注册表以 camera-movements.ts 的 25 预设为运镜基准，扩展覆盖景别/角度/转场/焦距/
 * 光圈/相机风格/打光，成为**提示词文本、UI 下拉、标签映射、白名单校验**共用的唯一来源。
 *
 * 消费点（全部 import 本模块，禁止各自再抄一份）：
 *   - cogen / 旧生成器 / AI 填空的镜头语言说明段与白名单校验
 *   - segment-planner 的中文标签映射（25 预设全部可达视频模型）
 *   - VLM 推断的枚举选项与映射表（vlmAliases）
 *
 * 兼容性：`dolly_in` / `dolly_out` 等历史平行词表以 `legacyValues` 形式保留，
 * 存量分镜数据仍可解析（解析用 `findMovementByAnyValue`），但**不再对外产出**。
 */

import {
  CAMERA_MOVEMENT_PRESETS,
  type CameraMovementPreset,
} from '../assets/constants/camera-movements'
import {
  APERTURE_PRESETS,
  CAMERA_STYLE_PRESETS,
  LENS_FOCAL_PRESETS,
} from '../assets/constants/lens-presets'
import { LIGHTING_PRESETS } from '../assets/constants/lighting-presets'

// ==================== 通用条目结构 ====================

/** 提示词渲染需要的可选字段（中文标签 + 英文短语 + 一句说明） */
export interface CinematicEntry {
  /** 落库值（写入 storyboards 字段，与既有 entity 兼容） */
  value: string
  /** 中文标签（提示词、UI、界面共用同一口径） */
  zhLabel: string
  /** 英文短语（拼进图像/视频 prompt） */
  enPhrase?: string
  /** 大众用户可见的一句话说明（tooltip / 提示词注解） */
  description?: string
  /** 提示词侧重说明（可选，比 description 更偏模型指令） */
  promptHint?: string
  /** 历史平行值（存量数据解析用，不再对外产出） */
  legacyValues?: string[]
  /** 其他词表/模型的别名（VLM 映射、旧数据反查） */
  aliases?: string[]
}

// ==================== 景别（8） ====================

export const SHOT_TYPE_ENTRIES: CinematicEntry[] = [
  { value: 'extreme_long', zhLabel: '大远景', enPhrase: 'extreme long shot, vast establishing view', description: '展示宏大环境' },
  { value: 'long', zhLabel: '远景', enPhrase: 'long shot, full scene in view', description: '展示完整场景，人物较小' },
  { value: 'full', zhLabel: '全景', enPhrase: 'full shot, whole body in frame', description: '人物全身，展示动作' },
  { value: 'medium', zhLabel: '中景', enPhrase: 'medium shot, waist up', description: '人物膝盖以上，展示互动' },
  { value: 'medium_close', zhLabel: '中近景', enPhrase: 'medium close-up, chest up', description: '人物腰部以上，常用对话场景' },
  { value: 'close', zhLabel: '近景', enPhrase: 'close-up, face and shoulders', description: '人物胸部以上，展示表情' },
  { value: 'extreme_close', zhLabel: '特写', enPhrase: 'extreme close-up, face detail', description: '人物面部，展示情感' },
  { value: 'detail', zhLabel: '大特写', enPhrase: 'detail shot, close on object or body part', description: '物品或局部细节' },
]

// ==================== 镜头角度（6） ====================

export const CAMERA_ANGLE_ENTRIES: CinematicEntry[] = [
  { value: 'eye_level', zhLabel: '平视', enPhrase: 'eye level angle', description: '客观中立' },
  { value: 'high', zhLabel: '俯拍', enPhrase: 'high angle', description: '显渺小或弱势' },
  { value: 'low', zhLabel: '仰拍', enPhrase: 'low angle', description: '显高大或强势' },
  { value: 'dutch', zhLabel: '荷兰角', enPhrase: 'dutch angle, tilted frame', description: '倾斜，不安或混乱' },
  { value: 'birds_eye', zhLabel: '鸟瞰', enPhrase: 'bird\'s eye view, top down', description: '全局视角' },
  { value: 'worms_eye', zhLabel: '虫视', enPhrase: 'worm\'s eye view, ground level looking up', description: '极低角度仰视' },
]

// ==================== 镜头运动（25 预设，来自 camera-movements.ts） ====================

/**
 * 运镜注册表以 `CAMERA_MOVEMENT_PRESETS` 的 25 预设为准，
 * 并把 cogen/VLM 的历史平行词表登记为 legacyValues / aliases（存量解析用）。
 *
 * 历史平行词 → 25 预设的对应关系（一致性修复 2026-10-06）：
 *   dolly_in→push  dolly_out→pull  tracking_left→track_left  tracking_right→track_right
 *   zoom_in/zoom_out→push/pull（无独立预设，语义最接近）  steadicam→long_take_tracking
 */
const MOVEMENT_LEGACY_MAP: Record<string, { legacyValues: string[]; aliases: string[] }> = {
  static: { legacyValues: [], aliases: ['locked off'] },
  push: { legacyValues: ['dolly_in'], aliases: ['push in', 'dolly in'] },
  pull: { legacyValues: ['dolly_out'], aliases: ['pull out', 'dolly out'] },
  pan_left: { legacyValues: [], aliases: ['pan left'] },
  pan_right: { legacyValues: [], aliases: ['pan right'] },
  tilt_up: { legacyValues: [], aliases: ['tilt up'] },
  tilt_down: { legacyValues: [], aliases: ['tilt down'] },
  track_left: { legacyValues: ['tracking_left'], aliases: ['truck left', 'track left'] },
  track_right: { legacyValues: ['tracking_right', 'truck_right'], aliases: ['truck right', 'track right'] },
  crane_up: { legacyValues: [], aliases: ['crane up'] },
  crane_down: { legacyValues: [], aliases: ['crane down'] },
  dolly_zoom: { legacyValues: [], aliases: ['vertigo'] },
  long_take_tracking: { legacyValues: ['steadicam'], aliases: ['long take'] },
  master_shot_push: { legacyValues: [], aliases: [] },
  spiral_up: { legacyValues: [], aliases: [] },
  pov: { legacyValues: [], aliases: ['point of view'] },
  ots_left: { legacyValues: [], aliases: ['over the shoulder left'] },
  ots_right: { legacyValues: [], aliases: ['over the shoulder right'] },
  circle_360: { legacyValues: ['orbit'], aliases: ['orbit', '360 orbit'] },
  whip_pan: { legacyValues: [], aliases: ['whip pan left', 'whip pan right'] },
  shaky_handheld: { legacyValues: ['handheld'], aliases: ['handheld'] },
  snorricam: { legacyValues: [], aliases: [] },
  aerial_descend: { legacyValues: [], aliases: [] },
  rack_focus: { legacyValues: [], aliases: ['focus pull'] },
  time_lapse: { legacyValues: [], aliases: ['timelapse'] },
}

/** 运镜注册表条目（含 UI 分类，分类沿用 camera-movements.ts） */
export interface CameraMovementEntry extends CinematicEntry {
  category: CameraMovementPreset['category']
}

export const CAMERA_MOVEMENT_ENTRIES: CameraMovementEntry[] = CAMERA_MOVEMENT_PRESETS.map((p) => {
  const legacy = MOVEMENT_LEGACY_MAP[p.value] ?? { legacyValues: [], aliases: [] }
  return {
    value: p.value,
    zhLabel: p.label,
    enPhrase: p.promptHint,
    description: p.description,
    category: p.category,
    legacyValues: legacy.legacyValues,
    aliases: [...legacy.aliases, ...(p.alias ?? [])],
  }
})

/** 运镜分类中文名（提示词分组渲染用） */
export const CAMERA_MOVEMENT_CATEGORY_LABELS: Record<CameraMovementPreset['category'], string> = {
  basic: '基础',
  narrative: '叙事级',
  dynamic: '动态',
  special: '特殊',
}

// ==================== 转场（8） ====================

export const TRANSITION_ENTRIES: CinematicEntry[] = [
  { value: 'cut', zhLabel: '硬切', description: '快速切换，时长 0' },
  { value: 'fade', zhLabel: '淡入淡出', description: '缓慢过渡，500-1000ms' },
  { value: 'dissolve', zhLabel: '叠化', description: '柔和融合，300-800ms' },
  { value: 'wipe', zhLabel: '划像', description: '方向性过渡，200-500ms' },
  { value: 'slide', zhLabel: '滑动', description: '平移过渡，200-500ms' },
  { value: 'zoom', zhLabel: '缩放转场', description: '空间压缩，200-500ms' },
  { value: 'iris', zhLabel: '圈入圈出', description: '圆形收放过渡，200-500ms' },
  { value: 'whip', zhLabel: '甩镜', description: '快速转场，200-500ms' },
]

// ==================== 焦距 / 光圈 / 相机风格 / 打光 ====================

export const LENS_FOCAL_ENTRIES: CinematicEntry[] = LENS_FOCAL_PRESETS.map((p) => ({
  value: p.value,
  zhLabel: p.label,
  enPhrase: p.promptHint,
  description: p.visualEffect,
}))

export const APERTURE_ENTRIES: CinematicEntry[] = APERTURE_PRESETS.map((p) => ({
  value: p.value,
  zhLabel: p.label,
  enPhrase: p.promptHint,
  description: p.visualEffect,
}))

export const CAMERA_STYLE_ENTRIES: CinematicEntry[] = CAMERA_STYLE_PRESETS.map((p) => ({
  value: p.value,
  zhLabel: p.label,
  enPhrase: p.promptHint,
  description: p.visualEffect,
}))

export const LIGHTING_ENTRIES: CinematicEntry[] = LIGHTING_PRESETS.map((p) => ({
  value: p.value,
  zhLabel: p.label,
  enPhrase: p.promptHint,
  description: p.description,
}))

// ==================== 白名单校验 ====================

function toValueSet(entries: CinematicEntry[]): ReadonlySet<string> {
  return new Set(entries.map((e) => e.value))
}

export const SHOT_TYPE_VALUES: ReadonlySet<string> = toValueSet(SHOT_TYPE_ENTRIES)
export const CAMERA_ANGLE_VALUES: ReadonlySet<string> = toValueSet(CAMERA_ANGLE_ENTRIES)
export const CAMERA_MOVEMENT_VALUES: ReadonlySet<string> = toValueSet(CAMERA_MOVEMENT_ENTRIES)
export const TRANSITION_VALUES: ReadonlySet<string> = toValueSet(TRANSITION_ENTRIES)
export const LENS_FOCAL_VALUES: ReadonlySet<string> = toValueSet(LENS_FOCAL_ENTRIES)
export const APERTURE_VALUES: ReadonlySet<string> = toValueSet(APERTURE_ENTRIES)
export const CAMERA_STYLE_VALUES: ReadonlySet<string> = toValueSet(CAMERA_STYLE_ENTRIES)
export const LIGHTING_VALUES: ReadonlySet<string> = toValueSet(LIGHTING_ENTRIES)

/**
 * 全部枚举的校验白名单（AI 填空输出校验用，方案 §3.9）：
 * 键 = AI 填空返回的字段名，值 = 合法取值集合。
 * 只有出现在本表的字段才做白名单校验；未列入的字段保持原 typeof 检查。
 */
export const FILL_FIELD_VALUE_SETS: Readonly<Record<string, ReadonlySet<string>>> = {
  shotType: SHOT_TYPE_VALUES,
  cameraAngle: CAMERA_ANGLE_VALUES,
  cameraMovement: CAMERA_MOVEMENT_VALUES,
  lensFocalMm: LENS_FOCAL_VALUES,
  aperture: APERTURE_VALUES,
  cameraStyle: CAMERA_STYLE_VALUES,
  lighting: LIGHTING_VALUES,
  transitionType: TRANSITION_VALUES,
}

// ==================== 反查 ====================

/** 按 value 精确反查 */
export function findEntry(entries: CinematicEntry[], value: string | null | undefined): CinematicEntry | null {
  if (!value) return null
  return entries.find((e) => e.value === value) ?? null
}

/**
 * 按 value / legacyValues / aliases 反查运镜（存量数据兼容）。
 * 例：历史值 `dolly_in` → push 条目；`steadicam` → long_take_tracking。
 */
export function findMovementByAnyValue(value: string | null | undefined): CameraMovementEntry | null {
  if (!value) return null
  const exact = CAMERA_MOVEMENT_ENTRIES.find((e) => e.value === value)
  if (exact) return exact
  return (
    CAMERA_MOVEMENT_ENTRIES.find(
      (e) => e.legacyValues?.includes(value) || e.aliases?.includes(value),
    ) ?? null
  )
}

/** 运镜中文标签（未命中返回 null，调用方决定是否告警） */
export function movementLabel(value: string | null | undefined): string | null {
  return findMovementByAnyValue(value)?.zhLabel ?? null
}

/** 景别中文标签 */
export function shotTypeLabel(value: string | null | undefined): string | null {
  return findEntry(SHOT_TYPE_ENTRIES, value)?.zhLabel ?? null
}

/** 镜头角度中文标签 */
export function cameraAngleLabel(value: string | null | undefined): string | null {
  return findEntry(CAMERA_ANGLE_ENTRIES, value)?.zhLabel ?? null
}

// ==================== 提示词渲染 ====================

/**
 * 渲染「镜头语言说明」段（提示词共用）。
 *
 * @param opts.includeMovementCategories 是否按 basic/narrative/dynamic/special 分组（默认 true）
 * @param opts.movementOnly              只渲染运镜段（label 为 true 时使用）
 */
export function renderShotLanguageSpec(
  opts: { includeMovementCategories?: boolean; movementOnly?: boolean } = {},
): string {
  const grouped = opts.includeMovementCategories !== false
  const lines: string[] = []

  if (!opts.movementOnly) {
    lines.push('### 景别（shotType）')
    for (const e of SHOT_TYPE_ENTRIES) {
      lines.push(`- ${e.value}: ${e.zhLabel} - ${e.description ?? ''}`.trimEnd())
    }
    lines.push('')
    lines.push('### 镜头角度（cameraAngle）')
    for (const e of CAMERA_ANGLE_ENTRIES) {
      lines.push(`- ${e.value}: ${e.zhLabel} - ${e.description ?? ''}`.trimEnd())
    }
    lines.push('')
  }

  lines.push(`### 镜头运动（cameraMovement）- 使用 ${CAMERA_MOVEMENT_ENTRIES.length} 个命名预设`)
  if (grouped) {
    const categories: CameraMovementPreset['category'][] = ['basic', 'narrative', 'dynamic', 'special']
    for (const cat of categories) {
      const items = CAMERA_MOVEMENT_ENTRIES.filter((e) => e.category === cat)
      if (items.length === 0) continue
      lines.push(
        `- ${CAMERA_MOVEMENT_CATEGORY_LABELS[cat]}（${items.length} 项）：` +
          items.map((e) => `${e.value}（${e.zhLabel}）`).join('、'),
      )
    }
  } else {
    lines.push(CAMERA_MOVEMENT_ENTRIES.map((e) => `${e.value}（${e.zhLabel}）`).join('、'))
  }

  return lines.join('\n')
}

/** 渲染转场枚举段 */
export function renderTransitionSpec(): string {
  return TRANSITION_ENTRIES.map((e) => `- ${e.value}: ${e.zhLabel} - ${e.description ?? ''}`.trimEnd()).join(
    '\n',
  )
}

/** 渲染「值: 中文 - 说明」通用列表（焦距/光圈/相机风格/打光共用） */
export function renderEntryList(entries: CinematicEntry[]): string {
  return entries
    .map((e) => `- ${e.value}: ${e.zhLabel} - ${e.description ?? ''}`.trimEnd())
    .join('\n')
}