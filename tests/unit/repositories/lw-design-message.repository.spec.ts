/**
 * LwDesignMessageRepository 测试（对话式工作流基础）
 * 覆盖：metadata 读写（add / getByConversationId / batchAdd）、老数据无 metadata 兼容。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { LwDesignMessageEntity } from '@core/database/entities/lw-design-message.entity'
import { LwDesignConversationEntity } from '@core/database/entities/lw-design-conversation.entity'
import { LwDesignMessageRepository } from '@core/database/repositories/lw-design-message.repository'
import { runWithUserAsync } from '@core/context/user-context'

async function buildDs(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [LwDesignMessageEntity, LwDesignConversationEntity],
    synchronize: false,
  })
  await ds.initialize()
  // 模拟迁移后状态：容器表 + 消息表（含 metadata 列）
  await ds.query(`CREATE TABLE lw_design_conversations (
    id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT NOT NULL, stage TEXT NOT NULL,
    messages TEXT, created_at DATETIME, updated_at DATETIME
  )`)
  await ds.query(`CREATE TABLE lw_design_messages (
    id TEXT PRIMARY KEY, user_id TEXT, conversation_id TEXT NOT NULL,
    role TEXT NOT NULL, content TEXT NOT NULL, timestamp INTEGER, sort_order INTEGER DEFAULT 0,
    metadata TEXT
  )`)
  return ds
}

describe('LwDesignMessageRepository（对话消息 + metadata）', () => {
  let ds: DataSource
  let repo: LwDesignMessageRepository

  beforeEach(async () => {
    ds = await buildDs()
    repo = new LwDesignMessageRepository(ds)
  })

  it('add 带 metadata → getByConversationId 读回', async () => {
    const msg = await runWithUserAsync('user-1', () =>
      repo.add('conv-1', {
        role: 'assistant',
        content: '好的，我来补充一位女二号。',
        metadata: JSON.stringify({ actions: [{ type: 'generate_characters', status: 'ok' }], suggestions: ['继续'] }),
      }),
    )
    expect(msg.role).toBe('assistant')
    expect(msg.metadata).toContain('generate_characters')

    const list = await runWithUserAsync('user-1', () => repo.getByConversationId('conv-1'))
    expect(list).toHaveLength(1)
    expect(list[0].content).toBe('好的，我来补充一位女二号。')
    expect(JSON.parse(list[0].metadata || '{}').actions[0].type).toBe('generate_characters')
  })

  it('batchAdd 带 metadata 批量读回（sort_order 保持顺序）', async () => {
    await runWithUserAsync('user-1', () =>
      repo.batchAdd('conv-1', [
        { role: 'user', content: '增加一位女二号', timestamp: 1, metadata: '{"seq":1}' },
        { role: 'assistant', content: '已完成', timestamp: 2, metadata: '{"seq":2}' },
      ]),
    )
    const list = await runWithUserAsync('user-1', () => repo.getByConversationId('conv-1'))
    expect(list.map(m => m.content)).toEqual(['增加一位女二号', '已完成'])
    expect(JSON.parse(list[1].metadata || '{}').seq).toBe(2)
  })

  it('老数据无 metadata 时返回 undefined（兼容）', async () => {
    await runWithUserAsync('user-1', () =>
      repo.add('conv-1', { role: 'user', content: '我想写个明朝锦衣卫的故事' }),
    )
    const list = await runWithUserAsync('user-1', () => repo.getByConversationId('conv-1'))
    expect(list[0].metadata).toBeUndefined()
  })

  it('多租户隔离：user-2 看不到 user-1 的消息', async () => {
    await runWithUserAsync('user-1', () =>
      repo.add('conv-1', { role: 'user', content: '秘密消息' }),
    )
    const other = await runWithUserAsync('user-2', () => repo.getByConversationId('conv-1'))
    expect(other).toHaveLength(0)
  })
})
