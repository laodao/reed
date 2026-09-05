/**
 * tool-call 节点测试（P0 片1）：校验（缺工具类型/ID）/ 执行成功映射输出 / 失败降级（可重试语义）
 * @module tests/workflow/tool-call
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@core/platform/workflow/tools/tool-registry', () => ({
  getToolService: vi.fn(),
}))

import { TOOL_NODE_HANDLERS } from '@core/platform/workflow/nodes/tool-nodes'
import { getToolService } from '@core/platform/workflow/tools/tool-registry'
import { NODE_TYPE_CATALOG_MAP, NODE_TYPE_CATALOG } from '@shared/types/workflow-node-catalog'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

const handler = TOOL_NODE_HANDLERS[0]
const svcMock = vi.mocked(getToolService)

const baseCtx = (config: Record<string, unknown>) =>
  ({ config, runId: 'run_1', nodeId: 'tool1', signal: new AbortController().signal, logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} } }) as never

describe('tool-call：validateConfig', () => {
  it('缺 toolType / 缺 toolId → 报错；合法 → 通过', () => {
    expect(handler.validateConfig({} as never)).toEqual(expect.arrayContaining([expect.stringContaining('工具类型')]))
    expect(handler.validateConfig({ toolType: 'custom' } as never)).toEqual(expect.arrayContaining([expect.stringContaining('工具')]))
    expect(handler.validateConfig({ toolType: 'custom', toolId: 'tool_1' } as never)).toEqual([])
    expect(handler.validateConfig({ toolType: 'preset', toolId: 'preset:web-search' } as never)).toEqual([])
  })
})

describe('tool-call：execute', () => {
  beforeEach(() => { svcMock.mockReset() })

  it('成功：透传执行结果到输出（status/ok/json/text/durationMs）', async () => {
    svcMock.mockReturnValue({ executeTool: vi.fn().mockResolvedValue({ status: 200, ok: true, json: { hits: [1] }, text: '{"hits":[1]}', durationMs: 42 }) } as never)
    const r = await handler.execute(baseCtx({
      toolType: 'preset', toolId: 'preset:web-search',
      params: [{ key: 'q', value: 'hello' }], credentialId: 'cred_1',
    }))
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') {
      expect(r.output).toMatchObject({ status: 200, ok: true, durationMs: 42 })
      expect(r.output.json).toMatchObject({ hits: [1] })
    }
    expect(svcMock.mock.calls[0][0]).toBeDefined()
  })

  it('失败：HTTP 错误（status=400）→ failed 且不可重试', async () => {
    svcMock.mockReturnValue({ executeTool: vi.fn().mockResolvedValue({ status: 400, ok: false, text: 'bad request', durationMs: 10 }) } as never)
    const r = await handler.execute(baseCtx({ toolType: 'custom', toolId: 'tool_1', params: [] }))
    expect(r.status).toBe('failed')
    expect(r.retryable).toBe(false)
    expect(r.error).toContain('bad request')
  })

  it('网络失败（status=0）→ failed 且可重试（走 fail 边重试语义）', async () => {
    svcMock.mockReturnValue({ executeTool: vi.fn().mockResolvedValue({ status: 0, ok: false, text: '请求失败: ECONNREFUSED', durationMs: 5 }) } as never)
    const r = await handler.execute(baseCtx({ toolType: 'custom', toolId: 'tool_1', params: [] }))
    expect(r.status).toBe('failed')
    expect(r.retryable).toBe(true)
  })
})

describe('tool-call：目录契约', () => {
  it('catalog 含 tool-call，requiredConfigKeys 覆盖 toolType+toolId', () => {
    const entry = NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['tool-call']]
    expect(entry.label).toBe('调用工具')
    expect(entry.requiredConfigKeys).toEqual(['toolType', 'toolId'])
    expect(NODE_TYPE_CATALOG.some(e => e.type === 'tool-call')).toBe(true)
  })
})
