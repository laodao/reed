// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import StageHeaderBar from '../../../../src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue'
import type { EpisodeStatus } from '../../../../src/shared/types/episode-production'

const MERGED_LABELS = ['内容+剧本', '资产', '分镜', '制作', '合成']

function mockEp(currentStatus: EpisodeStatus) {
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(globalThis as any).window.electronAPI = {
    episodeProduction: {
      calculateEpisodeProgress: vi.fn(async () => ({
        success: true,
        data: {
          episodeId: 'ep-1',
          currentStatus,
          stages: [
            { stage: 'pending', label: '内容', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'asset_prep', label: '资产', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'scripting', label: '剧本', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'storyboarding', label: '分镜', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'producing', label: '制作', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'composing', label: '合成', mark: '○', complete: false, progress: 0, gapCount: 0 },
          ],
          overallProgress: 0,
        },
      })),
    },
  }
}

async function mountAndGetSegs(currentStatus: EpisodeStatus) {
  mockEp(currentStatus)
  const w = mount(StageHeaderBar, {
    props: { episodeId: 'ep-1' },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w.findAll('.stage-segment')
}

describe('StageHeaderBar 合并段（6→5）', () => {
  it('渲染 5 个 segment，标签依次是 内容+剧本/资产/分镜/制作/合成', async () => {
    const segs = await mountAndGetSegs('pending')
    expect(segs).toHaveLength(5)
    segs.forEach((seg, i) => {
      expect(seg.text()).toContain(MERGED_LABELS[i])
    })
  })

  // 染色对照表（来自 spec § 2.1）
  const cases: Array<[EpisodeStatus, string[]]> = [
    ['pending',       ['stage-current',  'stage-pending',  'stage-pending',  'stage-pending',  'stage-pending']],
    ['asset_prep',    ['stage-complete', 'stage-current',  'stage-pending',  'stage-pending',  'stage-pending']],
    ['scripting',     ['stage-current',  'stage-complete', 'stage-pending',  'stage-pending',  'stage-pending']],
    ['storyboarding', ['stage-complete', 'stage-complete', 'stage-current',  'stage-pending',  'stage-pending']],
    ['producing',     ['stage-complete', 'stage-complete', 'stage-complete', 'stage-current',  'stage-pending']],
    ['composing',     ['stage-complete', 'stage-complete', 'stage-complete', 'stage-complete', 'stage-current']],
    ['completed',     ['stage-complete', 'stage-complete', 'stage-complete', 'stage-complete', 'stage-current']],
  ]

  for (const [status, expected] of cases) {
    it(`status=${status} 染色对：${expected.join(',')}`, async () => {
      const segs = await mountAndGetSegs(status)
      const actual = segs.map((s) =>
        ['stage-complete', 'stage-current', 'stage-pending'].find((c) => s.classes().includes(c)),
      )
      expect(actual).toEqual(expected)
    })
  }

  it('点击合并段 emit navigate-stage 用 pending（合并段集合 min）', async () => {
    mockEp('scripting')
    const wrapper = mount(StageHeaderBar, {
      props: { episodeId: 'ep-1' },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    await wrapper.findAll('.stage-segment')[0].trigger('click')
    expect(wrapper.emitted('navigate-stage')).toBeTruthy()
    expect(wrapper.emitted('navigate-stage')![0]).toEqual(['pending'])
  })
})
