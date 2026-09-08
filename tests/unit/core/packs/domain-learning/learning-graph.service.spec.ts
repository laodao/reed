/**
 * 领域学习 graph 服务契约测试（design-v3 §9 D9 / §14）
 *
 * 钉死：掌握度推进（懂了/没懂+拆解阈值）、前置门控（未就绪禁止懂了）、
 * 下一概念选择、树聚合、统计、租户隔离。真实 better-sqlite3 + 迁移。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import { DlRelationRepository, PREREQUISITE_TYPE } from '@core/database/repositories/dl-relation.repository'
import { DlMasteryLogRepository } from '@core/database/repositories/dl-mastery-log.repository'
import { DlCardRepository } from '@core/database/repositories/dl-card.repository'
import { LearningGraphService } from '@core/packs/domain-learning/services/learning-graph.service'
import { LearningProjectService } from '@core/packs/domain-learning/services/learning-project.service'

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
  const d = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities, synchronize: false })
  await d.initialize()
  await createDomainLearningTables(d)
  return d
}

function makeServices(d: DataSource) {
  return {
    projects: new DlProjectRepository(d),
    concepts: new DlConceptRepository(d),
    relations: new DlRelationRepository(d),
    masteryLogs: new DlMasteryLogRepository(d),
    cards: new DlCardRepository(d),
  }
}

function makeGraph(svc: ReturnType<typeof makeServices>): LearningGraphService {
  return new LearningGraphService(svc.concepts, svc.relations, svc.masteryLogs)
}

async function seedSpace(u: string, d: DataSource): Promise<string> {
  const s = makeServices(d)
  return runWithUserAsync(u, async () => {
    const p = await s.projects.create({ id: 'sp1', name: '大模型', goal: '入门' })
    // 树：根 group → 分支 → 概念
    await s.concepts.create({ id: 'g-root', projectId: p.id, nodeType: 'group', name: '领域根' })
    await s.concepts.create({ id: 'g-branch', projectId: p.id, nodeType: 'group', name: '基础', parentId: 'g-root' })
    await s.concepts.create({ id: 'c-attn', projectId: p.id, nodeType: 'concept', name: '注意力', parentId: 'g-branch' })
    await s.concepts.create({ id: 'c-tf', projectId: p.id, nodeType: 'concept', name: 'Transformer', parentId: 'g-branch' })
    // 前置：学 Transformer 前须掌握注意力
    await s.relations.create({ id: 'e1', projectId: p.id, sourceId: 'c-attn', targetId: 'c-tf', relationType: PREREQUISITE_TYPE, verified: true })
    return p.id
  })
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('LearningGraphService', () => {
  it('ackMastered：懂了 → mastery=mastered + 审计日志；门控未就绪时拒绝', async () => {
    ds = await buildDs()
    const pid = await seedSpace('u1', ds)
    const svc = makeServices(ds)
    const graph = makeGraph(svc)
    await runWithUserAsync('u1', async () => {
      // Transformer 前置（注意力）未掌握 → 拒绝懂了
      await expect(graph.ackMastered(pid, 'c-tf', 'lesson_ack')).rejects.toThrow(/前置/)
      // 先懂注意力
      await graph.ackMastered(pid, 'c-attn', 'lesson_ack')
      const attn = await svc.concepts.getById('c-attn')
      expect(attn?.mastery).toBe('mastered')
      const logs = await svc.masteryLogs.listByConcept(pid, 'c-attn')
      expect(logs[logs.length - 1]).toMatchObject({ toMastery: 'mastered', trigger: 'lesson_ack' })
      // 再懂 Transformer 成功
      await graph.ackMastered(pid, 'c-tf', 'lesson_ack')
      expect((await svc.concepts.getById('c-tf'))?.mastery).toBe('mastered')
    })
    // 租户隔离
    await runWithUserAsync('u2', async () => {
      await expect(graph.ackMastered(pid, 'c-attn', 'lesson_ack')).rejects.toThrow()
    })
  })

  it('ackConfused：没懂计数 +1 且达到阈值给出拆解建议；mastery 置 learning', async () => {
    ds = await buildDs()
    const pid = await seedSpace('u1', ds)
    const svc = makeServices(ds)
    const graph = makeGraph(svc)
    await runWithUserAsync('u1', async () => {
      const r1 = await graph.ackConfused(pid, 'c-attn', { reason: '不懂', sectionKey: 'mechanism' })
      expect(r1).toMatchObject({ splitSuggested: false, confusedCount: 1 })
      expect((await svc.concepts.getById('c-attn'))?.mastery).toBe('learning')
      const r2 = await graph.ackConfused(pid, 'c-attn', { reason: '还是不懂' })
      expect(r2).toMatchObject({ splitSuggested: true, confusedCount: 2 })
      const logs = await svc.masteryLogs.listByConcept(pid, 'c-attn')
      expect(logs.map((l) => l.trigger)).toEqual(['lesson_ack_failed'])
    })
  })

  it('pickNextToLearn：前置未满足跳过后继概念（依赖门控）', async () => {
    ds = await buildDs()
    const pid = await seedSpace('u1', ds)
    const svc = makeServices(ds)
    const graph = makeGraph(svc)
    await runWithUserAsync('u1', async () => {
      // 都未掌握：注意力在前、无前置 → 下一个是注意力
      expect(await graph.pickNextToLearn(pid)).toBe('c-attn')
      await graph.ackMastered(pid, 'c-attn', 'lesson_ack')
      // 注意力已掌握 → 解锁 Transformer
      expect(await graph.pickNextToLearn(pid)).toBe('c-tf')
      await graph.ackMastered(pid, 'c-tf', 'lesson_ack')
      // 全部掌握 → null
      expect(await graph.pickNextToLearn(pid)).toBeNull()
    })
  })

  it('buildTree：parent 层级聚合成大纲树；group 折叠、概念为叶', async () => {
    ds = await buildDs()
    const pid = await seedSpace('u1', ds)
    const svc = makeServices(ds)
    const graph = makeGraph(svc)
    const tree = await runWithUserAsync('u1', async () => graph.buildTree(pid))
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ id: 'g-root', name: '领域根' })
    const branch = tree[0].children?.[0]
    expect(branch).toMatchObject({ id: 'g-branch', name: '基础' })
    expect(branch?.children?.map((c) => c.conceptId)).toEqual(['c-attn', 'c-tf'])
  })

  it('stats：统计叶子概念总数与已掌握数；group 不计', async () => {
    ds = await buildDs()
    const pid = await seedSpace('u1', ds)
    const svc = makeServices(ds)
    const graph = makeGraph(svc)
    await runWithUserAsync('u1', async () => {
      const s0 = await graph.stats(pid)
      expect(s0).toMatchObject({ total: 2, mastered: 0 })
      await graph.ackMastered(pid, 'c-attn', 'lesson_ack')
      const s1 = await graph.stats(pid)
      expect(s1).toMatchObject({ total: 2, mastered: 1 })
    })
  })

  it('confirmRelation：人审确认未验证边 → verified=true', async () => {
    ds = await buildDs()
    const pid = await seedSpace('u1', ds)
    const svc = makeServices(ds)
    await runWithUserAsync('u1', async () => {
      // 建一条未验证边（related，非唯一冲突）
      const r = await svc.relations.create({ id: 'e-unverified', projectId: pid, sourceId: 'c-attn', targetId: 'c-tf', relationType: 'related' })
      expect(r.verified).toBe(false)
      const graph = makeGraph(svc)
      await graph.confirmRelation(pid, 'c-attn', 'c-tf', 'related', '人工补证')
      const confirmed = await svc.relations.listByProject(pid)
      expect(confirmed.find((x) => x.id === 'e-unverified')?.verified).toBe(true)
    })
  })
})

describe('LearningProjectService', () => {
  it('createSpace：建空间 + 根 group；list/get 可见', async () => {
    ds = await buildDs()
    const svc = makeServices(ds)
    const projectSvc = new LearningProjectService(svc.projects, svc.concepts)
    const id = await runWithUserAsync('u1', async () =>
      projectSvc.createSpace({ name: '机器学习', goal: '入门', tagline: '入门机器学习', profileId: 'T2' }))
    await runWithUserAsync('u1', async () => {
      const p = await projectSvc.getSpace(id)
      expect(p?.name).toBe('机器学习')
      const root = (await svc.concepts.listByProject(id)).find((c) => c.nodeType === 'group' && c.parentId === null)
      expect(root).toBeTruthy()
      expect(await projectSvc.listSpaces()).toHaveLength(1)
    })
    await runWithUserAsync('u2', async () => {
      expect(await projectSvc.listSpaces()).toHaveLength(0)
    })
  })

  it('ensureOwned/设置方法：不存在或跨租户抛错；pace/profile 写读回一致(M4-A P1-1/P2-1)', async () => {
    ds = await buildDs()
    const svc = makeServices(ds)
    const projectSvc = new LearningProjectService(svc.projects, svc.concepts)
    const id = await runWithUserAsync('u1', async () =>
      projectSvc.createSpace({ name: '设置域', goal: '入门' }))
    await runWithUserAsync('u1', async () => {
      // 不存在 → 抛错(不再静默 ok)
      await expect(projectSvc.ensureOwned('ghost')).rejects.toThrow(/空间不存在/)
      await expect(projectSvc.setPaceSettings('ghost', { enabled: true, intervalMin: 5, autoResearchConcepts: true, autoResolveOpenQuestions: true })).rejects.toThrow(/空间不存在/)
      // pace 写读回
      const saved = await projectSvc.setPaceSettings(id, { enabled: true, intervalMin: 5, autoResearchConcepts: true, autoResolveOpenQuestions: false })
      expect(saved.autoResolveOpenQuestions).toBe(false)
      expect((await projectSvc.getPaceSettings(id)).intervalMin).toBe(5)
      // profile 写读回
      await projectSvc.setProfile(id, 'theory', { kindLabel: '理论体系', nature: 'x', emphasis: ['流程'] })
      const row = await projectSvc.getSpace(id)
      expect(row?.profileId).toBe('theory')
      expect(row?.profile?.kindLabel).toBe('理论体系')
    })
    // 跨租户(他人空间=不可见→抛)
    await runWithUserAsync('u2', async () => {
      await expect(projectSvc.getPaceSettings(id)).rejects.toThrow(/空间不存在/)
    })
  })
})

describe('LearningGraphService 间隔复习（M3-B）', () => {
  it('listReviewDue：mastered 且逾期才出列；reviewDone 刷新基准并从队列移除', async () => {
    ds = await buildDs()
    const pid = await seedSpace('u1', ds)
    const svc = makeServices(ds)
    const graph = makeGraph(svc)
    await runWithUserAsync('u1', async () => {
      // 直接造：mastered 且最近掌握记录在 2026-01-01（逾 59 天）
      await svc.concepts.patch('c-attn', { mastery: 'mastered' })
      await svc.masteryLogs.append({ id: 'log-old', projectId: pid, conceptId: 'c-attn', fromMastery: 'untouched', toMastery: 'mastered', trigger: 'lesson_ack', at: new Date('2026-01-01T00:00:00Z') })
      // 未掌握的概念不入列
      await svc.concepts.patch('c-tf', { mastery: 'untouched' })

      const due = await graph.listReviewDue(pid, { intervalMin: 1440, limit: 10, now: new Date('2026-03-01T00:00:00Z') })
      expect(due.map((d) => d.conceptId)).toEqual(['c-attn'])

      // reviewDone：mastered→mastered + trigger=review 审计（下一次基准刷新）
      await graph.reviewDone(pid, 'c-attn')
      const logs = await svc.masteryLogs.listByConcept(pid, 'c-attn')
      expect(logs[logs.length - 1]).toMatchObject({ fromMastery: 'mastered', toMastery: 'mastered', trigger: 'review' })
      const dueAfter = await graph.listReviewDue(pid, { intervalMin: 1440, limit: 10, now: new Date('2026-03-01T00:00:00Z') })
      expect(dueAfter).toHaveLength(0)

      // 非 mastered/review 概念不能完成复习
      await expect(graph.reviewDone(pid, 'c-tf')).rejects.toThrow(/已掌握\/需复习/)
    })
  })

  it('markReview：mastered→review；reviewDone 从 review 收回 mastered', async () => {
    ds = await buildDs()
    const pid = await seedSpace('u1', ds)
    const svc = makeServices(ds)
    const graph = makeGraph(svc)
    await runWithUserAsync('u1', async () => {
      await svc.concepts.patch('c-attn', { mastery: 'mastered' })
      await graph.markReview(pid, 'c-attn')
      expect((await svc.concepts.getById('c-attn'))?.mastery).toBe('review')
      const logs1 = await svc.masteryLogs.listByConcept(pid, 'c-attn')
      expect(logs1[logs1.length - 1]).toMatchObject({ toMastery: 'review', trigger: 'manual' })

      await graph.reviewDone(pid, 'c-attn')
      expect((await svc.concepts.getById('c-attn'))?.mastery).toBe('mastered')
      const logs2 = await svc.masteryLogs.listByConcept(pid, 'c-attn')
      expect(logs2[logs2.length - 1]).toMatchObject({ fromMastery: 'review', toMastery: 'mastered', trigger: 'review' })
    })
  })
})
