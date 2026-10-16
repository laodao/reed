/**
 * code 节点测试（P0 片2 + 2026-10-08 宿主桥）：
 * 沙箱执行（输入注入/return 对象）/ 超时（死循环）/ 异常 / 无 require 能力 / 目录契约
 * + 宿主桥（async 包装/墙钟超时/中止/host 计数/预算）
 * @module tests/workflow/code-node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  CODE_NODE_HANDLERS,
  runCodeInSandbox,
  runCodeInSandboxAsync,
  buildHostBridge,
} from '@core/platform/workflow/nodes/code-nodes'
import {
  registerVariableDataService,
  resetVariableDataService,
} from '@core/platform/workflow/variables/variable-data.service'
import {
  setWorkflowRuntimeParams,
  resetWorkflowRuntimeParams,
} from '@shared/utils/workflow-runtime-params'
import { WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import { NODE_TYPE_CATALOG_MAP, NODE_TYPE_CATALOG } from '@shared/types/workflow-node-catalog'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

const handler = CODE_NODE_HANDLERS[0]
const baseCtx = (config: Record<string, unknown>) =>
  ({ config, runId: 'run_1', nodeId: 'code1', signal: new AbortController().signal, logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} } }) as never

describe('code：沙箱执行', () => {
  it('非 Electron 环境（Web/测试）禁止执行 → failed（平台门禁，防服务端 RCE）', async () => {
    const r = await handler.execute(baseCtx({ language: 'js', code: 'return { sum: 1 }', inputs: [] }))
    expect(r.status).toBe('failed')
    if (r.status === 'failed') expect(r.error).toContain('桌面端')
  })

  it('runCodeInSandbox 纯函数：return 对象作为输出', async () => {
    const r = await runCodeInSandbox('return { sum: (inputs.a ?? 0) + (inputs.b ?? 0) }', { a: '2', b: '3' }, 1000)
    expect(r).toEqual({ sum: '23' })  // 模板注入值为字符串 → 字符串拼接
  })

  it('输入注入：直接引用 inputs 对象', async () => {
    const r = await runCodeInSandbox('return { len: String(inputs.name).length }', { name: 'hello' }, 1000)
    expect(r).toEqual({ len: 5 })
  })

  it('支持 JSON 处理与数组运算（数据处理场景）', async () => {
    const r = await runCodeInSandbox(
      'const arr = inputs.list ?? []; return { count: arr.length, total: arr.reduce((s, x) => s + Number(x.v ?? 0), 0) }',
      { list: [{ v: 1 }, { v: 2 }, { v: 3 }] },
      1000,
    )
    expect(r).toEqual({ count: 3, total: 6 })
  })

  it('不暴露 require / process / fs（沙箱隔离）', () => {
    expect(() => runCodeInSandbox('return typeof require', {}, 1000)).not.toThrow()
    const r = runCodeInSandbox('return { req: typeof require, proc: typeof process }', {}, 1000)
    expect(r).toEqual({ req: 'undefined', proc: 'undefined' })
  })

  it('死循环 → 超时抛错（引擎降级为 failed）', () => {
    expect(() => runCodeInSandbox('while (true) {}', {}, 200)).toThrow()
  })

  it('代码异常 → 抛错（引擎降级为 failed）', () => {
    expect(() => runCodeInSandbox('throw new Error("boom")', {}, 1000)).toThrow('boom')
  })
})

describe('code：宿主桥（async 沙箱 + 闸门）', () => {
  beforeEach(() => {
    registerVariableDataService({
      queryRowsPaged: vi.fn().mockResolvedValue({ rows: [{ id: 'r1', v: 1 }], total: 1 }),
      insertRow: vi.fn().mockResolvedValue({ tableId: 't1', rowId: 'r1' }),
      upsertRow: vi.fn().mockResolvedValue({ tableId: 't1', rowId: 'r1', action: 'inserted' }),
      updateRow: vi.fn().mockResolvedValue(undefined),
      deleteRow: vi.fn().mockResolvedValue(undefined),
    } as never)
    setWorkflowRuntimeParams({ codeSandbox: { timeoutMs: 5_000, asyncTimeoutMs: 500, maxHostCalls: 3 } })
  })
  afterEach(() => {
    resetVariableDataService()
    resetWorkflowRuntimeParams()
  })

  const asyncOpts = (over: Partial<{ syncTimeoutMs: number; wallClockMs: number; signal: AbortSignal }> = {}) => ({
    syncTimeoutMs: 1_000,
    wallClockMs: 500,
    ...over,
  })

  it('异步代码：await Promise 直出返回值（无 host 也能走异步路径）', async () => {
    const r = await runCodeInSandboxAsync('return { v: await Promise.resolve(42) }', {}, asyncOpts())
    expect(r).toEqual({ v: 42 })
  })

  it('await host.*：宿主函数结果回到代码（IO 型胶水最小闭环）', async () => {
    const host = { echo: async (x: number) => x * 2 }
    const r = await runCodeInSandboxAsync('const v = await host.echo(21); return { v }', {}, { ...asyncOpts(), host: host as never })
    expect(r).toEqual({ v: 42 })
  })

  it('墙钟超时：宿主调用慢于 wallClockMs → 抛"超时"（真实 IO 等待期间事件循环空闲、可触发）', async () => {
    const host = { slow: () => new Promise(resolve => setTimeout(() => resolve('late'), 300)) }
    await expect(
      runCodeInSandboxAsync('return { v: await host.slow() }', {}, { ...asyncOpts({ wallClockMs: 60 }), host: host as never }),
    ).rejects.toThrow(/超时/)
  })

  it('同步死循环在 async 版同样被 vm timeout 拦截', async () => {
    await expect(
      runCodeInSandboxAsync('while (true) {}', {}, asyncOpts({ syncTimeoutMs: 150 })),
    ).rejects.toThrow()
  })

  it('中止：signal 已 aborted → 抛"取消"', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      runCodeInSandboxAsync('return { v: await new Promise(r => setTimeout(r, 50)) }', {}, asyncOpts({ signal: ac.signal })),
    ).rejects.toThrow(/取消/)
  })

  it('host 计数：超过 maxHostCalls → 抛"次数超限"（防代码内循环绕开引擎循环上限）', async () => {
    const ctx = {
      config: {}, runId: 'r', definitionId: 'd1', nodeId: 'n', signal: new AbortController().signal,
      logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
    } as never
    const host = buildHostBridge(ctx)
    // maxHostCalls=3：第 4 次（query 不计预算但计数）超限
    await host.table.query({ tableName: 't' })
    await host.table.query({ tableName: 't' })
    await host.table.query({ tableName: 't' })
    await expect(host.table.query({ tableName: 't' })).rejects.toThrow(/次数超限/)
  })

  it('预算：toolBudget 耗尽 → 写操作抛"预算已耗尽"（query 不计预算不受影响）', async () => {
    const ctx = {
      config: {}, runId: 'r', definitionId: 'd1', nodeId: 'n', signal: new AbortController().signal,
      logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
      toolBudget: { max: 1, used: 1, remaining: 0, tryConsume: () => false },
    } as never
    const host = buildHostBridge(ctx)
    await expect(host.table.insert({ tableName: 't', row: {} })).rejects.toThrow(/预算/)
    await expect(host.table.query({ tableName: 't' })).resolves.toEqual([{ id: 'r1', v: 1 }])
  })

  it('中止围堵：signal aborted 后任何 host 调用立即抛错（宿主调用循环可被终止）', async () => {
    const ac = new AbortController()
    const ctx = {
      config: {}, runId: 'r', definitionId: 'd1', nodeId: 'n', signal: ac.signal,
      logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
    } as never
    const host = buildHostBridge(ctx)
    ac.abort()
    await expect(host.table.query({ tableName: 't' })).rejects.toThrow(/取消|已取消/)
  })

  it('host.table 的 app 作用域以 ctx.definitionId 为属主（与节点同语义）', async () => {
    const insertRow = vi.fn().mockResolvedValue({ tableId: 't1', rowId: 'r1' })
    registerVariableDataService({ insertRow } as never)
    const ctx = {
      config: {}, runId: 'r', definitionId: 'def_app1', nodeId: 'n', signal: new AbortController().signal,
      logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} },
      toolBudget: { max: 10, used: 0, remaining: 10, tryConsume: () => true },
    } as never
    const host = buildHostBridge(ctx)
    await host.table.insert({ tableName: 't', scope: 'app', row: { a: 1 } })
    expect(insertRow).toHaveBeenCalledWith(expect.objectContaining({ scope: 'app', ownerId: 'def_app1', tableName: 't' }))
  })
})

describe('code：validateConfig 与目录契约', () => {
  it('validateConfig：代码空 / 非 js 语言报错', () => {
    expect(handler.validateConfig({} as never)).toEqual(expect.arrayContaining([expect.stringContaining('代码')]))
    expect(handler.validateConfig({ language: 'python', code: 'x' } as never)).toEqual(expect.arrayContaining([expect.stringContaining('JavaScript')]))
    expect(handler.validateConfig({ language: 'js', code: 'return 1' } as never)).toEqual([])
  })

  it('catalog 含 code 且 requiredConfigKeys=code；超时常量存在', () => {
    const entry = NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['code']]
    expect(entry.label).toBe('代码执行')
    expect(entry.requiredConfigKeys).toEqual(['code'])
    expect(NODE_TYPE_CATALOG.some(e => e.type === 'code')).toBe(true)
    expect(WORKFLOW_LIMITS.codeTimeoutMs).toBeGreaterThan(0)
  })
})
