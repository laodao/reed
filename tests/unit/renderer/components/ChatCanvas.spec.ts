// @vitest-environment happy-dom
/** ChatCanvas 滚动跟随单测：用户发送无条件拉底 / agent 消息仅吸底跟随 / 拖动即停 / 拉回恢复 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import ChatCanvas from '../../../../src/renderer/src/components/longwriting/room/ChatCanvas.vue'
import type { RoomMessageView } from '../../../../src/shared/types/story-room.types'

const mountOpts = { global: { plugins: [ElementPlus] } } as const

const baseProps = {
  streamMessage: null,
  status: 'idle',
  busy: false,
  cards: [],
  projectName: '测试作品',
}

function userMsg(content: string): RoomMessageView {
  return { role: 'user', content, timestamp: Date.now() }
}
function assistantMsg(content: string): RoomMessageView {
  return { role: 'assistant', content, timestamp: Date.now() }
}

/** happy-dom 无布局引擎：伪造滚动容器度量（scrollHeight 可增长模拟内容变高） */
function mockScroller(el: HTMLElement) {
  const m = { scrollHeight: 1000, scrollTop: 0 }
  Object.defineProperty(el, 'scrollHeight', { get: () => m.scrollHeight, configurable: true })
  Object.defineProperty(el, 'clientHeight', { get: () => 400, configurable: true })
  Object.defineProperty(el, 'scrollTop', {
    get: () => m.scrollTop,
    set: (v: number) => {
      m.scrollTop = v
    },
    configurable: true,
  })
  return m
}

/** watch(flush post) + scrollToBottom 内部 nextTick，两拍后断言 */
async function flush() {
  await nextTick()
  await nextTick()
  await new Promise((r) => requestAnimationFrame(r))
}

describe('ChatCanvas 滚动跟随', () => {
  it('用户发送消息（role=user）即使已上翻也无条件拉底', async () => {
    const w = mount(ChatCanvas, { props: { ...baseProps, messages: [] }, ...mountOpts })
    const m = mockScroller(w.find('.chat').element)
    m.scrollTop = 100
    await w.find('.chat').trigger('scroll') // 拖动上翻 → 停跟随
    w.setProps({ messages: [userMsg('加一个反派')] })
    await flush()
    expect(m.scrollTop).toBe(1000)
  })

  it('agent 消息在用户上翻阅读时不拽回', async () => {
    const w = mount(ChatCanvas, {
      props: { ...baseProps, messages: [userMsg('开场')] },
      ...mountOpts,
    })
    const m = mockScroller(w.find('.chat').element)
    m.scrollTop = 200
    await w.find('.chat').trigger('scroll') // 拖动上翻 → 停跟随
    w.setProps({ messages: [userMsg('开场'), assistantMsg('好的，聊聊这个反派')] })
    await flush()
    expect(m.scrollTop).toBe(200)
  })

  it('agent 消息在吸底跟随时自动拉底', async () => {
    const w = mount(ChatCanvas, {
      props: { ...baseProps, messages: [userMsg('开场')] },
      ...mountOpts,
    })
    const m = mockScroller(w.find('.chat').element)
    m.scrollHeight = 1400 // 内容增长，视口仍在底部（0 距离）
    w.setProps({ messages: [userMsg('开场'), assistantMsg('回复')] })
    await flush()
    expect(m.scrollTop).toBe(1400)
  })

  it('用户拖回底部后恢复跟随', async () => {
    const w = mount(ChatCanvas, {
      props: { ...baseProps, messages: [userMsg('开场')] },
      ...mountOpts,
    })
    const m = mockScroller(w.find('.chat').element)
    m.scrollTop = 100
    await w.find('.chat').trigger('scroll') // 上翻 → 停跟随
    m.scrollTop = 600 // 1000-600-400=0 → 回到底部
    await w.find('.chat').trigger('scroll')
    m.scrollHeight = 1400
    w.setProps({ messages: [userMsg('开场'), assistantMsg('回复')] })
    await flush()
    expect(m.scrollTop).toBe(1400)
  })

  it('流式增量在停跟随时不动滚动条', async () => {
    const w = mount(ChatCanvas, {
      props: { ...baseProps, messages: [userMsg('开场')], streamMessage: { content: '正', turnNo: 2 } },
      ...mountOpts,
    })
    const m = mockScroller(w.find('.chat').element)
    m.scrollTop = 200
    await w.find('.chat').trigger('scroll') // 拖动上翻 → 停跟随
    w.setProps({ streamMessage: { content: '正在生成很长的一段主编回复', turnNo: 2 } })
    await flush()
    expect(m.scrollTop).toBe(200)
  })
})
