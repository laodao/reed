// @vitest-environment happy-dom
/**
 * StageHeaderBar 组件单测
 *
 * 覆盖 3 个通用场景（染色 × 多状态用例在 StageHeaderBar-merged.spec.ts）：
 * 1. episodeId 为 null 不调 IPC，渲染空态
 * 2. 渲染 5 个合并段，标签依次是 内容+剧本/资产/分镜/制作/合成
 * 3. expose reload() 重新拉进度
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import StageHeaderBar from '../../../../src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue'

const MERGED_LABELS = ['内容+剧本', '资产', '分镜', '制作', '合成']

function mockEpApi(currentStatus: string) {
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(globalThis as any).window.electronAPI = {
    episodeProduction: {
      calculateEpisodeProgress: vi.fn(async () => ({
        success: true,
        data: {
          episodeId: 'ep-1',
          currentStatus,
          stages: [
            { stage: 'pending', label: '内容', mark: '✓', complete: true, progress: 1, gapCount: 0 },
            { stage: 'asset_prep', label: '资产', mark: '✓', complete: true, progress: 1, gapCount: 0 },
            { stage: 'scripting', label: '剧本', mark: '●', complete: false, progress: 0, gapCount: 2 },
            { stage: 'storyboarding', label: '分镜', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'producing', label: '制作', mark: '○', complete: false, progress: 0, gapCount: 0 },
            { stage: 'composing', label: '合成', mark: '○', complete: false, progress: 0, gapCount: 0 },
          ],
          overallProgress: 0.33,
        },
      })),
    },
  }
}

describe('StageHeaderBar', () => {
  it('episodeId 为 null 不调 IPC，渲染空态', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: null }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.findAll('.stage-segment')).toHaveLength(0)
  })

  it('渲染 5 个合并段，标签依次是 内容+剧本/资产/分镜/制作/合成', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const segs = w.findAll('.stage-segment')
    expect(segs).toHaveLength(5)
    segs.forEach((seg, i) => {
      expect(seg.text()).toContain(MERGED_LABELS[i])
    })
  })

  it('status=scripting 时：内容+剧本=current, 资产=complete, 其余=pending', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const segs = w.findAll('.stage-segment')
    // scripting 属于 内容+剧本 段 → current
    expect(segs[0].classes()).toContain('stage-current')
    // asset_prep 段 ord=1 < scripting ord=2 且不在段内 → complete
    expect(segs[1].classes()).toContain('stage-complete')
    // 分镜/制作/合成 ord > scripting ord（但 scripting 不在其段内且 cur<minOrd） → pending
    expect(segs[2].classes()).toContain('stage-pending')
    expect(segs[3].classes()).toContain('stage-pending')
    expect(segs[4].classes()).toContain('stage-pending')
  })

  it('expose reload() 重新拉进度', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const apiSpy = (window as any).electronAPI.episodeProduction.calculateEpisodeProgress
    apiSpy.mockClear()
    ;(w.vm as any).reload()
    await flushPromises()
    expect(apiSpy).toHaveBeenCalledTimes(1)
  })
})
