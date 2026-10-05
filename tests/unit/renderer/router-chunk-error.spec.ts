/**
 * @vitest-environment happy-dom
 *
 * router 懒加载失败兜底单测（2026-10-05）
 *
 * 背景：视图 chunk 拉取失败（依赖/工具链升级后陈旧 vite 缓存的典型症状）时，
 * vue-router 静默中止导航，用户看到"点菜单没反应"。router/index.ts 挂了 onError：
 * 首次失败 → 记目标 hash + 整页 reload；10s 内重复失败 → 只提示，防死循环。
 *
 * 用真实导航触发：注册一个加载即失败的懒加载路由（同用户侧动态导入失败的错误形态）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map<string, string>()
const reload = vi.fn()

vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})
// happy-dom 的 location 字段只读——整体替换为可观察的假 location
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload, hash: '' },
  configurable: true,
  writable: true,
})

const CHUNK_FAIL = () =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module: http://x/src/views/KnowledgeBase.vue'))

async function pushBoom(): Promise<void> {
  const { default: router } = await import('@/router')
  router.addRoute({ path: '/__boom', component: CHUNK_FAIL })
  await router.push('/__boom').catch(() => { /* 导航失败即被测对象 */ })
}

describe('router 懒加载失败兜底', () => {
  beforeEach(() => {
    store.clear()
    reload.mockClear()
    window.location.hash = ''
  })

  it('首次动态导入失败 → 记录目标 hash 并整页 reload（自动重试）', async () => {
    await pushBoom()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('/__boom')
    expect(store.get('router:chunk-reload-at')).toBeTruthy()
  })

  it('10s 内重复失败 → 不再 reload（防死循环），交由提示兜底', async () => {
    await pushBoom()
    await pushBoom()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('非动态导入类错误不触发 reload', async () => {
    const { default: router } = await import('@/router')
    router.addRoute({
      path: '/__boom2',
      component: () => Promise.reject(new Error('some other navigation error')),
    })
    await router.push('/__boom2').catch(() => {})

    expect(reload).not.toHaveBeenCalled()
  })
})
