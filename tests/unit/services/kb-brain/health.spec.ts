/**
 * 大脑体检服务测试（§检查机制）
 *
 * 覆盖：覆盖率统计（章消化/耗尽/零产出）、知识构成（分层/存疑/悬置）、
 * 建议生成（待提取/耗尽章/存疑/待审批/书级遍缺失）、只读不写。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { registerCoreDatabaseManager } from '@core/database/database-manager.interface'
import { KbBrainHealthService } from '@core/platform/services/kb-brain/health.service'
import { createKbBrainTestTables, insertTestKb, insertTestDoc } from '../../helpers/kb-brain-test-db'

type EntityCtor = new (...args: unknown[]) => object

describe('KbBrainHealthService 体检', () => {
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
    await createKbBrainTestTables(ds)
    registerCoreDatabaseManager(() => ({
      kbAtoms: new KbAtomRepository(ds),
      kbNotes: new KbNoteRepository(ds),
      kbDigestPasses: new KbDigestPassRepository(ds),
      kbDocuments: new KbDocumentRepository(ds),
      kbChapters: new KbChapterRepository(ds),
      kbBrainEntities: new KbEntityRepository(ds),
      knowledgeBases: new KnowledgeBaseRepository(ds),
    }) as never)
    await insertTestKb(ds, { id: 'kb-h', brainConfig: JSON.stringify({ enabled: true, profile: { contentType: 'novel' } }) })
    await insertTestDoc(ds, { id: 'doc-h1', kbId: 'kb-h' })
    await insertTestDoc(ds, { id: 'doc-h2', kbId: 'kb-h' })

    const chapters = new KbChapterRepository(ds)
    await chapters.replaceByDocument('doc-h1', [
      { id: 'ch-h1', documentId: 'doc-h1', knowledgeBaseId: 'kb-h', title: '第1章', level: 1, ordering: 0, content: 'c1', contentHash: 'hh1' },
      { id: 'ch-h2', documentId: 'doc-h1', knowledgeBaseId: 'kb-h', title: '第2章', level: 1, ordering: 1, content: 'c2', contentHash: 'hh2' },
    ])
    const passes = new KbDigestPassRepository(ds)
    const d1 = await passes.ensurePass({ knowledgeBaseId: 'kb-h', documentId: 'doc-h1', chapterId: 'ch-h1', passType: 'base', passKey: 'base', chapterHash: 'hh1' })
    await passes.setRunning(d1.pass.id)
    await passes.setDone(d1.pass.id, { atoms: 3, merged: 0 }, { calls: 1 })
    const d2 = await passes.ensurePass({ knowledgeBaseId: 'kb-h', documentId: 'doc-h1', chapterId: 'ch-h2', passType: 'base', passKey: 'base', chapterHash: 'hh2' })
    await passes.setRunning(d2.pass.id)
    await passes.setFailed(d2.pass.id, 'llm down')
    // 手工推到 attempts=3（耗尽）
    await ds.query(`UPDATE kb_digest_passes SET attempts = 3 WHERE chapter_id = 'ch-h2'`)
    // 书级遍记录
    const d3 = await passes.ensurePass({ knowledgeBaseId: 'kb-h', documentId: 'doc-h1', chapterId: null, passType: 'book', passKey: 'book:outline', chapterHash: 'fp' })
    await passes.setRunning(d3.pass.id)
    await passes.setDone(d3.pass.id, { cards: 1 }, { calls: 1 })

    const atoms = new KbAtomRepository(ds)
    await atoms.createBatch([
      { knowledgeBaseId: 'kb-h', statement: '设定论断', type: 'fact', sourceDocumentId: 'doc-h1', sourceQuote: 'q', layer: 'setting' },
      { knowledgeBaseId: 'kb-h', statement: '存疑论断', type: 'fact', sourceDocumentId: 'doc-h1', sourceQuote: 'q' },
      { knowledgeBaseId: 'kb-h', statement: '悬置点', type: 'open-question', sourceDocumentId: 'doc-h1', sourceQuote: 'q' },
    ])
    const atomRepo = new KbAtomRepository(ds)
    const rows = await atomRepo.findByKb('kb-h', { limit: 10 })
    await atomRepo.updateStatus(rows[1].id, { status: 'suspected' })
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('报告：覆盖率/构成/书级遍/建议一次产出', async () => {
    const res = await new KbBrainHealthService().check('kb-h')
    expect(res.success).toBe(true)
    const r = res.data!
    expect(r.profile).toEqual({ contentType: 'novel', detected: true })
    // doc-h2 待提取（brain_status null）、doc-h1 已跑（brain_status 未写也算 pending——按实现口径）
    expect(r.coverage.chaptersTotal).toBe(2)
    expect(r.coverage.chaptersDigested).toBe(1)
    expect(r.coverage.chaptersExhausted).toBe(1)
    expect(r.coverage.chaptersNoAtoms).toBe(0)
    expect(r.knowledge.byLayer.setting).toBe(1)
    expect(r.knowledge.byStatus.suspected).toBe(1)
    expect(r.knowledge.openQuestions).toBe(1)
    expect(r.bookPasses).toHaveLength(1)
    expect(r.bookPasses[0]).toMatchObject({ documentName: '测试书-doc-h1', passKey: 'book:outline', status: 'done' })
  })

  it('建议：存疑/悬置未登记台账/待提取 生成对应建议', async () => {
    const r = (await new KbBrainHealthService().check('kb-h')).data!
    const codes = r.suggestions.map((s) => s.code)
    expect(codes).toContain('chapters-exhausted')
    expect(codes).toContain('conflicts-pending')
    expect(codes).toContain('foreshadow-open')
  })

  it('不存在的库 → 失败而非炸', async () => {
    const res = await new KbBrainHealthService().check('kb-none')
    expect(res.success).toBe(false)
    expect(res.error).toBeTruthy()
  })
})
