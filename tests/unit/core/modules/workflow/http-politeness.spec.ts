/**
 * 爬取礼貌调度器测试（节点侧共享工具）
 * @module tests/workflow/http-politeness
 * @description politeFetch：同 host 串行（默认单线程）、不同 host 可并行、
 *              请求前随机间隔、参数走配置链（默认值/上限）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { politeFetch, resetPolitenessThrottles } from '@core/modules/workflow/nodes/http-politeness'

beforeEach(() => {
  resetPolitenessThrottles()
  vi.unstubAllGlobals()
})

/** 造一个 fetch mock：记录调用进入/退出（用于断言串行/并行） */
function stubFetchWithTracker() {
  const active = { count: 0, max: 0 }
  const calls: Array<{ url: string; enterAt: number; exitAt: number }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const c = { url: String(url), enterAt: Date.now(), exitAt: 0 }
    active.count++
    if (active.count > active.max) active.max = active.count
    await new Promise(r => setTimeout(r, 30)) // 模拟网络耗时
    active.count--
    c.exitAt = Date.now()
    calls.push(c)
    return { ok: true, status: 200, text: async () => '' }
  }))
  return { calls, active }
}

describe('politeFetch 同站单线程', () => {
  it('同 host 并发请求串行执行（互不重叠）', async () => {
    const { calls, active } = stubFetchWithTracker()
    const noDelay = { delayMsMin: 0, delayMsMax: 0 }
    await Promise.all([
      politeFetch('https://a.com/1', undefined, noDelay),
      politeFetch('https://a.com/2', undefined, noDelay),
      politeFetch('https://a.com/3', undefined, noDelay),
    ])
    expect(active.max).toBe(1) // 同站最多 1 个在飞（单线程）
    expect(calls).toHaveLength(3)
  })

  it('不同 host 可并行（并发数 = host 数）', async () => {
    const { active } = stubFetchWithTracker()
    const noDelay = { delayMsMin: 0, delayMsMax: 0 }
    await Promise.all([
      politeFetch('https://a.com/x', undefined, noDelay),
      politeFetch('https://b.com/x', undefined, noDelay),
      politeFetch('https://c.com/x', undefined, noDelay),
    ])
    expect(active.max).toBe(3)
  })

  it('hostConcurrency 配置可放宽同站并发（上限封顶）', async () => {
    const { active } = stubFetchWithTracker()
    await Promise.all([
      politeFetch('https://a.com/1', undefined, { delayMsMin: 0, delayMsMax: 0, hostConcurrency: 2 }),
      politeFetch('https://a.com/2', undefined, { delayMsMin: 0, delayMsMax: 0, hostConcurrency: 2 }),
      politeFetch('https://a.com/3', undefined, { delayMsMin: 0, delayMsMax: 0, hostConcurrency: 2 }),
    ])
    expect(active.max).toBe(2)
  })
})

describe('politeFetch 随机间隔', () => {
  it('请求前随机等待 [min,max] 区间内', async () => {
    let last = Date.now()
    const gaps: number[] = []
    vi.stubGlobal('fetch', vi.fn(async () => {
      const now = Date.now()
      gaps.push(now - last)
      last = now
      await new Promise(r => setTimeout(r, 5))
      return { ok: true, status: 200, text: async () => '' }
    }))
    await politeFetch('https://a.com/1', undefined, { delayMsMin: 20, delayMsMax: 20 })
    await politeFetch('https://a.com/2', undefined, { delayMsMin: 20, delayMsMax: 20 })
    // 每个请求前等待 ~20ms（进入 gap 至少包含一次 20ms 等待；容忍计时抖动）
    for (const g of gaps.slice(1)) {
      expect(g).toBeGreaterThanOrEqual(15)
    }
  })

  it('delayMsMax=0 时不等待', async () => {
    const t0 = Date.now()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })))
    await politeFetch('https://a.com/x', undefined, { delayMsMin: 0, delayMsMax: 0 })
    expect(Date.now() - t0).toBeLessThan(200)
  })
})

describe('politeFetch 默认值', () => {
  it('缺省参数走 WORKFLOW_DEFAULTS（同站并发=1，有随机间隔）', async () => {
    const { active } = stubFetchWithTracker()
    await Promise.all([
      politeFetch('https://a.com/1'),
      politeFetch('https://a.com/2'),
    ])
    expect(active.max).toBe(1)
  })
})
