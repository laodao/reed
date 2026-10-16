/**
 * 爬取礼貌调度器测试（节点侧共享工具）
 * @module tests/workflow/http-politeness
 * @description politeFetch：同 host 串行（默认单线程）、不同 host 可并行、
 *              请求前随机间隔、参数走配置链（默认值/上限）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { politeFetch, resetPolitenessThrottles } from '@core/platform/workflow/nodes/http-politeness'
import {
  resetWorkflowRuntimeParams,
  setWorkflowRuntimeParams,
} from '@shared/utils/workflow-runtime-params'

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

/**
 * 2026-09-13 参数设置第二轮：抓取礼貌参数从"模块常量"改为"运行时持有者"
 * （设置页「参数设置 → 工作流 → 抓取礼貌」），保存后重注入即生效。
 * 这里证明读取点真的读了持有者：不传 opts 时按注入值走。
 */
describe('politeFetch 读运行参数（设置页可调）', () => {
  beforeEach(() => resetWorkflowRuntimeParams())
  afterEach(() => resetWorkflowRuntimeParams())

  it('注入请求间隔后，不传 opts 也按注入值等待（不是内置默认的 800ms+）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })))
    setWorkflowRuntimeParams({ crawl: { delayMsMin: 20, delayMsMax: 20 } as never })
    const t0 = Date.now()
    await politeFetch('https://a.com/x')
    const elapsed = Date.now() - t0
    expect(elapsed).toBeGreaterThanOrEqual(15) // 确实等了注入的 20ms
    expect(elapsed).toBeLessThan(400) // 而不是内置默认（800~2500ms）
  })

  it('注入同站并发后，新建节流器按注入值放宽', async () => {
    const { active } = stubFetchWithTracker()
    setWorkflowRuntimeParams({ crawl: { delayMsMin: 0, delayMsMax: 0, hostConcurrency: 2 } as never })
    await Promise.all([
      politeFetch('https://a.com/1'),
      politeFetch('https://a.com/2'),
    ])
    expect(active.max).toBe(2)
  })

  it('节点 config 仍然优先于运行参数（配置链顺序不变）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })))
    setWorkflowRuntimeParams({ crawl: { delayMsMin: 500, delayMsMax: 500 } as never })
    const t0 = Date.now()
    await politeFetch('https://a.com/x', undefined, { delayMsMin: 0, delayMsMax: 0 })
    expect(Date.now() - t0).toBeLessThan(300) // 节点显式 0 → 不等
  })
})
