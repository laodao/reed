/**
 * tabs store 持久化单测
 *
 * 验证 sessionStorage hydrate / persist + 边界容错。
 *
 * ️ 2026-09-16 变更（启动性能）：hydrate 与首次 persist **不再同步发生**。
 * 实测渲染进程首次同步访问 sessionStorage 会阻塞约 6s（Chromium 存储后端首次拉起，
 * 新 user-data-dir 仅 ~0.1ms → 属 profile/环境相关），而 store 是在布局组件 setup 里
 * 实例化的，同步访问会把 `app.mount()` 一起卡住、首屏 6 秒不出。
 * 因此：初始化只造默认状态（零存储访问），读写推迟到 `DEFERRED_STORAGE_DELAY_MS`
 * 之后的定时器里。本用例用假定时器推进这一刻，其余语义（hydrate 校验/补首页/
 * activeTabPath 回退/损坏容错/写盘内容）保持不变。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const STORAGE_KEY = 'tabs:state:v1'
/** 与实现里的首次存储访问延后时长保持一致 */
const DEFER_MS = 1500

function createMemoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size },
  } as Storage
}

async function freshStore(): Promise<typeof import('../../../../src/renderer/src/stores/tabs')> {
  // 清模块缓存，让 store 工厂重新走一遍"首次访问"安排
  vi.resetModules()
  return await import('../../../../src/renderer/src/stores/tabs')
}

/** 推进到首次存储访问之后（hydrate + 首次落盘都已完成） */
async function settleStorage(): Promise<void> {
  await vi.advanceTimersByTimeAsync(DEFER_MS)
  await nextTick()
}

const chatRoute = {
  path: '/chat', name: 'AI 对话',
  meta: { title: 'AI 对话' }, matched: [],
  fullPath: '/chat', hash: '', params: {}, query: {}, redirectedFrom: null,
} as any

describe('stores/tabs · 持久化', () => {
  beforeEach(() => {
    ;(globalThis as any).sessionStorage = createMemoryStorage()
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as any).sessionStorage
  })

  it('初始化不访问 sessionStorage（首屏不被存储阻塞）', async () => {
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const spy = vi.spyOn(globalThis.sessionStorage, 'getItem')
    const s = useTabsStore()
    expect(spy).not.toHaveBeenCalled()
    expect(s.tabList).toHaveLength(1)
  })

  it('sessionStorage 为空时使用默认 [首页]', async () => {
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    await settleStorage()
    expect(s.tabList).toHaveLength(1)
    expect(s.tabList[0].path).toBe('/')
    expect(s.activeTabPath).toBe('/')
  })

  it('能从 sessionStorage hydrate 出完整列表与激活项', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabList: [
        { path: '/', title: '首页', closable: false, affixed: true },
        { path: '/chat', title: 'AI 对话', closable: true },
      ],
      activeTabPath: '/chat',
    }))
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    await settleStorage()
    expect(s.tabList.map(t => t.path)).toEqual(['/', '/chat'])
    expect(s.activeTabPath).toBe('/chat')
  })

  it('hydrate 数据缺「首页」时自动补回到列表头部', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabList: [{ path: '/chat', title: 'AI 对话', closable: true }],
      activeTabPath: '/chat',
    }))
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    await settleStorage()
    expect(s.tabList[0].path).toBe('/')
    expect(s.tabList).toHaveLength(2)
  })

  it('hydrate 出来的 activeTabPath 不在列表里时回退到 /', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabList: [
        { path: '/', title: '首页', closable: false, affixed: true },
        { path: '/chat', title: 'AI 对话', closable: true },
      ],
      activeTabPath: '/nonexistent',
    }))
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    await settleStorage()
    expect(s.activeTabPath).toBe('/')
  })

  it('sessionStorage JSON 损坏时落回默认值，不抛异常', async () => {
    sessionStorage.setItem(STORAGE_KEY, '{not json')
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    await settleStorage()
    expect(s.tabList).toHaveLength(1)
    expect(s.tabList[0].path).toBe('/')
    expect(s.activeTabPath).toBe('/')
  })

  it('hydrate 之前用户已开标签：不会被恢复结果丢掉', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabList: [
        { path: '/', title: '首页', closable: false, affixed: true },
        { path: '/diary', title: '日记', closable: true },
      ],
      activeTabPath: '/diary',
    }))
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    // 首屏期间（存储未就绪）用户切到 AI 对话
    s.addTab(chatRoute)
    await settleStorage()
    expect(s.tabList.map(t => t.path)).toEqual(['/', '/diary', '/chat'])
    expect(s.activeTabPath).toBe('/chat')
  })

  it('存储就绪后 addTab 立即写入 sessionStorage', async () => {
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    await settleStorage()

    s.addTab(chatRoute)
    await nextTick()
    const raw = sessionStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.tabList.map((t: any) => t.path)).toEqual(['/', '/chat'])
    expect(parsed.activeTabPath).toBe('/chat')
  })

  it('closeTab 后 sessionStorage 同步更新', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabList: [
        { path: '/', title: '首页', closable: false, affixed: true },
        { path: '/chat', title: 'AI 对话', closable: true },
      ],
      activeTabPath: '/chat',
    }))
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    await settleStorage()

    s.closeTab('/chat')
    await nextTick()
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)
    expect(parsed.tabList.map((t: any) => t.path)).toEqual(['/'])
    expect(parsed.activeTabPath).toBe('/')
  })

  it('sessionStorage.setItem 抛错时 store 行为不受影响', async () => {
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    await settleStorage()
    // 让 setItem 抛错
    ;(globalThis as any).sessionStorage.setItem = () => { throw new Error('quota') }
    expect(() => s.addTab(chatRoute)).not.toThrow()
    expect(s.tabList.map(t => t.path)).toEqual(['/', '/chat'])
  })
})