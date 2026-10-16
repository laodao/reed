/**
 * agent_sessions.listSessions 单测（29 号 M5.5 批2 工作台数据源）
 * sqlite 内存库；验证聚合（distinct/最近时间/行数）与租户过滤。
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDataSource, type TestDataSource } from '../helpers/create-test-data-source'
import { AgentSessionRepository } from '@core/database/repositories/agent-session.repository'
import { getCurrentUserId, runWithUserAsync } from '@core/context/user-context'

describe('AgentSessionRepository.listSessions [sqlite]', () => {
  let tds: TestDataSource
  let repo: AgentSessionRepository

  beforeAll(async () => {
    tds = await createTestDataSource('sqlite')
    repo = new AgentSessionRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('聚合：distinct conversation + 最近时间 + 行数倒序', async () => {
    await repo.replaceAll('system-chat-agent:dialog:a', [
      { conversationId: 'system-chat-agent:dialog:a', seq: 0, role: 'user', content: '1' },
      { conversationId: 'system-chat-agent:dialog:a', seq: 1, role: 'assistant', content: '2' },
    ])
    await new Promise((r) => setTimeout(r, 10))
    await repo.replaceAll('task:t1', [
      { conversationId: 'task:t1', seq: 0, role: 'user', content: '3' },
    ])
    const list = await repo.listSessions()
    expect(list.map((s) => s.conversationId)).toEqual(['task:t1', 'system-chat-agent:dialog:a'])
    expect(list[1].messageCount).toBe(2)
    expect(list[0].messageCount).toBe(1)
    expect(list[0].updatedAt).toBeInstanceOf(Date)
  })

  it('租户过滤：仅见当前用户的会话', async () => {
    await runWithUserAsync('u1', async () => {
      await repo.replaceAll('c1', [{ conversationId: 'c1', seq: 0, role: 'user', content: 'x' }])
    })
    await runWithUserAsync('u2', async () => {
      await repo.replaceAll('c2', [{ conversationId: 'c2', seq: 0, role: 'user', content: 'y' }])
      const list = await repo.listSessions()
      expect(list.map((s) => s.conversationId)).toEqual(['c2'])
    })
    // u1 视角只见 c1
    await runWithUserAsync('u1', async () => {
      expect(getCurrentUserId()).toBe('u1')
      const list = await repo.listSessions()
      expect(list.map((s) => s.conversationId)).toEqual(['c1'])
    })
  })
})
