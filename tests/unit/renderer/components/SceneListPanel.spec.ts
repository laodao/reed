// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SceneListPanel from '../../../../src/renderer/src/components/episode-production/stage-content-script-v3/SceneListPanel.vue'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const scenes = [
  {
    id: 's1',
    sceneNumber: 1,
    location: '客栈',
    timeOfDay: 'night',
    weather: null,
    characters: [{ characterId: 'c1', characterName: '张三' }],
    originalText: '',
    narration: '',
    dialogues: [],
    actions: [],
  },
  {
    id: 's2',
    sceneNumber: 2,
    location: '湖边',
    timeOfDay: 'day',
    weather: null,
    characters: [],
    originalText: '',
    narration: '',
    dialogues: [],
    actions: [],
  },
]

describe('SceneListPanel', () => {
  it('渲染场景列表 + 数量', () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [],
        locations: [],
        items: [],
        highlightedEntity: null,
        readonly: false,
      },
      ...mountOpts,
    })
    expect(w.text()).toContain('场景列表 (2)')
    expect(w.findAll('.scene-card')).toHaveLength(2)
  })

  it('点击 [+ 添加场景] / [✏ 重写] / [🔗 修复绑定] 触发对应 emit', async () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [],
        locations: [],
        items: [],
        highlightedEntity: null,
        readonly: false,
      },
      ...mountOpts,
    })
    await w.find('.btn-add-scene').trigger('click')
    expect(w.emitted('add-scene')).toBeTruthy()
    await w.find('.btn-rewrite').trigger('click')
    expect(w.emitted('rewrite-scenes')).toBeTruthy()
    await w.find('.btn-fix-bindings').trigger('click')
    expect(w.emitted('fix-bindings')).toBeTruthy()
  })

  it('展开场景 emit expand 携带 scene id', async () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [],
        locations: [],
        items: [],
        highlightedEntity: null,
        readonly: false,
      },
      ...mountOpts,
    })
    await w.findAll('.scene-header')[0].trigger('click')
    expect(w.emitted('expand')).toBeTruthy()
    expect(w.emitted('expand')![0]).toEqual(['s1'])
  })

  it('readonly 时所有 actions 按钮隐藏', () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [],
        locations: [],
        items: [],
        highlightedEntity: null,
        readonly: true,
      },
      ...mountOpts,
    })
    expect(w.find('.btn-add-scene').exists()).toBe(false)
  })

  it('highlightedEntity 命中场景加 highlighted class', () => {
    const w = mount(SceneListPanel, {
      props: {
        scenes,
        entities: [],
        characters: [{ id: 'c1', name: '张三' }],
        locations: [],
        items: [],
        highlightedEntity: { kind: 'character', name: '张三', id: 'c1' },
        readonly: false,
      },
      ...mountOpts,
    })
    const cards = w.findAll('.scene-card')
    expect(cards[0].classes()).toContain('highlighted')
    expect(cards[1].classes()).not.toContain('highlighted')
  })
})
