// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SceneEntityChips from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/SceneEntityChips.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

describe('SceneEntityChips', () => {
  it('渲染所有 chip', () => {
    const w = mount(SceneEntityChips, {
      props: {
        chips: [
          { kind: 'character', name: '张三', id: 'c1' },
          { kind: 'location', name: '客栈', id: 'l1' },
          { kind: 'item', name: '长剑' },
        ],
      },
      ...mountOpts,
    })
    expect(w.findAll('.entity-chip')).toHaveLength(3)
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('客栈')
    expect(w.text()).toContain('长剑')
  })

  it('点击 chip 触发 click-entity emit 携带 EntityRef', async () => {
    const w = mount(SceneEntityChips, {
      props: {
        chips: [{ kind: 'character', name: '张三', id: 'c1' }],
      },
      ...mountOpts,
    })
    await w.find('.entity-chip').trigger('click')
    expect(w.emitted('click-entity')).toBeTruthy()
    expect(w.emitted('click-entity')![0][0]).toEqual({ kind: 'character', name: '张三', id: 'c1' })
  })

  it('空列表不渲染', () => {
    const w = mount(SceneEntityChips, { props: { chips: [] }, ...mountOpts })
    expect(w.findAll('.entity-chip')).toHaveLength(0)
  })
})
