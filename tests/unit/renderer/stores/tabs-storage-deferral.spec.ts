/**
 * @vitest-environment happy-dom
 *
 * tabs store 启动期存储访问单测（启动性能回归）
 *
 * 背景：渲染进程启动后**首次同步访问 sessionStorage 会长时间阻塞**（本机实测约 6s：
 * Chromium 存储后端首次拉起；全新 user-data-dir 仅 ~0.1ms，属 profile/环境相关）。
 * 原实现在 store 初始化时读 sessionStorage，导致 `app.mount()` 被卡住、首屏 6 秒不出。
 * 修复后：初始化只造默认状态（零存储访问），首次读+写推迟到首帧之后的定时器里。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const STORAGE_KEY = 'tabs:state:v1'

/** 记录存储调用顺序 */
function installStorageSpy() {
  const calls: string[] = []
  const store = new Map<string, string>()
  const spy = {
    getItem: vi.fn((k: string) => { calls.push(`get:${k}`); return store.get(k) ?? null }),
    setItem: vi.fn((k: string, v: string) => { calls.push(`set:${k}`); store.set(k, v) }),
    removeItem: vi.fn((k: string) => { calls.push(`remove:${k}`); store.delete(k) }),
    key: vi.fn(() => null),
    clear: vi.fn(() => store.clear()),
    get length() { return store.size },
  }
  Object.defineProperty(globalThis, 'sessionStorage', { value: spy, configurable: true, writable: true })
  return { calls, store, spy }
}

describe('useTabsStore 启动期存储访问', () => {
  beforeEach(() => {
    // 每个用例都要拿到"全新启动"的模块状态（store 模块内有首次访问去重标记）
    vi.resetModules()
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('store 初始化不触碰 sessionStorage（首屏不被存储阻塞）', async () => {
    const { calls, spy } = installStorageSpy()
    const { useTabsStore } = await import('@/stores/tabs')

    const tabs = useTabsStore()

    expect(spy.getItem).not.toHaveBeenCalled()
    expect(spy.setItem).not.toHaveBeenCalled()
    expect(calls).toEqual([])
    // 默认状态：仅首页一个固定标签
    expect(tabs.tabList).toHaveLength(1)
    expect(tabs.tabList[0].path).toBe('/')
    expect(tabs.activeTabPath).toBe('/')
  })

  it('首次存储访问发生在延后定时器之后，且先读后写', async () => {
    const { store, spy } = installStorageSpy()
    store.set(STORAGE_KEY, JSON.stringify({
      tabList: [
        { path: '/', title: '首页', closable: false, affixed: true },
        { path: '/chat', title: 'AI 对话', closable: true },
      ],
      activeTabPath: '/chat',
    }))
    const { useTabsStore } = await import('@/stores/tabs')
    const tabs = useTabsStore()

    // 定时器未到：仍然零存储访问
    await vi.advanceTimersByTimeAsync(100)
    expect(spy.getItem).not.toHaveBeenCalled()

    // 定时器到点：读出持久化状态并补齐到 store
    await vi.advanceTimersByTimeAsync(1500)
    expect(spy.getItem).toHaveBeenCalledWith(STORAGE_KEY)
    expect(tabs.tabList.map((t) => t.path)).toEqual(['/', '/chat'])
    expect(tabs.activeTabPath).toBe('/chat')
  })

  it('存储未就绪期间的标签变更只暂存内存，就绪后落盘一次', async () => {
    const { store, spy } = installStorageSpy()
    const { useTabsStore } = await import('@/stores/tabs')
    const tabs = useTabsStore()

    // 首屏期间用户切换了标签（存储尚未就绪）
    tabs.addTab({ path: '/chat', meta: { title: 'AI 对话' }, name: 'Chat' } as never)
    expect(spy.setItem).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1500)
    expect(spy.setItem).toHaveBeenCalled()
    const written = JSON.parse(spy.setItem.mock.calls.at(-1)![1]) as { tabList: Array<{ path: string }> }
    expect(written.tabList.map((t) => t.path)).toContain('/chat')
    void store
  })

  it('持久化数据非法时回退默认状态且不抛错', async () => {
    const { store, spy } = installStorageSpy()
    store.set(STORAGE_KEY, '{ not json')
    const { useTabsStore } = await import('@/stores/tabs')
    const tabs = useTabsStore()

    await vi.advanceTimersByTimeAsync(1500)
    expect(tabs.tabList).toHaveLength(1)
    expect(tabs.activeTabPath).toBe('/')
    expect(spy.getItem).toHaveBeenCalled()
  })

  it('标签操作（增删/关闭其它）语义保持', async () => {
    installStorageSpy()
    const { useTabsStore } = await import('@/stores/tabs')
    const tabs = useTabsStore()

    tabs.addTab({ path: '/chat', meta: { title: 'AI 对话' } } as never)
    tabs.addTab({ path: '/diary', meta: { title: '日记' } } as never)
    tabs.addTab({ path: '/chat', meta: { title: 'AI 对话' } } as never) // 重复不新增
    expect(tabs.tabList.map((t) => t.path)).toEqual(['/', '/chat', '/diary'])
    expect(tabs.activeTabPath).toBe('/chat')

    // 关闭不可关闭的首页 → 无变化
    expect(tabs.closeTab('/')).toBeNull()
    // 关闭当前激活标签（/chat）→ 回落到后一个可关闭标签
    expect(tabs.closeTab('/chat')).toBe('/diary')

    tabs.closeOtherTabs('/')
    expect(tabs.tabList.map((t) => t.path)).toEqual(['/'])
  })
})