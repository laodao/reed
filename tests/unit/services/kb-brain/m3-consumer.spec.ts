/**
 * M3 测试：FSRS 复习调度 + brain-provider 装配段 + CRAG 纠错
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createKbBrainTestTables, insertTestKb } from '../../helpers/kb-brain-test-db'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbNoteReviewRepository } from '@core/database/repositories/kb-note-review.repository'
import { KbBrainFsrsService } from '@core/platform/services/kb-brain/fsrs.service'
import { installKbBrainProvider, resetKbBrainProviderInstall } from '@core/platform/services/kb-brain/brain-provider'
import { listStructuredProviders } from '@core/platform/agent-runtime/memory/structured-provider'
import type { KnowledgeSegment } from '@core/platform/agent-runtime/memory/structured-provider'
import type { BrainQueryService } from '@core/platform/services/kb-brain/brain-query.service'

type EntityCtor = new (...args: unknown[]) => object

describe('FSRS 复习调度', () => {
  let ds: DataSource
  let notes: KbNoteRepository
  let reviews: KbNoteReviewRepository
  let svc: KbBrainFsrsService
  const KB = 'kb-fsrs'

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
    // learning 启用
    await insertTestKb(ds, { id: KB, brainConfig: '{"enabled":true,"learning":{"enabled":true,"desiredRetention":0.9}}' })
    notes = new KbNoteRepository(ds)
    reviews = new KbNoteReviewRepository(ds)
    svc = new KbBrainFsrsService({
      repos: () => ({
        notes,
        reviews,
        learningEnabled: async () => true,
      }),
    })
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  async function plantCard(): Promise<string> {
    const n = await notes.propose(KB, { title: `复习卡-${Math.random()}`, description: 'x', type: 'methodology' })
    await notes.publish(n.id)
    // 初始化 due（首卡视为已到期）
    await ds.query(`UPDATE kb_notes SET due_at = datetime('now', '-1 day') WHERE id = '${n.id}'`)
    return n.id
  }

  it('learning 未启用 → dueNext 空、grade 拒绝', async () => {
    const disabled = new KbBrainFsrsService({ repos: () => ({ notes, reviews, learningEnabled: async () => false }) })
    expect(await disabled.dueNext(KB, 10)).toEqual([])
    const n = await plantCard()
    expect((await disabled.grade(KB, n, 3)).success).toBe(false)
  })

  it('到期卡进入队列；评分后 due 后移 + 评分历史落账 + stability 增长', async () => {
    const noteId = await plantCard()
    const due = await svc.dueNext(KB, 10)
    expect(due.some((d) => d.noteId === noteId)).toBe(true)

    const before = await notes.findById(noteId)
    const g = await svc.grade(KB, noteId, 3)
    expect(g.success).toBe(true)
    expect(g.nextDueAt!).toBeInstanceOf(Date)

    const after = await notes.findById(noteId)
    expect(after!.fsrsStability!).toBeGreaterThan(before!.fsrsStability ?? 0)
    expect(new Date(after!.dueAt!).getTime()).toBeGreaterThan(Date.now())
    const logs = await reviews.findByNote(noteId)
    expect(logs).toHaveLength(1)
    expect(logs[0].rating).toBe(3)
    // 已不在到期队列
    expect((await svc.dueNext(KB, 10)).some((d) => d.noteId === noteId)).toBe(false)
  })

  it('不存在的卡片评分拒绝', async () => {
    expect((await svc.grade(KB, 'no-such', 3)).success).toBe(false)
  })
})

describe('brain-provider（T17）', () => {
  it('supports 三创作宿主；query 输出预算内 KnowledgeSegment', async () => {
    resetKbBrainProviderInstall()
    const fakeBrainQuery = {
      search: async () => ({
        success: true,
        data: [
          { documentName: '《X》', content: '复仇爽点第三次必然递减', kind: 'atom', score: 0.9 },
          { documentName: '思想卡', content: '延迟型代价导致偿付潮', kind: 'note', score: 0.8 },
        ],
      }),
    } as unknown as BrainQueryService
    installKbBrainProvider({
      brainQuery: fakeBrainQuery,
      enabledKbs: async () => [{ id: 'kb-x', embeddingConfig: null }],
    })

    const provider = listStructuredProviders().find((p) => p.id === 'kb-brain')
    expect(provider).toBeTruthy()
    expect(provider!.supports({ bizModule: 'longwriting', projectId: 'p1' })).toBe(true)
    expect(provider!.supports({ bizModule: 'chat' })).toBe(false)

    const segments: KnowledgeSegment[] = await provider!.query({
      scope: { bizModule: 'longwriting', projectId: 'p1' },
      topics: ['复仇', '代价'],
      budget: { maxSegments: 2, maxChars: 600 },
    })
    expect(segments).toHaveLength(2)
    expect(segments[0].layer).toBe('L3')
    expect(segments[0].source.provider).toBe('kb-brain')
    expect(segments[0].text).toContain('复仇爽点第三次必然递减')
    resetKbBrainProviderInstall()
  })
})
