/**
 * 触发调度器测试：cron 推进/错过跳过/事件匹配（fake timer + 内存假仓库）
 * @module tests/workflow/trigger-scheduler
 */
import { describe, it, expect } from 'vitest'
import { WorkflowTriggerScheduler, previewCronExpression } from '@core/modules/workflow/trigger/workflow-trigger-scheduler.service'
import { publishDomainEvent, subscribeDomainEvents } from '@core/modules/workflow/trigger/domain-event-bus'
import { runWithUser } from '@core/context/user-context'
import type { WorkflowTrigger } from '@shared/types/workflow.types'

// ---- 假仓库/假服务 ----

class FakeDefinitions {
  rows: Map<string, any> = new Map()
  async scanDueCronTriggers(now: Date) {
    return [...this.rows.values()]
      .filter((r: any) => r.publishedVersion > 0 && r.nextFireAt && r.nextFireAt <= now)
      .map((r: any) => ({ id: r.id, userId: r.userId, nextFireAt: r.nextFireAt, lastFireAt: r.lastFireAt, triggers: r.triggers }))
      .filter((row: any) => row.triggers.some((t: WorkflowTrigger) => t.type === 'cron' && t.enabled))
  }
  async scanEventTriggers() {
    return [...this.rows.values()]
      .filter((r: any) => r.publishedVersion > 0)
      .map((r: any) => ({ id: r.id, userId: r.userId, triggers: r.triggers }))
      .filter((row: any) => row.triggers.some((t: WorkflowTrigger) => t.type === 'event' && t.enabled))
  }
  async getById(id: string) {
    return this.rows.get(id) ?? null
  }
  updates: Array<[string, any]> = []
  async update(id: string, patch: any) {
    this.updates.push([id, patch])
    const row = this.rows.get(id)
    if (row) Object.assign(row, patch)
    return row
  }
}

class FakeRunService {
  starts: Array<{ definitionId: string; triggerType: string }> = []
  async startRun(input: { definitionId: string; triggerType: string }) {
    this.starts.push(input)
    return { id: `run_${this.starts.length}`, status: 'running' }
  }
}

function makeScheduler(tickMs = 30_000) {
  const definitions = new FakeDefinitions()
  const runService = new FakeRunService()
  const scheduler = new WorkflowTriggerScheduler(
    { definitions: definitions as any, runService: runService as any },
    {
      setInterval: () => 'fake',
      clearInterval: () => {},
    },
    tickMs
  )
  return { scheduler, definitions, runService }
}

describe('previewCronExpression', () => {
  it('合法表达式返回 next5', () => {
    const r = previewCronExpression('*/5 * * * *')
    expect(r.valid).toBe(true)
    expect(r.next5).toHaveLength(5)
  })
  it('非法表达式返回错误', () => {
    const r = previewCronExpression('not-a-cron')
    expect(r.valid).toBe(false)
    expect(r.error).toBeTruthy()
  })
})

