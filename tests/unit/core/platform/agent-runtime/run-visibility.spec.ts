/**
 * M5.5 运行可见性单测（29 号批1）
 * - AgentRunRegistry：登记/完成/租户过滤/scope 查找/abort/onChange（含监听器异常隔离）
 * - TrajectorySink onEntry：逐条外推 + 异常不影响缓冲/落库
 * - AgentTaskService.recoverInterrupted：running→ready CAS + 同 root 去重重调度
 */

import { describe, it, expect, vi } from 'vitest'
import { AgentRunRegistry, resetAgentRunRegistry } from '@core/platform/agent-runtime/runtime/run-registry'
import { TrajectorySink } from '@core/platform/agent-runtime/trajectory/sink'
import { AgentTaskService } from '@core/platform/agent-runtime/tasks/task-service'
import type { AgentTaskRepository } from '@core/database/repositories/agent-task.repository'

describe('AgentRunRegistry（29 号批1）', () => {
  it('register/finish/listRunning：登记与终态、租户过滤', () => {
    const reg = new AgentRunRegistry()
    reg.register({ id: 'r1', definitionId: 'd', scopeKey: 'dialog:a', label: 'L', userId: 'u1' })
    reg.register({ id: 'r2', definitionId: 'd', scopeKey: 'task:b', label: 'T', userId: 'u2' })
    expect(reg.listRunning()).toHaveLength(2)
    expect(reg.listRunning('u1').map((r) => r.id)).toEqual(['r1'])
    expect(reg.getByScope('task:b')?.id).toBe('r2')
    reg.finish('r1', { id: 'r1', scopeKey: 'dialog:a', status: 'done' })
    expect(reg.listRunning()).toHaveLength(1)
    // 未登记的 finish 忽略不抛
    expect(() => reg.finish('ghost', { id: 'ghost', scopeKey: 'x', status: 'error' })).not.toThrow()
  })

  it('onChange：started/finished 事件按序外推，监听器异常被隔离', () => {
    const reg = new AgentRunRegistry()
    const events: string[] = []
    reg.onChange((e) => {
      events.push(e.kind)
      throw new Error('监听器炸了')
    })
    const seen: string[] = []
    reg.onChange((e) => seen.push(e.kind))
    reg.register({ id: 'r1', definitionId: 'd', scopeKey: 's', label: 'L', userId: null })
    reg.finish('r1', { id: 'r1', scopeKey: 's', status: 'error', error: 'boom' })
    expect(events).toEqual(['started', 'finished'])
    expect(seen).toEqual(['started', 'finished'])
  })

  it('abortByScope：命中注入的 abort 闭包；租户不匹配拒绝；未登记返回 false', () => {
    const reg = new AgentRunRegistry()
    expect(reg.abortByScope('nope', null)).toBe(false)
    let aborted = 0
    reg.register({ id: 'r1', definitionId: 'd', scopeKey: 'dialog:a', label: 'L', userId: 'u1', abort: () => aborted++ })
    // 租户不匹配拒绝（review P2-3：写通道曾零租户校验）
    expect(reg.abortByScope('dialog:a', 'u2')).toBe(false)
    expect(aborted).toBe(0)
    expect(reg.abortByScope('dialog:a', 'u1')).toBe(true)
    expect(aborted).toBe(1)
  })

  it('单例 reset', () => {
    resetAgentRunRegistry()
  })
})

describe('TrajectorySink.onEntry（29 号批1）', () => {
  it('append 逐条外推；回调异常不影响缓冲与落库', async () => {
    const pushed: Array<{ scopeKey: string; kind: string }> = []
    const flushed: number[] = []
    const sink = new TrajectorySink(
      {
        appendBatch: async (entries) => {
          flushed.push(...entries.map((e) => e.seq))
        },
        maxSeq: async () => 100,
      },
      {
        scope: 'session',
        scopeKey: 'dialog:x',
        onEntry: (scopeKey, entry) => {
          if (entry.kind === 'boom') throw new Error('回调异常')
          pushed.push({ scopeKey, kind: entry.kind })
        },
      },
    )
    sink.append({ iteration: 1, kind: 'decision', payload: {} })
    sink.append({ iteration: 1, kind: 'boom', payload: {} })
    sink.append({ iteration: 1, kind: 'tool_call', payload: {} })
    await sink.flush()
    expect(pushed.map((p) => p.kind)).toEqual(['decision', 'tool_call'])
    expect(flushed).toHaveLength(3) // 回调异常的条目照常落库
  })
})

describe('AgentTaskService.recoverInterrupted（29 号批1）', () => {
  it('running→ready CAS 迁移；同 root 去重后重调度一次', async () => {
    const patched: string[] = []
    const fakeRepo = {
      listByStatusRaw: async () => [
        { id: 't1', userId: 'u1', rootId: 'root-1' },
        { id: 't2', userId: 'u1', rootId: 'root-1' },
        { id: 't3', userId: 'u2', rootId: 'root-2' },
      ],
      patchFromStatus: async (id: string) => {
        patched.push(id)
        return true
      },
    } as unknown as AgentTaskRepository
    const svc = new AgentTaskService({
      tasks: fakeRepo,
      planner: {} as never,
      verifier: {} as never,
      executors: {} as never,
    })
    const spy = vi.spyOn(svc as never, 'schedule' as never).mockResolvedValue(undefined) as unknown as vi.Mock
    const r = await svc.recoverInterrupted()
    expect(r.recovered).toBe(3)
    expect(patched).toEqual(['t1', 't2', 't3'])
    // 重调度经 recoverAsUser（动态 import + ALS 重放）异步触达——轮询等齐
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(['root-1', 'root-2'])
  })
})
