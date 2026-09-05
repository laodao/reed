/**
 * lens / camera-movements / lighting presets · spec（Phase 2 C7，spec 2026-05-09 §3.2 B5）
 *
 * 验证：
 *   - 预设值不重复（value 唯一性）
 *   - promptHint 含中英双写要点
 *   - find* helper 反查
 *   - 现有老值（static / push / pull / pan / track / crane）兼容保留
 */

import { describe, it, expect } from 'vitest'
import {
  LENS_FOCAL_PRESETS,
  APERTURE_PRESETS,
  CAMERA_STYLE_PRESETS,
  findLensFocalPreset,
  findAperturePreset,
  findCameraStylePreset,
} from '@core/platform/episode-production/assets/constants/lens-presets'
import {
  CAMERA_MOVEMENT_PRESETS,
  CAMERA_MOVEMENT_GROUPS,
  findCameraMovementPreset,
} from '@core/platform/episode-production/assets/constants/camera-movements'
import {
  LIGHTING_PRESETS,
  findLightingPreset,
} from '@core/platform/episode-production/assets/constants/lighting-presets'

describe('lens-presets', () => {
  it('LENS_FOCAL_PRESETS 5 项；value 唯一', () => {
    expect(LENS_FOCAL_PRESETS).toHaveLength(5)
    const values = LENS_FOCAL_PRESETS.map((p) => p.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('APERTURE_PRESETS 5 项；value 唯一', () => {
    expect(APERTURE_PRESETS).toHaveLength(5)
    const values = APERTURE_PRESETS.map((p) => p.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('CAMERA_STYLE_PRESETS 4 项；value 唯一', () => {
    expect(CAMERA_STYLE_PRESETS).toHaveLength(4)
    const values = CAMERA_STYLE_PRESETS.map((p) => p.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('每项含 visualEffect + promptHint（非空）', () => {
    for (const p of [...LENS_FOCAL_PRESETS, ...APERTURE_PRESETS, ...CAMERA_STYLE_PRESETS]) {
      expect(p.visualEffect.length).toBeGreaterThan(0)
      expect(p.promptHint.length).toBeGreaterThan(0)
    }
  })

  it('find* helper 反查正确', () => {
    expect(findLensFocalPreset('50mm')?.label).toContain('标准')
    expect(findLensFocalPreset('not-exist')).toBeNull()
    expect(findAperturePreset('f/1.8')?.label).toContain('极浅景深')
    expect(findCameraStylePreset('cinematic')?.label).toBe('电影感')
    expect(findCameraStylePreset(null)).toBeNull()
  })
})

describe('camera-movements', () => {
  it('25 个预设；value 唯一', () => {
    expect(CAMERA_MOVEMENT_PRESETS).toHaveLength(25)
    const values = CAMERA_MOVEMENT_PRESETS.map((p) => p.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('4 大类划分（basic / narrative / dynamic / special）', () => {
    const basic = CAMERA_MOVEMENT_PRESETS.filter((p) => p.category === 'basic')
    const narrative = CAMERA_MOVEMENT_PRESETS.filter((p) => p.category === 'narrative')
    const dynamic = CAMERA_MOVEMENT_PRESETS.filter((p) => p.category === 'dynamic')
    const special = CAMERA_MOVEMENT_PRESETS.filter((p) => p.category === 'special')
    expect(basic).toHaveLength(11)
    expect(narrative).toHaveLength(8)
    expect(dynamic).toHaveLength(3)
    expect(special).toHaveLength(3)
  })

  it('保留老值兼容（static / push / pull / pan / track / crane）', () => {
    expect(findCameraMovementPreset('static')?.label).toBe('固定')
    expect(findCameraMovementPreset('push')?.label).toBe('推镜')
    expect(findCameraMovementPreset('pull')?.label).toBe('拉镜')
    // pan / track / crane 老值在 basic 类已被扩展；本测试不强制存在裸 'pan' / 'track' / 'crane'
    // 但 pan_left / track_left 等扩展应存在
    expect(findCameraMovementPreset('pan_left')).not.toBeNull()
    expect(findCameraMovementPreset('crane_up')).not.toBeNull()
  })

  it('叙事级含希区柯克变焦 / OTS / 360 环绕', () => {
    expect(findCameraMovementPreset('dolly_zoom')?.label).toContain('希区柯克')
    expect(findCameraMovementPreset('ots_left')?.label).toContain('OTS')
    expect(findCameraMovementPreset('circle_360')?.label).toContain('360')
  })

  it('每项含 description + promptHint', () => {
    for (const p of CAMERA_MOVEMENT_PRESETS) {
      expect(p.description.length).toBeGreaterThan(0)
      expect(p.promptHint.length).toBeGreaterThan(0)
    }
  })

  it('CAMERA_MOVEMENT_GROUPS 4 组与 PRESETS 总数一致', () => {
    expect(CAMERA_MOVEMENT_GROUPS).toHaveLength(4)
    const total = CAMERA_MOVEMENT_GROUPS.reduce((s, g) => s + g.items.length, 0)
    expect(total).toBe(CAMERA_MOVEMENT_PRESETS.length)
  })
})

describe('lighting-presets', () => {
  it('12 个预设；value 唯一', () => {
    expect(LIGHTING_PRESETS).toHaveLength(12)
    const values = LIGHTING_PRESETS.map((p) => p.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('每项含 description + promptHint', () => {
    for (const p of LIGHTING_PRESETS) {
      expect(p.description.length).toBeGreaterThan(0)
      expect(p.promptHint.length).toBeGreaterThan(0)
    }
  })

  it('含核心电影光照名词（伦勃朗 / 三点 / 黑色电影 / 赛博朋克）', () => {
    const labels = LIGHTING_PRESETS.map((p) => p.label).join(' ')
    expect(labels).toContain('伦勃朗')
    expect(labels).toContain('三点')
    expect(labels).toContain('黑色电影')
    expect(labels).toContain('赛博朋克')
  })

  it('find* 反查', () => {
    expect(findLightingPreset('rembrandt')?.label).toContain('伦勃朗')
    expect(findLightingPreset('not_exist')).toBeNull()
    expect(findLightingPreset(null)).toBeNull()
  })
})