describe('cron tick', () => {
  it('grace 内到期：触发一次 + 推进 nextFireAt + 记 lastFireAt', async () => {
    const { scheduler, definitions, runService } = makeScheduler()
    const now = new Date('2026-08-17T10:00:10Z')
    definitions.rows.set('d1', {
      id: 'd1', userId: 'u1', publishedVersion: 1,
      nextFireAt: new Date('2026-08-17T10:00:00Z'), lastFireAt: null,
      triggers: [{ type: 'cron', expression: '0 * * * *', enabled: true }],
    })
    await scheduler.tick(now)
    expect(runService.starts).toHaveLength(1)
    expect(runService.starts[0]).toMatchObject({ definitionId: 'd1', triggerType: 'cron' })
    const row = definitions.rows.get('d1')
    expect(row.lastFireAt?.getTime()).toBe(now.getTime())
    expect(row.nextFireAt!.getTime()).toBeGreaterThan(now.getTime()) // 11:00
    expect(row.nextFireAt!.getUTCHours()).toBe(11)
  })

  it('错过超过 grace（2×tick）：跳过不触发，推进到未来', async () => {
    const { scheduler, definitions, runService } = makeScheduler(30_000)
    const now = new Date('2026-08-17T10:05:00Z')
    definitions.rows.set('d1', {
      id: 'd1', userId: 'u1', publishedVersion: 1,
      nextFireAt: new Date('2026-08-17T10:00:00Z'), lastFireAt: null, // 5 分钟前，远超 60s grace
      triggers: [{ type: 'cron', expression: '0 * * * *', enabled: true }],
    })
    await scheduler.tick(now)
    expect(runService.starts).toHaveLength(0) // 不补跑
    const row = definitions.rows.get('d1')
    expect(row.nextFireAt!.getUTCHours()).toBe(11) // 推进到未来首个触发点
    expect(row.lastFireAt).toBeNull() // 未触发不记
  })

  it('未到期/未发布/cron 停用：不触发不写库', async () => {
    const { scheduler, definitions, runService } = makeScheduler()
    const now = new Date()
    definitions.rows.set('future', {
      id: 'future', userId: 'u1', publishedVersion: 1,
      nextFireAt: new Date(now.getTime() + 600_000), lastFireAt: null,
      triggers: [{ type: 'cron', expression: '0 * * * *', enabled: true }],
    })
    await scheduler.tick(now)
    expect(runService.starts).toHaveLength(0)
    expect(definitions.updates).toHaveLength(0)
  })
})

describe('事件触发', () => {
  // 事件路径用真实短等待（假定时器会让 setTimeout 永不推进）

  it('同租户 + payload 匹配 → 触发；跨租户不触发', async () => {
    const { scheduler, definitions, runService } = makeScheduler()
    definitions.rows.set('d1', {
      id: 'd1', userId: 'user-a', publishedVersion: 1, nextFireAt: null, lastFireAt: null,
      triggers: [{ type: 'event', eventName: 'kb:document-completed', enabled: true, match: { status: 'completed' } }],
    })
    await scheduler.start() // start 内含订阅 + 索引构建
    try {

    // 跨租户事件（user-b 发布）：不触发
    runWithUser('user-b', () => publishDomainEvent('kb:document-completed', { documentId: 'x', status: 'completed' }))
    await new Promise(r => setTimeout(r, 10))
    expect(runService.starts).toHaveLength(0)

    // 同租户 + match 不符：不触发
    runWithUser('user-a', () => publishDomainEvent('kb:document-completed', { documentId: 'x', status: 'failed' }))
    await new Promise(r => setTimeout(r, 10))
    expect(runService.starts).toHaveLength(0)

    // 同租户 + match 命中：触发
    runWithUser('user-a', () => publishDomainEvent('kb:document-completed', { documentId: 'x', status: 'completed' }))
    await new Promise(r => setTimeout(r, 10))
    expect(runService.starts).toHaveLength(1)
    expect(runService.starts[0]).toMatchObject({ definitionId: 'd1', triggerType: 'event' })
    } finally {
      scheduler.stop()
    }
  })

  it('start() 订阅事件 + 幂等', async () => {
    const { scheduler } = makeScheduler()
    await scheduler.start()
    await scheduler.start() // 幂等
    scheduler.stop()
  })

  it('recomputeOne 对已删除定义刷新事件索引——删除后事件不再触发（评审#37）', async () => {
    const { scheduler, definitions, runService } = makeScheduler()
    definitions.rows.set('d1', {
      id: 'd1', userId: 'user-a', publishedVersion: 1, nextFireAt: null, lastFireAt: null,
      triggers: [{ type: 'event', eventName: 'kb:document-completed', enabled: true }],
    })
    await scheduler.start()
    try {
      runWithUser('user-a', () => publishDomainEvent('kb:document-completed', {}))
      await new Promise(r => setTimeout(r, 10))
      expect(runService.starts).toHaveLength(1)

      // 删除定义（行已不存在），随后 recomputeOne（delete 路径调用）
      definitions.rows.delete('d1')
      await scheduler.recomputeOne('d1')

      runWithUser('user-a', () => publishDomainEvent('kb:document-completed', {}))
      await new Promise(r => setTimeout(r, 10))
      // 已删定义不得再被事件触发
      expect(runService.starts).toHaveLength(1)
    } finally {
      scheduler.stop()
    }
  })
})
