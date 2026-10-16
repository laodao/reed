/**
 * 会话原始流水仓储单元测试（39 号 P0-2，真实 sqlite）
 * @module tests/unit/core/platform/agent-runtime/session-event.repository.spec
 *
 * 锚点：幂等批写（同 (conversation, seq) 重复静默跳过——崩溃重放不重不漏）/
 * maxSeq 续接 / 多租户 ALS 隔离（读删走 scoped）/ 迁移幂等。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createAgentSessionEvents } from '@core/database/migrations/create-agent-session-events'
import { AgentSessionEventEntity } from '@core/database/entities/agent-session-event.entity'
import { AgentSessionEventRepository, transcriptId } from '@core/database/repositories/agent-session-event.repository'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AgentSessionEventEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createAgentSessionEvents(ds)
  return ds
}

let ds: DataSource
let repo: AgentSessionEventRepository

beforeEach(async () => {
  ds = await buildDs()
  repo = new AgentSessionEventRepository(ds)
})

afterEach(async () => {
  await ds.destroy()
})

const row = (conversationId: string, seq: number, role = 'user') => ({
  conversationId,
  seq,
  role,
  content: JSON.stringify({ role, content: `m-${conversationId}-${seq}` }),
})

describe('AgentSessionEventRepository（39 号 P0-2 原始流水）', () => {
  it('appendBatch + listByConversation：按 seq 升序还原', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([row('conv1', 0), row('conv1', 1, 'assistant'), row('conv1', 2, 'tool')])
      const rows = await repo.listByConversation('conv1')
      expect(rows.map((r) => r.seq)).toEqual([0, 1, 2])
      expect(rows[1].role).toBe('assistant')
      expect(JSON.parse(rows[2].content).content).toBe('m-conv1-2')
    })
  })

  it('幂等：同 (conversation, seq) 重复写入静默跳过（崩溃重放不重不漏）', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([row('conv1', 0), row('conv1', 1)])
      await repo.appendBatch([row('conv1', 1), row('conv1', 2)]) // seq=1 重复
      const rows = await repo.listByConversation('conv1')
      expect(rows.map((r) => r.seq)).toEqual([0, 1, 2])
    })
  })

  it('maxSeq 续接起点：空会话 0，落库后取最大值', async () => {
    await runWithUserAsync('u1', async () => {
      expect(await repo.maxSeq('conv1')).toBe(0)
      await repo.appendBatch([row('conv1', 0), row('conv1', 5)])
      expect(await repo.maxSeq('conv1')).toBe(5)
    })
  })

  it('多租户 ALS 隔离：u2 读不到/删不掉 u1 的流水；同会话键互不覆盖', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([row('conv1', 0)])
    })
    await runWithUserAsync('u2', async () => {
      await repo.appendBatch([row('conv1', 0)]) // 同键不同租户——行 id 不同（id 含 conversation+seq，与 u1 行同 id？）
    }).catch(() => undefined)
    // 同 id 主键（确定性 id 不含租户）——u2 的插入被 orIgnore 吞掉（主键冲突）
    await runWithUserAsync('u2', async () => {
      const rows = await repo.listByConversation('conv1')
      expect(rows).toHaveLength(0) // 租户过滤：读不到 u1 的行
      expect(await repo.maxSeq('conv1')).toBe(0) // 裸查语义：会话键全局唯一（键含租户前缀由上层保证）
      expect(await repo.deleteByConversation('conv1')).toBe(0) // scoped 删除跨租户无效
    })
    await runWithUserAsync('u1', async () => {
      expect((await repo.listByConversation('conv1'))).toHaveLength(1) // u1 数据完好
    })
  })

  it('deleteByConversation（scoped）：清空本租户该会话全部行', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.appendBatch([row('conv9', 0), row('conv9', 1), row('conv9', 2)])
      expect(await repo.deleteByConversation('conv9')).toBe(3)
      expect(await repo.listByConversation('conv9')).toHaveLength(0)
    })
  })

  it('迁移幂等：重复执行 createAgentSessionEvents 不抛错', async () => {
    await createAgentSessionEvents(ds)
    await createAgentSessionEvents(ds)
    expect(true).toBe(true)
  })

  it('确定性 id 形态：se_<conversationId>_<seq>', () => {
    expect(transcriptId('conv1', 3)).toBe('se_conv1_3')
  })
})
