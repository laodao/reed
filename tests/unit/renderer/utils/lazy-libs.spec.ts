/**
 * 重型库按需加载工具（lazy-libs）单测
 *
 * 背景：html2canvas / mermaid 体积大、模块求值慢（html2canvas 单模块求值实测约 400ms），
 * 若组件顶层静态 import，会阻塞聊天页首次打开的主线程。lazy-libs 提供动态 import + 单例缓存。
 *
 * 覆盖：
 * - 返回模块 default 导出
 * - 多次调用只加载/初始化一次（单例缓存：mermaid.initialize 仅执行一次）
 * - mermaid 初始化配置（startOnLoad: false 等，与历史模块级配置一致）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted：mock 工厂被提升到 import 之前，只能引用 hoisted 变量
const mocks = vi.hoisted(() => ({
  mermaidInitialize: vi.fn(),
  mermaidRender: vi.fn(async () => ({ svg: '<svg></svg>' }))
}))

vi.mock('html2canvas', () => ({
  default: () => 'canvas'
}))

vi.mock('mermaid', () => ({
  default: {
    initialize: mocks.mermaidInitialize,
    render: mocks.mermaidRender
  }
}))

// lazy-libs 模块级单例缓存跨用例共享：每个用例重置模块注册表 + 动态 import 拿到全新状态
async function freshLazyLibs(): Promise<typeof import('../../../../src/renderer/src/utils/lazy-libs')> {
  vi.resetModules()
  return await import('../../../../src/renderer/src/utils/lazy-libs')
}

describe('lazy-libs 按需加载', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadHtml2Canvas 返回 html2canvas 默认导出（函数）', async () => {
    const libs = await freshLazyLibs()
    const h2c = await libs.loadHtml2Canvas()
    expect(typeof h2c).toBe('function')
    expect(h2c()).toBe('canvas')
  })

  it('loadHtml2Canvas 多次调用返回同一单例', async () => {
    const libs = await freshLazyLibs()
    const a = await libs.loadHtml2Canvas()
    const b = await libs.loadHtml2Canvas()
    expect(a).toBe(b)
  })

  it('loadMermaid 返回 mermaid API 对象', async () => {
    const libs = await freshLazyLibs()
    const mm = await libs.loadMermaid()
    expect(typeof mm.initialize).toBe('function')
    expect(typeof mm.render).toBe('function')
  })

  it('多次 loadMermaid 只 initialize 一次（单例缓存生效）', async () => {
    const libs = await freshLazyLibs()
    await libs.loadMermaid()
    await libs.loadMermaid()
    await libs.loadMermaid()
    expect(mocks.mermaidInitialize).toHaveBeenCalledTimes(1)
  })

  it('mermaid 初始化配置 startOnLoad=false（不自动扫描页面）', async () => {
    const libs = await freshLazyLibs()
    await libs.loadMermaid()
    expect(mocks.mermaidInitialize).toHaveBeenCalledWith(
      expect.objectContaining({
        startOnLoad: false,
        securityLevel: 'loose'
      })
    )
  })
})

describe('scheduleIdleLoad 空闲调度', () => {
  it('优先使用 requestIdleCallback 调度（带超时上限）', async () => {
    const libs = await freshLazyLibs()
    const orig = (globalThis as any).requestIdleCallback
    let captured: { cb: () => void; opts: { timeout: number } } | null = null
    ;(globalThis as any).requestIdleCallback = (cb: () => void, opts: { timeout: number }) => {
      captured = { cb, opts }
      return 1
    }
    try {
      const fn = vi.fn()
      libs.scheduleIdleLoad(fn)
      expect(captured).not.toBeNull()
      // 必须带超时上限：避免空闲迟迟不来导致加载被无限推迟
      expect(captured!.opts.timeout).toBeGreaterThan(0)
      captured!.cb()
      expect(fn).toHaveBeenCalledTimes(1)
    } finally {
      ;(globalThis as any).requestIdleCallback = orig
    }
  })

  it('无 requestIdleCallback 时回退到 setTimeout', async () => {
    const libs = await freshLazyLibs()
    const orig = (globalThis as any).requestIdleCallback
    ;(globalThis as any).requestIdleCallback = undefined
    vi.useFakeTimers()
    try {
      const fn = vi.fn()
      libs.scheduleIdleLoad(fn)
      expect(fn).not.toHaveBeenCalled()
      vi.advanceTimersByTime(200)
      expect(fn).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
      ;(globalThis as any).requestIdleCallback = orig
    }
  })
})
