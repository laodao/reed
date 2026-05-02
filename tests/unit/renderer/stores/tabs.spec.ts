/**
 * tabs store 持久化单测
 *
 * 验证 sessionStorage hydrate / persist + 边界容错。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const STORAGE_KEY = 'tabs:state:v1'

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
  // 清模块缓存，让 store 工厂重新读 sessionStorage
  vi.resetModules()
  return await import('../../../../src/renderer/src/stores/tabs')
}

describe('stores/tabs · 持久化', () => {
  beforeEach(() => {
    ;(globalThis as any).sessionStorage = createMemoryStorage()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    delete (globalThis as any).sessionStorage
  })

  it('sessionStorage 为空时使用默认 [首页]', async () => {
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
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
    expect(s.activeTabPath).toBe('/')
  })

  it('sessionStorage JSON 损坏时落回默认值，不抛异常', async () => {
    sessionStorage.setItem(STORAGE_KEY, '{not json')
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    expect(s.tabList).toHaveLength(1)
    expect(s.tabList[0].path).toBe('/')
    expect(s.activeTabPath).toBe('/')
  })

  it('addTab 之后 sessionStorage 同步写入', async () => {
    const { useTabsStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useTabsStore()
    s.addTab({
      path: '/chat', name: 'AI 对话',
      meta: { title: 'AI 对话' }, matched: [],
      fullPath: '/chat', hash: '', params: {}, query: {}, redirectedFrom: null,
    } as any)
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
    // 让 setItem 抛错
    ;(globalThis as any).sessionStorage.setItem = () => { throw new Error('quota') }
    expect(() => s.addTab({
      path: '/chat', name: 'AI 对话',
      meta: { title: 'AI 对话' }, matched: [],
      fullPath: '/chat', hash: '', params: {}, query: {}, redirectedFrom: null,
    } as any)).not.toThrow()
    expect(s.tabList.map(t => t.path)).toEqual(['/', '/chat'])
  })
})
