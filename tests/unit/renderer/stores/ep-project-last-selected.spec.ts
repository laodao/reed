import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const STORAGE_KEY = 'ep-production:last-selected-project'

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

async function freshStore() {
  vi.resetModules()
  return await import('../../../../src/renderer/src/stores/episode-production/project.store')
}

describe('ep-project store · lastSelectedProjectId 持久化', () => {
  beforeEach(() => {
    ;(globalThis as any).localStorage = createMemoryStorage()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    delete (globalThis as any).localStorage
  })

  it('localStorage 为空时初始 lastSelectedProjectId = null', async () => {
    const { useEpProjectStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useEpProjectStore()
    expect(s.lastSelectedProjectId).toBeNull()
  })

  it('setLastSelectedProjectId 写入并持久化', async () => {
    const { useEpProjectStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useEpProjectStore()
    s.setLastSelectedProjectId('proj-1')
    expect(s.lastSelectedProjectId).toBe('proj-1')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('proj-1')
  })

  it('从 localStorage hydrate', async () => {
    localStorage.setItem(STORAGE_KEY, 'proj-x')
    const { useEpProjectStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useEpProjectStore()
    expect(s.lastSelectedProjectId).toBe('proj-x')
  })

  it('setLastSelectedProjectId(null) 清除持久化', async () => {
    localStorage.setItem(STORAGE_KEY, 'proj-x')
    const { useEpProjectStore } = await freshStore()
    setActivePinia(createPinia())
    const s = useEpProjectStore()
    s.setLastSelectedProjectId(null)
    expect(s.lastSelectedProjectId).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
