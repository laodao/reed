// @vitest-environment happy-dom
/**
 * StageHeaderBar 组件单测
 *
 * 覆盖 5 个核心场景：
 * 1. episodeId 为 null 不调 IPC，渲染空态
 * 2. 渲染 6 段文字 label
 * 3. 当前/完成/未到 3 态有正确 css class
 * 4. 点击段触发 navigate-stage 事件
 * 5. expose reload() 重新拉进度
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import StageHeaderBar from '../../../../src/renderer/src/components/episode-production/workbench/StageHeaderBar.vue'

const STAGE_LABELS = ['① 内容', '② 资产', '③ 剧本', '④ 分镜', '⑤ 制作', '⑥ 合成']

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

  it('渲染 6 段文字 label', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const segs = w.findAll('.stage-segment')
    expect(segs).toHaveLength(6)
    segs.forEach((seg, i) => {
      expect(seg.text()).toContain(STAGE_LABELS[i])
    })
  })

  it('当前/完成/未到 3 态有正确 css class', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const segs = w.findAll('.stage-segment')
    expect(segs[0].classes()).toContain('stage-complete')
    expect(segs[1].classes()).toContain('stage-complete')
    expect(segs[2].classes()).toContain('stage-current')
    expect(segs[3].classes()).toContain('stage-pending')
    expect(segs[5].classes()).toContain('stage-pending')
  })

  it('点击段触发 navigate-stage 事件', async () => {
    mockEpApi('scripting')
    const w = mount(StageHeaderBar, { props: { episodeId: 'ep-1' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    await w.findAll('.stage-segment')[3].trigger('click')
    expect(w.emitted('navigate-stage')).toBeTruthy()
    expect(w.emitted('navigate-stage')![0]).toEqual(['storyboarding'])
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
