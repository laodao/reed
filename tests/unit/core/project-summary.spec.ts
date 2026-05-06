/**
 * project-summary 单测（FU5-A1）
 *
 * 覆盖 buildProjectSummary 的聚合逻辑：
 *   episodeCount / progressPct / currentStageLabel / sourceType
 */
import { describe, it, expect } from 'vitest'
import {
  buildProjectSummary,
  episodeProgressPct,
} from '../../../src/core/modules/episode-production/workflow/project-summary'
import type {
  EpisodeStatus,
  VideoEpisode,
  VideoProject,
} from '../../../src/shared/types/episode-production'

function fakeProject(over: Partial<VideoProject> = {}): VideoProject {
  return {
    id: 'vp_1',
    name: '测试剧集',
    longWritingProjectId: undefined,
    status: 'draft',
    config: {} as any,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as VideoProject
}

function fakeEpisode(
  num: number,
  status: EpisodeStatus,
  over: Partial<VideoEpisode> = {},
): VideoEpisode {
  return {
    id: `ve_${num}`,
    projectId: 'vp_1',
    sourceType: 'uploaded',
    episodeNumber: num,
    title: `第 ${num} 集`,
    status,
    duration: 0,
    audioTracks: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as VideoEpisode
}

describe('episodeProgressPct', () => {
  it('单调递增：pending < asset_prep < scripting < storyboarding < producing < composing < completed', () => {
    const order: EpisodeStatus[] = [
      'pending',
      'asset_prep',
      'scripting',
      'storyboarding',
      'producing',
      'composing',
      'completed',
    ]
    let prev = -1
    for (const s of order) {
      const cur = episodeProgressPct(s)
      expect(cur).toBeGreaterThan(prev)
      prev = cur
    }
  })

  it('completed = 100', () => {
    expect(episodeProgressPct('completed')).toBe(100)
  })
})

describe('buildProjectSummary', () => {
  it('0 集：episodeCount=0 / progressPct=0 / currentStageLabel=null', () => {
    const s = buildProjectSummary(fakeProject(), [])
    expect(s.episodeCount).toBe(0)
    expect(s.progressPct).toBe(0)
    expect(s.currentStageLabel).toBeNull()
    expect(s.sourceType).toBe('standalone')
  })

  it('全部 completed：progressPct=100 / currentStageLabel="已完成"', () => {
    const s = buildProjectSummary(fakeProject(), [
      fakeEpisode(1, 'completed'),
      fakeEpisode(2, 'completed'),
    ])
    expect(s.episodeCount).toBe(2)
    expect(s.progressPct).toBe(100)
    expect(s.currentStageLabel).toBe('已完成')
  })

  it('混合状态：取进度最低的剧集作为 currentStageLabel', () => {
    const s = buildProjectSummary(fakeProject(), [
      fakeEpisode(1, 'completed'),
      fakeEpisode(2, 'producing'),
      fakeEpisode(3, 'pending'),
    ])
    expect(s.episodeCount).toBe(3)
    // 平均：(100 + 70 + 5) / 3 = 58.33 → 58
    expect(s.progressPct).toBe(58)
    expect(s.currentStageLabel).toBe('第 3 集 · 内容识别')
  })

  it('多剧集同进度：取 episodeNumber 较小的作为 current', () => {
    const s = buildProjectSummary(fakeProject(), [
      fakeEpisode(2, 'scripting'),
      fakeEpisode(1, 'scripting'),
    ])
    expect(s.currentStageLabel).toBe('第 1 集 · 剧本编辑')
  })

  it('longWritingProjectId 决定 sourceType=linked_lw', () => {
    const s = buildProjectSummary(
      fakeProject({ longWritingProjectId: 'lw_001' }),
      [],
    )
    expect(s.sourceType).toBe('linked_lw')
  })

  it('无 longWritingProjectId 决定 sourceType=standalone', () => {
    const s = buildProjectSummary(fakeProject(), [])
    expect(s.sourceType).toBe('standalone')
  })

  it('保留原 VideoProject 字段（id / name / config / createdAt 等）', () => {
    const p = fakeProject({ name: '江湖传', id: 'vp_999' })
    const s = buildProjectSummary(p, [fakeEpisode(1, 'asset_prep')])
    expect(s.id).toBe('vp_999')
    expect(s.name).toBe('江湖传')
  })
})
