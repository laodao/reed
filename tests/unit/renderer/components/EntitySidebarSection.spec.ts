// @vitest-environment happy-dom
/** EntitySidebarSection 单测：折叠 + 透传 emit */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EntitySidebarSection from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarSection.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const samples = [
  { id: 'c1', name: '张三', confirmed: true, sourceType: 'standalone' as const },
  { id: 'c2', name: '李四', confirmed: false, sourceType: 'linked_lw' as const },
]

describe('EntitySidebarSection', () => {
  it('显示标题 + 数量', () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: samples, scenes: [] },
      ...mountOpts,
    })
    expect(w.text()).toContain('角色')
    expect(w.text()).toContain('(2)')
  })

  it('默认展开，渲染 item 列表', () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: samples, scenes: [] },
      ...mountOpts,
    })
    expect(w.findAllComponents({ name: 'EntitySidebarItem' })).toHaveLength(2)
  })

  it('点击 header 折叠隐藏 item', async () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: samples, scenes: [] },
      ...mountOpts,
    })
    await w.find('.section-header').trigger('click')
    expect(w.findAllComponents({ name: 'EntitySidebarItem' })).toHaveLength(0)
  })

  it('空数组显示空 hint', () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: [], scenes: [] },
      ...mountOpts,
    })
    expect(w.text()).toContain('未识别到角色')
  })

  it('item 透传 click → emit click-entity 携带 EntityRef', async () => {
    const w = mount(EntitySidebarSection, {
      props: { kind: 'character', icon: '👤', title: '角色', entities: samples, scenes: [] },
      ...mountOpts,
    })
    const items = w.findAllComponents({ name: 'EntitySidebarItem' })
    await items[0].vm.$emit('click')
    expect(w.emitted('click-entity')).toBeTruthy()
    expect(w.emitted('click-entity')![0][0]).toMatchObject({ kind: 'character', name: '张三' })
  })
})
