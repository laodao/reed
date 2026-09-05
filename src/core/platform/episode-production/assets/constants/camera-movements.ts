/**
 * 运镜命名预设（spec 2026-05-09 ep-redesign §3.2 B5 · P-13）
 *
 * 4 大类共 25 个预设：
 *   - basic（11 项）：保留现有 6 类 + 扩展 left/right 等
 *   - narrative（8 项）：希区柯克变焦 / OTS 过肩 / 360 环绕 等叙事级
 *   - dynamic（3 项）：甩镜 / 手持 / 主体绑机位
 *   - special（3 项）：航拍下降 / 跟焦切换 / 延时摄影
 *
 * 字段说明：
 *   - value: 写入 storyboards.cameraMovement 的字符串（与现有 entity 兼容）
 *   - label: 中文（大众用户友好）
 *   - alias: 别名（搜索）
 *   - description: tooltip 给大众用户
 *   - promptHint: 英文 prompt 片段
 *
 * 现有老值（static / push / pull / pan / track / crane）已保留在 basic 类，向后兼容。
 */

export interface CameraMovementPreset {
  value: string
  label: string
  alias?: string[]
  description: string
  promptHint: string
  category: 'basic' | 'narrative' | 'dynamic' | 'special'
}

export const CAMERA_MOVEMENT_PRESETS: CameraMovementPreset[] = [
  // 基础 11 项
  { value: 'static',      label: '固定',  description: '镜头不动',           promptHint: 'static shot, locked off camera', category: 'basic' },
  { value: 'push',        label: '推镜',  description: '相机向被摄物推近',   promptHint: 'dolly in, slow push toward subject', category: 'basic' },
  { value: 'pull',        label: '拉镜',  description: '相机后退远离',       promptHint: 'dolly out, slow pull away', category: 'basic' },
  { value: 'pan_left',    label: '左摇',  description: '水平向左转动',       promptHint: 'pan left, horizontal camera rotation', category: 'basic' },
  { value: 'pan_right',   label: '右摇',  description: '水平向右转动',       promptHint: 'pan right', category: 'basic' },
  { value: 'tilt_up',     label: '上仰',  description: '镜头向上抬起',       promptHint: 'tilt up, vertical rotation upward', category: 'basic' },
  { value: 'tilt_down',   label: '下俯',  description: '镜头向下俯视',       promptHint: 'tilt down', category: 'basic' },
  { value: 'track_left',  label: '左移',  description: '相机平移左行',       promptHint: 'truck left, horizontal lateral movement', category: 'basic' },
  { value: 'track_right', label: '右移',  description: '相机平移右行',       promptHint: 'truck right', category: 'basic' },
  { value: 'crane_up',    label: '升镜',  description: '升降臂向上',         promptHint: 'crane up, vertical rise', category: 'basic' },
  { value: 'crane_down',  label: '降镜',  description: '升降臂向下',         promptHint: 'crane down', category: 'basic' },

  // 叙事级 8 项（电影行业命名）
  { value: 'dolly_zoom',         label: '希区柯克变焦', alias: ['vertigo'], description: '推镜同时拉变焦 → 背景诡异收缩，主体不变（迷魂记同款）', promptHint: 'dolly zoom, vertigo effect, hitchcock zoom, background distortion', category: 'narrative' },
  { value: 'long_take_tracking', label: '长镜头跟拍',                       description: '一镜到底跟随主体行进',                  promptHint: 'long take tracking shot, continuous follow', category: 'narrative' },
  { value: 'master_shot_push',   label: '大师推近',                         description: '从全景缓慢推近到中近景',                promptHint: 'master shot dolly in, slow push from wide to medium', category: 'narrative' },
  { value: 'spiral_up',          label: '螺旋上升',                         description: '螺旋式升起 + 旋转',                     promptHint: 'spiral crane up with rotation', category: 'narrative' },
  { value: 'pov',                label: '主观视角',                         description: '从角色视角看出去',                      promptHint: 'POV shot, first-person perspective', category: 'narrative' },
  { value: 'ots_left',           label: 'OTS 左过肩',                       description: '从角色左肩后看',                        promptHint: 'over the shoulder shot from left', category: 'narrative' },
  { value: 'ots_right',          label: 'OTS 右过肩',                       description: '从角色右肩后看',                        promptHint: 'over the shoulder shot from right', category: 'narrative' },
  { value: 'circle_360',         label: '360 环绕',                         description: '相机围绕主体环绕一周',                  promptHint: '360 degree orbit around subject', category: 'narrative' },

  // 动态 3 项（短剧 / 短视频常用）
  { value: 'whip_pan',       label: '甩镜',       description: '快速横甩转场',                       promptHint: 'whip pan, quick lateral motion blur', category: 'dynamic' },
  { value: 'shaky_handheld', label: '手持晃动',   description: '模拟手持的自然晃动',                 promptHint: 'handheld camera, natural shake, documentary feel', category: 'dynamic' },
  { value: 'snorricam',      label: '主体绑机位', description: '相机绑在主角身上 → 背景旋转，主体不动', promptHint: 'snorricam, body-mounted camera, subject locked, background rotates', category: 'dynamic' },

  // 特殊 3 项
  { value: 'aerial_descend', label: '航拍下降', description: '从高空降到地面',     promptHint: 'aerial descent, high to low altitude', category: 'special' },
  { value: 'rack_focus',     label: '跟焦切换', description: '焦点在前后景间切换', promptHint: 'rack focus, focus pull between foreground and background', category: 'special' },
  { value: 'time_lapse',     label: '延时摄影', description: '时间加速',           promptHint: 'time-lapse, accelerated time', category: 'special' },
]

/** 按 value 反查；老值（push/pull 等）含在 basic 类 */
export function findCameraMovementPreset(value: string | null | undefined): CameraMovementPreset | null {
  if (!value) return null
  return CAMERA_MOVEMENT_PRESETS.find((p) => p.value === value) ?? null
}

/** 按类别分组（UI grouped select 用） */
export const CAMERA_MOVEMENT_GROUPS = [
  { key: 'basic' as const,     label: '基础',     items: CAMERA_MOVEMENT_PRESETS.filter((p) => p.category === 'basic') },
  { key: 'narrative' as const, label: '叙事级',   items: CAMERA_MOVEMENT_PRESETS.filter((p) => p.category === 'narrative') },
  { key: 'dynamic' as const,   label: '动态',     items: CAMERA_MOVEMENT_PRESETS.filter((p) => p.category === 'dynamic') },
  { key: 'special' as const,   label: '特殊',     items: CAMERA_MOVEMENT_PRESETS.filter((p) => p.category === 'special') },
]
