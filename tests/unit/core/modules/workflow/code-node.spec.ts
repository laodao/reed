/**
 * code 节点测试（P0 片2）：沙箱执行（输入注入/return 对象）/ 超时（死循环）/ 异常 / 无 require 能力 / 目录契约
 * @module tests/workflow/code-node
 */
import { describe, it, expect } from 'vitest'

import { CODE_NODE_HANDLERS, runCodeInSandbox } from '@core/modules/workflow/nodes/code-nodes'
import { WORKFLOW_LIMITS } from '@shared/types/workflow.types'
import { NODE_TYPE_CATALOG_MAP, NODE_TYPE_CATALOG } from '@shared/types/workflow-node-catalog'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

const handler = CODE_NODE_HANDLERS[0]
const baseCtx = (config: Record<string, unknown>) =>
  ({ config, runId: 'run_1', nodeId: 'code1', signal: new AbortController().signal, logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} } }) as never

describe('code：沙箱执行', () => {
  it('基础计算：return 对象作为输出', async () => {
    const r = await handler.execute(baseCtx({ language: 'js', code: 'return { sum: (inputs.a ?? 0) + (inputs.b ?? 0) }', inputs: [{ key: 'a', value: '2' }, { key: 'b', value: '3' }] }))
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') expect(r.output.result).toEqual({ sum: '23' })  // 模板注入值为字符串 → 字符串拼接
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
