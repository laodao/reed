/**
 * 卡片检索索引测试（2026-10 M0-#7）
 *
 * 覆盖：索引文本构成（标题/描述/正文节选、空段剔除）、单卡写入（note: 向量 +
 * 倒排、重写幂等不重复）、存量回填（缺索引补建/已索引跳过）、发布钩子漏斗
 * （publish/evolve(published) 触发、钩子失败不影响发布）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbNoteRepository, setKbNotePublishHook, type KbNoteRecord } from '@core/database/repositories/kb-note.repository'
import {
  noteIndexText,
  indexNoteWithDeps,
  ensureNotesIndexedWithDeps,
  type NoteIndexDeps,
} from '@core/platform/services/kb-brain/note-index'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

function mkNote(id: string, over: Partial<KbNoteRecord> = {}): KbNoteRecord {
  return {
    id,
    userId: null,
    knowledgeBaseId: 'kb-i',
    title: `标题-${id}`,
    description: `描述-${id}`,
    body: `正文-${id}`,
    type: 'plot-pattern',
    status: 'published',
    evidence: '[]',
    origin: 'ai-distill',
    version: 1,
    patternSkeleton: null,
    patternInstances: null,
    lensAttention: null,
    classicScore: 0,
    supersededNoteId: null,
    tags: '[]',
    fsrsStability: null,
    fsrsDifficulty: null,
    lastReviewAt: null,
    reviewCount: 0,
    lapseCount: 0,
    citedCount: 0,
    lastCitedAt: null,
    dueAt: null,
    fsrsState: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as KbNoteRecord
}

function mkFakes() {
  const vectorRows = new Map<string, number[]>()
  const inverted: Array<{ term: string; chunkId: string; knowledgeBaseId: string; termFrequency: number }> = []
  const embedCalls: string[][] = []
  const deps = {
    embed: async (texts: string[]) => {
      embedCalls.push(texts)
      return texts.map((t) => [t.length, 0.5])
    },
    vectors: {
      createBatch: async (items: Array<{ chunkId: string; knowledgeBaseId: string; vector: number[] }>) => {
        for (const i of items) vectorRows.set(i.chunkId, i.vector)
      },
      deleteByChunkId: async (chunkId: string) => {
        vectorRows.delete(chunkId)
      },
      findByChunkIds: async (ids: string[]) => {
        const m = new Map<string, { chunkId: string }>()
        for (const id of ids) if (vectorRows.has(id)) m.set(id, { chunkId: id })
        return m
      },
    },
    inverted: {
      insertBatch: async (items: Array<{ term: string; chunkId: string; knowledgeBaseId: string; termFrequency: number }>) => {
        inverted.push(...items)
      },
      deleteByChunkId: async (chunkId: string) => {
        for (let i = inverted.length - 1; i >= 0; i--) if (inverted[i]!.chunkId === chunkId) inverted.splice(i, 1)
      },
    },
  }
  return { deps: deps as unknown as Pick<NoteIndexDeps, 'embed' | 'vectors' | 'inverted'>, vectorRows, inverted, embedCalls }
}

describe('卡片检索索引（M0-#7）', () => {
  it('索引文本：标题+描述+正文节选；空段剔除、正文截断', () => {
    expect(noteIndexText(mkNote('a'))).toBe('标题-a\n描述-a\n正文-a')
    expect(noteIndexText({ title: 't', description: '', body: 'b' })).toBe('t\nb')
    const long = noteIndexText({ title: 't', description: 'd', body: 'x'.repeat(2000) })
    expect(long.length).toBeLessThan(700)
    expect(long).not.toContain('x'.repeat(601))
  })

  it('单卡写入：note: 向量 + 倒排；重写幂等不重复', async () => {
    const { deps, vectorRows, inverted, embedCalls } = mkFakes()
    expect(await indexNoteWithDeps(deps, 'kb-i', mkNote('n1'))).toBe(true)
    expect(vectorRows.has('note:n1')).toBe(true)
    expect(embedCalls.length).toBe(1)
    expect(inverted.length).toBeGreaterThan(0)
    expect(inverted.every((r) => r.chunkId === 'note:n1' && r.knowledgeBaseId === 'kb-i')).toBe(true)
    const invertedCount = inverted.length
    // 重写：先删后写，向量不重复、倒排不重复
    expect(await indexNoteWithDeps(deps, 'kb-i', mkNote('n1', { body: '正文-改' }))).toBe(true)
    expect(vectorRows.size).toBe(1)
    expect(inverted.length).toBe(invertedCount)
  })

  it('回填：只为缺索引的 published 卡补建，已索引跳过', async () => {
    const { deps, vectorRows } = mkFakes()
    vectorRows.set('note:already', [1, 2])
    const lister = {
      listByStatus: async () => ({
        rows: [mkNote('already'), mkNote('m1'), mkNote('m2')],
      }),
    }
    const full: NoteIndexDeps = { ...deps, notes: lister }
    expect(await ensureNotesIndexedWithDeps(full, 'kb-i')).toBe(2)
    // 第二轮：全部已索引 → 0
    expect(await ensureNotesIndexedWithDeps(full, 'kb-i')).toBe(0)
  })
})

describe('卡片发布钩子漏斗', () => {
  let ds: DataSource
  let notes: KbNoteRepository

  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities).filter((v) => typeof v === 'function') as EntityCtor[],
      synchronize: false,
      logging: false,
    })
    await ds.initialize()
    await createKbBrainTestTables(ds)
    await insertTestKb(ds, { id: 'kb-h' })
    notes = new KbNoteRepository(ds)
  })

  afterAll(async () => {
    setKbNotePublishHook(null)
    await ds?.destroy()
  })

  it('publish 触发钩子；evolveCard 仅对已发布卡触发', async () => {
    const fired: string[] = []
    setKbNotePublishHook(async (n) => {
      fired.push(`${n.id}:${n.status}`)
    })
    try {
      const proposed = await notes.propose('kb-h', { title: '钩子卡', description: 'd', body: 'b', type: 'plot-pattern' })
      await notes.publish(proposed.id)
      expect(fired).toEqual([`${proposed.id}:published`])

      // proposed 卡演进不触发（还没发布）
      const p2 = await notes.propose('kb-h', { title: '待审卡', description: 'd', body: 'b', type: 'plot-pattern' })
      await notes.evolveCard(p2.id, { body: 'b2' })
      expect(fired.length).toBe(1)

      // published 卡演进触发（索引需随内容刷新）
      await notes.evolveCard(proposed.id, { body: 'b2' })
      expect(fired.length).toBe(2)
    } finally {
      setKbNotePublishHook(null)
    }
  })

  it('钩子抛错不阻断发布主流程', async () => {
    setKbNotePublishHook(async () => {
      throw new Error('嵌入服务挂了')
    })
    try {
      const n = await notes.propose('kb-h', { title: '钩子抛错卡', description: 'd', body: 'b', type: 'insight' })
      const published = await notes.publish(n.id)
      expect(published?.status).toBe('published')
    } finally {
      setKbNotePublishHook(null)
    }
  })
})
