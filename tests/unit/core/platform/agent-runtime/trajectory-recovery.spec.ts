/**
 * 可恢复轮枚举单测（47号恢复能力面，真实 sqlite）
 * @module tests/unit/core/platform/agent-runtime/trajectory-recovery.spec
 *
 * 锚点：末条轨迹=该轮终态投影——末条终态（final/guardrail_stop）排除、
 * 审批等待（human_request）排除、非终态（tool_call 等半途形态）= 可恢复；
 * session scope 限定（workflow scope 不入枚举）/ scopePrefix 过滤 / 租户隔离。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createAgentTrajectories } from '@core/database/migrations/create-agent-trajectories'
import { AgentTrajectoryEntity } from '@core/database/entities/agent-trajectory.entity'
import { AgentTrajectoryRepository } from '@core/database/repositories/agent-trajectory.repository'
import type { AgentTrajectoryAppend } from '@core/database/repositories/agent-trajectory.repository'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AgentTrajectoryEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createAgentTrajectories(ds)
  return ds
}

let ds: DataSource
let repo: AgentTrajectoryRepository

beforeEach(async () => {
  ds = await buildDs()
  repo = new AgentTrajectoryRepository(ds)
})

afterEach(async () => {
  await ds.destroy()
})

const entry = (scopeKey: string, kind: string, overrides: Partial<AgentTrajectoryAppend> = {}): AgentTrajectoryAppend => ({
  scope: 'session',
  scopeKey,
  seq: 0,
  iteration: 1,
  kind,
  ...overrides,
})

describe('AgentTrajectoryRepository.listRecoverable（47号）', () => {
  it('末条终态/审批等待排除，半途形态=可恢复', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([
        // 完整收敛轮：turn_start → … → final
        entry('story-room:a', 'decision', { seq: 0, name: 'turn_start' }),
        entry('story-room:a', 'final', { seq: 1 }),
        // 崩溃轮：停在 tool_call（无回执）
        entry('story-room:b', 'decision', { seq: 0, name: 'turn_start' }),
        entry('story-room:b', 'tool_call', { seq: 1, name: 'lw_generate' }),
        // error 收束轮：guardrail_stop 终态
        entry('story-room:c', 'tool_call', { seq: 0 }),
        entry('story-room:c', 'guardrail_stop', { seq: 1 }),
        // 审批挂起轮：不属崩溃恢复
        entry('story-room:d', 'human_request', { seq: 0 }),
      ])
      const rows = await repo.listRecoverable({ scopePrefix: 'story-room:' })
      expect(rows.map((r) => r.scopeKey).sort()).toEqual(['story-room:b'])
      expect(rows[0].kind).toBe('tool_call')
      expect(rows[0].name).toBe('lw_generate')
    })
  })

  it('scopePrefix 过滤：其他前缀不入枚举', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([
        entry('story-room:a', 'tool_call', { seq: 0 }),
        entry('dialog:9', 'tool_call', { seq: 0 }),
      ])
      const rows = await repo.listRecoverable({ scopePrefix: 'story-room:' })
      expect(rows.map((r) => r.scopeKey)).toEqual(['story-room:a'])
      // 无前缀 = 全量
      const all = await repo.listRecoverable()
      expect(all.map((r) => r.scopeKey).sort()).toEqual(['dialog:9', 'story-room:a'])
    })
  })

  it('workflow scope 不入枚举（节点恢复自成一体）', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([
        entry('run1:node2', 'tool_call', { seq: 0, scope: 'workflow' }),
        entry('story-room:a', 'tool_call', { seq: 0 }),
      ])
      const rows = await repo.listRecoverable()
      expect(rows.map((r) => r.scopeKey)).toEqual(['story-room:a'])
    })
  })

  it('子代理 :sub_* scope 排除（一次性、不可续跑——对抗 review P1）', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([
        entry('story-room:a', 'decision', { seq: 0, name: 'turn_start' }),
        entry('story-room:a', 'tool_call', { seq: 1, name: 'spawn_subagent' }),
        // 崩溃时在途的子代理：末条半途形态，但不可续跑
        entry('story-room:a:sub_1720000000_ab12', 'tool_call', { seq: 0, name: 'web_search' }),
      ])
      const rows = await repo.listRecoverable({ scopePrefix: 'story-room:' })
      expect(rows.map((r) => r.scopeKey)).toEqual(['story-room:a'])
    })
  })

  it('租户隔离：只看得到本用户的轨迹', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([entry('story-room:mine', 'tool_call', { seq: 0 })])
    })
    await runWithUserAsync('u2', async () => {
      await repo.appendBatch([entry('story-room:theirs', 'tool_call', { seq: 0 })])
      const rows = await repo.listRecoverable()
      expect(rows.map((r) => r.scopeKey)).toEqual(['story-room:theirs'])
    })
  })

  it('limit 截断（createdAt 降序）', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([entry('story-room:a', 'tool_call', { seq: 0 })])
      await new Promise((r) => setTimeout(r, 5))
      await repo.appendBatch([entry('story-room:b', 'tool_call', { seq: 0 })])
      const rows = await repo.listRecoverable({ limit: 1 })
      expect(rows.map((r) => r.scopeKey)).toEqual(['story-room:b'])
    })
  })
})
