/**
 * 工作流领域类型辅助函数测试
 * @module tests/workflow/workflow-types
 * @description handleId 编解码是编辑器（Vue Flow sourceHandle）与引擎
 *              （node_run.route_taken）双端共用的契约，必须严格往返一致。
 */
import { describe, it, expect } from 'vitest'
import {
  encodeWorkflowHandleId,
  decodeWorkflowHandleId,
  WORKFLOW_DEFAULTS,
  WORKFLOW_LIMITS,
  type WorkflowEdgeKind,
} from '@shared/types/workflow.types'

describe('handleId 编解码', () => {
  const fixedKinds: WorkflowEdgeKind[] = [
    'normal',
    'fail',
    'approve',
    'reject',
    'loop-body',
    'loop-back',
    'loop-done',
  ]

  it('固定 kind 编码往返一致', () => {
    for (const kind of fixedKinds) {
      const handleId = encodeWorkflowHandleId(kind)
      const decoded = decodeWorkflowHandleId(handleId)
      expect(decoded.kind).toBe(kind)
      expect(decoded.branchId).toBeUndefined()
    }
  })

  it('normal 编码为 out（Vue Flow 约定）', () => {
    expect(encodeWorkflowHandleId('normal')).toBe('out')
  })

  it('branch 编码携带 branchId 并可解码还原', () => {
    const handleId = encodeWorkflowHandleId('branch', 'br1')
    expect(handleId).toBe('branch:br1')
    const decoded = decodeWorkflowHandleId(handleId)
    expect(decoded.kind).toBe('branch')
    expect(decoded.branchId).toBe('br1')
  })

  it('未知 handleId 解码回退为 normal（容错）', () => {
    expect(decodeWorkflowHandleId('whatever').kind).toBe('normal')
  })

  it('branch 前缀但空 branchId 解码为 undefined（容错）', () => {
    const decoded = decodeWorkflowHandleId('branch:')
    expect(decoded.kind).toBe('branch')
    expect(decoded.branchId).toBeUndefined()
  })
})

describe('默认值与硬性上限一致性', () => {
  it('所有默认值不超过对应硬性上限', () => {
    expect(WORKFLOW_DEFAULTS.maxDurationMs).toBeLessThanOrEqual(WORKFLOW_LIMITS.maxDurationMs)
    expect(WORKFLOW_DEFAULTS.maxLoopIterations).toBeLessThanOrEqual(
      WORKFLOW_LIMITS.maxLoopIterations
    )
    expect(WORKFLOW_DEFAULTS.maxOutputChars).toBeLessThanOrEqual(WORKFLOW_LIMITS.maxOutputChars)
    expect(WORKFLOW_DEFAULTS.maxRetryCount).toBeLessThanOrEqual(WORKFLOW_LIMITS.maxRetryCount)
    expect(WORKFLOW_DEFAULTS.maxParallelNodes).toBeLessThanOrEqual(WORKFLOW_LIMITS.maxParallelNodes)
    expect(WORKFLOW_DEFAULTS.maxConcurrentRuns).toBeLessThanOrEqual(
      WORKFLOW_LIMITS.maxConcurrentRuns
    )
  })

  it('maxNodeRuns 默认 ≥ maxLoopIterations（否则合法循环被护栏误杀）', () => {
    expect(WORKFLOW_DEFAULTS.maxNodeRuns).toBeGreaterThanOrEqual(
      WORKFLOW_DEFAULTS.maxLoopIterations
    )
  })
})
