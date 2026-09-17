/**
 * 知识大脑仓储行为测试（kb-atom / kb-entity / kb-knowledge-edge / kb-note /
 * kb-digest-pass / kb-note-review）
 *
 * 重点：台账幂等决策矩阵（ensurePass）、裁决分域查询边界（lensNoteId 严格分域）、
 * 边五元组幂等、提议→批准/拒绝流转、重链/stale。
 * 运行环境：better-sqlite3 内存库 + 全量实体（同迁移测试基建）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DataSource } from 'typeorm'
import * as entities from '@core/database/entities'
import { createKbBrainTables } from '@core/database/migrations/create-kb-brain-tables'
import { KbAtomRepository } from '@core/database/repositories/kb-atom.repository'
import { KbEntityRepository } from '@core/database/repositories/kb-entity.repository'
import { KbKnowledgeEdgeRepository } from '@core/database/repositories/kb-knowledge-edge.repository'
import { KbNoteRepository } from '@core/database/repositories/kb-note.repository'
import { KbDigestPassRepository } from '@core/database/repositories/kb-digest-pass.repository'
import { KbNoteReviewRepository } from '@core/database/repositories/kb-note-review.repository'

type EntityCtor = new (...args: unknown[]) => object

describe('kb-brain repositories', () => {
  let ds: DataSource
  let atoms: KbAtomRepository
  let ents: KbEntityRepository
  let edges: KbKnowledgeEdgeRepository
  let notes: KbNoteRepository
  let passes: KbDigestPassRepository
  let reviews: KbNoteReviewRepository

  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities).filter((v) => typeof v === 'function') as EntityCtor[],
      synchronize: false,
      logging: false,
    })
    await ds.initialize()
    await ds.query(`CREATE TABLE knowledge_bases (
      id varchar PRIMARY KEY, user_id varchar, name varchar NOT NULL,
      embedding_model varchar NOT NULL, embedding_provider varchar NOT NULL,
      embedding_dimension INTEGER DEFAULT 1536, embedding_config TEXT,
      rerank_config TEXT, document_count INTEGER DEFAULT 0,
      vector_count INTEGER DEFAULT 0, total_size INTEGER DEFAULT 0,
      created_at datetime, updated_at datetime
    )`)
    await createKbBrainTables(ds)
    atoms = new KbAtomRepository(ds)
    ents = new KbEntityRepository(ds)
    edges = new KbKnowledgeEdgeRepository(ds)
    notes = new KbNoteRepository(ds)
    passes = new KbDigestPassRepository(ds)
    reviews = new KbNoteReviewRepository(ds)
  })

  afterAll(async () => {
    await ds?.destroy()
  })

  describe('KbDigestPassRepository.ensurePass 幂等矩阵', () => {
    const key = {
      knowledgeBaseId: 'kb-p',
      documentId: 'doc-p',
      chapterId: 'ch-p1',
      passType: 'base' as const,
      passKey: 'base',
    }

    it('全新 → run；setRunning 后同键 → skip(running)', async () => {
      const d1 = await passes.ensurePass({ ...key, chapterHash: 'h1' })
      expect(d1.action).toBe('run')
      await passes.setRunning(d1.pass.id)
      const d2 = await passes.ensurePass({ ...key, chapterHash: 'h1' })
      expect(d2.action).toBe('skip')
      expect(d2.reason).toBe('running')
    })

    it('done 且 hash 未变 → skip；hash 变了 → 重跑（pending 重置）', async () => {
      const k = { ...key, chapterId: 'ch-h2', passKey: 'h2' }
      const d = await passes.ensurePass({ ...k, chapterHash: 'h2' })
      expect(d.action).toBe('run')
      await passes.setRunning(d.pass.id)
      await passes.setDone(d.pass.id, { atoms: 3 }, { calls: 2 })
      const same = await passes.ensurePass({ ...k, chapterHash: 'h2' })
      expect(same.action).toBe('skip')
      expect(same.reason).toBe('done-same-hash')
      const changed = await passes.ensurePass({ ...k, chapterHash: 'h3' })
      expect(changed.action).toBe('run')
    })

    it('failed 未超上限 → 重跑；达 3 次 → skip', async () => {
      const k = { ...key, chapterId: 'ch-fail', passKey: 'fail' }
      for (let i = 0; i < 3; i++) {
        const d = await passes.ensurePass({ ...k, chapterHash: 'hx' })
        expect(d.action).toBe('run')
        await passes.setRunning(d.pass.id)
        await passes.setFailed(d.pass.id, 'boom')
      }
      const d4 = await passes.ensurePass({ ...k, chapterHash: 'hx' })
      expect(d4.action).toBe('skip')
    })

    it('文档级任务（chapterId=null）靠应用层判重而非 DB 唯一键（F7）', async () => {
      const k = { knowledgeBaseId: 'kb-p', documentId: 'doc-p', chapterId: null, passType: 'distill' as const, passKey: 'distill:b1' }
      const d1 = await passes.ensurePass({ ...k, chapterHash: null })
      expect(d1.action).toBe('run')
      await passes.setRunning(d1.pass.id)
      // 并发的第二次 ensure 读到已存在行 → skip(running)：判重走读路径，不依赖唯一键
      const d2 = await passes.ensurePass({ ...k, chapterHash: null })
      expect(d2.action).toBe('skip')
      expect(d2.pass.id).toBe(d1.pass.id)
    })

    it('recoverPending 找回 pending 与僵死 running', async () => {
      const d = await passes.ensurePass({
        knowledgeBaseId: 'kb-p', documentId: 'doc-p', chapterId: 'ch-rec', passType: 'base', passKey: 'rec',
        chapterHash: 'h',
      })
      await passes.setRunning(d.pass.id)
      // 刚置 running 未超时 → 不找回
      let list = await passes.recoverPending(10 * 60 * 1000)
      expect(list.find((p) => p.id === d.pass.id)).toBeUndefined()
      // 手工把 updated_at 拨回 11 分钟前 → 找回
      await ds.query(`UPDATE kb_digest_passes SET updated_at = datetime('now', '-11 minutes') WHERE id = '${d.pass.id}'`)
      list = await passes.recoverPending(10 * 60 * 1000)
      expect(list.find((p) => p.id === d.pass.id)).toBeTruthy()
    })

    it('costByKb 聚合成本', async () => {
      const cost = await passes.costByKb('kb-p')
      expect(cost.calls).toBeGreaterThan(0)
    })
  })

  describe('KbAtomRepository 裁决分域与生命周期', () => {
    it('createBatch + 公共层/视角分域查询严格隔离', async () => {
      const entA = await ents.upsertMention('kb-a', { name: '程野', type: 'character' })
      const entB = await ents.upsertMention('kb-a', { name: '苏晚', type: 'character' })
      await atoms.createBatch([
        {
          knowledgeBaseId: 'kb-a',
          statement: '程野在第三卷失去左臂',
          type: 'fact',
          sourceDocumentId: 'doc-a',
          sourceQuote: 'quote-1',
          subjectEntityId: entA.id,
          extractionPass: 'base#1',
        },
        {
          knowledgeBaseId: 'kb-a',
          statement: '（人物弧光视角）程野的堕落是渐进的',
          type: 'insight',
          sourceDocumentId: 'doc-a',
          sourceQuote: 'quote-2',
          subjectEntityId: entA.id,
          lensNoteId: 'lens-arc',
          extractionPass: 'lens:lens-arc#1',
        },
        {
          knowledgeBaseId: 'kb-a',
          statement: '苏晚知晓密约',
          type: 'fact',
          sourceDocumentId: 'doc-a',
          sourceQuote: 'quote-3',
          subjectEntityId: entB.id,
          extractionPass: 'base#1',
        },
      ])
      // 公共层裁决候选：不含视角遍产物
      const publicCandidates = await atoms.findByEntities('kb-a', [entA.id], { lensNoteId: null })
      expect(publicCandidates.map((a) => a.statement)).toEqual(['程野在第三卷失去左臂'])
      // 同视角域：只见该视角论断
      const lensCandidates = await atoms.findByEntities('kb-a', [entA.id], { lensNoteId: 'lens-arc' })
      expect(lensCandidates).toHaveLength(1)
      expect(lensCandidates[0].lensNoteId).toBe('lens-arc')
      // 文档查询按域过滤
      const publicDocs = await atoms.findByDocument('doc-a', { lensNoteId: null })
      expect(publicDocs).toHaveLength(2)
    })

    it('updateStatus 关旧开新 + markChapterStale 排除保留集', async () => {
      const rows = await atoms.findByDocument('doc-a', { lensNoteId: null })
      const old = rows[0]
      const [fresh] = await atoms.createBatch([
        {
          knowledgeBaseId: 'kb-a',
          statement: '程野在第四卷失去左臂（修正）',
          type: 'fact',
          sourceDocumentId: 'doc-a',
          sourceQuote: 'quote-4',
        },
      ])
      await atoms.updateStatus(old.id, { status: 'superseded', supersededByAtomId: fresh.id })
      const after = await atoms.findById(old.id)
      expect(after?.status).toBe('superseded')
      expect(after?.supersededByAtomId).toBe(fresh.id)

      const staleCount = await atoms.markChapterStale('doc-a', [fresh.id])
      expect(staleCount).toBeGreaterThanOrEqual(1) // old 与苏晚条目被 stale
      expect((await atoms.findById(fresh.id))?.status).toBe('supported')
    })

    it('incUse 使用计数', async () => {
      const rows = await atoms.findByDocument('doc-a', { lensNoteId: null })
      const target = rows.find((r) => r.status === 'supported')!
      await atoms.incUse([target.id])
      expect((await atoms.findById(target.id))?.useCount).toBe(1)
    })
  })

  describe('KbEntityRepository', () => {
    it('upsertMention：别名合并 + 重复 mention 返回同实体', async () => {
      const e1 = await ents.upsertMention('kb-e', { name: '程野', type: 'character', aliases: ['程大哥'] })
      const e2 = await ents.upsertMention('kb-e', { name: '程野', type: 'character', aliases: ['程大哥', '程捕头'] })
      expect(e2.id).toBe(e1.id)
      expect(e2.aliases).toContain('程捕头')
    })

    it('merge：别名吸收 + from 置 merged', async () => {
      const from = await ents.upsertMention('kb-e', { name: '苏婉', type: 'character' })
      const to = await ents.upsertMention('kb-e', { name: '苏晚', type: 'character' })
      await ents.merge(from.id, to.id)
      const mergedFrom = await ents.findById(from.id)
      const mergedTo = await ents.findById(to.id)
      expect(mergedFrom?.status).toBe('merged')
      expect(mergedFrom?.targetEntityId).toBe(to.id)
      expect(mergedTo?.aliases).toContain('苏婉')
    })

    it('边端点 redirectNode 随合并改指', async () => {
      const e1 = await ents.upsertMention('kb-r', { name: 'A君', type: 'character' })
      const e2 = await ents.upsertMention('kb-r', { name: 'B君', type: 'character' })
      const e3 = await ents.upsertMention('kb-r', { name: 'C君', type: 'character' })
      await edges.createBatch('kb-r', [
        { sourceKind: 'entity', sourceId: e1.id, relation: 'same-as', targetKind: 'entity', targetId: e2.id, evidence: '同指' },
      ])
      await edges.redirectNode('entity', e1.id, e3.id)
      const ns = await edges.neighborsOf('kb-r', [e3.id])
      expect(ns).toHaveLength(1)
      expect(ns[0].targetId).toBe(e2.id)
    })
  })

  describe('KbKnowledgeEdgeRepository 五元组幂等', () => {
    it('重复边 dedupe 不重复创建', async () => {
      const r1 = await edges.createBatch('kb-edge', [
        { sourceKind: 'atom', sourceId: 'x1', relation: 'leads-to', targetKind: 'atom', targetId: 'x2', evidence: '因果' },
      ])
      const r2 = await edges.createBatch('kb-edge', [
        { sourceKind: 'atom', sourceId: 'x1', relation: 'leads-to', targetKind: 'atom', targetId: 'x2', evidence: '因果' },
      ])
      expect(r1.created).toBe(1)
      expect(r2.created).toBe(0)
      expect(r2.deduped).toBe(1)
    })

    it('graphSnapshot 输出 PPR 输入形状', async () => {
      const snap = await edges.graphSnapshot('kb-r')
      // redirectNode 已把 A君 端点改指 C君：图中剩 B/C 两节点（A 退出边）
      expect(snap.nodes.length).toBe(2)
      expect(snap.edges.length).toBe(1)
    })
  })

  describe('KbNoteRepository 提议流转', () => {
    it('propose → publish（改写 bump version）→ reject archive', async () => {
      const p = await notes.propose('kb-a', {
        title: '复仇文的爽点有递减效应',
        description: '当你在创作复仇线剧情、需要安排第三次及以后的复仇桥段时使用。',
        body: '12 本里 11 本遵守……',
        type: 'insight',
        evidence: JSON.stringify([{ atomId: 'atom-1' }]),
      })
      expect(p.status).toBe('proposed')
      expect(p.version).toBe(1)

      const pub = await notes.publish(p.id)
      expect(pub?.status).toBe('published')
      expect(pub?.version).toBe(1) // 直接批准不改写不加版本

      const p2 = await notes.propose('kb-a', {
        title: '复仇文的爽点有递减效应',
        description: '同题再提议',
        type: 'insight',
      })
      const pubEdited = await notes.publish(p2.id, { body: '修正：递减阈值……' })
      expect(pubEdited?.version).toBe(2) // 改写后批准=演进

      const p3 = await notes.propose('kb-a', { title: '另一个提议', description: 'x', type: 'methodology' })
      const rej = await notes.reject(p3.id)
      expect(rej?.status).toBe('archived')

      const proposed = await notes.listByStatus('kb-a', 'proposed', 1, 10)
      expect(proposed.total).toBe(0)
    })

    it('findSimilarTitle 精确与前缀命中', async () => {
      await notes.propose('kb-e', { title: '延迟型代价导致后期偿付潮', description: 'x', type: 'insight' })
      const exact = await notes.findSimilarTitle('kb-e', '延迟型代价导致后期偿付潮')
      expect(exact).toHaveLength(1)
      const fuzzy = await notes.findSimilarTitle('kb-e', '延迟型代价导致后期偿付潮（修订）')
      expect(fuzzy.length).toBeGreaterThanOrEqual(1)
    })

    it('upsertLens 创建 published 视角卡并支持更新', async () => {
      const lens = await notes.upsertLens('kb-a', {
        title: '人物弧光视角',
        description: '用我看书当你关心人物动机链的渐进性时。',
        lensAttention: JSON.stringify({ attendTo: ['动机链'], questions: ['每步转变是否有铺垫'] }),
      })
      expect(lens.status).toBe('published')
      const updated = await notes.upsertLens('kb-a', {
        id: lens.id,
        title: '人物弧光视角',
        description: '更新描述',
        lensAttention: lens.lensAttention!,
      })
      expect(updated.id).toBe(lens.id)
      expect(updated.version).toBe(2)
    })

    it('incCited 引用计数', async () => {
      const p = await notes.propose('kb-n', { title: 'n1', description: 'x', type: 'synthesis' })
      await notes.publish(p.id)
      await notes.incCited([p.id])
      expect((await notes.findById(p.id))?.citedCount).toBe(1)
    })
  })

  describe('KbNoteReviewRepository', () => {
    it('append + findByNote 按时间升序', async () => {
      const n = await notes.propose('kb-a', { title: '复习卡', description: 'x', type: 'methodology' })
      await notes.publish(n.id)
      await reviews.append({ noteId: n.id, kbId: 'kb-a', rating: 3, reviewedAt: new Date(Date.now() - 60000) })
      await reviews.append({ noteId: n.id, kbId: 'kb-a', rating: 4, reviewedAt: new Date() })
      const list = await reviews.findByNote(n.id)
      expect(list.map((r) => r.rating)).toEqual([3, 4])
    })
  })
})
