/**
 * episode-status.machine 单测（P6-T10）
 *
 * 覆盖 7 状态 + 转换分类 + 视觉标记。
 */

import { describe, it, expect } from 'vitest'
import {
  classifyTransition,
  getNextPossibleStatuses,
  stageNumberOf,
  visualMarkOfStage,
  ALL_EPISODE_STATUSES,
  STAGE_LABELS,
} from '@core/platform/episode-production/workflow/episode-status.machine'

describe('classifyTransition', () => {
  it('forward / backward / same', () => {
    expect(classifyTransition('pending', 'asset_prep')).toBe('forward')
    expect(classifyTransition('producing', 'asset_prep')).toBe('backward')
    expect(classifyTransition('scripting', 'scripting')).toBe('same')
  })

  it('completed 是终态', () => {
    expect(classifyTransition('composing', 'completed')).toBe('forward')
    expect(classifyTransition('completed', 'asset_prep')).toBe('backward')
  })
})

describe('getNextPossibleStatuses', () => {
  it('非终态：返回所有其他状态', () => {
    const r = getNextPossibleStatuses('scripting')
    expect(r).not.toContain('scripting')
    expect(r.length).toBe(ALL_EPISODE_STATUSES.length - 1)
  })

  it('completed：返回空数组', () => {
    expect(getNextPossibleStatuses('completed')).toEqual([])
  })
})

describe('stageNumberOf', () => {
  it('1~7 顺序', () => {
    expect(stageNumberOf('pending')).toBe(1)
    expect(stageNumberOf('asset_prep')).toBe(2)
    expect(stageNumberOf('scripting')).toBe(3)
    expect(stageNumberOf('storyboarding')).toBe(4)
    expect(stageNumberOf('producing')).toBe(5)
    expect(stageNumberOf('composing')).toBe(6)
    expect(stageNumberOf('completed')).toBe(7)
  })
})

describe('visualMarkOfStage', () => {
  it('current=scripting 时：pending/asset_prep ✓ / scripting ● / 后续 ○', () => {
    expect(visualMarkOfStage('pending', 'scripting')).toBe('✓')
    expect(visualMarkOfStage('asset_prep', 'scripting')).toBe('✓')
    expect(visualMarkOfStage('scripting', 'scripting')).toBe('●')
    expect(visualMarkOfStage('storyboarding', 'scripting')).toBe('○')
    expect(visualMarkOfStage('completed', 'scripting')).toBe('○')
  })
})

describe('STAGE_LABELS', () => {
  it('每个状态都有中文标签', () => {
    for (const s of ALL_EPISODE_STATUSES) {
      expect(STAGE_LABELS[s]).toBeTruthy()
    }
    expect(STAGE_LABELS.pending).toContain('内容')
    expect(STAGE_LABELS.composing).toContain('合成')
  })
})
