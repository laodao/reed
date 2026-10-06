import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'
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

    const onDisk = fs.readFileSync(path.join(tmpDir, firstFilePath), 'utf-8')
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

// ===== review M14：processDocument 是 fire-and-forget，管线执行中文档可能被删除 =====
// （deleteDocument / 日记 purgeEntryIds），继续跑会写 chunks/vectors/倒排孤儿行。
// 各阶段边界必须回读文档行（assertDocAlive），已删则记日志并安静中止。
describe.each(getTestDialects())('KnowledgeBaseService.processDocument 文档中途删除 [%s]', dialect => {
  let tds: TestDataSource
  let tmpDir: string
  let svc: KnowledgeBaseService
  let kbs: KnowledgeBaseRepository
  let docs: KbDocumentRepository
  let chunks: KbChunkRepository
  let invIndex: KbInvertedIndexRepository
  let vectorsMock: {
    deleteByDocumentId: ReturnType<typeof vi.fn>
    createBatch: ReturnType<typeof vi.fn>
  }

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    kbs = new KnowledgeBaseRepository(tds.ds)
    docs = new KbDocumentRepository(tds.ds)
    chunks = new KbChunkRepository(tds.ds)
    invIndex = new KbInvertedIndexRepository(tds.ds)

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-svc-mid-del-'))

    vectorsMock = {
      deleteByDocumentId: vi.fn().mockResolvedValue(undefined),
      createBatch: vi.fn().mockResolvedValue(undefined),
    }

    vi.spyOn(dbModule, 'getCoreDatabaseManager').mockReturnValue({
      knowledgeBases: kbs,
      kbDocuments: docs,
      kbChunks: chunks,
      kbInvertedIndex: invIndex,
      kbVectors: vectorsMock as any,
      kbChapters: new KbChapterRepository(tds.ds),
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
    // 本组用例跑真 processDocument（不 spy 掉）；只桩 embedding，避免外部 API 依赖
    vi.spyOn(svc, 'getEmbeddingVectors').mockImplementation(async (texts: string[]) =>
      texts.map(() => [0.1, 0.2, 0.3]),
    )
  })

  afterAll(async () => {
    await tds.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    await tds.truncateAll()
    vectorsMock.deleteByDocumentId.mockClear()
    vectorsMock.createBatch.mockClear()
  })

  async function makeKb(): Promise<{ kbId: string; kb: ReturnType<KnowledgeBaseRepository['create'] extends (...a: any[]) => infer R ? R : never> }> {
    const kb = await kbs.create({
      name: 'KB-MID-DEL',
      embeddingModel: 'm',
      embeddingDimension: 3,
      embeddingConfig: {} as any,
    } as any)
    return { kbId: kb.id, kb }
  }

  /** 建文档行 + 落盘正文（绕过 addDocument：它会 fire-and-forget 触发管线，干扰用例） */
  async function makeDoc(kbId: string, content: string): Promise<ReturnType<KbDocumentRepository['create']>> {
    const docId = randomUUID()
    const rel = `knowledge-base/${kbId}/documents/${docId}.txt`
    fs.mkdirSync(path.join(tmpDir, 'knowledge-base', kbId, 'documents'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, rel), content, 'utf-8')
    return docs.create({
      knowledgeBaseId: kbId,
      name: '中途删除文档',
      filePath: rel,
      fileType: 'txt',
      fileSize: Buffer.byteLength(content, 'utf-8'),
    })
  }

  /** markdown 多章节正文：结构切分路径（split 阶段无需 embedding），产出多个 chunk */
  function makeContent(): string {
    const sections: string[] = []
    for (let i = 1; i <= 3; i++) {
      sections.push(`# 第${i}章\n\n${`第${i}章的正文内容，用于切分测试。`.repeat(50)}`)
    }
    return sections.join('\n\n')
  }

  /** 在 updateProgress 首次达到 threshold 后立刻用真实 deleteDocument 删除文档
   * （模拟管线步骤间隙中被 purge——真实场景删除发生在两个 await 之间，而非 update 语句中途） */
  function deleteDocAtProgress(docId: string, threshold: number): void {
    const real = docs.updateProgress.bind(docs)
    let fired = false
    vi.spyOn(docs, 'updateProgress').mockImplementation(async (id: string, progress: number) => {
      await real(id, progress)
      if (!fired && progress >= threshold) {
        fired = true
        const del = await svc.deleteDocument(docId)
        expect(del.success).toBe(true)
      }
    })
  }

  it('切分完成后、chunks 写入前被删 → 不写 chunks/vectors/倒排索引，不标完成', async () => {
    const { kbId, kb } = await makeKb()
    const doc = await makeDoc(kbId, makeContent())
    const indexSpy = vi.spyOn(invIndex, 'insertBatch')
    const completedSpy = vi.spyOn(docs, 'markCompleted')
    // progress 30 = 「4. 存储切片」标记点，位于 chunks 写入边界检查之前
    deleteDocAtProgress(doc.id, 30)

    await (svc as any).processDocument(doc, kb)

    // 文档行确已删除（删除动作真实发生）
    expect(await docs.findById(doc.id)).toBeNull()
    // 后续阶段零写入：无孤儿 chunks / vectors / 倒排，未标完成
    expect(await chunks.findByDocumentId(doc.id)).toHaveLength(0)
    expect(vectorsMock.createBatch).not.toHaveBeenCalled()
    expect(indexSpy).not.toHaveBeenCalled()
    expect(completedSpy).not.toHaveBeenCalled()
    expect((await kbs.findById(kbId))!.vectorCount).toBe(0)
  })

  it('vectors 写入后、buildIndex 前被删 → 不写倒排索引、不标完成（已写 chunks 由删除清理）', async () => {
    const { kbId, kb } = await makeKb()
    const doc = await makeDoc(kbId, makeContent())
    const indexSpy = vi.spyOn(invIndex, 'insertBatch')
    const completedSpy = vi.spyOn(docs, 'markCompleted')
    // progress 90 = 「6. 索引」标记点，位于 buildIndex/markCompleted 边界检查之前
    deleteDocAtProgress(doc.id, 90)

    await (svc as any).processDocument(doc, kb)

    // 前面的 chunks/vectors 阶段已执行过（vectors 桩被调用），随后删除清掉了 chunks
    expect(vectorsMock.createBatch).toHaveBeenCalled()
    expect(await chunks.findByDocumentId(doc.id)).toHaveLength(0)
    // 中止点之后的阶段零写入
    expect(await docs.findById(doc.id)).toBeNull()
    expect(indexSpy).not.toHaveBeenCalled()
    expect(completedSpy).not.toHaveBeenCalled()
    expect((await kbs.findById(kbId))!.vectorCount).toBe(0)
  })

  it('文档未被删 → 管线正常跑完（存活性检查不误伤正常流）', async () => {
    const { kbId, kb } = await makeKb()
    const doc = await makeDoc(kbId, makeContent())

    await (svc as any).processDocument(doc, kb)

    const after = await docs.findById(doc.id)
    expect(after).not.toBeNull()
    expect(after!.status).toBe('completed')
    expect(after!.chunkCount).toBeGreaterThan(0)
    expect(vectorsMock.createBatch).toHaveBeenCalled()
    expect((await kbs.findById(kbId))!.vectorCount).toBe(after!.chunkCount)
  })
})
