import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KnowledgeBaseService } from '@core/services/knowledge-base.service'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
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
