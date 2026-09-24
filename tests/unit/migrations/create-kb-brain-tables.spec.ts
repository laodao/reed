/**
 * 知识大脑 6 表迁移测试（create-kb-brain-tables）
 *
 * 验证：
 * 1. 全新库一次迁移建出 6 表 + knowledge_bases 补 brain_config/brain_state 两列
 * 2. 幂等：重复执行不抛错不重建
 * 3. entity 定义与 DDL 一致（实体可正常读写——schema-drift 的行为级保险）
 * 4. 约束行为：kb_entities (kb_id,name) 唯一；kb_digest_passes 的 NULL chapter_id
 *    在唯一索引下互不相斥（F7：文档级任务必须走应用层判重）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createKbBrainTables } from '@core/database/migrations/create-kb-brain-tables'
import { KbAtomEntity } from '@core/database/entities/kb-brain/kb-atom.entity'
import { KbEntityEntity } from '@core/database/entities/kb-brain/kb-entity.entity'
import { KbDigestPassEntity } from '@core/database/entities/kb-brain/kb-digest-pass.entity'

type EntityCtor = new (...args: unknown[]) => object

const BRAIN_TABLES = [
  'kb_atoms',
  'kb_entities',
  'kb_knowledge_edges',
  'kb_notes',
  'kb_digest_passes',
  'kb_note_reviews',
]

describe('create-kb-brain-tables', () => {
  let ds: DataSource

  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities).filter((v) => typeof v === 'function') as EntityCtor[],
      synchronize: false,
      logging: false,
    })
    await ds.initialize()
    // knowledge_bases 先由最小 DDL 建出（迁移只负责补列）
    await ds.query(`CREATE TABLE knowledge_bases (
      id varchar PRIMARY KEY, user_id varchar, name varchar NOT NULL,
      embedding_model varchar NOT NULL, embedding_provider varchar NOT NULL,
      embedding_dimension INTEGER DEFAULT 1536, embedding_config TEXT,
      rerank_config TEXT, document_count INTEGER DEFAULT 0,
      vector_count INTEGER DEFAULT 0, total_size INTEGER DEFAULT 0,
      created_at datetime, updated_at datetime
    )`)
    await createKbBrainTables(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('6 张表全部建出 + knowledge_bases 补两列', async () => {
    for (const t of BRAIN_TABLES) {
      const rows = (await ds.query(
        `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='${t}'`,
      )) as Array<{ count: number }>
      expect(Number(rows[0].count)).toBe(1)
    }
    const cols = (await ds.query('PRAGMA table_info(knowledge_bases)')) as Array<{ name: string }>
    const names = cols.map((c) => c.name)
    expect(names).toContain('brain_config')
    expect(names).toContain('brain_state')
  })

  it('幂等：重复执行不抛错', async () => {
    await expect(createKbBrainTables(ds)).resolves.toBeUndefined()
  })

  it('entity 与 DDL 一致：kb_atoms 可正常写入读出', async () => {
    const repo = ds.getRepository(KbAtomEntity)
    const e = new KbAtomEntity()
    e.id = 'atom-1'
    e.knowledgeBaseId = 'kb-1'
    e.statement = '《X》的复仇对象逐级上升'
    e.type = 'fact'
    e.status = 'supported'
    e.certainty = 0.9
    e.sourceDocumentId = 'doc-1'
    e.sourceChapterId = 'ch-1'
    e.sourceChapterHash = 'hash-1'
    e.sourceQuote = '他先杀管家，再杀家主。'
    e.extractionPass = 'base#1'
    e.origin = 'ai'
    await repo.save(e)
    const loaded = await repo.findOne({ where: { id: 'atom-1' } as never })
    expect(loaded?.statement).toBe('《X》的复仇对象逐级上升')
    expect(loaded?.lensNoteId ?? null).toBeNull()
  })

  it('kb_entities (knowledge_base_id, name) 唯一约束生效', async () => {
    const repo = ds.getRepository(KbEntityEntity)
    const a = new KbEntityEntity()
    a.id = 'ent-1'
    a.knowledgeBaseId = 'kb-1'
    a.name = '程野'
    a.aliases = '[]'
    a.entityType = 'character'
    await repo.save(a)
    const b = new KbEntityEntity()
    b.id = 'ent-2'
    b.knowledgeBaseId = 'kb-1'
    b.name = '程野'
    b.aliases = '[]'
    b.entityType = 'character'
    await expect(repo.save(b)).rejects.toThrow()
  })

  it('F7：kb_digest_passes 的 NULL chapter_id 不受唯一索引约束（文档级任务须应用层判重）', async () => {
    const repo = ds.getRepository(KbDigestPassEntity)
    const mk = (id: string, chapterId: string | null, passKey: string): KbDigestPassEntity => {
      const e = new KbDigestPassEntity()
      e.id = id
      e.knowledgeBaseId = 'kb-1'
      e.documentId = 'doc-1'
      e.chapterId = chapterId
      e.passType = 'distill'
      e.passKey = passKey
      e.status = 'pending'
      e.attempts = 0
      return e
    }
    await repo.save(mk('pass-1', null, 'distill:batch-1'))
    // 同 pass_key、同 NULL chapter 的第二行能插入——证明唯一索引不拦 NULL（预期行为）
    await expect(repo.save(mk('pass-2', null, 'distill:batch-1'))).resolves.toBeTruthy()
    // 章级任务的唯一键生效
    await repo.save(mk('pass-3', 'ch-1', 'base'))
    const dup = mk('pass-4', 'ch-1', 'base')
    await expect(repo.save(dup)).rejects.toThrow()
  })
})
