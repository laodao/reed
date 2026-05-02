/**
 * 分镜语言中文映射
 * 拆自 VideoProjectEditor.vue，供各组件复用
 */

export const shotTypeLabels: Record<string, string> = {
  extreme_long: '大远景',
  long: '远景',
  full: '全景',
  medium: '中景',
  medium_close: '中近景',
  close: '近景',
  extreme_close: '特写',
  detail: '细节特写'
}

export const cameraAngleLabels: Record<string, string> = {
  eye_level: '平视',
  high: '俯视',
  low: '仰视',
  dutch: '倾斜',
  birds_eye: '鸟瞰',
  worms_eye: '虫视'
}

export const cameraMovementLabels: Record<string, string> = {
  static: '固定',
  pan_left: '左摇',
  pan_right: '右摇',
  tilt_up: '上仰',
  tilt_down: '下俯',
  dolly_in: '推近',
  dolly_out: '拉远',
  zoom_in: '放大',
  zoom_out: '缩小',
  tracking: '跟拍',
  crane: '升降'
}

export const statusLabels: Record<string, string> = {
  pending: '待处理',
  generating: '生成中',
  image_ready: '画面已就绪',
  audio_ready: '音频已就绪',
  completed: '已完成',
  error: '错误'
}

export function getShotTypeLabel(type: string): string {
  return shotTypeLabels[type] || type
}

export function getCameraAngleLabel(angle: string): string {
  return cameraAngleLabels[angle] || angle
}

export function getCameraMovementLabel(movement: string): string {
  return cameraMovementLabels[movement] || movement
}

export function getStatusLabel(status: string): string {
  return statusLabels[status] || status
}
