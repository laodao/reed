/**
 * AgentSessionStore 单元测试（23 号 §6 契约）
 * @module tests/core/platform/agent-runtime/session-store
 * @description 内存实现基础语义 + DB 实现（真实 sqlite）：往返还原（含 tool-call
 *              配对消息）、全量替换不留残行、多租户 ALS 隔离、匿名（Electron）
 *              共存、512KB 上限 fail-fast、损坏行/断档 fail-fast、
 *              (user_id, conversation_id, seq) 唯一索引兜底、迁移幂等。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import type { ModelMessage } from 'ai'
import { runWithUserAsync } from '@core/context/user-context'
import { createAgentTables } from '@core/database/migrations/create-agent-tables'
import { AgentSessionEntity } from '@core/database/entities/agent-session.entity'
import {
  createSessionStore,
  InMemorySessionStore,
  DbAgentSessionStore,
  AgentSessionCorruptionError,
  AgentMessageTooLargeError,
  MAX_MESSAGE_BYTES,
  type AgentSessionStore,
} from '@core/platform/agent-runtime/memory/session-store'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AgentSessionEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createAgentTables(ds)
  return ds
}

/** 覆盖 AI SDK 关键形态：system / user / assistant(tool-call) / tool(tool-result) 配对 */
function sampleMessages(): ModelMessage[] {
  return [
    { role: 'system', content: '你是长文写作助手' },
    { role: 'user', content: '写第三章' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: '我先查一下设定' },
        { type: 'tool-call', toolCallId: 'tc-1', toolName: 'graph_query', input: { entity: '主角' } },
      ],
    } as unknown as ModelMessage,
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tc-1',
          toolName: 'graph_query',
          output: { state: { 年龄: 25, 处境: '流亡' } },
        },
      ],
    } as unknown as ModelMessage,
    { role: 'assistant', content: '第三章：流亡之路……' },
  ]
}

describe('InMemorySessionStore', () => {
  let store: InMemorySessionStore

  beforeEach(() => {
    store = new InMemorySessionStore()
  })

  it('save/load 往返：深相等还原（含 tool-call 配对）；未命中返回 undefined', async () => {
    const messages = sampleMessages()
    await store.save('story-room:p-1', messages)
    expect(await store.load('story-room:p-1')).toEqual(messages)
    expect(await store.load('story-room:p-2')).toBeUndefined()
  })

  it('load 返回副本：外部修改不影响存储内历史', async () => {
    await store.save('s', [{ role: 'user', content: 'a' }])
    const loaded = await store.load('s')
    loaded!.push({ role: 'user', content: 'b' })
    expect((await store.load('s'))!.length).toBe(1)
  })

  it('save 全量替换：旧历史整体被覆盖', async () => {
    await store.save('s', [{ role: 'user', content: '旧' }])
    await store.save('s', [{ role: 'user', content: '新1' }, { role: 'assistant', content: '新2' }])
    expect(await store.load('s')).toEqual([
      { role: 'user', content: '新1' },
      { role: 'assistant', content: '新2' },
    ])
  })

  it('save 空数组 = 清空会话；delete 后未命中', async () => {
    await store.save('s', [{ role: 'user', content: 'a' }])
    await store.save('s', [])
    expect(await store.load('s')).toBeUndefined()
    await store.save('s', [{ role: 'user', content: 'b' }])
    await store.delete('s')
    expect(await store.load('s')).toBeUndefined()
  })
})

