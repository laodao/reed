/**
 * shot-video-readiness 纯函数单测（2026-09-25 一致性修复 · 审计主题 B 评审收尾）
 *
 * 覆盖：
 * - segmentProvidesVideo：各状态枚举 × videoPath 有无
 * - storyboardHasVideo：双口径（自身 videoPath / 所属片段），无 Map 时退化
 */

import { describe, expect, it } from 'vitest'
import {
  segmentProvidesVideo,
  storyboardHasVideo,
  type SegmentVideoMap,
} from '@core/platform/episode-production/services/shot-video-readiness'

describe('segmentProvidesVideo', () => {
  it('null / undefined → false', () => {
    expect(segmentProvidesVideo(null)).toBe(false)
    expect(segmentProvidesVideo(undefined)).toBe(false)
  })

  it('completed 且 videoPath 非空 → true', () => {
    expect(segmentProvidesVideo({ status: 'completed', videoPath: 'v/seg.mp4' })).toBe(true)
  })

  it('completed 但 videoPath 缺失/空串 → false', () => {
    expect(segmentProvidesVideo({ status: 'completed', videoPath: null })).toBe(false)
    expect(segmentProvidesVideo({ status: 'completed', videoPath: '' })).toBe(false)
  })

  it('pending / generating / error 即使有 videoPath → false', () => {
    for (const status of ['pending', 'generating', 'error']) {
      expect(segmentProvidesVideo({ status, videoPath: 'v/seg.mp4' })).toBe(false)
    }
  })

  it('superseded 即使有 videoPath → false（与导出器跳过口径一致）', () => {
    expect(segmentProvidesVideo({ status: 'superseded', videoPath: 'v/seg.mp4' })).toBe(false)
  })
})

describe('storyboardHasVideo', () => {
  const segMap: SegmentVideoMap = new Map([
    ['seg_ok', { status: 'completed', videoPath: 'v/ok.mp4' }],
    ['seg_superseded', { status: 'superseded', videoPath: 'v/old.mp4' }],
    ['seg_pending', { status: 'pending', videoPath: null }],
  ])

  it('分镜自身 videoPath 非空 → true（无需查片段）', () => {
    expect(storyboardHasVideo({ videoPath: '/v1.mp4', segmentId: null })).toBe(true)
    expect(storyboardHasVideo({ videoPath: '/v1.mp4', segmentId: 'seg_superseded' }, segMap)).toBe(true)
  })

  it('无自身 videoPath、所属片段 completed+videoPath → true', () => {
    expect(storyboardHasVideo({ videoPath: null, segmentId: 'seg_ok' }, segMap)).toBe(true)
  })

  it('所属片段 superseded / pending / 不在 Map / 无 segmentId → false', () => {
    expect(storyboardHasVideo({ videoPath: null, segmentId: 'seg_superseded' }, segMap)).toBe(false)
    expect(storyboardHasVideo({ videoPath: null, segmentId: 'seg_pending' }, segMap)).toBe(false)
    expect(storyboardHasVideo({ videoPath: null, segmentId: 'seg_ghost' }, segMap)).toBe(false)
    expect(storyboardHasVideo({ videoPath: null, segmentId: null }, segMap)).toBe(false)
  })

  it('不传 segmentsById → 退化为只看自身 videoPath', () => {
    expect(storyboardHasVideo({ videoPath: null, segmentId: 'seg_ok' })).toBe(false)
    expect(storyboardHasVideo({ videoPath: '/v1.mp4', segmentId: 'seg_ok' })).toBe(true)
  })
})
