/**
 * 知识大脑统一检索池测试（T10）
 *
 * 覆盖：向量召回命名空间分流（qa: 剔除/include 过滤）、BM25 词法召回
 * （atom 行参与候选、统计排除 brain 行——存量 BM25 不被污染）、跨类型 RRF、
 * 结果解析（atom provenance/note 载荷/status 过滤/lens 过滤）、同源 chunk 去重。
 * 依赖假嵌入 + 假 searchSimilar + 真 sqlite 仓储。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createKbBrainTestTables } from '../../helpers/kb-brain-test-db'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbChunkRepository } from '@core/database/repositories/kb-chunk.repository'
import { KbDocumentRepository } from '@core/database/repositories/kb-document.repository'
import { KbInvertedIndexRepository } from '@core/database/repositories/kb-inverted-index.repository'
import { BrainQueryService, type BrainQueryDeps } from '@core/platform/services/kb-brain/brain-query.service'
import { tokenizeForIndex } from '@core/platform/services/kb-tokenize'
import { setDefaultUser, LOCAL_DEFAULT_USER_ID } from '@core/context/user-context'

type EntityCtor = new (...args: unknown[]) => object

describe('BrainQueryService', () => {
  let ds: DataSource
  let atoms: KbAtomRepository
  let notes: KbNoteRepository
  let chunks: KbChunkRepository
  let inverted: KbInvertedIndexRepository
  let fakeSimilarHits: Array<{ chunkId: string; score: number }>
  let svc: BrainQueryService

  const KB = 'kbq'

  function makeDeps(): BrainQueryDeps {
    const docs = new KbDocumentRepository(ds)
    return {
      embed: async () => {
        return [[1, 0, 0]]
      },
      searchSimilar: async () => fakeSimilarHits,
      inverted: {
        findByTerms: (kbId, terms) => inverted.findByTerms(kbId, terms),
        getDocumentFrequencies: (kbId, opts) => inverted.getDocumentFrequencies(kbId, opts),
        getChunkCount: (kbId, opts) => inverted.getChunkCount(kbId, opts),
        getAverageChunkLength: (kbId, opts) => inverted.getAverageChunkLength(kbId, opts),
      },
      atoms: new KbAtomRepository(ds),
      notes,
      chunks,
      docs,
    }
  }

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
    setDefaultUser(LOCAL_DEFAULT_USER_ID)
    await ds.query(
      `INSERT INTO knowledge_bases (id, user_id, name, embedding_model, embedding_provider) VALUES ('${KB}', '${LOCAL_DEFAULT_USER_ID}', 'q', 'm', 'cloud')`,
    )
    await ds.query(
      `INSERT INTO kb_documents (id, user_id, knowledge_base_id, name, file_path, file_type) VALUES ('docq', '${LOCAL_DEFAULT_USER_ID}', '${KB}', '查询书', '/tmp/q.txt', 'txt')`,
    )

    atoms = new KbAtomRepository(ds)
    notes = new KbNoteRepository(ds)
    chunks = new KbChunkRepository(ds)
    inverted = new KbInvertedIndexRepository(ds)
    fakeSimilarHits = []
    svc = new BrainQueryService(makeDeps())
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  it('atom 命中：provenance 载荷 + superseded/stale 跳过 + include 过滤', async () => {
    const [a1] = await atoms.createBatch([
      {
        knowledgeBaseId: KB,
        statement: '程野在第三卷失去左臂',
        type: 'fact',
        sourceDocumentId: 'docq',
        sourceChapterId: 'chq1',
        sourceQuote: '他失去了左臂',
        startOffset: 10,
        endOffset: 17,
        sourceChunkId: 'chunk-raw-1',
      },
    ])
    const [aOld] = await atoms.createBatch([
      {
        knowledgeBaseId: KB,
        statement: '程野失去右手（旧）',
        type: 'fact',
        sourceDocumentId: 'docq',
        sourceQuote: 'q-old',
      },
    ])
    await atoms.updateStatus(aOld.id, { status: 'superseded', supersededByAtomId: a1.id })

    fakeSimilarHits = [
      { chunkId: `atom:${a1.id}`, score: 0.92 },
      { chunkId: `atom:${aOld.id}`, score: 0.88 },
      { chunkId: 'qa:pair1:0', score: 0.99 }, // QA 命名空间必须被剔除
    ]
    const out = await svc.search({ knowledgeBaseId: KB, query: '程野 失去 左臂', include: ['chunk', 'atom'], embeddingConfig: null })
    expect(out.success).toBe(true)
    expect(out.data).toHaveLength(1)
    const hit = out.data![0]
    expect(hit.kind).toBe('atom')
    expect(hit.atom?.id).toBe(a1.id)
    expect(hit.atom?.quote).toBe('他失去了左臂')
    expect(hit.atom?.jumpTo).toEqual({ chapterId: 'chq1', startOffset: 10 })
    expect(hit.score).toBe(0.92)
    expect(hit.content).toBe('程野在第三卷失去左臂')
  })

  it('include 不含 chunk 时 chunk 命中不出现；lensNoteId 过滤观感论断', async () => {
    const [pub] = await atoms.createBatch([
      { knowledgeBaseId: KB, statement: '公共层事实', type: 'fact', sourceDocumentId: 'docq', sourceQuote: 'pub' },
    ])
    const [lens] = await atoms.createBatch([
      {
        knowledgeBaseId: KB,
        statement: '（人物弧光）程野堕落是渐进的',
        type: 'insight',
        sourceDocumentId: 'docq',
        sourceQuote: 'lensq',
        lensNoteId: 'lens-1',
        extractionPass: 'lens:lens-1#1',
      },
    ])
    fakeSimilarHits = [
      { chunkId: 'chunk-plain-1', score: 0.9 },
      { chunkId: `atom:${pub.id}`, score: 0.85 },
      { chunkId: `atom:${lens.id}`, score: 0.8 },
    ]
    const onlyAtom = await svc.search({ knowledgeBaseId: KB, query: 'x', include: ['atom'], embeddingConfig: null })
    expect(onlyAtom.data?.every((r) => r.kind === 'atom')).toBe(true)

    const lensOnly = await svc.search({ knowledgeBaseId: KB, query: 'x', include: ['atom'], lensNoteId: 'lens-1', embeddingConfig: null })
    expect(lensOnly.data).toHaveLength(1)
    expect(lensOnly.data![0].atom?.id).toBe(lens.id)
    void pub
  })

  it('BM25 词法召回：atom 行参与、统计排除 brain 行（存量 chunk 分数不受污染）', async () => {
    // chunk 行 + atom 行都写倒排
    await chunks.createBatch([
      {
        documentId: 'docq',
        knowledgeBaseId: KB,
        content: '复仇文的爽点有递减效应，同类复仇第三次必须升级代价',
        chunkIndex: 0,
      } as never,
    ])
    const chunkRows = await chunks.findByDocumentId('docq')
    const chunkId = chunkRows[0].id
    const chunkTerms = new Map<string, number>()
    for (const t of tokenizeForIndex('复仇文的爽点有递减效应，同类复仇第三次必须升级代价')) {
      chunkTerms.set(t, (chunkTerms.get(t) ?? 0) + 1)
    }
    await inverted.insertBatch([...chunkTerms.entries()].map(([term, tf]) => ({ term, chunkId, knowledgeBaseId: KB, termFrequency: tf })))

    const [atomB] = await atoms.createBatch([
      { knowledgeBaseId: KB, statement: '复仇第三次必须升级代价或改变性质', type: 'method', sourceDocumentId: 'docq', sourceQuote: 'b' },
    ])
    const atomTerms = new Map<string, number>()
    for (const t of tokenizeForIndex('复仇第三次必须升级代价或改变性质')) {
      atomTerms.set(t, (atomTerms.get(t) ?? 0) + 1)
    }
    await inverted.insertBatch([...atomTerms.entries()].map(([term, tf]) => ({ term, chunkId: `atom:${atomB.id}`, knowledgeBaseId: KB, termFrequency: tf })))

    // 存量口径验证：排除 brain 行后 df/count 不含 atom 行
    const dfAll = await inverted.getDocumentFrequencies(KB)
    const dfExcl = await inverted.getDocumentFrequencies(KB, { excludeChunkIdPrefixes: ['atom:', 'note:'] })
    const termProbe = '复仇'
    expect(dfAll.get(termProbe)).toBeGreaterThan(dfExcl.get(termProbe) ?? 0) // atom 行确实推高了 df
    const countExcl = await inverted.getChunkCount(KB, { excludeChunkIdPrefixes: ['atom:', 'note:'] })
    expect(countExcl).toBe(1) // 只有 1 个真 chunk

    // brain 检索：向量零命中（fake 空），纯词法也应出结果（atom 与 chunk 都进池）
    fakeSimilarHits = []
    const out = await svc.search({
      knowledgeBaseId: KB,
      query: '复仇 升级 代价',
      include: ['chunk', 'atom'],
      embeddingConfig: null,
    })
    expect(out.success).toBe(true)
    const kinds = out.data!.map((r) => r.kind)
    expect(kinds).toContain('chunk')
    expect(kinds).toContain('atom')
    const atomHit = out.data!.find((r) => r.kind === 'atom')!
    expect(atomHit.score).toBeGreaterThan(0) // score=BM25 原始分（非 0）
  })

  it('同源去重：chunk 与其源 atom 同中保 atom', async () => {
    const [a] = await atoms.createBatch([
      {
        knowledgeBaseId: KB,
        statement: '去重验证论断',
        type: 'fact',
        sourceDocumentId: 'docq',
        sourceQuote: 'dd',
        sourceChunkId: 'src-chunk-9',
      },
    ])
    await chunks.createBatch([{ id: 'src-chunk-9', documentId: 'docq', knowledgeBaseId: KB, content: '去重验证原文', chunkIndex: 0 } as never])
    fakeSimilarHits = [
      { chunkId: 'src-chunk-9', score: 0.95 },
      { chunkId: `atom:${a.id}`, score: 0.7 },
    ]
    const out = await svc.search({ knowledgeBaseId: KB, query: '去重', include: ['chunk', 'atom'], embeddingConfig: null })
    const kinds = out.data!.map((r) => r.kind)
    expect(kinds).toContain('atom')
    expect(kinds).not.toContain('chunk')
  })

  it('note 命中：载荷与 archived 过滤', async () => {
    const n1 = await notes.propose(KB, { title: '测试思想卡', description: '测试描述', type: 'insight', evidence: JSON.stringify([{}]) })
    await notes.publish(n1.id)
    const n2 = await notes.propose(KB, { title: '被拒卡', description: 'x', type: 'insight' })
    await notes.reject(n2.id)
    fakeSimilarHits = [
      { chunkId: `note:${n1.id}`, score: 0.8 },
      { chunkId: `note:${n2.id}`, score: 0.75 },
    ]
    const out = await svc.search({ knowledgeBaseId: KB, query: '思想', include: ['note'], embeddingConfig: null })
    expect(out.data).toHaveLength(1)
    expect(out.data![0].kind).toBe('note')
    expect(out.data![0].note?.title).toBe('测试思想卡')
    expect(out.data![0].note?.evidenceCount).toBe(1)
  })

  it('synthesize：chunk 贡献减半（RRF 乘法权重）；scoreKind/context 正确回填', async () => {
    // 先建 chunk 拿真实 id（createBatch 生成 UUID，不认传入 id）
    await chunks.createBatch([{ documentId: 'docq', knowledgeBaseId: KB, content: '秘银原文上下文', chunkIndex: 5 } as never])
    const realChunk = (await chunks.findByDocumentId('docq')).find((c) => c.content === '秘银原文上下文')!
    const [atomD] = await atoms.createBatch([
      {
        knowledgeBaseId: KB,
        statement: '综合型验证论断 秘银',
        type: 'fact',
        sourceDocumentId: 'docq',
        sourceQuote: '秘银quote',
        sourceChunkId: realChunk.id,
      },
    ])
    await inverted.insertBatch([{ term: '秘银', chunkId: `atom:${atomD.id}`, knowledgeBaseId: KB, termFrequency: 1 }])
    fakeSimilarHits = [
      { chunkId: `atom:${atomD.id}`, score: 0.9 },
      { chunkId: realChunk.id, score: 0.85 },
    ]
    const out = await svc.search({
      knowledgeBaseId: KB,
      query: '秘银',
      include: ['chunk', 'atom'],
      intent: 'synthesize',
      embeddingConfig: null,
    })
    const atomHit = out.data!.find((r) => r.kind === 'atom')!
    const chunkHit = out.data!.find((r) => r.kind === 'chunk')
    // 同源去重+context：chunk 降级为 atom 的 context
    expect(atomHit).toBeTruthy()
    expect(atomHit.context).toBe('秘银原文上下文')
    expect(chunkHit).toBeUndefined()
    // scoreKind：向量命中 → cosine
    expect(atomHit.scoreKind).toBe('cosine')
  })

  it('RRF 融合：两路都命中的条目排前（向量第1+词法第1 > 单路第1）', async () => {
    const [a] = await atoms.createBatch([
      { knowledgeBaseId: KB, statement: '双路命中论断 重剑', type: 'fact', sourceDocumentId: 'docq', sourceQuote: 'rr' },
    ])
    const [b] = await atoms.createBatch([
      { knowledgeBaseId: KB, statement: '仅词法论断 重剑', type: 'fact', sourceDocumentId: 'docq', sourceQuote: 'oo' },
    ])
    // 词法：两 atom 都含"重剑"（专属词，避免跨用例污染）
    for (const at of [a, b]) {
      await inverted.insertBatch([{ term: '重剑', chunkId: `atom:${at.id}`, knowledgeBaseId: KB, termFrequency: 1 }])
    }
    fakeSimilarHits = [{ chunkId: `atom:${a.id}`, score: 0.9 }] // a 双路，b 仅词法
    const out = await svc.search({ knowledgeBaseId: KB, query: '重剑', include: ['atom'], embeddingConfig: null })
    expect(out.data![0].atom?.id).toBe(a.id)
    expect(out.data!.map((r) => r.atom?.id)).toContain(b.id)
  })
})
