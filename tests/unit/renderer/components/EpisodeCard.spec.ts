// @vitest-environment happy-dom
/** EpisodeCard 单测：渲染 + 3 个 emit 事件（click / edit / delete）+ stop propagation */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EpisodeCard from '../../../../src/renderer/src/components/episode-production/project-list/EpisodeCard.vue'
import type { EpisodeWithProgress } from '../../../../src/shared/types/episode-production/episode-with-progress.types'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const sample: EpisodeWithProgress = {
  id: 'ep-1',
  projectId: 'p-1',
  episodeNumber: 3,
  title: '决战紫禁',
  status: 'storyboarding',
  progressPct: 50,
  currentStageLabel: '分镜中',
}

describe('EpisodeCard', () => {
  it('渲染封面 + 第 X 集 · 标题 + 进度 + 阶段', () => {
    const w = mount(EpisodeCard, { props: { episode: sample }, ...mountOpts })
    expect(w.text()).toContain('第 3 集 · 决战紫禁')
    expect(w.text()).toContain('分镜中')
    const fill = w.find('.progress-fill')
    expect((fill.element as HTMLElement).style.width).toBe('50%')
  })

  it('点击卡片触发 click 事件', async () => {
    const w = mount(EpisodeCard, { props: { episode: sample }, ...mountOpts })
    await w.trigger('click')
    expect(w.emitted('click')).toBeTruthy()
    expect(w.emitted('click')![0]).toEqual([sample])
  })

  it('点击 hover 编辑按钮触发 edit，且不冒泡 click', async () => {
    const w = mount(EpisodeCard, { props: { episode: sample }, ...mountOpts })
    await w.find('.edit-btn').trigger('click')
    expect(w.emitted('edit')).toBeTruthy()
    expect(w.emitted('edit')![0]).toEqual([sample])
    expect(w.emitted('click')).toBeFalsy()
  })

  it('点击 hover 删除按钮触发 delete，且不冒泡 click', async () => {
    const w = mount(EpisodeCard, { props: { episode: sample }, ...mountOpts })
    await w.find('.delete-btn').trigger('click')
    expect(w.emitted('delete')).toBeTruthy()
    expect(w.emitted('delete')![0]).toEqual([sample])
    expect(w.emitted('click')).toBeFalsy()
  })
})