describe('DbAgentSessionStore（真实 sqlite）', () => {
  let ds: DataSource
  let store: AgentSessionStore

  beforeEach(async () => {
    ds = await buildDs()
    store = createSessionStore({ dataSource: ds })
  })
  afterEach(async () => {
    await ds.destroy()
  })

  it('save/load 往返：JSON 序列化无损还原（含 tool-call 配对）；未命中 undefined', async () => {
    await runWithUserAsync('user-1', async () => {
      const messages = sampleMessages()
      await store.save('story-room:p-1', messages)
      expect(await store.load('story-room:p-1')).toEqual(messages)
      expect(await store.load('story-room:p-other')).toBeUndefined()
    })
  })

  it('全量替换不留残行：3 条 → 2 条后表内恰好 2 行', async () => {
    await runWithUserAsync('user-1', async () => {
      await store.save('c1', sampleMessages())
      const shorter: ModelMessage[] = [
        { role: 'user', content: '精简后' },
        { role: 'assistant', content: '好的' },
      ]
      await store.save('c1', shorter)
      expect(await store.load('c1')).toEqual(shorter)
      const count = await ds.query(`SELECT COUNT(*) AS n FROM agent_sessions WHERE conversation_id = 'c1'`)
      expect(count[0].n).toBe(2)
    })
  })

  it('save 空数组清空；delete 删除会话', async () => {
    await runWithUserAsync('user-1', async () => {
      await store.save('c1', sampleMessages())
      await store.save('c1', [])
      expect(await store.load('c1')).toBeUndefined()
      await store.save('c1', [{ role: 'user', content: 'x' }])
      await store.delete('c1')
      expect(await store.load('c1')).toBeUndefined()
      const count = await ds.query(`SELECT COUNT(*) AS n FROM agent_sessions WHERE conversation_id = 'c1'`)
      expect(count[0].n).toBe(0)
    })
  })

  it('多租户 ALS 隔离：user-2 读不到 user-1 的会话；同 sessionId 各自独立、互不覆盖', async () => {
    await runWithUserAsync('user-1', async () => {
      await store.save('story-room:p-1', [{ role: 'user', content: 'user-1 的历史' }])
    })
    await runWithUserAsync('user-2', async () => {
      // 读不到 user-1 的
      expect(await store.load('story-room:p-1')).toBeUndefined()
      // 同一 sessionId 写入自己的历史
      await store.save('story-room:p-1', [{ role: 'user', content: 'user-2 的历史' }])
    })
    await runWithUserAsync('user-1', async () => {
      expect(await store.load('story-room:p-1')).toEqual([{ role: 'user', content: 'user-1 的历史' }])
    })
    await runWithUserAsync('user-2', async () => {
      expect(await store.load('story-room:p-1')).toEqual([{ role: 'user', content: 'user-2 的历史' }])
      // user-2 删除不影响 user-1
      await store.delete('story-room:p-1')
    })
    await runWithUserAsync('user-1', async () => {
      expect(await store.load('story-room:p-1')).toEqual([{ role: 'user', content: 'user-1 的历史' }])
    })
  })

  it('匿名（Electron 单用户，user_id NULL）与登录用户共存互不干扰', async () => {
    // 无 ALS 上下文 → userId null
    await store.save('c-anon', [{ role: 'user', content: '匿名历史' }])
    await runWithUserAsync('user-1', async () => {
      expect(await store.load('c-anon')).toBeUndefined()
      await store.save('c-anon', [{ role: 'user', content: '登录历史' }])
    })
    expect(await store.load('c-anon')).toEqual([{ role: 'user', content: '匿名历史' }])
  })

  it('512KB 上限：超限消息拒绝保存（fail-fast，错误信息含 sessionId 与定位）', async () => {
    await runWithUserAsync('user-1', async () => {
      const huge: ModelMessage = { role: 'assistant', content: 'x'.repeat(MAX_MESSAGE_BYTES + 1) }
      await expect(store.save('c-big', [huge])).rejects.toThrow(AgentMessageTooLargeError)
      await expect(store.save('c-big', [huge])).rejects.toThrow(/c-big/)
      // 拒存后表内无残留（校验发生在 DELETE 之前）
      const count = await ds.query(`SELECT COUNT(*) AS n FROM agent_sessions WHERE conversation_id = 'c-big'`)
      expect(count[0].n).toBe(0)
    })
  })

  it('损坏行：content 非法 JSON → load 抛 AgentSessionCorruptionError（带会话定位）', async () => {
    await runWithUserAsync('user-1', async () => {
      await ds.query(
        `INSERT INTO agent_sessions (id, user_id, conversation_id, seq, role, content, created_at)
         VALUES ('bad-1', 'user-1', 'c-bad', 0, 'user', '{oops', NULL)`
      )
      await expect(store.load('c-bad')).rejects.toThrow(AgentSessionCorruptionError)
      await expect(store.load('c-bad')).rejects.toThrow(/c-bad/)
    })
  })

  it('seq 断档（中段行被删）→ load 拒绝加载（防 tool-call 配对破坏）', async () => {
    await runWithUserAsync('user-1', async () => {
      await store.save('c-gap', sampleMessages())
      await ds.query(`DELETE FROM agent_sessions WHERE conversation_id = 'c-gap' AND seq = 1`)
      await expect(store.load('c-gap')).rejects.toThrow(/seq 断档/)
    })
  })

  it('唯一索引兜底：同 (user_id, conversation_id, seq) 重复插入被 DB 拒绝', async () => {
    await runWithUserAsync('user-1', async () => {
      await ds.query(
        `INSERT INTO agent_sessions (id, user_id, conversation_id, seq, role, content, created_at)
         VALUES ('u1-a', 'user-1', 'c-uniq', 0, 'user', '{}', NULL)`
      )
      await expect(
        ds.query(
          `INSERT INTO agent_sessions (id, user_id, conversation_id, seq, role, content, created_at)
           VALUES ('u1-b', 'user-1', 'c-uniq', 0, 'user', '{}', NULL)`
        )
      ).rejects.toThrow(/UNIQUE/i)
    })
  })

  it('512KB 上限：恰好等于上限放行，超 1 字节拒绝（按 UTF-8 字节计量）', async () => {
    await runWithUserAsync('user-1', async () => {
      const overhead = JSON.stringify({ role: 'user', content: '' }).length // ASCII：长度=字节数
      const exact: ModelMessage = { role: 'user', content: 'x'.repeat(MAX_MESSAGE_BYTES - overhead) }
      await store.save('c-edge', [exact]) // 恰好 MAX：放行
      expect((await store.load('c-edge'))!.length).toBe(1)

      const over: ModelMessage = { role: 'user', content: 'x'.repeat(MAX_MESSAGE_BYTES - overhead + 1) }
      await expect(store.save('c-edge', [over])).rejects.toThrow(AgentMessageTooLargeError)
    })
  })

  it('中文按 UTF-8 字节计量：1000 汉字（3000 字节）不因 length 陷阱误判', async () => {
    await runWithUserAsync('user-1', async () => {
      const cjk: ModelMessage = { role: 'user', content: '汉'.repeat(1000) } // length≈1000，字节≈3000
      await store.save('c-cjk', [cjk])
      expect((await store.load('c-cjk'))!.length).toBe(1)
    })
  })

  it('长会话批量插入分块：5000 条消息全量替换成功且顺序正确（回归 SQLite 变量上限）', async () => {
    await runWithUserAsync('user-1', async () => {
      const big: ModelMessage[] = Array.from({ length: 5000 }, (_, i) => ({
        role: 'user' as const,
        content: `msg-${i}`,
      }))
      await store.save('c-5k', big)
      const loaded = await store.load('c-5k')
      expect(loaded!.length).toBe(5000)
      expect(loaded![0].content).toBe('msg-0')
      expect(loaded![4999].content).toBe('msg-4999')
      // 再全量替换一次（DELETE+分块 INSERT 双向路径）
      await store.save('c-5k', big.slice(0, 4500))
      expect((await store.load('c-5k'))!.length).toBe(4500)
    })
  })

  it('迁移幂等：重复执行 createAgentTables 不抛错', async () => {
    await createAgentTables(ds)
    await createAgentTables(ds)
  })
})

describe('createSessionStore 工厂', () => {
  it('无 DataSource → 内存实现；有 DataSource → DB 实现', async () => {
    expect(createSessionStore()).toBeInstanceOf(InMemorySessionStore)
    const ds = await buildDs()
    try {
      expect(createSessionStore({ dataSource: ds })).toBeInstanceOf(DbAgentSessionStore)
    } finally {
      await ds.destroy()
    }
  })
})
