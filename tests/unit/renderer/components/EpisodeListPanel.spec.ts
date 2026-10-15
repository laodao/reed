// @vitest-environment happy-dom
/** EpisodeListPanel 单测：page-header + 集 grid + 占位卡 + emit 透传 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EpisodeListPanel from '../../../../src/renderer/src/components/episode-production/project-list/EpisodeListPanel.vue'
import type { VideoProject } from '../../../../src/shared/types/story-to-video.types'
import type { EpisodeWithProgress } from '../../../../src/shared/types/episode-production/episode-with-progress.types'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const project: VideoProject = {
  id: 'p1',
  name: '我的项目',
  status: 'active',
  config: {} as any,
  createdAt: 0,
  updatedAt: 0,
}

const episodes: EpisodeWithProgress[] = [
  { id: 'e1', projectId: 'p1', episodeNumber: 1, title: '回1', status: 'pending', progressPct: 0, currentStageLabel: '未开始' },
  { id: 'e2', projectId: 'p1', episodeNumber: 2, title: '回2', status: 'scripting', progressPct: 30, currentStageLabel: '剧本中' },
]

describe('EpisodeListPanel', () => {
  it('渲染 page-header（项目名 + X 集）', () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    expect(w.text()).toContain('我的项目')
    expect(w.text()).toContain('2 集')
  })

  it('集 grid + 末尾占位卡', () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    expect(w.findAllComponents({ name: 'EpisodeCard' })).toHaveLength(2)
    expect(w.find('.episode-card-new').exists()).toBe(true)
  })

  it('点击 [项目设置] 触发 settings', async () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    await w.find('.btn-settings').trigger('click')
    expect(w.emitted('settings')).toBeTruthy()
  })

  it('点击 [+ 新建剧集] 或占位卡触发 create-episode', async () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    await w.find('.btn-create-episode').trigger('click')
    expect(w.emitted('create-episode')).toBeTruthy()

    await w.find('.episode-card-new').trigger('click')
    expect(w.emitted('create-episode')).toHaveLength(2)
  })

  it('集卡 emit 透传 click / edit / delete', async () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes }, ...mountOpts })
    const cards = w.findAllComponents({ name: 'EpisodeCard' })
    await cards[0].vm.$emit('click', episodes[0])
    expect(w.emitted('open-episode')![0]).toEqual([episodes[0]])
    await cards[1].vm.$emit('edit', episodes[1])
    expect(w.emitted('edit-episode')![0]).toEqual([episodes[1]])
    await cards[0].vm.$emit('delete', episodes[0])
    expect(w.emitted('delete-episode')![0]).toEqual([episodes[0]])
  })

  it('空集列表只显示占位卡', () => {
    const w = mount(EpisodeListPanel, { props: { project, episodes: [] }, ...mountOpts })
    expect(w.findAllComponents({ name: 'EpisodeCard' })).toHaveLength(0)
    expect(w.find('.episode-card-new').exists()).toBe(true)
    expect(w.text()).toContain('0 集')
  })
})
