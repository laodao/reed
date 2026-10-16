/**
 * param-options · 分镜参数选项字典
 *
 * PromptEditor 的 #参数 chip 下拉用。value 与后端 StoryboardEntity 字段
 *（shotType / cameraAngle / cameraMovement / transitionType / transitionDirection）
 * 保持一致，label 复用 StoryboardEditDialog 的中文文案。
 */

export interface ParamOption {
  value: string
  label: string
}

/** 景别 */
export const SHOT_TYPE_OPTIONS: ParamOption[] = [
  { value: 'extreme_long', label: '大远景' },
  { value: 'long', label: '远景' },
  { value: 'full', label: '全景' },
  { value: 'medium', label: '中景' },
  { value: 'medium_close', label: '中近景' },
  { value: 'close', label: '近景' },
  { value: 'extreme_close', label: '特写' },
  { value: 'detail', label: '大特写' },
]

/** 角度 */
export const CAMERA_ANGLE_OPTIONS: ParamOption[] = [
  { value: 'eye_level', label: '平视' },
  { value: 'high', label: '俯拍' },
  { value: 'low', label: '仰拍' },
  { value: 'dutch', label: '荷兰角' },
  { value: 'birds_eye', label: '鸟瞰' },
  { value: 'worms_eye', label: '虫视' },
]

/** 运镜 */
export const CAMERA_MOVEMENT_OPTIONS: ParamOption[] = [
  { value: 'static', label: '固定' },
  { value: 'pan_left', label: '左摇' },
  { value: 'pan_right', label: '右摇' },
  { value: 'tilt_up', label: '上仰' },
  { value: 'tilt_down', label: '下俯' },
  { value: 'dolly_in', label: '推镜' },
  { value: 'dolly_out', label: '拉镜' },
  { value: 'truck_left', label: '左移' },
  { value: 'truck_right', label: '右移' },
  { value: 'zoom_in', label: '变焦推进' },
  { value: 'zoom_out', label: '变焦拉远' },
  { value: 'crane_up', label: '升镜' },
  { value: 'crane_down', label: '降镜' },
  { value: 'handheld', label: '手持' },
  { value: 'orbit', label: '环绕' },
]

/** 转场类型 */
export const TRANSITION_TYPE_OPTIONS: ParamOption[] = [
  { value: 'cut', label: '硬切' },
  { value: 'fade', label: '淡入淡出' },
  { value: 'dissolve', label: '溶解' },
  { value: 'wipe', label: '擦除' },
  { value: 'slide', label: '滑动' },
  { value: 'zoom', label: '缩放' },
  { value: 'iris', label: '光圈' },
  { value: 'whip', label: '甩镜' },
]

/** 转场方向（仅 slide/wipe 有效） */
export const TRANSITION_DIRECTION_OPTIONS: ParamOption[] = [
  { value: 'left', label: '向左' },
  { value: 'right', label: '向右' },
  { value: 'up', label: '向上' },
  { value: 'down', label: '向下' },
]

/** 按 value 查 label；未匹配返回空串（用于 chip 显示当前值） */
export function labelOf(
  options: ParamOption[],
  value: string | null | undefined,
): string {
  if (!value) return ''
  return options.find((o) => o.value === value)?.label ?? ''
}
