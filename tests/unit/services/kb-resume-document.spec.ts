/**
 * 知识库文档「继续处理」（断点续跑）测试
 *
 * 背景：processDocument 是纯内存 fire-and-forget，PC 重启后 Promise 蒸发，
 * 文档永久卡在 processing。续跑语义（用户裁决：保留已有向量，只补未完成部分）：
 *   管线顺序 = 解析 → 切片落库 → 逐批生成向量 → 建倒排索引 → 标记完成
 *
 * 契约：
 *  1. chunks 有、vectors 部分缺失 → 只为缺失的 chunk 生成向量（已有向量绝不重跑）
 *  2. chunks + vectors 齐全、仅缺索引 → 不重新生成任何向量，只建索引并标记完成
 *  3. 无 chunks（解析/切片阶段中断）→ 从头跑
 *  4. 幂等：已完成文档再续跑不重复生成向量
 *  5. **后台执行**：resumeDocument 只等「是否成功启动」，不阻塞到管线跑完
 *     （大文档数千切片要数分钟，同步 await 会锁死界面）；进度/终态走事件
 *  6. 取数纪律：判定阶段不读正文，正文按 embedding 批大小分批取回
 */
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

describe.each(getTestDialects())('KnowledgeBaseService 继续处理（断点续跑）[%s]', dialect => {
  let tds: TestDataSource
  let tmpDir: string
  let svc: KnowledgeBaseService
  let kbs: KnowledgeBaseRepository
  let docs: KbDocumentRepository
  let chunks: KbChunkRepository
  let invIndex: KbInvertedIndexRepository

  /** 向量桩：真实记录「哪些 chunkId 已落向量」，模拟向量库跨重启持久化 */
  let vectorStore: Map<string, number[]>
  let vectorsMock: {
    createBatch: ReturnType<typeof vi.fn>
    deleteByDocumentId: ReturnType<typeof vi.fn>
    findByChunkIds: ReturnType<typeof vi.fn>
    findByChunkId: ReturnType<typeof vi.fn>
  }
  /** 捕获状态事件（断言后台任务的失败/完成通知） */
  let emitted: Array<{ channel: string; data: any }>

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    kbs = new KnowledgeBaseRepository(tds.ds)
    docs = new KbDocumentRepository(tds.ds)
    chunks = new KbChunkRepository(tds.ds)
    invIndex = new KbInvertedIndexRepository(tds.ds)

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-resume-test-'))
    vectorStore = new Map()

    vectorsMock = {
      createBatch: vi.fn(async (items: Array<{ chunkId: string; vector: number[] }>) => {
        for (const it of items) vectorStore.set(it.chunkId, it.vector)
      }),
      deleteByDocumentId: vi.fn(async (documentId: string) => {
        const rows = await chunks.findByDocumentId(documentId)
        for (const r of rows) vectorStore.delete(r.id)
      }),
      findByChunkIds: vi.fn(async (ids: string[]) => {
        const m = new Map<string, any>()
        for (const id of ids) {
          if (vectorStore.has(id)) m.set(id, { chunkId: id, vector: vectorStore.get(id) })
        }
        return m
      }),
      findByChunkId: vi.fn(async (id: string) =>
        vectorStore.has(id) ? { chunkId: id, vector: vectorStore.get(id) } : null,
      ),
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

    emitted = []
    vi.spyOn(eventModule, 'getEventEmitter').mockReturnValue({
      emit: (channel: string, data: any) => emitted.push({ channel, data }),
      on: vi.fn(),
      off: vi.fn(),
    } as any)

    svc = new KnowledgeBaseService()
  })

  afterAll(async () => {
    await tds.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  beforeEach(async () => {
    await tds.truncateAll()
    vectorStore.clear()
    emitted = []
    vectorsMock.createBatch.mockClear()
    vectorsMock.findByChunkIds.mockClear()
  })

  async function makeKb() {
    return await kbs.create({
      name: 'KB-RESUME',
      embeddingModel: 'm',
      embeddingDimension: 3,
      embeddingConfig: {} as any,
    } as any)
  }

  /** 建文档行 + 落盘正文（绕过 addDocument：它会 fire-and-forget 触发管线） */
  async function makeDoc(kbId: string, content: string) {
    const docId = randomUUID()
    const rel = `knowledge-base/${kbId}/documents/${docId}.txt`
    fs.mkdirSync(path.join(tmpDir, 'knowledge-base', kbId, 'documents'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, rel), content, 'utf-8')
    return docs.create({
      knowledgeBaseId: kbId,
      name: '续跑测试文档',
      filePath: rel,
      fileType: 'txt',
      fileSize: Buffer.byteLength(content, 'utf-8'),
    })
  }

  function makeContent(): string {
    const sections: string[] = []
    for (let i = 1; i <= 3; i++) {
      sections.push(`# 第${i}章\n\n${`第${i}章的正文内容，用于断点续跑测试。`.repeat(50)}`)
    }
    return sections.join('\n\n')
  }

  /** 模拟「跑到一半重启」：手动落 chunks + 给前 N 个 chunk 落向量，状态停在 processing */
  async function simulateInterrupted(
    docId: string,
    kbId: string,
    totalChunks: number,
    withVectors: number,
  ): Promise<string[]> {
    const reqs = Array.from({ length: totalChunks }, (_, i) => ({
      documentId: docId,
      knowledgeBaseId: kbId,
      content: `模拟切片内容 ${i}：${'填充文本。'.repeat(30)}`,
      chunkIndex: i,
      startOffset: i * 100,
      endOffset: (i + 1) * 100,
      splitMethod: 'fixed' as any,
    }))
    const saved = await chunks.createBatch(reqs)
    const ids = saved.map(c => c.id)
    for (let i = 0; i < withVectors && i < ids.length; i++) {
      vectorStore.set(ids[i], [0.1, 0.2, 0.3])
    }
    await docs.updateProgress(docId, 50)
    return ids
  }

  it('chunks 已落 + 部分向量缺失 → 只补缺失向量，已有向量不重跑', async () => {
    const kb = await makeKb()
    const doc = await makeDoc(kb.id, makeContent())
    const total = 6
    const withVectors = 4
    const ids = await simulateInterrupted(doc.id, kb.id, total, withVectors)

    const embedSpy = vi
      .spyOn(svc, 'getEmbeddingVectors')
      .mockImplementation(async (texts: string[]) => texts.map(() => [0.5, 0.5, 0.5]))

    const res = await svc.resumeDocument(doc.id)
    expect(res.success, res.error).toBe(true)
    // 后台执行：等待任务收尾后再断言终态（确定性等待，不轮询）
    await svc.waitForBackgroundTask(doc.id)

    // 只为缺失的 2 条生成向量（4 条已有，绝不重跑）
    expect(embedSpy).toHaveBeenCalledTimes(1)
    const fedTexts = embedSpy.mock.calls[0][0] as string[]
    expect(fedTexts).toHaveLength(total - withVectors)

    // 不重不漏：全部 chunk 都有向量
    expect(vectorStore.size).toBe(total)
    // 已有向量的内容未被覆盖（保留原值）
    expect(vectorStore.get(ids[0])).toEqual([0.1, 0.2, 0.3])
    expect(vectorStore.get(ids[total - 1])).toEqual([0.5, 0.5, 0.5])

    const after = await docs.findById(doc.id)
    expect(after!.status).toBe('completed')
    expect(after!.chunkCount).toBe(total)
  })

  it('chunks + 向量全齐、仅缺索引 → 不重新生成任何向量，只建索引并标完成', async () => {
    const kb = await makeKb()
    const doc = await makeDoc(kb.id, makeContent())
    const total = 5
    await simulateInterrupted(doc.id, kb.id, total, total)

    const embedSpy = vi.spyOn(svc, 'getEmbeddingVectors')
    const indexSpy = vi.spyOn(invIndex, 'insertBatch')

    const res = await svc.resumeDocument(doc.id)
    expect(res.success, res.error).toBe(true)
    await svc.waitForBackgroundTask(doc.id)

    // 零 embedding 调用：已有向量一个都不重算（省费用/时间的核心保证）
    expect(embedSpy).not.toHaveBeenCalled()
    expect(indexSpy).toHaveBeenCalled()

    const after = await docs.findById(doc.id)
    expect(after!.status).toBe('completed')
    expect(after!.chunkCount).toBe(total)
  })

  it('无 chunks（解析/切片阶段就中断）→ 从头跑完整管线', async () => {
    const kb = await makeKb()
    const doc = await makeDoc(kb.id, makeContent())
    await docs.updateProgress(doc.id, 10)

    vi.spyOn(svc, 'getEmbeddingVectors').mockImplementation(async (texts: string[]) =>
      texts.map(() => [0.9, 0.9, 0.9]),
    )

    const res = await svc.resumeDocument(doc.id)
    expect(res.success, res.error).toBe(true)
    await svc.waitForBackgroundTask(doc.id)

    const after = await docs.findById(doc.id)
    expect(after!.status).toBe('completed')
    expect(after!.chunkCount).toBeGreaterThan(0)
    const allChunks = await chunks.findByDocumentId(doc.id)
    expect(vectorStore.size).toBe(allChunks.length)
  })

  it('已完成的文档续跑 → 幂等，不重复生成向量', async () => {
    const kb = await makeKb()
    const doc = await makeDoc(kb.id, makeContent())

    vi.spyOn(svc, 'getEmbeddingVectors').mockImplementation(async (texts: string[]) =>
      texts.map(() => [0.3, 0.3, 0.3]),
    )
    await (svc as any).processDocument(doc, kb)
    const done = await docs.findById(doc.id)
    expect(done!.status).toBe('completed')
    const sizeAfterFirst = vectorStore.size

    const embedSpy = vi.spyOn(svc, 'getEmbeddingVectors').mockClear()
    const res = await svc.resumeDocument(doc.id)
    expect(res.success, res.error).toBe(true)
    await svc.waitForBackgroundTask(doc.id)

    expect(embedSpy).not.toHaveBeenCalled()
    expect(vectorStore.size).toBe(sizeAfterFirst)
  })

  it('后台执行：resumeDocument 立即返回，不等管线跑完（界面不被锁死）', async () => {
    const kb = await makeKb()
    const doc = await makeDoc(kb.id, makeContent())
    await simulateInterrupted(doc.id, kb.id, 8, 0)

    // embedding 卡住不返回（模拟慢速 API）——若为同步等待，resumeDocument 会一直挂着
    let releaseEmbed!: () => void
    const gate = new Promise<void>(r => (releaseEmbed = r))
    vi.spyOn(svc, 'getEmbeddingVectors').mockImplementation(async (texts: string[]) => {
      await gate
      return texts.map(() => [0.2, 0.2, 0.2])
    })

    const t0 = Date.now()
    const res = await svc.resumeDocument(doc.id)
    const elapsed = Date.now() - t0

    // 立即返回（远小于 embedding 的等待时间），且报告"已受理"
    expect(res.success, res.error).toBe(true)
    expect(elapsed).toBeLessThan(1000)
    // 已受理 = 处于处理中
    expect(svc.isProcessing(doc.id)).toBe(true)
    const row = await docs.findById(doc.id)
    expect(row!.status).toBe('processing')

    // 放行，确认后续能正常收尾
    releaseEmbed()
    await svc.waitForBackgroundTask(doc.id)
    expect((await docs.findById(doc.id))!.status).toBe('completed')
  })

  it('防重复触发：同一文档已在处理 → 第二次调用被拒绝', async () => {
    const kb = await makeKb()
    const doc = await makeDoc(kb.id, makeContent())
    await simulateInterrupted(doc.id, kb.id, 8, 0)

    let releaseEmbed!: () => void
    const gate = new Promise<void>(r => (releaseEmbed = r))
    vi.spyOn(svc, 'getEmbeddingVectors').mockImplementation(async (texts: string[]) => {
      await gate
      return texts.map(() => [0.2, 0.2, 0.2])
    })

    const first = await svc.resumeDocument(doc.id)
    expect(first.success).toBe(true)

    const second = await svc.resumeDocument(doc.id)
    expect(second.success).toBe(false)
    expect(second.error).toMatch(/正在处理/)

    releaseEmbed()
    await svc.waitForBackgroundTask(doc.id)
  })

  it('后台任务失败 → 落库失败原因 + 发失败事件（不静默停在处理中）', async () => {
    const kb = await makeKb()
    const doc = await makeDoc(kb.id, makeContent())
    await simulateInterrupted(doc.id, kb.id, 6, 0)

    vi.spyOn(svc, 'getEmbeddingVectors').mockRejectedValue(
      new Error('Embedding 接口返回 401 Unauthorized：Invalid API-key provided.'),
    )

    const res = await svc.resumeDocument(doc.id)
    expect(res.success, res.error).toBe(true)
    await svc.waitForBackgroundTask(doc.id)

    const after = await docs.findById(doc.id)
    expect(after!.status).toBe('failed')
    expect(after!.errorMessage).toMatch(/Invalid API-key provided/)

    const failedEvent = emitted.find(
      e => e.channel === 'kb:document-status' && e.data?.status === 'failed',
    )
    expect(failedEvent).toBeTruthy()
    expect(failedEvent!.data.errorMessage).toMatch(/Invalid API-key provided/)
  })

  it('取数纪律：判定阶段不读正文，正文按批取回（大文档 SQLITE_CANTOPEN 回归）', async () => {
    const kb = await makeKb()
    const doc = await makeDoc(kb.id, makeContent())
    const total = 8
    const ids = await simulateInterrupted(doc.id, kb.id, total, 0)

    vi.spyOn(svc, 'getEmbeddingVectors').mockImplementation(async (texts: string[]) =>
      texts.map(() => [0.4, 0.4, 0.4]),
    )

    const findByDocSpy = vi.spyOn(chunks, 'findByDocumentId')
    const findByIdsSpy = vi.spyOn(chunks, 'findByIds')

    const res = await svc.resumeDocument(doc.id)
    expect(res.success, res.error).toBe(true)
    await svc.waitForBackgroundTask(doc.id)

    // 判定阶段取切片必须【不带】正文（否则大文档全量读正文 → SQLITE_CANTOPEN）
    const firstCall = findByDocSpy.mock.calls[0]
    expect(firstCall[1]?.includeContent).toBeFalsy()

    // 正文只在按批取回时读，每批受 embedding 批大小约束（不一次性持有全文）
    expect(findByIdsSpy).toHaveBeenCalled()
    const contentBatches = findByIdsSpy.mock.calls.filter(c => c[1]?.includeContent)
    expect(contentBatches.length).toBeGreaterThan(0)
    for (const c of contentBatches) {
      const size = (c[0] as string[]).length
      expect(size).toBeGreaterThan(0)
      expect(size).toBeLessThanOrEqual(500)
    }
    // 批次合并后覆盖全部切片（不重不漏）
    const batchedIds = contentBatches.flatMap(c => c[0] as string[])
    expect(new Set(batchedIds).size).toBe(ids.length)
  })

  it('文档不存在 → 明确报错，不静默成功', async () => {
    const res = await svc.resumeDocument(randomUUID())
    expect(res.success).toBe(false)
    expect(res.error).toBeTruthy()
  })
})