/**
 * sub-workflow 节点测试（P0 片3）：校验 / startRun 透传 / skipped 报错 / 终态取结果 / 失败透传 / 目录契约
 * @module tests/workflow/sub-workflow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@core/modules/workflow/run-service-access', () => ({
  getRunServiceAccess: vi.fn(),
}))

import { SUB_WORKFLOW_NODE_HANDLERS } from '@core/modules/workflow/nodes/sub-workflow-nodes'
import { getRunServiceAccess } from '@core/modules/workflow/run-service-access'
import { NODE_TYPE_CATALOG_MAP, NODE_TYPE_CATALOG } from '@shared/types/workflow-node-catalog'
import { WORKFLOW_NODE_TYPES } from '@shared/types/workflow.types'

const handler = SUB_WORKFLOW_NODE_HANDLERS[0]
const accessMock = vi.mocked(getRunServiceAccess)

const baseCtx = (config: Record<string, unknown>) =>
  ({ config, runId: 'run_parent', nodeId: 'sub1', signal: new AbortController().signal, logger: { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} } }) as never

function makeRunService(over: Record<string, unknown> = {}) {
  const runService = {
    startRun: vi.fn(async () => ({ id: 'run_sub', status: 'running' })),
    getRunDetail: vi.fn(),
    ...over,
  }
  accessMock.mockReturnValue(runService as never)
  return runService
}

describe('sub-workflow：validateConfig', () => {
  it('缺 definitionId 报错；有值通过', () => {
    expect(handler.validateConfig({} as never)).toEqual(expect.arrayContaining([expect.stringContaining('子工作流')]))
    expect(handler.validateConfig({ definitionId: 'wfdef_x' } as never)).toEqual([])
  })
})

describe('sub-workflow：execute', () => {
  beforeEach(() => { accessMock.mockReset() })

  it('startRun 透传（triggerType=subflow + usePublishedGraph + 父 runId）并输出子运行结果', async () => {
    const runService = makeRunService({
      getRunDetail: vi.fn().mockResolvedValueOnce({ run: { status: 'running' }, nodeRuns: [] })
        .mockResolvedValueOnce({ run: { status: 'succeeded' }, nodeRuns: [{ nodeType: 'message', output: { content: '子流程完成' } }] }),
    })
    const r = await handler.execute(baseCtx({ definitionId: 'wfdef_sub', inputs: [{ key: 'q', value: 'hi' }] }))
    expect(r.status).toBe('succeeded')
    if (r.status === 'succeeded') {
      expect(r.output).toMatchObject({ runId: 'run_sub', status: 'succeeded', result: '子流程完成' })
    }
    expect(runService.startRun).toHaveBeenCalledWith(expect.objectContaining({
      definitionId: 'wfdef_sub',
      triggerType: 'subflow',
      inputs: { q: 'hi' },
      usePublishedGraph: true,
      triggerInfo: expect.objectContaining({ source: 'subflow', parentRunId: 'run_parent' }),
    }))
  })

  it('子运行 skipped（互斥）→ failed 不重试', async () => {
    makeRunService({ startRun: vi.fn(async () => ({ id: 'r', status: 'skipped', skipReason: '已有运行' })) })
    const r = await handler.execute(baseCtx({ definitionId: 'wfdef_sub', inputs: [] }))
    expect(r.status).toBe('failed')
    expect(r.retryable).toBe(false)
    expect(r.error).toContain('运行中')
  })

  it('子运行终态 failed → 节点 failed（错误透传）', async () => {
    makeRunService({
      getRunDetail: vi.fn().mockResolvedValue({ run: { status: 'failed', error: '子流程炸了' }, nodeRuns: [] }),
    })
    const r = await handler.execute(baseCtx({ definitionId: 'wfdef_sub', inputs: [] }))
    expect(r.status).toBe('failed')
    expect(r.error).toContain('子流程炸了')
  })

  it('超时（getRunDetail 一直 running）→ failed', async () => {
    makeRunService({
      getRunDetail: vi.fn().mockResolvedValue({ run: { status: 'running' }, nodeRuns: [] }),
    })
    const started = Date.now()
    const r = await handler.execute(baseCtx({ definitionId: 'wfdef_sub', inputs: [], timeoutMs: 80 }))
    expect(Date.now() - started).toBeGreaterThanOrEqual(70)
    expect(r.status).toBe('failed')
    expect(r.error).toContain('超时')
  })
})

describe('sub-workflow：目录契约', () => {
  it('catalog 含 sub-workflow 且 requiredConfigKeys=definitionId', () => {
    const entry = NODE_TYPE_CATALOG_MAP[WORKFLOW_NODE_TYPES['sub-workflow']]
    expect(entry.label).toBe('子工作流')
    expect(entry.requiredConfigKeys).toEqual(['definitionId'])
    expect(NODE_TYPE_CATALOG.some(e => e.type === 'sub-workflow')).toBe(true)
  })
})
