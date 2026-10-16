/**
 * 转场配置 → ffmpeg xfade filter 翻译器（spec §5.3 · P6-T2）
 * @module platform/episode-production/compose/transition-translator
 *
 * 把项目内统一的 TransitionConfig（type / duration / direction / easing / color）
 * 翻译成 ffmpeg `xfade` filter 的 transition 关键字 + 持续时间 + filter 表达式，
 * 给 P6-T4 ffmpeg-assembler 拼 filter_complex 用。
 *
 * cut（硬切）模式不走 xfade —— 直接 concat 即可（needsXfade=false）。
 *
 * 纯函数模块，无 IO 副作用，便于单测覆盖。
 *
 * Reference：ffmpeg xfade transitions
 * https://ffmpeg.org/ffmpeg-filters.html#xfade
 *
 * 注：与既有 transition.service.ts（绑定 fluent-ffmpeg 的旧合并方法）独立；
 * 旧 service 用旧类型 + 副作用 API 留作兼容路径，本翻译器服务于新 P6 架构。
 */

import type {
  TransitionConfig,
  TransitionType,
} from '@shared/types/episode-production'

/** 翻译产物 */
export interface FfmpegTransitionPlan {
  /** ffmpeg xfade transition 关键字（如 'fade' / 'dissolve' / 'wipeleft'）；cut 时为 null */
  xfadeName: string | null
  /** 转场持续秒数；cut 时为 0 */
  durationSec: number
  /** 是否需要 xfade filter（cut 不需要，concat 即可） */
  needsXfade: boolean
}

/**
 * 把 TransitionConfig 翻译成 xfade plan。
 */
export function toFfmpegTransition(cfg: TransitionConfig): FfmpegTransitionPlan {
  const durationSec = Math.max(0, cfg.duration ?? 500) / 1000

  if (cfg.type === 'cut') {
    return { xfadeName: null, durationSec: 0, needsXfade: false }
  }

  const xfadeName = mapTypeToXfade(cfg.type, cfg.direction, cfg.color)
  return {
    xfadeName,
    durationSec,
    needsXfade: durationSec > 0,
  }
}

/**
 * 8 种 spec 转场 → ffmpeg xfade 关键字的映射。
 *
 * - cut → '' (caller 应跳过 xfade)
 * - fade → fadeblack / fadewhite / fade（按 color 决定）
 * - dissolve → dissolve
 * - wipe + direction → wipe{left,right,up,down}
 * - slide + direction → slide{left,right,up,down}
 * - zoom → zoomin
 * - iris → circleopen
 * - whip → hblur
 */
function mapTypeToXfade(
  type: TransitionType,
  direction?: TransitionConfig['direction'],
  color?: TransitionConfig['color'],
): string {
  switch (type) {
    case 'cut':
      return ''
    case 'fade':
      if (
        color === 'white' ||
        color?.toLowerCase() === '#ffffff' ||
        color?.toLowerCase() === '#fff'
      ) {
        return 'fadewhite'
      }
      if (
        color === 'black' ||
        color?.toLowerCase() === '#000000' ||
        color?.toLowerCase() === '#000'
      ) {
        return 'fadeblack'
      }
      return 'fade'
    case 'dissolve':
      return 'dissolve'
    case 'wipe':
      return `wipe${normalizeDirection(direction)}`
    case 'slide':
      return `slide${normalizeDirection(direction)}`
    case 'zoom':
      return 'zoomin'
    case 'iris':
      return 'circleopen'
    case 'whip':
      return 'hblur'
    default:
      return 'fade'
  }
}

function normalizeDirection(d: TransitionConfig['direction']): string {
  if (d === 'left' || d === 'right' || d === 'up' || d === 'down') return d
  return 'left'
}

/**
 * 给两段视频在时间线上的相邻位置构造 xfade filter 表达式。
 *
 * @param plan toFfmpegTransition 的输出
 * @param prevShotEndSec 前一镜在合并视频中的结束时间（重叠起始点 = endSec - duration）
 * @returns ffmpeg filter 内 xfade= 子句；cut 模式返回 null（caller concat）
 *
 * 例（dissolve 0.5 秒在第 2 秒末尾）→
 *   xfade=transition=dissolve:duration=0.500:offset=1.500
 */
export function buildXfadeClause(
  plan: FfmpegTransitionPlan,
  prevShotEndSec: number,
): string | null {
  if (!plan.needsXfade || plan.xfadeName === null || plan.xfadeName === '') {
    return null
  }
  const offsetSec = Math.max(0, prevShotEndSec - plan.durationSec)
  const round = (n: number) => Number(n.toFixed(3))
  return `xfade=transition=${plan.xfadeName}:duration=${round(plan.durationSec)}:offset=${round(offsetSec)}`
}
