/**
 * @vitest-environment happy-dom
 *
 * 聊天消息窗口化单测（首开性能）
 *
 * 背景：Chat 页把整段历史（长会话可达数百条）一次性挂载，每条都要走 markdown 渲染 +
 * 事件绑定 + mermaid 探测，首开主线程被长任务占满。窗口化只挂载"最近 N 条"，
 * 向上滚动再增量补齐，且补齐时必须保住滚动位置（否则内容会跳动）。
 */
import { describe, it, expect } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { useMessageWindow, expandHistoryKeepingScroll } from '@/composables/useMessageWindow'

describe('useMessageWindow', () => {
  it('消息数不超过初始窗口时全部可见', () => {
    const total = ref(10)
    const w = useMessageWindow(total, { initialSize: 30, chunkSize: 30 })
    expect(w.startIndex.value).toBe(0)
    expect(w.hiddenCount.value).toBe(0)
    expect(w.canExpand.value).toBe(false)
  })

  it('长会话只暴露最近 initialSize 条', () => {
    const w = useMessageWindow(ref(200), { initialSize: 30, chunkSize: 30 })
    expect(w.startIndex.value).toBe(170)
    expect(w.hiddenCount.value).toBe(170)
    expect(w.canExpand.value).toBe(true)
  })

  it('expandHistory 每次前移一个 chunk，直到全部展开', () => {
    const w = useMessageWindow(ref(200), { initialSize: 30, chunkSize: 30 })
    expect(w.expandHistory()).toBe(30)
    expect(w.startIndex.value).toBe(140)
    expect(w.expandHistory()).toBe(30)
    expect(w.startIndex.value).toBe(110)
    for (let i = 0; i < 10; i++) w.expandHistory()
    expect(w.startIndex.value).toBe(0)
    expect(w.canExpand.value).toBe(false)
    // 已全部展开时不再返回新增
    expect(w.expandHistory()).toBe(0)
  })

  it('列表变长（流式新增）不改变已展开区间，新消息落在窗口尾部', () => {
    const total = ref(200)
    const w = useMessageWindow(total, { initialSize: 30, chunkSize: 30 })
    w.expandHistory()
    const before = w.startIndex.value
    total.value = 201
    expect(w.startIndex.value).toBe(before)
    // 新消息（第 201 条）落在可见窗口内
    const visible = Array.from({ length: total.value - w.startIndex.value }, (_, i) => w.startIndex.value + i)
    expect(visible).toContain(200)
  })

  it('列表变短（切换会话/删除）时窗口收敛，startIndex 不为负', async () => {
    const total = ref(200)
    const w = useMessageWindow(total, { initialSize: 30, chunkSize: 30 })
    total.value = 5
    await nextTick()
    expect(w.startIndex.value).toBe(0)
    expect(w.hiddenCount.value).toBe(0)
  })

  it('可用 computed 作为总数来源', () => {
    const total = computed(() => 100)
    const w = useMessageWindow(total, { initialSize: 20, chunkSize: 20 })
    expect(w.startIndex.value).toBe(80)
  })

  it('reset 回到初始窗口（切换会话语义）', async () => {
    const total = ref(200)
    const w = useMessageWindow(total, { initialSize: 30, chunkSize: 30 })
    w.expandHistory()
    expect(w.startIndex.value).toBe(170 - 30)
    w.reset()
    expect(w.startIndex.value).toBe(170)
    await nextTick()
  })
})

describe('expandHistoryKeepingScroll', () => {
  /** 构造一个"每条 100px 高"的滚动容器，可模拟补齐历史后高度增加 */
  function makeContainer(): { el: HTMLElement; addTop: (n: number) => void } {
    const el = document.createElement('div')
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true })
    document.body.appendChild(el)
    let top = 0
    // 锚点：模拟窗口首条消息
    const anchor = document.createElement('div')
    anchor.className = 'message-item'
    el.appendChild(anchor)
    Object.defineProperty(anchor, 'offsetTop', { get: () => top })
    return {
      el,
      addTop: (n: number) => { top += n },
    }
  }

  it('补齐后按锚点位移补偿 scrollTop，避免视口跳动', async () => {
    const { el, addTop } = makeContainer()
    el.scrollTop = 500

    const applied = await expandHistoryKeepingScroll(el, '.message-item', () => {
      addTop(300) // 前面插入 3 条 100px 高的历史
      return 3
    })

    expect(applied).toBe(true)
    await nextTick()
    expect(el.scrollTop).toBe(800)
  })

  it('没有可补历史时不触碰滚动位置', async () => {
    const { el } = makeContainer()
    el.scrollTop = 500
    const applied = await expandHistoryKeepingScroll(el, '.message-item', () => 0)
    expect(applied).toBe(false)
    expect(el.scrollTop).toBe(500)
  })

  it('容器为空（未挂载）时安全返回', async () => {
    const applied = await expandHistoryKeepingScroll(null, '.message-item', () => 5)
    expect(applied).toBe(true)
  })

  it('锚点缺失时不报错（极端：消息全被替换）', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const applied = await expandHistoryKeepingScroll(el, '.message-item', () => 5)
    expect(applied).toBe(true)
  })
})