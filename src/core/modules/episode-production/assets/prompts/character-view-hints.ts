/**
 * 角色图集各 slot 的业务语义（角度 + 景别 + 构图约束）
 * @module modules/episode-production/assets/prompts/character-view-hints
 *
 * 派生图生成时按 slot 使用，确保：
 *   - "正面半身"生成半身（而非全身）
 *   - "左侧四分之三"生成对应角度
 *   - 以主图（正面全身）为参考，身份/服饰/背景一致，仅角度与景别变化
 */

import type { CharacterFraming } from './character-constraints'

export interface CharacterViewHint {
  /** 构图约束（半身 / 上半身 / 全身） */
  framing: CharacterFraming
  /** 角度/景别描述（中英双写），追加在身份锚点之后 */
  viewHint: string
}

/** 角色图集 slot → 语义映射（label 为 asset_image.label / 图集 slot key） */
export const CHARACTER_VIEW_HINTS: Record<string, CharacterViewHint> = {
  // 主图：正面全身（基准，供派生参考）
  main: {
    framing: 'fullBody',
    viewHint: '正面全身（front view, standing full body, head to toe, facing camera）',
  },
  // 半身角度
  front_half: {
    framing: 'upperBody',
    viewHint: '正面半身（front view, waist-up, head and shoulders visible）',
  },
  left_3q: {
    framing: 'upperBody',
    viewHint: '左侧四分之三半身（three-quarter left view, waist-up, head and shoulders visible）',
  },
  right_3q: {
    framing: 'upperBody',
    viewHint: '右侧四分之三半身（three-quarter right view, waist-up, head and shoulders visible）',
  },
  // 全身角度
  full_left: {
    framing: 'fullBody',
    viewHint: '左侧全身（left side view, standing full body, head to toe）',
  },
  full_right: {
    framing: 'fullBody',
    viewHint: '右侧全身（right side view, standing full body, head to toe）',
  },
  // 三视图（character bible）用 label
  front: {
    framing: 'fullBody',
    viewHint: '正面全身（front view, standing full body, head to toe, facing camera）',
  },
  '3q_left': {
    framing: 'fullBody',
    viewHint: '左侧四分之三全身（three-quarter left view, standing full body）',
  },
  '3q_right': {
    framing: 'fullBody',
    viewHint: '右侧四分之三全身（three-quarter right view, standing full body）',
  },
}

/** 按 label 取语义映射；无匹配返回 null（调用方回退到 category 默认） */
export function viewHintForLabel(label: string | null | undefined): CharacterViewHint | null {
  if (!label) return null
  return CHARACTER_VIEW_HINTS[label] ?? null
}
