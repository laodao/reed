/**
 * segment-planner 镜头头标签接注册表单测（提示词优化方案 §3.14）
 * @module tests/unit/episode-production/render/segment-planner-registry
 *
 * 背景：优化前标签表手写 cogen 的 15 项词表，与 UI 真值（camera-movements.ts 25 预设）
 * 不同源——19/25 个真实预设的运镜标签被静默省略，视频模型收不到运镜信息。
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildSegmentPrompt,
  shotHeaderMeta,
  type SegmentPromptShot,
} from '@core/platform/episode-production/render/video/segment-planner'
import { CAMERA_MOVEMENT_PRESETS } from '@core/platform/episode-production/assets/constants/camera-movements'

function shot(over: Partial<SegmentPromptShot> = {}): SegmentPromptShot {
  return { duration: 3, frameDescription: '【场景】某处', ...over } as SegmentPromptShot
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shotHeaderMeta · 25 预设全部可达', () => {
  it('每个真实运镜预设都能产出中文标签', () => {
    for (const preset of CAMERA_MOVEMENT_PRESETS) {
      const meta = shotHeaderMeta(shot({ cameraMovement: preset.value }), () => {})
      expect(meta).toContain(preset.label)
    }
  })

  it('25 个预设中无一个被省略（优化前 19 个被丢）', () => {
    const unmapped: string[] = []
    for (const preset of CAMERA_MOVEMENT_PRESETS) {
      shotHeaderMeta(shot({ cameraMovement: preset.value }), (f, v) => unmapped.push(`${f}:${v}`))
    }
    expect(unmapped).toEqual([])
  })

  it('景别 8 值 + 角度 6 值全部可达', () => {
    for (const v of ['extreme_long', 'long', 'full', 'medium', 'medium_close', 'close', 'extreme_close', 'detail']) {
      expect(shotHeaderMeta(shot({ shotType: v }), () => {}).length).toBe(1)
    }
    for (const v of ['eye_level', 'high', 'low', 'dutch', 'birds_eye', 'worms_eye']) {
      expect(shotHeaderMeta(shot({ cameraAngle: v }), () => {}).length).toBe(1)
    }
  })

  it('历史平行值（dolly_in / tracking_left / steadicam）仍可解析为标签（存量数据）', () => {
    expect(shotHeaderMeta(shot({ cameraMovement: 'dolly_in' }), () => {})).toContain('推镜')
    expect(shotHeaderMeta(shot({ cameraMovement: 'tracking_left' }), () => {})).toContain('左移')
    expect(shotHeaderMeta(shot({ cameraMovement: 'steadicam' }), () => {})).toContain('长镜头跟拍')
  })

  it('未知值省略并回调留痕（不再静默）', () => {
    const seen: string[] = []
    const meta = shotHeaderMeta(shot({ cameraMovement: 'crash_zoom' }), (f, v) => seen.push(`${f}:${v}`))
    expect(meta).toEqual([])
    expect(seen).toEqual(['cameraMovement:crash_zoom'])
  })

  it('缺省 onUnmapped 时记 warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    shotHeaderMeta(shot({ shotType: 'weird' }))
    expect(warn).toHaveBeenCalled()
  })
})

describe('buildSegmentPrompt · 界面所见即模型所得', () => {
  it('25 预设的运镜标签全部出现在片段提示词里', () => {
    for (const preset of CAMERA_MOVEMENT_PRESETS) {
      const prompt = buildSegmentPrompt([shot({ cameraMovement: preset.value })])
      expect(prompt).toContain(preset.label)
    }
  })

  it('历史值 dolly_in 不再产出（提示词侧只出现当前真值标签）', () => {
    const prompt = buildSegmentPrompt([shot({ cameraMovement: 'push' })])
    expect(prompt).toContain('推镜')
  })
})