import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KnowledgeBaseService } from '@core/platform/services/knowledge-base.service'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import { KbChapterRepository } from '@core/database/repositories/kb-chapter.repository'
import { KbInvertedIndexRepository } from '@core/database/repositories/kb-inverted-index.repository'

import * as dbModule from '@core/database/database-manager.interface'
import * as pathModule from '@core/interfaces/path.interface'
import * as eventModule from '@core/interfaces/event.interface'

describe.each(getTestDialects())('KnowledgeBaseService.addDocument [%s]', dialect => {
  let tds: TestDataSource
  let tmpDir: string
  let svc: KnowledgeBaseService
  let kbs: KnowledgeBaseRepository
  let docs: KbDocumentRepository
  let kbVectorsMock: { deleteByDocumentId: ReturnType<typeof vi.fn> }

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    kbs = new KnowledgeBaseRepository(tds.ds)
    docs = new KbDocumentRepository(tds.ds)

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-svc-test-'))

    kbVectorsMock = {
      deleteByDocumentId: vi.fn().mockResolvedValue(undefined),
    }

    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      knowledgeBases: kbs,
      kbDocuments: docs,
      kbChunks: new KbChunkRepository(tds.ds),
      kbInvertedIndex: new KbInvertedIndexRepository(tds.ds),
      kbVectors: kbVectorsMock as any,
    } as any)

    vi.spyOn(pathModule, 'getPathProvider').mockReturnValue({
      getDataPath: () => tmpDir,
    } as any)

    // mock EventEmitter，避免 getEventEmitter() 抛"未注册"错误
    vi.spyOn(eventModule, 'getEventEmitter').mockReturnValue({
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as any)

    svc = new KnowledgeBaseService()
    // Stub processDocument（private 方法），避免真调网络 / 长跑
    vi.spyOn(svc as any, 'processDocument').mockResolvedValue(undefined)
  })

  afterAll(async () => {
    await tds.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    await tds.truncateAll()
    kbVectorsMock.deleteByDocumentId.mockClear()
  })

  async function makeKb(): Promise<string> {
    const kb = await kbs.create({
      name: 'KB1',
      embeddingModel: 'm',
      embeddingDimension: 1,
      embeddingConfig: {} as any,
    } as any)
    return kb.id
  }

  it('无 source → 新建路径，isUpdate=false，source 为 undefined', async () => {
    const kbId = await makeKb()
    const result = await svc.addDocument(kbId, {
      name: '手动文档',
      type: 'text',
      content: 'hello',
    })
    expect(result.success).toBe(true)
    expect(result.data!.isUpdate).toBe(false)
    expect(result.data!.doc.source).toBeUndefined()
  })

  it('有 source 未命中 → 新建并持久化 source', async () => {
    const kbId = await makeKb()
    const result = await svc.addDocument(kbId, {
      name: '日记A',
      type: 'text',
      content: '内容',
      source: { type: 'diary', id: 'entry-1' },
    })
    expect(result.success).toBe(true)
    expect(result.data!.isUpdate).toBe(false)
    expect(result.data!.doc.source).toEqual({ type: 'diary', id: 'entry-1' })

    const found = await docs.findBySource(kbId, { type: 'diary', id: 'entry-1' })
    expect(found).not.toBeNull()
  })

  it('有 source 命中 → 走 upsert 路径，复用 doc.id 与 filePath', async () => {
    const kbId = await makeKb()
    const first = await svc.addDocument(kbId, {
      name: '日记A v1',
      type: 'text',
      content: '旧内容',
      source: { type: 'diary', id: 'entry-1' },
    })
    const firstDocId = first.data!.doc.id
    const firstFilePath = first.data!.doc.filePath

    const second = await svc.addDocument(kbId, {
      name: '日记A v2',
      type: 'text',
      content: '新内容（更长一点）',
      source: { type: 'diary', id: 'entry-1' },
    })
    expect(second.data!.isUpdate).toBe(true)
    expect(second.data!.doc.id).toBe(firstDocId)
    expect(second.data!.doc.filePath).toBe(firstFilePath)
    expect(second.data!.doc.name).toBe('日记A v2')
    expect(second.data!.doc.fileSize).toBe(Buffer.byteLength('新内容（更长一点）', 'utf-8'))

    const onDisk = fs.readFileSync(firstFilePath, 'utf-8')
    expect(onDisk).toBe('新内容（更长一点）')

    const kb = await kbs.findById(kbId)
    expect(kb!.documentCount).toBe(1)
  })

  it('upsert 路径调 clearDocumentArtifacts（验证 kbVectors.deleteByDocumentId 被调）', async () => {
    const kbId = await makeKb()
    await svc.addDocument(kbId, {
      name: 'X',
      type: 'text',
      content: 'a',
      source: { type: 'diary', id: 'd1' },
    })

    expect(kbVectorsMock.deleteByDocumentId).not.toHaveBeenCalled()

    await svc.addDocument(kbId, {
      name: 'X',
      type: 'text',
      content: 'b',
      source: { type: 'diary', id: 'd1' },
    })
    expect(kbVectorsMock.deleteByDocumentId).toHaveBeenCalled()
  })
})

