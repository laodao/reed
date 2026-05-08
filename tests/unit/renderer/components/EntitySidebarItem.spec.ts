// @vitest-environment happy-dom
/** EntitySidebarItem 单测：渲染 + 4 个 emit + readonly + highlight */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EntitySidebarItem from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/EntitySidebarItem.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const sample = {
  id: 'c1',
  name: '张三',
  confirmed: true,
  sourceType: 'standalone' as const,
  description: '主角',
}

describe('EntitySidebarItem', () => {
  it('渲染名称 + 场景号', () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1, 2] },
      ...mountOpts,
    })
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('(1, 2)')
  })

  it('无场景显示 (-)', () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [] },
      ...mountOpts,
    })
    expect(w.text()).toContain('(-)')
  })

  it('点击 item 触发 click emit', async () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1] },
      ...mountOpts,
    })
    await w.find('.entity-item').trigger('click')
    expect(w.emitted('click')).toBeTruthy()
  })

  it('hover 编辑/删除按钮触发对应 emit', async () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1] },
      ...mountOpts,
    })
    await w.find('.btn-edit').trigger('click')
    expect(w.emitted('edit')).toBeTruthy()
    await w.find('.btn-delete').trigger('click')
    expect(w.emitted('delete')).toBeTruthy()
  })

  it('readonly 时不显示操作按钮', () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1], readonly: true },
      ...mountOpts,
    })
    expect(w.find('.btn-edit').exists()).toBe(false)
    expect(w.find('.btn-delete').exists()).toBe(false)
  })

  it('highlighted prop 加 highlighted class', () => {
    const w = mount(EntitySidebarItem, {
      props: { entity: sample, kind: 'character', sceneNumbers: [1], highlighted: true },
      ...mountOpts,
    })
    expect(w.find('.entity-item').classes()).toContain('highlighted')
  })
})
