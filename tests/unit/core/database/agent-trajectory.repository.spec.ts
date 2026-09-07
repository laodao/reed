/**
 * AgentTrajectoryRepository 真实 DataSource 契约测试（25 号 M2 批1）
 *
 * 钉死：确定性幂等主键（重放不重不漏）、ALS userId 注入（租户隔离）、
 * maxSeq 续接起点（sink 崩溃恢复语义）、scope_key 前缀/精确级联删除、
 * payload 字节截断。真实 better-sqlite3 + 迁移（生产路径零 mock）。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { AgentTrajectoryRepository, TRAJECTORY_PAYLOAD_MAX_BYTES } from '@core/database/repositories/agent-trajectory.repository'
import { createAgentTrajectories } from '@core/database/migrations/create-agent-trajectories'
import { runWithUserAsync } from '@core/context/user-context'

let ds: DataSource | null = null

async function buildDs(): Promise<DataSource> {
  const d = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [(await import('@core/database/entities/agent-trajectory.entity')).AgentTrajectoryEntity],
    synchronize: false,
  })
  await d.initialize()
  await createAgentTrajectories(d)
  return d
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('幂等与租户', () => {
  it('appendBatch 同 (scope_key, seq) 重复写幂等（orIgnore），listByScope 按 seq 升序', async () => {
    ds = await buildDs()
    const repo = new AgentTrajectoryRepository(ds)
    await runWithUserAsync('u1', async () => {
      const batch = [
        { scope: 'workflow' as const, scopeKey: 'r1:n1:0', seq: 1, iteration: 0, kind: 'decision', payload: { a: 1 } },
        { scope: 'workflow' as const, scopeKey: 'r1:n1:0', seq: 2, iteration: 0, kind: 'tool_call', name: 'http_get', payload: {} },
      ]
      await repo.appendBatch(batch)
      await repo.appendBatch(batch) // 重放
      await repo.appendBatch([]) // 空批 no-op
      const rows = await repo.listByScope('r1:n1:0')
      expect(rows.map((r) => r.seq)).toEqual([1, 2])
      expect(rows[1].name).toBe('http_get')
      expect(rows[1].id).toBe('tr_r1:n1:0_2')
    })
  })

  it('ALS userId 注入：属主可见、他人不可见', async () => {
    ds = await buildDs()
    const repo = new AgentTrajectoryRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([
        { scope: 'session', scopeKey: 'session:def1:s1', seq: 1, iteration: 0, kind: 'final', payload: {} },
      ])
    })
    const raw = await ds.query("SELECT user_id FROM agent_trajectories WHERE scope_key = 'session:def1:s1'")
    expect(raw[0].user_id).toBe('u1')
    await runWithUserAsync('u1', async () => {
      expect((await repo.listByScope('session:def1:s1')).length).toBe(1)
    })
    await runWithUserAsync('u2', async () => {
      expect((await repo.listByScope('session:def1:s1')).length).toBe(0)
    })
  })

  it('maxSeq 返回库内最大 seq（无行 0）——sink 续接起点', async () => {
    ds = await buildDs()
    const repo = new AgentTrajectoryRepository(ds)
    await runWithUserAsync('u1', async () => {
      expect(await repo.maxSeq('r2:n1:0')).toBe(0)
      await repo.appendBatch([
        { scope: 'workflow', scopeKey: 'r2:n1:0', seq: 3, iteration: 1, kind: 'tool_call', payload: {} },
        { scope: 'workflow', scopeKey: 'r2:n1:0', seq: 7, iteration: 2, kind: 'final', payload: {} },
      ])
      expect(await repo.maxSeq('r2:n1:0')).toBe(7)
    })
  })
})

describe('级联删除', () => {
  it('deleteByRunRaw 按 runId 前缀删 workflow 行，不误删其他 run 的 session 行', async () => {
    ds = await buildDs()
    const repo = new AgentTrajectoryRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([
        { scope: 'workflow', scopeKey: 'r9:n1:0', seq: 1, iteration: 0, kind: 'decision', payload: {} },
        { scope: 'workflow', scopeKey: 'r9:n2:0', seq: 1, iteration: 0, kind: 'decision', payload: {} },
        { scope: 'session', scopeKey: 'session:def:r9x', seq: 1, iteration: 0, kind: 'final', payload: {} },
      ])
      expect(await repo.deleteByRunRaw('r9')).toBe(2)
      expect(await repo.listByScope('r9:n1:0')).toHaveLength(0)
      expect(await repo.listByScope('session:def:r9x')).toHaveLength(1)
    })
  })

  it('deleteByScopeRaw 精确删会话行', async () => {
    ds = await buildDs()
    const repo = new AgentTrajectoryRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([
        { scope: 'session', scopeKey: 'session:d1:s1', seq: 1, iteration: 0, kind: 'final', payload: {} },
      ])
      expect(await repo.deleteByScopeRaw('session:d1:s1')).toBe(1)
      expect(await repo.listByScope('session:d1:s1')).toHaveLength(0)
    })
  })
})

describe('payload 截断', () => {
  it('超 16KB 的 payload 字节截断并保留 _truncated 标记（CJK 按 UTF-8 字节计）', async () => {
    ds = await buildDs()
    const repo = new AgentTrajectoryRepository(ds)
    await runWithUserAsync('u1', async () => {
      const big = { text: '汉'.repeat(20_000) } // ~60KB UTF-8
      await repo.appendBatch([
        { scope: 'workflow', scopeKey: 'r3:n1:0', seq: 1, iteration: 0, kind: 'tool_result', payload: big },
      ])
      const rows = await repo.listByScope('r3:n1:0')
      const raw = (await ds.query(
        "SELECT payload_json FROM agent_trajectories WHERE scope_key = 'r3:n1:0'",
      )) as Array<{ payload_json: string }>
      expect(Buffer.byteLength(raw[0].payload_json, 'utf8')).toBeLessThan(TRAJECTORY_PAYLOAD_MAX_BYTES + 64)
      expect(rows[0].payload).toHaveProperty('_truncated')
    })
  })

  it('引号密集 payload 包装后仍不超上限（review A2：JSON.stringify 转义膨胀近 2 倍曾突破 16KB）', async () => {
    ds = await buildDs()
    const repo = new AgentTrajectoryRepository(ds)
    await runWithUserAsync('u1', async () => {
      // 引号密集：每字符都可能是转义源（" 与 \ 序列），包装膨胀最陡的形状
      const quoteHeavy = { text: '"' + '\\' + '"'.repeat(30_000) }
      await repo.appendBatch([
        { scope: 'workflow', scopeKey: 'r3:n1:1', seq: 1, iteration: 0, kind: 'tool_result', payload: quoteHeavy },
      ])
      const raw = (await ds.query(
        "SELECT payload_json FROM agent_trajectories WHERE scope_key = 'r3:n1:1'",
      )) as Array<{ payload_json: string }>
      expect(Buffer.byteLength(raw[0].payload_json, 'utf8')).toBeLessThan(TRAJECTORY_PAYLOAD_MAX_BYTES + 8)
    })
  })
})
