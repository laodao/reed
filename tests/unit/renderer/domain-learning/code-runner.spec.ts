/**
 * 讲义 JS 代码运行测试（code-runner）
 * @module tests/unit/renderer/domain-learning/code-runner.spec
 *
 * 用户需求（2026-09-12）：「代码能不能做到在线运行看结果」。
 * 钉死（可在无 Worker 的测试环境验证的部分）：
 * - Worker 源码拼装：片段内联（**不需要 eval**）、console 捕获、网络 API 被遮蔽为 undefined、
 *   异常被捕获并回报、结束时回报 done；
 * - 输出裁剪：限行/限长 + 截断提示；
 * - 环境不支持（happy-dom 无 Worker）→ 返回可读错误而不是抛错。
 */

import { describe, it, expect } from 'vitest'
import {
  RUN_LIMITS,
  buildRunnerWorkerSource,
  canRunInWorker,
  runJsSnippet,
  trimOutput,
} from '../../../../src/renderer/src/views/domain-learning/code-runner'

describe('buildRunnerWorkerSource（沙箱源码拼装）', () => {
  const src = buildRunnerWorkerSource('console.log(1 + 1)')

  it('把片段内联进 Worker 顶层代码（不依赖 eval / new Function）', () => {
    expect(src).toContain('console.log(1 + 1)')
    expect(src).not.toContain('eval(')
    expect(src).not.toContain('new Function')
  })

  it('console 被替换为 postMessage 上报（log/info/debug→log，warn/error 分级）', () => {
    expect(src).toContain("__post('log'")
    expect(src).toContain("__post('warn'")
    expect(src).toContain("__post('error'")
  })

  it('网络与宿主 API 被遮蔽（fetch/XHR/WebSocket/EventSource/importScripts/Worker/document/window）', () => {
    for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'document', 'window']) {
      expect(src).toContain(api)
    }
    // 以函数参数形式遮蔽为 undefined（片段里拿不到）
    expect(src).toMatch(/\(__console, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined\)/)
  })

  it('异常被捕获并回报 throw，随后必报 done（保证主线程能收尾）', () => {
    expect(src).toContain("__post('throw'")
    expect(src).toContain("__post('done', null)")
    expect(src).toContain('} finally {')
  })

  it('值格式化：数组按 [1, 2] 展示、循环引用不炸、Error 带名字', () => {
    expect(src).toContain('function __fmt')
    expect(src).toContain("'[Circular]'")
    expect(src).toContain('v.name + ')
  })
})

describe('trimOutput（输出裁剪）', () => {
  it('正常输出原样返回', () => {
    expect(trimOutput(['a', 'b'], { maxLines: 10, maxLineChars: 10 })).toEqual({ lines: ['a', 'b'], truncated: false })
  })

  it('超行数：保留前 N 行 + 提示还有多少行', () => {
    const r = trimOutput(['1', '2', '3', '4'], { maxLines: 2, maxLineChars: 10 })
    expect(r.lines[0]).toBe('1')
    expect(r.lines[1]).toBe('2')
    expect(r.lines[2]).toContain('还有 2 行输出未显示')
    expect(r.truncated).toBe(true)
  })

  it('超行宽：截断并标注本行已截断', () => {
    const r = trimOutput(['x'.repeat(50)], { maxLines: 10, maxLineChars: 10 })
    expect(r.lines[0]).toBe(`${'x'.repeat(10)}…（本行已截断）`)
    expect(r.truncated).toBe(true)
  })

  it('默认护栏：200 行 / 每行 400 字', () => {
    expect(RUN_LIMITS.maxLines).toBe(200)
    expect(RUN_LIMITS.maxLineChars).toBe(400)
  })
})

describe('runJsSnippet（环境不支持时给可读错误，不抛错）', () => {
  it('happy-dom 无 Worker → ok=false + 可读错误（界面会显示「需要在应用界面里运行」）', async () => {
    if (canRunInWorker()) return // 若环境支持则跳过该断言（本单测环境不支持）
    const r = await runJsSnippet('console.log(1)')
    expect(r.ok).toBe(false)
    expect(r.output).toEqual([])
    expect(r.error).toContain('不支持运行代码')
    expect(r.durationMs).toBeGreaterThanOrEqual(0)
  })
})
