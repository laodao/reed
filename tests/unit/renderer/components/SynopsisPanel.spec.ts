// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SynopsisPanel from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/SynopsisPanel.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

describe('SynopsisPanel', () => {
  it('渲染梗概文本', () => {
    const w = mount(SynopsisPanel, {
      props: { synopsis: '@张三 在 @客栈 喝酒', entities: [], readonly: false },
      ...mountOpts,
    })
    expect(w.text()).toContain('张三')
  })

  it('梗概为空显示提示', () => {
    const w = mount(SynopsisPanel, {
      props: { synopsis: '', entities: [], readonly: false },
      ...mountOpts,
    })
    expect(w.text()).toContain('梗概为空')
  })

  it('点击 [✨ 重新生成] 触发 regenerate emit', async () => {
    const w = mount(SynopsisPanel, {
      props: { synopsis: 'x', entities: [], readonly: false },
      ...mountOpts,
    })
    await w.find('.btn-regen').trigger('click')
    expect(w.emitted('regenerate')).toBeTruthy()
  })

  it('readonly 时不显示 [重新生成]', () => {
    const w = mount(SynopsisPanel, {
      props: { synopsis: 'x', entities: [], readonly: true },
      ...mountOpts,
    })
    expect(w.find('.btn-regen').exists()).toBe(false)
  })
})
