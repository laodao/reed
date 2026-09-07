/**
 * run 级 token 聚合 + 节点轨迹查询（25 号 M2 批1/批2）
 *
 * 钉死：aggregateRunTokenUsage 跨节点汇总与容错、getNodeTrajectories 的
 * 属主校验（非属主 404 语义）、端口未装配时降级返回空、scopeKey 构造形态。
 */

import { describe, it, expect } from 'vitest'
import { WorkflowRunService, aggregateRunTokenUsage } from '@core/platform/workflow/workflow-run.service'
import { runWithUserAsync } from '@core/context/user-context'
import type { WorkflowNodeRunRecord } from '@core/database/repositories/workflow-node-run.repository'

describe('aggregateRunTokenUsage', () => {
  it('跨节点汇总 usage，byNode 按节点分组，billedNodes 只计有用量节点', () => {
    const nodeRuns = [
      { nodeId: 'a', output: { answer: 'x', usage: { promptTokens: 100, completionTokens: 50, toolCalls: 3 } } },
      { nodeId: 'b', output: { usage: { promptTokens: 10, completionTokens: 5, toolCalls: 0 } } },
      { nodeId: 'c', output: { text: '非 AI 节点无 usage' } },
      { nodeId: 'd', output: { usage: { promptTokens: 0, completionTokens: 0, toolCalls: 0 } } },
    ] as unknown as WorkflowNodeRunRecord[]
    const agg = aggregateRunTokenUsage(nodeRuns)
    expect(agg.promptTokens).toBe(110)
    expect(agg.completionTokens).toBe(55)
    expect(agg.toolCalls).toBe(3)
    expect(agg.billedNodes).toBe(2)
    expect(agg.byNode.a).toEqual({ promptTokens: 100, completionTokens: 50, toolCalls: 3 })
  })

  it('畸形 usage/非对象 output 容错按 0 计（不抛错）', () => {
    const nodeRuns = [
      { nodeId: 'a', output: null },
      { nodeId: 'b', output: { usage: 'garbage' } },
      { nodeId: 'c', output: { usage: { promptTokens: 'x', completionTokens: null } } },
    ] as unknown as WorkflowNodeRunRecord[]
    const agg = aggregateRunTokenUsage(nodeRuns)
    expect(agg.promptTokens).toBe(0)
    expect(agg.billedNodes).toBe(0)
  })
})

describe('getNodeTrajectories', () => {
  /** fake getById 模拟真实 scoped 语义：仅属主可见（非属主/不存在返回 null） */
  function buildService(opts: {
    runs?: Map<string, { owner: string }>
    trajectories?: { listByScope(scopeKey: string): Promise<unknown[]> } | null
  }) {
    const rows = opts.runs ?? new Map()
    const svc = new WorkflowRunService({
      runs: {
        getById: async (id: string) => {
          const row = rows.get(id)
          const userId = (await import('@core/context/user-context')).getCurrentUserId()
          return row && row.owner === userId ? ({ id, ...row } as never) : null
        },
      } as never,
      nodeRuns: {} as never,
      definitions: {} as never,
      engine: {} as never,
      trajectories: (opts.trajectories ?? null) as never,
    })
    return svc
  }

  it('scopeKey 形态 = runId:nodeId:iterationIndex；端口未装配返回空（观测面降级）', async () => {
    const seen: string[] = []
    const svc = buildService({
      runs: new Map([['r1', { owner: 'u1' }]]),
      trajectories: { listByScope: async (k) => { seen.push(k); return [{ seq: 1 }] } },
    })
    await runWithUserAsync('u1', async () => {
      const rows = await svc.getNodeTrajectories('r1', 'n1', 2)
      expect(rows).toHaveLength(1)
    })
    expect(seen).toEqual(['r1:n1:2'])

    const degraded = buildService({ runs: new Map([['r1', { owner: 'u1' }]]) })
    await runWithUserAsync('u1', async () => {
      expect(await degraded.getNodeTrajectories('r1', 'n1', 0)).toEqual([])
    })
  })

  it('run 不存在/非属主 → 抛错（404 语义，不泄露存在性）——review D4 钉死', async () => {
    const svc = buildService({
      runs: new Map([['r1', { owner: 'u1' }]]),
      trajectories: { listByScope: async () => [] },
    })
    await runWithUserAsync('u2', async () => {
      await expect(svc.getNodeTrajectories('r1', 'n1', 0)).rejects.toThrow('不存在或无权访问')
    })
    await expect(svc.getNodeTrajectories('missing', 'n1', 0)).rejects.toThrow('不存在或无权访问')
  })
})
