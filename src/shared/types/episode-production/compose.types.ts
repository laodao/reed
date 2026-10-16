/**
 * episode-production · 合成（转场/项目配置） · 类型定义
 * @module shared/types/episode-production/compose.types
 * @description 视频合成层类型：转场类型枚举与转场配置。
 *
 * 注：原类型定义来自 src/shared/types/story-to-video.types.ts，
 *     P1 拆分后旧文件改为 deprecated re-export。修改请改本文件。
 */

/**
 * 转场类型
 */
export type TransitionType =
  | 'cut' // 硬切
  | 'fade' // 淡入淡出
  | 'dissolve' // 溶解
  | 'wipe' // 擦除
  | 'slide' // 滑动
  | 'zoom' // 缩放
  | 'iris' // 光圈
  | 'whip' // 甩镜

/**
 * 转场配置
 */
export interface TransitionConfig {
  type: TransitionType
  duration: number // 转场时长（毫秒）
  direction?: 'left' | 'right' | 'up' | 'down' // 滑动/擦除方向
  easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out'
  color?: string // 淡入淡出颜色（hex）
}
