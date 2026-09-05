/**
 * 事件类型映射表单测（10-event-system §9 前端推送行：映射表 + 双向转换 + 翻译重建）
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_RUN_EVENT_CHANNEL_TYPES,
  WORKFLOW_RUN_EVENT_TYPE_MAP,
  toRunPlatformEventType,
  toWorkflowRunEventType,
  translateRunPlatformEvent,
} from '@core/platform/services/event-system/workflow-run-event-map'
import {
  WORKFLOW_RUN_EVENT_TYPES,
  type WorkflowRunEvent,
} from '@shared/types/workflow.types'
import type { PlatformEvent } from '@shared/types/event.types'

function makePlatformEvent(type: string, payload: unknown): PlatformEvent {
  return {
    seq: 1,
    id: 'evt-1',
    userId: 'u1',
    type,
    aggregate: { kind: 'workflow_run', id: 'run-1' },
    actor: { kind: 'workflow', id: 'run-1' },
    payload,
    causationId: null,
    correlationId: 'run-1',
    occurredAt: Date.now(),
    schemaVersion: 1,
  }
}

describe('WORKFLOW_RUN_EVENT_TYPE_MAP（§9 映射表）', () => {
  it('覆盖五型判别全集（与 WORKFLOW_RUN_EVENT_TYPES 一一对应）', () => {
    const wfTypes = Object.values(WORKFLOW_RUN_EVENT_TYPES)
    expect(Object.keys(WORKFLOW_RUN_EVENT_TYPE_MAP).sort()).toEqual(wfTypes.sort())
  })

  it('五型 → 平台类型（点分层 workflow.run.* 族）', () => {
    expect(toRunPlatformEventType(WORKFLOW_RUN_EVENT_TYPES.runStatus)).toBe('workflow.run.run-status')
    expect(toRunPlatformEventType(WORKFLOW_RUN_EVENT_TYPES.nodeStatus)).toBe('workflow.run.node-status')
    expect(toRunPlatformEventType(WORKFLOW_RUN_EVENT_TYPES.nodeProgress)).toBe('workflow.run.node-progress')
    expect(toRunPlatformEventType(WORKFLOW_RUN_EVENT_TYPES.reviewRequested)).toBe('workflow.run.review-requested')
    expect(toRunPlatformEventType(WORKFLOW_RUN_EVENT_TYPES.notify)).toBe('workflow.run.notify')
  })

  it('平台类型 → 五型（逆映射完整往返）', () => {
    for (const [wfType, platformType] of Object.entries(WORKFLOW_RUN_EVENT_TYPE_MAP)) {
      expect(toWorkflowRunEventType(platformType)).toBe(wfType)
    }
  })

  it('未登记映射的平台类型返回 null（未来扩展类型不推前端）', () => {
    expect(toWorkflowRunEventType('workflow.run.review-decided')).toBeNull()
    expect(toWorkflowRunEventType('kb:document-completed')).toBeNull()
  })

  it('映射值唯一（无两个五型撞同一平台类型）', () => {
    const values = Object.values(WORKFLOW_RUN_EVENT_TYPE_MAP)
    expect(new Set(values).size).toBe(values.length)
  })

  it('通道默认订阅 workflow.run.* 族', () => {
    expect(DEFAULT_RUN_EVENT_CHANNEL_TYPES).toEqual(['workflow.run.*'])
  })
})

describe('translateRunPlatformEvent（通道翻译：重建五型载荷）', () => {
  it('重建 type 字段并与剩余载荷合并', () => {
    const event = makePlatformEvent('workflow.run.run-status', {
      runId: 'run-1',
      definitionId: 'def-1',
      status: 'running',
      stats: { totalNodes: 3, doneNodes: 1, failedNodes: 0, recoveredNodes: 0 },
    })
    expect(translateRunPlatformEvent(event)).toEqual({
      type: 'run-status',
      runId: 'run-1',
      definitionId: 'def-1',
      status: 'running',
      stats: { totalNodes: 3, doneNodes: 1, failedNodes: 0, recoveredNodes: 0 },
    } satisfies WorkflowRunEvent)
  })

  it('未登记映射类型返回 null', () => {
    expect(translateRunPlatformEvent(makePlatformEvent('workflow.run.future', {}))).toBeNull()
  })
})