// ===== review 回归（2026-09-12）：删除路径必须连同 kb_chapters 一起清理 =====
// 章节表冗余存全文，漏删 = 删除文档/整库后正文仍留在数据库
describe.each(getTestDialects())('KnowledgeBaseService 删除清理章节 [%s]', dialect => {
  let tds: TestDataSource
  let tmpDir: string
  let svc: KnowledgeBaseService
  let kbs: KnowledgeBaseRepository
  let docs: KbDocumentRepository
  let chapters: KbChapterRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    kbs = new KnowledgeBaseRepository(tds.ds)
    docs = new KbDocumentRepository(tds.ds)
    chapters = new KbChapterRepository(tds.ds)

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-svc-del-test-'))

    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      knowledgeBases: kbs,
      kbDocuments: docs,
      kbChunks: new KbChunkRepository(tds.ds),
      kbInvertedIndex: new KbInvertedIndexRepository(tds.ds),
      kbVectors: { deleteByDocumentId: vi.fn().mockResolvedValue(undefined), deleteByChunkId: vi.fn().mockResolvedValue(undefined) } as any,
      kbChapters: chapters,
    } as any)

    vi.spyOn(pathModule, 'getPathProvider').mockReturnValue({
      getDataPath: () => tmpDir,
    } as any)

    vi.spyOn(eventModule, 'getEventEmitter').mockReturnValue({
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as any)

    svc = new KnowledgeBaseService()
    vi.spyOn(svc as any, 'processDocument').mockResolvedValue(undefined)
  })

  afterAll(async () => {
    await tds.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  async function makeKb(): Promise<string> {
    const kb = await kbs.create({
      name: 'KB-DEL',
      embeddingModel: 'm',
      embeddingDimension: 1,
      embeddingConfig: {} as any,
    } as any)
    return kb.id
  }

  async function makeDocWithChapter(kbId: string, name: string): Promise<string> {
    const r = await svc.addDocument(kbId, { name, type: 'text', content: '正文' })
    const docId = r.data!.doc.id
    await chapters.replaceByDocument(docId, [
      { id: `ch_${name}`, documentId: docId, knowledgeBaseId: kbId, title: '第一章', level: 1, ordering: 0, content: '整章全文……' },
    ])
    return docId
  }

  it('deleteDocument 连同 kb_chapters 一起删（正文不残留）', async () => {
    const kbId = await makeKb()
    const docId = await makeDocWithChapter(kbId, '单文档')
    expect(await chapters.findByDocument(docId)).toHaveLength(1)

    const del = await svc.deleteDocument(docId)
    expect(del.success).toBe(true)
    expect(await chapters.findByDocument(docId)).toHaveLength(0)
  })

  it('deleteKnowledgeBase 也清理 kb_chapters', async () => {
    const kbId = await makeKb()
    const docA = await makeDocWithChapter(kbId, '文档A')
    const docB = await makeDocWithChapter(kbId, '文档B')
    expect(await chapters.findByDocument(docA)).toHaveLength(1)
    expect(await chapters.findByDocument(docB)).toHaveLength(1)

    const del = await svc.deleteKnowledgeBase(kbId)
    expect(del.success).toBe(true)
    expect(await chapters.findByDocument(docA)).toHaveLength(0)
    expect(await chapters.findByDocument(docB)).toHaveLength(0)
  })
})
