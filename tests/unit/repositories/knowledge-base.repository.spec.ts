import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KnowledgeBaseRepository } from '@core/database/repositories/knowledge-base.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import { KbInvertedIndexRepository } from '@core/database/repositories/kb-inverted-index.repository'

describe.each(getTestDialects())('KB 子系统 [%s]', dialect => {
  let tds: TestDataSource
  let kbs: KnowledgeBaseRepository
  let docs: KbDocumentRepository
  let chunks: KbChunkRepository
  let inv: KbInvertedIndexRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    kbs = new KnowledgeBaseRepository(tds.ds)
    docs = new KbDocumentRepository(tds.ds)
    chunks = new KbChunkRepository(tds.ds)
    inv = new KbInvertedIndexRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ KnowledgeBase ============

  it('KB: create + 默认计数 + findById', async () => {
    const kb = await kbs.create({
      name: 'KB1',
      embeddingModel: 'text-embedding-3-large',
      embeddingDimension: 3072,
      embeddingConfig: { provider: 'openai' } as any,
    } as any)
    expect(kb.documentCount).toBe(0)
    expect(kb.vectorCount).toBe(0)
    expect(kb.totalSize).toBe(0)
    expect(kb.embeddingConfig).toContain('openai')

    const got = await kbs.findById(kb.id)
    expect(got!.name).toBe('KB1')
  })

  it('KB: existsByName + update + delete', async () => {
    await kbs.create({
      name: 'KB1',
      embeddingModel: 'm',
      embeddingDimension: 1024,
    } as any)
    expect(await kbs.existsByName('KB1')).toBe(true)
    expect(await kbs.existsByName('Nope')).toBe(false)

    const kb = (await kbs.findAll())[0]
    expect(await kbs.update(kb.id, { description: 'new desc' } as any)).toBe(true)
    expect((await kbs.findById(kb.id))!.description).toBe('new desc')

    expect(await kbs.delete(kb.id)).toBe(true)
    expect(await kbs.findById(kb.id)).toBeNull()
  })

  it('KB: incrementXxx 累加 + updatedAt 更新', async () => {
    const kb = await kbs.create({
      name: 'X',
      embeddingModel: 'm',
      embeddingDimension: 1024,
    } as any)
    await kbs.incrementDocumentCount(kb.id, 3)
    await kbs.incrementVectorCount(kb.id, 100)
    await kbs.incrementTotalSize(kb.id, 1024)
    const got = await kbs.findById(kb.id)
    expect(got!.documentCount).toBe(3)
    expect(got!.vectorCount).toBe(100)
    expect(got!.totalSize).toBe(1024)

    // 负值减少
    await kbs.incrementVectorCount(kb.id, -10)
    expect((await kbs.findById(kb.id))!.vectorCount).toBe(90)
  })

  it('KB: updateStats 直接覆盖', async () => {
    const kb = await kbs.create({
      name: 'X',
      embeddingModel: 'm',
      embeddingDimension: 1024,
    } as any)
    await kbs.updateStats(kb.id, { documentCount: 5, vectorCount: 200, totalSize: 4096 } as any)
    const got = await kbs.findById(kb.id)
    expect(got!.documentCount).toBe(5)
    expect(got!.totalSize).toBe(4096)
  })

  // ============ KbDocument ============

  it('Document: create + findByKnowledgeBaseId + 状态查询', async () => {
    const kb = await kbs.create({
      name: 'X',
      embeddingModel: 'm',
      embeddingDimension: 1024,
    } as any)
    const d = await docs.create({
      knowledgeBaseId: kb.id,
      name: 'a.pdf',
      filePath: '/x/a.pdf',
      fileType: 'pdf',
      fileSize: 1024,
    } as any)
    expect(d.status).toBe('pending')
    expect(d.progress).toBe(0)

    const list = await docs.findByKnowledgeBaseId(kb.id)
    expect(list).toHaveLength(1)

    const pending = await docs.findByStatus('pending' as any)
    expect(pending).toHaveLength(1)
  })

  it('Document: createBatch 事务批量', async () => {
    const kb = await kbs.create({
      name: 'X',
      embeddingModel: 'm',
      embeddingDimension: 1024,
    } as any)
    const list = await docs.createBatch([
      { knowledgeBaseId: kb.id, name: 'a', filePath: '/a', fileType: 'pdf', fileSize: 100 } as any,
      { knowledgeBaseId: kb.id, name: 'b', filePath: '/b', fileType: 'md', fileSize: 200 } as any,
    ])
    expect(list).toHaveLength(2)
    expect(await docs.countByKnowledgeBaseId(kb.id)).toBe(2)
  })

  it('Document: updateProgress + markCompleted + markFailed', async () => {
    const kb = await kbs.create({
      name: 'X',
      embeddingModel: 'm',
      embeddingDimension: 1024,
    } as any)
    const d = await docs.create({
      knowledgeBaseId: kb.id, name: 'a', filePath: '/a', fileType: 'pdf', fileSize: 100,
    } as any)
    await docs.updateProgress(d.id, 50)
    expect((await docs.findById(d.id))!.status).toBe('processing')
    expect((await docs.findById(d.id))!.progress).toBe(50)

    await docs.markCompleted(d.id, 10)
    const completed = await docs.findById(d.id)
    expect(completed!.status).toBe('completed')
    expect(completed!.chunkCount).toBe(10)

    const d2 = await docs.create({
      knowledgeBaseId: kb.id, name: 'b', filePath: '/b', fileType: 'pdf', fileSize: 100,
    } as any)
    await docs.markFailed(d2.id, 'parse error')
    expect((await docs.findById(d2.id))!.errorMessage).toBe('parse error')
  })

  it('Document: sumSizeByKnowledgeBaseId', async () => {
    const kb = await kbs.create({
      name: 'X',
      embeddingModel: 'm',
      embeddingDimension: 1024,
    } as any)
    await docs.create({
      knowledgeBaseId: kb.id, name: 'a', filePath: '/a', fileType: 'pdf', fileSize: 100,
    } as any)
    await docs.create({
      knowledgeBaseId: kb.id, name: 'b', filePath: '/b', fileType: 'pdf', fileSize: 200,
    } as any)
    expect(await docs.sumSizeByKnowledgeBaseId(kb.id)).toBe(300)
  })

  // ============ KbChunk ============

  it('Chunk: createBatch + findByDocumentId + findByIds', async () => {
    const kb = await kbs.create({
      name: 'X', embeddingModel: 'm', embeddingDimension: 1024,
    } as any)
    const d = await docs.create({
      knowledgeBaseId: kb.id, name: 'a', filePath: '/a', fileType: 'pdf', fileSize: 100,
    } as any)
    const list = await chunks.createBatch([
      { documentId: d.id, knowledgeBaseId: kb.id, content: 'one', chunkIndex: 0, title: 'A', level: 1 } as any,
      { documentId: d.id, knowledgeBaseId: kb.id, content: 'two', chunkIndex: 1 } as any,
      { documentId: d.id, knowledgeBaseId: kb.id, content: 'three', chunkIndex: 2 } as any,
    ])
    expect(list).toHaveLength(3)
    expect((await chunks.findByDocumentId(d.id)).map(c => c.content)).toEqual(['one', 'two', 'three'])

    const byIds = await chunks.findByIds([list[0].id, list[2].id])
    expect(byIds).toHaveLength(2)
  })

  it('Chunk: 分页 + 标题查询', async () => {
    const kb = await kbs.create({
      name: 'X', embeddingModel: 'm', embeddingDimension: 1024,
    } as any)
    const d = await docs.create({
      knowledgeBaseId: kb.id, name: 'a', filePath: '/a', fileType: 'pdf', fileSize: 100,
    } as any)
    for (let i = 0; i < 5; i++) {
      await chunks.create({
        documentId: d.id,
        knowledgeBaseId: kb.id,
        content: `c${i}`,
        chunkIndex: i,
        title: i === 2 ? 'special' : null,
      } as any)
    }
    const page = await chunks.findByDocumentIdPaginated(d.id, 1, 2)
    expect(page).toHaveLength(2)
    expect(page[0].chunkIndex).toBe(1)

    const found = await chunks.findByTitle(d.id, 'special')
    expect(found!.chunkIndex).toBe(2)
  })

  it('Chunk: 级联删除 by document/kb', async () => {
    const kb = await kbs.create({
      name: 'X', embeddingModel: 'm', embeddingDimension: 1024,
    } as any)
    const d = await docs.create({
      knowledgeBaseId: kb.id, name: 'a', filePath: '/a', fileType: 'pdf', fileSize: 100,
    } as any)
    await chunks.create({ documentId: d.id, knowledgeBaseId: kb.id, content: 'x', chunkIndex: 0 } as any)
    await chunks.create({ documentId: d.id, knowledgeBaseId: kb.id, content: 'y', chunkIndex: 1 } as any)
    expect(await chunks.countByDocumentId(d.id)).toBe(2)

    await chunks.deleteByDocumentId(d.id)
    expect(await chunks.countByDocumentId(d.id)).toBe(0)
  })

  // ============ KbInvertedIndex ============

  it('InvertedIndex: upsert 重复 term+chunk_id 更新而非插入', async () => {
    await inv.upsert({ term: 'apple', chunkId: 'c1', knowledgeBaseId: 'k1', termFrequency: 3 })
    await inv.upsert({ term: 'apple', chunkId: 'c1', knowledgeBaseId: 'k1', termFrequency: 5, positions: [10, 20] })
    const list = await inv.findByTerm('k1', 'apple')
    expect(list).toHaveLength(1)
    expect(list[0].termFrequency).toBe(5)
    expect(list[0].positions).toEqual([10, 20])
  })

  it('InvertedIndex: insertBatch + findByTerms', async () => {
    await inv.insertBatch([
      { term: 'apple', chunkId: 'c1', knowledgeBaseId: 'k1', termFrequency: 3 },
      { term: 'banana', chunkId: 'c1', knowledgeBaseId: 'k1', termFrequency: 1 },
      { term: 'apple', chunkId: 'c2', knowledgeBaseId: 'k1', termFrequency: 2 },
    ])
    const map = await inv.findByTerms('k1', ['apple', 'banana'])
    expect(map.size).toBe(2)
    expect(map.get('apple')!.length).toBe(2)
    expect(map.get('banana')!.length).toBe(1)
  })

  it('InvertedIndex: 文档频率 + 切片数 + 平均长度', async () => {
    await inv.insertBatch([
      { term: 'apple', chunkId: 'c1', knowledgeBaseId: 'k1', termFrequency: 3 },
      { term: 'apple', chunkId: 'c2', knowledgeBaseId: 'k1', termFrequency: 5 },
      { term: 'banana', chunkId: 'c1', knowledgeBaseId: 'k1', termFrequency: 1 },
    ])
    const df = await inv.getDocumentFrequencies('k1')
    expect(df.get('apple')).toBe(2)
    expect(df.get('banana')).toBe(1)

    expect(await inv.getChunkCount('k1')).toBe(2)

    // 平均长度 = (3+5+1)/2 = 4.5
    expect(await inv.getAverageChunkLength('k1')).toBe(4.5)
  })

  it('KbDocument: findBySource 命中（同 KB 同 source）', async () => {
    const kb = await kbs.create({
      name: 'KB1',
      embeddingModel: 'm',
      embeddingDimension: 1,
      embeddingConfig: {} as any,
    } as any)
    const created = await docs.create({
      knowledgeBaseId: kb.id,
      name: '日记A',
      filePath: '/tmp/a.txt',
      fileType: 'txt',
      fileSize: 100,
      source: { type: 'diary', id: 'diary-1' },
    })
    expect(created.source).toEqual({ type: 'diary', id: 'diary-1' })

    const found = await docs.findBySource(kb.id, { type: 'diary', id: 'diary-1' })
    expect(found?.id).toBe(created.id)
  })

  it('KbDocument: findBySource 不跨 KB', async () => {
    const kb1 = await kbs.create({ name: 'KB1', embeddingModel: 'm', embeddingDimension: 1, embeddingConfig: {} as any } as any)
    const kb2 = await kbs.create({ name: 'KB2', embeddingModel: 'm', embeddingDimension: 1, embeddingConfig: {} as any } as any)
    await docs.create({
      knowledgeBaseId: kb1.id,
      name: '日记A',
      filePath: '/tmp/a.txt',
      fileType: 'txt',
      fileSize: 100,
      source: { type: 'diary', id: 'diary-1' },
    })
    const got = await docs.findBySource(kb2.id, { type: 'diary', id: 'diary-1' })
    expect(got).toBeNull()
  })

  it('KbDocument: 不传 source 时 sourceType/sourceId 为 null', async () => {
    const kb = await kbs.create({ name: 'KB1', embeddingModel: 'm', embeddingDimension: 1, embeddingConfig: {} as any } as any)
    const doc = await docs.create({
      knowledgeBaseId: kb.id,
      name: '上传文档',
      filePath: '/tmp/x.txt',
      fileType: 'txt',
      fileSize: 50,
    })
    expect(doc.source).toBeUndefined()
    const got = await docs.findBySource(kb.id, { type: 'diary', id: 'diary-1' })
    expect(got).toBeNull()
  })

  it('KbDocument: findBySource 不存在返回 null', async () => {
    const kb = await kbs.create({ name: 'KB1', embeddingModel: 'm', embeddingDimension: 1, embeddingConfig: {} as any } as any)
    const got = await docs.findBySource(kb.id, { type: 'diary', id: 'no-such' })
    expect(got).toBeNull()
  })

  it('InvertedIndex: deleteByChunkId / deleteByKnowledgeBaseId', async () => {
    await inv.insertBatch([
      { term: 'a', chunkId: 'c1', knowledgeBaseId: 'k1', termFrequency: 1 },
      { term: 'a', chunkId: 'c2', knowledgeBaseId: 'k1', termFrequency: 1 },
      { term: 'a', chunkId: 'c3', knowledgeBaseId: 'k2', termFrequency: 1 },
    ])
    await inv.deleteByChunkId('c1')
    expect((await inv.findByTerm('k1', 'a')).length).toBe(1)

    await inv.deleteByKnowledgeBaseId('k1')
    expect((await inv.findByTerm('k1', 'a')).length).toBe(0)
    expect((await inv.findByTerm('k2', 'a')).length).toBe(1)
  })
})
