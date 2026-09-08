/**
 * 领域学习 7 仓储真实 DataSource 契约测试（tasks/2026-09-07-domain-learning-space/design-v3.md §9）
 *
 * 钉死：7 张 dl_* 表的 CRUD、JSON 列解析、唯一约束（concept 同级不重名、
 * relation 三元唯一）、租户隔离（ALS 注入/过滤）、迁移幂等（双端路径零 mock）。
 * 真实 better-sqlite3 + 迁移函数（生产路径）。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import { DlRelationRepository } from '@core/database/repositories/dl-relation.repository'
import { DlMasteryLogRepository } from '@core/database/repositories/dl-mastery-log.repository'
import { DlCardRepository } from '@core/database/repositories/dl-card.repository'
import { DlDocRepository } from '@core/database/repositories/dl-doc.repository'
import { DlQuestionRepository } from '@core/database/repositories/dl-question.repository'

let ds: DataSource | null = null

const ENTITY_IMPORTS = [
  () => import('@core/database/entities/domain-learning/dl-project.entity'),
  () => import('@core/database/entities/domain-learning/dl-concept.entity'),
  () => import('@core/database/entities/domain-learning/dl-relation.entity'),
  () => import('@core/database/entities/domain-learning/dl-mastery-log.entity'),
  () => import('@core/database/entities/domain-learning/dl-card.entity'),
  () => import('@core/database/entities/domain-learning/dl-doc.entity'),
  () => import('@core/database/entities/domain-learning/dl-question.entity'),
]

async function buildDs(): Promise<DataSource> {
  const entities = []
  for (const imp of ENTITY_IMPORTS) {
    const mod = await imp()
    entities.push(Object.values(mod)[0] as new () => object)
  }
  const d = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities,
    synchronize: false,
  })
  await d.initialize()
  await createDomainLearningTables(d)
  return d
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('dl 迁移幂等', () => {
  it('重复执行 createDomainLearningTables 不抛错（已存在表走 onExists 补索引）', async () => {
    ds = await buildDs()
    await createDomainLearningTables(ds)
    await createDomainLearningTables(ds)
    // 7 张表都在 sqlite_master
    for (const t of ['dl_project', 'dl_concept', 'dl_relation', 'dl_mastery_log', 'dl_card', 'dl_doc', 'dl_question']) {
      const rows = await ds.query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`, [t])
      expect(rows.length, `表 ${t} 应存在`).toBe(1)
    }
  })
})

describe('DlProjectRepository', () => {
  it('create/getById/patch/listAll + 租户隔离', async () => {
    ds = await buildDs()
    const repo = new DlProjectRepository(ds)
    await runWithUserAsync('u1', async () => {
      const p = await repo.create({
        id: 'p1', name: '大模型前沿', goal: '入门',
        profile: { kindLabel: '前沿交叉', emphasis: ['concept', 'paper'] },
        defaultModel: { modelId: 'qwen-max' },
      })
      expect(p.profile).toMatchObject({ kindLabel: '前沿交叉' })
      expect(p.defaultModel).toMatchObject({ modelId: 'qwen-max' })
      await repo.patch('p1', { status: 'paused', name: '大模型前沿入门' })
      const row = await repo.getById('p1')
      expect(row).toMatchObject({ status: 'paused', name: '大模型前沿入门' })
      expect((await repo.listAll()).map((r) => r.id)).toEqual(['p1'])
    })
    await runWithUserAsync('u2', async () => {
      expect(await repo.getById('p1')).toBeNull()
      expect(await repo.listAll()).toHaveLength(0)
    })
  })
})

describe('DlConceptRepository', () => {
  it('create/listByProject/listByParent/patch + JSON attrs', async () => {
    ds = await buildDs()
    const repo = new DlConceptRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'c-root', projectId: 'p1', nodeType: 'group', name: '模型架构', parentId: null })
      await repo.create({ id: 'c1', projectId: 'p1', nodeType: 'concept', name: 'Transformer', parentId: 'c-root', en: 'Transformer', attrs: { year: 2017 } })
      await repo.create({ id: 'c2', projectId: 'p1', nodeType: 'concept', name: '注意力机制', parentId: 'c-root' })
      const children = await repo.listByParent('p1', 'c-root')
      expect(children.map((c) => c.name)).toEqual(['Transformer', '注意力机制'])
      expect(children[0].attrs).toMatchObject({ year: 2017 })
      await repo.patch('c1', { researchState: 'researched', mastery: 'mastered' })
      expect(await repo.getById('c1')).toMatchObject({ researchState: 'researched', mastery: 'mastered' })
    })
    // 租户隔离
    await runWithUserAsync('u2', async () => {
      expect(await repo.listByParent('p1', 'c-root')).toHaveLength(0)
    })
  })

  it('同级不重名：同 project+同 parent 下同名第二次插入被唯一索引拒绝', async () => {
    ds = await buildDs()
    const repo = new DlConceptRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'g1', projectId: 'p1', nodeType: 'group', name: '分支A' })
      await repo.create({ id: 'x1', projectId: 'p1', nodeType: 'concept', name: '同名概念', parentId: 'g1' })
      await expect(
        repo.create({ id: 'x2', projectId: 'p1', nodeType: 'concept', name: '同名概念', parentId: 'g1' }),
      ).rejects.toThrow()
    })
  })

  it('existsSiblingName 命中同级同名（含根层 parentId=null）', async () => {
    ds = await buildDs()
    const repo = new DlConceptRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'r1', projectId: 'p1', nodeType: 'group', name: '根目录' })
      expect(await repo.existsSiblingName('p1', null, '根目录')).toBe(true)
      expect(await repo.existsSiblingName('p1', null, '别的目录')).toBe(false)
      expect(await repo.existsSiblingName('p1', null, '根目录', 'r1')).toBe(false)
    })
  })
})

describe('DlRelationRepository', () => {
  it('create 幂等同边 / 三元唯一拒绝重复新边 / verified 升级', async () => {
    ds = await buildDs()
    const repo = new DlRelationRepository(ds)
    await runWithUserAsync('u1', async () => {
      const r1 = await repo.create({ id: 'e1', projectId: 'p1', sourceId: 'c1', targetId: 'c2', relationType: 'prerequisite', evidence: '据讲义' })
      expect(r1.verified).toBe(false)
      // 同三元组重复 create：不抛错，幂等返回已存在行
      const dup = await repo.create({ id: 'e1x', projectId: 'p1', sourceId: 'c1', targetId: 'c2', relationType: 'prerequisite' })
      expect(dup.id).toBe('e1')
      // 人工确认（verified 升级）同一 id 更新
      const v = await repo.create({ id: 'e1y', projectId: 'p1', sourceId: 'c1', targetId: 'c2', relationType: 'prerequisite', verified: true, evidence: '已人审' })
      expect(v.id).toBe('e1')
      expect(v.verified).toBe(true)
      expect(v.evidence).toBe('已人审')
    })
  })

  it('listBySource/listByTarget/listPrerequisites 过滤正确', async () => {
    ds = await buildDs()
    const repo = new DlRelationRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'e1', projectId: 'p1', sourceId: 'c1', targetId: 'c2', relationType: 'prerequisite' })
      await repo.create({ id: 'e2', projectId: 'p1', sourceId: 'c1', targetId: 'c3', relationType: 'related' })
      await repo.create({ id: 'e3', projectId: 'p1', sourceId: 'c3', targetId: 'c1', relationType: 'prerequisite' })
      const prereqs = await repo.listPrerequisites('p1', 'c1')
      expect(prereqs.map((r) => r.sourceId)).toEqual(['c3'])
      expect((await repo.listBySource('p1', 'c1')).map((r) => r.targetId)).toEqual(['c2', 'c3'])
      expect((await repo.listByTarget('p1', 'c2')).map((r) => r.sourceId)).toEqual(['c1'])
    })
    await runWithUserAsync('u2', async () => {
      expect(await repo.listByProject('p1')).toHaveLength(0)
    })
  })
})

describe('DlMasteryLogRepository', () => {
  it('append/listByConcept 审计轨迹（升序）', async () => {
    ds = await buildDs()
    const repo = new DlMasteryLogRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.append({ id: 'm1', projectId: 'p1', conceptId: 'c1', fromMastery: 'untouched', toMastery: 'learning', trigger: 'lesson_open' })
      await repo.append({ id: 'm2', projectId: 'p1', conceptId: 'c1', fromMastery: 'learning', toMastery: 'mastered', trigger: 'lesson_ack' })
      const logs = await repo.listByConcept('p1', 'c1')
      expect(logs.map((l) => l.toMastery)).toEqual(['learning', 'mastered'])
      expect(logs[1].trigger).toBe('lesson_ack')
      expect(await repo.countByConcept('p1', 'c1')).toBe(2)
    })
  })
})

describe('DlCardRepository', () => {
  it('create/version/getCurrentByConcept/listVersions + sections JSON 往返', async () => {
    ds = await buildDs()
    const repo = new DlCardRepository(ds)
    await runWithUserAsync('u1', async () => {
      const sections = [{ key: 'essence', title: '本质', style: 'intro', md: '## 本质\n第一段', folded: false }]
      const works = [{ kind: '论文', title: 'Attention Is All You Need', year: '2017' }]
      await repo.create({ id: 'card1', projectId: 'p1', conceptId: 'c1', essenceType: 'K-concept', sections, works })
      await repo.create({ id: 'card1v2', projectId: 'p1', conceptId: 'c1', essenceType: 'K-concept', sections: [...sections, { key: 'verify', title: '检验', md: '自测', folded: false }], works, version: 2, status: 'published' })
      const current = await repo.getCurrentByConcept('p1', 'c1')
      expect(current?.version).toBe(2)
      expect(current?.sections).toHaveLength(2)
      expect(current?.works?.[0]).toMatchObject({ kind: '论文' })
      expect(current?.status).toBe('published')
      expect((await repo.listVersionsByConcept('p1', 'c1')).map((c) => c.version)).toEqual([1, 2])
      await repo.patch('card1', { status: 'published', contentMd: '# md' })
      expect(await repo.getById('card1')).toMatchObject({ status: 'published', contentMd: '# md' })
    })
    await runWithUserAsync('u2', async () => {
      expect(await repo.getCurrentByConcept('p1', 'c1')).toBeNull()
    })
  })
})

describe('DlDocRepository', () => {
  it('create/getLatestByType + conceptIds JSON', async () => {
    ds = await buildDs()
    const repo = new DlDocRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'd1', projectId: 'p1', docType: 'intro', title: '导读', conceptIds: ['c1', 'c2'], contentMd: '# 导读正文' })
      await repo.create({ id: 'd2', projectId: 'p1', docType: 'review', title: '分支总览' })
      const intro = await repo.getLatestByType('p1', 'intro')
      expect(intro).toMatchObject({ docType: 'intro', conceptIds: ['c1', 'c2'] })
      const review = await repo.getLatestByType('p1', 'review')
      expect(review?.id).toBe('d2')
    })
  })
})

describe('DlQuestionRepository', () => {
  it('create(open)/answer 流转/countOpenByProject + 租户隔离', async () => {
    ds = await buildDs()
    const repo = new DlQuestionRepository(ds)
    await runWithUserAsync('u1', async () => {
      await repo.create({ id: 'q1', projectId: 'p1', conceptId: 'c1', question: '什么是 X？' })
      await repo.create({ id: 'q2', projectId: 'p1', question: '泛问' })
      expect(await repo.countOpenByProject('p1')).toBe(2)
      const open = await repo.listOpenByProject('p1')
      expect(open.map((q) => q.id)).toEqual(['q1', 'q2'])
      await repo.patch('q1', { status: 'answered', answerMd: 'X 是…', answerSource: 'kb', answeredAt: new Date() })
      expect(await repo.countOpenByProject('p1')).toBe(1)
      const answered = await repo.getById('q1')
      expect(answered).toMatchObject({ status: 'answered', answerSource: 'kb' })
      expect(answered?.answerMd).toBe('X 是…')
    })
    await runWithUserAsync('u2', async () => {
      expect(await repo.countOpenByProject('p1')).toBe(0)
    })
  })
})
