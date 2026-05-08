// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EntitySidebar from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebar.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

describe('EntitySidebar', () => {
  it('渲染三个 section', () => {
    const w = mount(EntitySidebar, {
      props: {
        characters: [{ id: 'c1', name: '张三' }],
        locations: [{ id: 'l1', name: '客栈' }],
        items: [{ id: 'i1', name: '长剑' }],
        scenes: [],
        highlightedEntity: null,
        highlightedSceneId: null,
      },
      ...mountOpts,
    })
    expect(w.findAllComponents({ name: 'EntitySidebarSection' })).toHaveLength(3)
    expect(w.text()).toContain('角色')
    expect(w.text()).toContain('地点')
    expect(w.text()).toContain('物品')
  })

  it('section emit click-entity 透传到外', async () => {
    const w = mount(EntitySidebar, {
      props: {
        characters: [{ id: 'c1', name: '张三' }],
        locations: [],
        items: [],
        scenes: [],
        highlightedEntity: null,
        highlightedSceneId: null,
      },
      ...mountOpts,
    })
    const sections = w.findAllComponents({ name: 'EntitySidebarSection' })
    await sections[0].vm.$emit('click-entity', { kind: 'character', name: '张三', id: 'c1' })
    expect(w.emitted('click-entity')).toBeTruthy()
    expect(w.emitted('click-entity')![0][0]).toEqual({ kind: 'character', name: '张三', id: 'c1' })
  })
})
