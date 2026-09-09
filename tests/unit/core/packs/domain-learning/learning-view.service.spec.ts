/**
 * 领域学习视图服务统计/导出测试（learning-view.service，M3-C）
 * @module tests/unit/core/packs/domain-learning/learning-view.service.spec
 *
 * 钉死：buildSpaceStats 聚合（概念/研究/讲义状态/关系/问答/复习到期开关）；buildLessonDigest
 * 按目录树收录有讲义概念并输出可读 md（标题/区内容/著作/证据）。
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
import { DlQuestionRepository } from '@core/database/repositories/dl-question.repository'
import { LearningViewService } from '@core/packs/domain-learning/services/learning-view.service'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

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

async function buildDb(d: DataSource): Promise<ICoreDatabaseManager> {
  const db = {
    dlProjects: new DlProjectRepository(d),
    dlConcepts: new DlConceptRepository(d),
    dlRelations: new DlRelationRepository(d),
    dlMasteryLogs: new DlMasteryLogRepository(d),
    dlCards: new DlCardRepository(d),
    dlQuestions: new DlQuestionRepository(d),
  } as unknown as ICoreDatabaseManager
  return db
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('LearningViewService 统计与导出（M3-C）', () => {
  it('buildSpaceStats：概念/讲义/问答聚合 + 复习到期按开关计数', async () => {
    ds = await buildDs()
    const db = await buildDb(ds)
    const svc = new LearningViewService(db)
    const pid = 'st-sp'
    await runWithUserAsync('u1', async () => {
      await db.dlProjects!.create({ id: pid, name: '统计域', goal: '入门' })
      await db.dlConcepts!.create({ id: 'g1', projectId: pid, nodeType: 'group', name: '分支' })
      await db.dlConcepts!.create({ id: 'c1', projectId: pid, nodeType: 'concept', name: '概念A', mastery: 'mastered' })
      await db.dlConcepts!.create({ id: 'c2', projectId: pid, nodeType: 'concept', name: '概念B', mastery: 'learning' })
      // 讲义：c1 发布 v1、c2 草稿
      await db.dlCards!.create({ id: 'card1', projectId: pid, conceptId: 'c1', essenceType: 'K-concept', sections: [{ key: 'intro', md: 'x' }], evidenceSources: [{ kind: '书', title: 'T' }], status: 'published' })
      await db.dlCards!.create({ id: 'card2', projectId: pid, conceptId: 'c2', essenceType: 'K-concept', sections: [{ key: 'intro', md: 'y' }], evidenceSources: [{ kind: '书', title: 'U' }] })
      // 问答
      await db.dlQuestions!.create({ id: 'q1', projectId: pid, question: 'open?' })
      await db.dlQuestions!.create({ id: 'q2', projectId: pid, question: 'answered?' })
      await db.dlQuestions!.patch('q2', { answerMd: 'ans', answerSource: 'lesson', status: 'answered', answeredAt: new Date() })
      // 旧掌握日志 + 启用复习(interval 60min) → 到期 1（c1 mastered 且日志 2026-01-01）
      await db.dlMasteryLogs!.append({ id: 'lg1', projectId: pid, conceptId: 'c1', fromMastery: 'untouched', toMastery: 'mastered', trigger: 'lesson_ack', at: new Date('2026-01-01T00:00:00Z') })
      await db.dlProjects!.patch(pid, { review: { enabled: true, intervalMin: 60, limit: 10 } })

      const stats = await svc.buildSpaceStats(pid)
      expect(stats).not.toBeNull()
      expect(stats!.concepts).toMatchObject({ total: 2, groups: 1, mastered: 1, learning: 1, review: 0 })
      expect(stats!.cards).toEqual({ published: 1, draft: 1 })
      expect(stats!.questions).toMatchObject({ total: 2, open: 1, answered: 1 })
      expect(stats!.reviewDueCount).toBe(1)
      expect(stats!.research).toEqual({ unresearched: 2 })
    })
  })

  it('buildLessonDigest：目录树顺序收录有讲义概念，md 含区内容与证据/著作', async () => {
    ds = await buildDs()
    const db = await buildDb(ds)
    const svc = new LearningViewService(db)
    const pid = 'dg-sp'
    await runWithUserAsync('u1', async () => {
      await db.dlProjects!.create({ id: pid, name: '导出域', goal: '入门' })
      await db.dlConcepts!.create({ id: 'g1', projectId: pid, nodeType: 'group', name: '基础分支', parentId: null })
      await db.dlConcepts!.create({ id: 'c1', projectId: pid, nodeType: 'concept', name: '条件概率', parentId: 'g1', mastery: 'mastered' })
      await db.dlCards!.create({
        id: 'card1', projectId: pid, conceptId: 'c1', essenceType: 'K-stmt',
        sections: [{ key: 'statement', title: '表述', md: '$$P(A|B)=\\frac{P(B|A)P(A)}{P(B)}$$' }],
        works: [{ kind: '论文', title: 'Bayes 1763', year: '1763' }],
        evidenceSources: [{ kind: '论文', title: 'Bayes 1763', url: 'https://example.org/x' }],
        status: 'published',
      })

      const dig = await svc.buildLessonDigest(pid)
      expect(dig).not.toBeNull()
      expect(dig!.count).toBe(1)
      expect(dig!.markdown).toContain('# 导出域 · 讲义合集')
      expect(dig!.markdown).toContain('## 基础分支')
      expect(dig!.markdown).toContain('### 条件概率')
      expect(dig!.markdown).toContain('P(A|B)')
      expect(dig!.markdown).toContain('**相关著作**')
      expect(dig!.markdown).toContain('**证据来源**')
      expect(dig!.filename).toContain('.md')
    })
  })

  it('buildSpaceView：追问历史 turns 按 旧→新 正序（最近消息在底部，M6 修复）', async () => {
    ds = await buildDs()
    const db = await buildDb(ds)
    const svc = new LearningViewService(db)
    const pid = 'dg-turns'
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    await runWithUserAsync('u1', async () => {
      await db.dlProjects!.create({ id: pid, name: '对话域', goal: '入门' })
      await db.dlConcepts!.create({ id: 'c1', projectId: pid, nodeType: 'concept', name: '概念A', parentId: null })
      // 先后落三条问答（略隔时间戳保证 createdAt 可辨）
      await db.dlQuestions!.create({ id: 'q1', projectId: pid, conceptId: 'c1', question: '第一问' })
      await sleep(8)
      await db.dlQuestions!.create({ id: 'q2', projectId: pid, conceptId: 'c1', question: '第二问' })
      await sleep(8)
      await db.dlQuestions!.create({ id: 'q3', projectId: pid, conceptId: 'c1', question: '第三问' })

      const view = await svc.buildSpaceView(pid)
      const textSeq = (view?.turns ?? []).filter((t) => t.role === 'user').map((t) => t.text)
      // 渲染时按序展示 → 最早的提问在最上、最近的在最下
      expect(textSeq).toEqual(['第一问', '第二问', '第三问'])
      expect(view?.turns[0]?.text).toBe('第一问')
      expect(view?.turns[view!.turns.length - 1]?.text).toBe('第三问')
    })
  })
})
