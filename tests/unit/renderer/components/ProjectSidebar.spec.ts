// @vitest-environment happy-dom
/** ProjectSidebar 单测：列表渲染 + 选中态 + select / create / dropdown emit */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ProjectSidebar from '../../../../src/renderer/src/components/episode-production/project-list/ProjectSidebar.vue'
import type { VideoProjectSummary } from '../../../../src/shared/types/story-to-video.types'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const samples: VideoProjectSummary[] = [
  {
    id: 'p1',
    name: '项目1',
    episodeCount: 3,
    sourceType: 'standalone',
    progressPct: 0,
    currentStageLabel: null,
    status: 'active',
    config: {} as any,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'p2',
    name: '项目2',
    episodeCount: 0,
    sourceType: 'linked_lw',
    progressPct: 0,
    currentStageLabel: null,
    status: 'active',
    config: {} as any,
    createdAt: 0,
    updatedAt: 0,
  },
]

describe('ProjectSidebar', () => {
  it('渲染项目列表', () => {
    const w = mount(ProjectSidebar, { props: { projects: samples, selectedId: null }, ...mountOpts })
    expect(w.findAll('.project-item')).toHaveLength(2)
    expect(w.text()).toContain('项目1')
    expect(w.text()).toContain('项目2')
  })

  it('selectedId 命中时高亮 active', () => {
    const w = mount(ProjectSidebar, { props: { projects: samples, selectedId: 'p1' }, ...mountOpts })
    const items = w.findAll('.project-item')
    expect(items[0].classes()).toContain('active')
    expect(items[1].classes()).not.toContain('active')
  })

  it('点击项目触发 select', async () => {
    const w = mount(ProjectSidebar, { props: { projects: samples, selectedId: null }, ...mountOpts })
    await w.findAll('.project-item')[1].trigger('click')
    expect(w.emitted('select')).toBeTruthy()
    expect(w.emitted('select')![0]).toEqual([samples[1]])
  })

  it('新建按钮触发 create', async () => {
    const w = mount(ProjectSidebar, { props: { projects: samples, selectedId: null }, ...mountOpts })
    await w.find('.create-btn').trigger('click')
    expect(w.emitted('create')).toBeTruthy()
  })

  it('空列表显示空态', () => {
    const w = mount(ProjectSidebar, { props: { projects: [], selectedId: null }, ...mountOpts })
    expect(w.find('.empty-state').exists()).toBe(true)
  })
})
