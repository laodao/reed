/**
 * 镜头语言枚举注册表单测（提示词优化方案 §2.3 单一事实源）
 * @module tests/unit/episode-production/prompts/cinematic-registry
 *
 * 目标：锁定"同一批枚举全库只有一份定义"这一约束——
 *   - 注册表必须与 camera-movements.ts 的 25 预设一致（不许多、不许少）
 *   - 历史平行词表（dolly_in/tracking_left/steadicam…）只能作为 legacy 解析入口，
 *     不得再出现在任何提示词渲染结果里
 */

import { describe, it, expect } from 'vitest'
import {
  CAMERA_MOVEMENT_ENTRIES,
  CAMERA_MOVEMENT_VALUES,
  SHOT_TYPE_ENTRIES,
  CAMERA_ANGLE_ENTRIES,
  TRANSITION_ENTRIES,
  LENS_FOCAL_VALUES,
  APERTURE_VALUES,
  CAMERA_STYLE_VALUES,
  LIGHTING_VALUES,
  FILL_FIELD_VALUE_SETS,
  findMovementByAnyValue,
  movementLabel,
  renderShotLanguageSpec,
} from '@core/platform/episode-production/prompts/cinematic-registry'
import { CAMERA_MOVEMENT_PRESETS } from '@core/platform/episode-production/assets/constants/camera-movements'

describe('cinematic-registry · 运镜基准', () => {
  it('运镜条目与 camera-movements.ts 的 25 预设逐值一致', () => {
    expect(CAMERA_MOVEMENT_ENTRIES).toHaveLength(25)
    expect(CAMERA_MOVEMENT_ENTRIES.map((e) => e.value)).toEqual(
      CAMERA_MOVEMENT_PRESETS.map((p) => p.value),
    )
  })

  it('中文标签直接来自预设（单一事实源，不另起一套）', () => {
    for (const p of CAMERA_MOVEMENT_PRESETS) {
      const entry = CAMERA_MOVEMENT_ENTRIES.find((e) => e.value === p.value)
      expect(entry?.zhLabel).toBe(p.label)
    }
  })

  it('历史平行词表可通过 findMovementByAnyValue 解析（存量数据兼容）', () => {
    expect(findMovementByAnyValue('dolly_in')?.value).toBe('push')
    expect(findMovementByAnyValue('dolly_out')?.value).toBe('pull')
    expect(findMovementByAnyValue('tracking_left')?.value).toBe('track_left')
    expect(findMovementByAnyValue('tracking_right')?.value).toBe('track_right')
    expect(findMovementByAnyValue('orbit')?.value).toBe('circle_360')
    expect(findMovementByAnyValue('steadicam')?.value).toBe('long_take_tracking')
    expect(findMovementByAnyValue('handheld')?.value).toBe('shaky_handheld')
  })

  it('精确值原样命中，未知值返回 null（不静默兜底）', () => {
    expect(findMovementByAnyValue('push')?.value).toBe('push')
    expect(findMovementByAnyValue('crash_zoom')).toBeNull()
    expect(findMovementByAnyValue('')).toBeNull()
    expect(movementLabel('dolly_zoom')).toBe('希区柯克变焦')
    expect(movementLabel('crash_zoom')).toBeNull()
  })
})

describe('cinematic-registry · 其余枚举', () => {
  it('景别 8 / 角度 6 / 转场 8', () => {
    expect(SHOT_TYPE_ENTRIES).toHaveLength(8)
    expect(CAMERA_ANGLE_ENTRIES).toHaveLength(6)
    expect(TRANSITION_ENTRIES).toHaveLength(8)
  })

  it('角度含 worms_eye（旧 AI 填空提示词漏项已修）', () => {
    expect(CAMERA_ANGLE_ENTRIES.map((e) => e.value)).toContain('worms_eye')
  })

  it('转场含 iris（旧 AI 填空提示词漏项已修）', () => {
    expect(TRANSITION_ENTRIES.map((e) => e.value)).toContain('iris')
  })

  it('焦距 5 / 光圈 5 / 相机风格 4 / 打光 12 白名单齐备', () => {
    expect(LENS_FOCAL_VALUES.size).toBe(5)
    expect(APERTURE_VALUES.size).toBe(5)
    expect(CAMERA_STYLE_VALUES.size).toBe(4)
    expect(LIGHTING_VALUES.size).toBe(12)
  })
})

describe('cinematic-registry · 提示词渲染', () => {
  const spec = renderShotLanguageSpec()

  it('渲染结果含全部 25 个运镜真值', () => {
    for (const e of CAMERA_MOVEMENT_ENTRIES) {
      expect(spec).toContain(e.value)
    }
  })

  it('渲染结果不含任何历史平行词（防止旧词表回流提示词）', () => {
    expect(spec).not.toContain('dolly_in')
    expect(spec).not.toContain('dolly_out')
    expect(spec).not.toContain('tracking_left')
    expect(spec).not.toContain('steadicam')
  })

  it('渲染结果不含虚构运镜值（AI 填空曾经写死的 11 项）', () => {
    const fabricated = [
      'push_in',
      'pull_out',
      'reveal_push',
      'reveal_pull',
      'whip_pan_left',
      'whip_pan_right',
      'crash_zoom',
      'slow_motion_static',
      'time_lapse_pan',
      'freeze_frame',
      'impact_zoom',
    ]
    for (const v of fabricated) {
      expect(spec).not.toContain(v)
    }
  })

  it('声明的预设数量与实际条目数一致（防"25 命名预设"式假声明）', () => {
    expect(spec).toContain(`使用 ${CAMERA_MOVEMENT_ENTRIES.length} 个命名预设`)
  })

  it('分组渲染含四个类别中文名', () => {
    expect(spec).toContain('基础（11 项）')
    expect(spec).toContain('叙事级（8 项）')
    expect(spec).toContain('动态（3 项）')
    expect(spec).toContain('特殊（3 项）')
  })
})

describe('cinematic-registry · 白名单', () => {
  it('FILL_FIELD_VALUE_SETS 覆盖 8 个可校验字段', () => {
    expect(Object.keys(FILL_FIELD_VALUE_SETS).sort()).toEqual(
      [
        'aperture',
        'cameraAngle',
        'cameraMovement',
        'cameraStyle',
        'lensFocalMm',
        'lighting',
        'shotType',
        'transitionType',
      ].sort(),
    )
  })

  it('运镜白名单拒绝历史平行词与虚构值（只认真实 25 预设）', () => {
    expect(CAMERA_MOVEMENT_VALUES.has('push')).toBe(true)
    expect(CAMERA_MOVEMENT_VALUES.has('dolly_in')).toBe(false)
    expect(CAMERA_MOVEMENT_VALUES.has('crash_zoom')).toBe(false)
    expect(CAMERA_MOVEMENT_VALUES.has('push_in')).toBe(false)
  })
})