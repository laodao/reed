/**
 * 领域学习 Agent 动作层测试（dl-agent-actions）
 * @module tests/unit/core/packs/domain-learning/dl-agent-actions.spec
 *
 * 钉死（design-v3 §13/§14）：evidence 硬校验（无证据不落库）、先验 needs_verification
 * 标记、产出草稿态（relation verified=false 待人审）、答疑三路（有据存档 / 未解登记 /
 * 缺参拒绝）。真实 better-sqlite3 + 迁移。executeDlAction 优先用 ctx.db（工具层由宿主注入），
 * 测试注入真实仓储 stub，无需注册全局 DatabaseManager 访问器。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import { DlRelationRepository, PREREQUISITE_TYPE } from '@core/database/repositories/dl-relation.repository'
import { DlCardRepository } from '@core/database/repositories/dl-card.repository'
import { DlQuestionRepository } from '@core/database/repositories/dl-question.repository'
import { executeDlAction } from '@core/packs/domain-learning/services/dl-agent-actions'
import type { DlAgentExecutionContext } from '@core/packs/domain-learning/services/dl-agent.types'
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

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

/** 组装真实仓储的 db stub（executeDlAction 优先用 ctx.db，测试免注册全局访问器） */
function buildDb(d: DataSource): ICoreDatabaseManager {
  return {
    dlProjects: new DlProjectRepository(d),
    dlConcepts: new DlConceptRepository(d),
    dlRelations: new DlRelationRepository(d),
    dlCards: new DlCardRepository(d),
    dlQuestions: new DlQuestionRepository(d),
  } as unknown as ICoreDatabaseManager
}

function execCtx(db: ICoreDatabaseManager, spaceId: string): DlAgentExecutionContext {
  return { spaceId, db, emit: () => {} } as DlAgentExecutionContext
}

async function seedProject(d: DataSource, id: string): Promise<void> {
  await runWithUserAsync('u1', () => new DlProjectRepository(d).create({ id, name: '测试域', goal: '入门' }))
}

describe('dl-agent-actions', () => {
  it('save_concept：新建概念草稿（source=ai_verified）；同父同名幂等更新', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)

    await runWithUserAsync('u1', async () => {
      const ctx = execCtx(db, 'sp1')
      const r1 = await executeDlAction(ctx, { type: 'dl_save_concept', params: { concept: { name: '注意力', definitionShort: '关注重要部分', nodeType: 'concept' } } })
      expect(r1.summary.status).toBe('ok')
      const saved = await db.dlConcepts!.listByProject('sp1')
      expect(saved).toHaveLength(1)
      expect(saved[0]).toMatchObject({ name: '注意力', source: 'ai_verified', researchState: 'extracted' })

      // 幂等：同父同名再存 → 更新描述不新建
      await executeDlAction(ctx, { type: 'dl_save_concept', params: { concept: { name: '注意力', definitionShort: '更新版描述' } } })
      const again = await db.dlConcepts!.listByProject('sp1')
      expect(again).toHaveLength(1)
      expect(again[0].definitionShort).toBe('更新版描述')
    })
  })

  it('save_relation：默认前置依赖边落草稿（verified=false），待人审；自环拒绝', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-a', projectId: 'sp1', nodeType: 'concept', name: 'A' })
      await db.dlConcepts!.create({ id: 'c-b', projectId: 'sp1', nodeType: 'concept', name: 'B' })
    })
    const ctx = execCtx(db, 'sp1')
    await runWithUserAsync('u1', async () => {
      const r = await executeDlAction(ctx, { type: 'dl_save_relation', params: { relation: { sourceId: 'c-a', targetId: 'c-b' } } })
      expect(r.summary.message).toContain('待地图人审')
      const rows = await db.dlRelations!.listByProject('sp1')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ sourceId: 'c-a', targetId: 'c-b', relationType: PREREQUISITE_TYPE, verified: false })
      await expect(
        executeDlAction(ctx, { type: 'dl_save_relation', params: { relation: { sourceId: 'c-a', targetId: 'c-a' } } }),
      ).rejects.toThrow(/自环/)
    })
  })

  it('save_card：无证据不落库（硬校验）；有证据落草稿并回写概念 research_state/card', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', () => db.dlConcepts!.create({ id: 'c-bayes', projectId: 'sp1', nodeType: 'concept', name: '贝叶斯定理' }))
    const ctx = execCtx(db, 'sp1')

    await runWithUserAsync('u1', async () => {
      // 无证据 → 拒绝
      await expect(
        executeDlAction(ctx, {
          type: 'dl_save_card',
          params: {
            card: {
              conceptId: 'c-bayes',
              essenceType: 'K-stmt',
              sections: [{ key: 'statement', md: 'P(A|B)=P(B|A)P(A)/P(B)' }],
              evidenceSources: [],
            },
          },
        }),
      ).rejects.toThrow(/无出处|evidenceSources/)

      // 有证据 → 落库草稿 + 概念回写
      const r = await executeDlAction(ctx, {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-bayes',
            essenceType: 'K-stmt',
            sections: [{ key: 'statement', title: '表述', md: '$$P(A|B)=\\frac{P(B|A)P(A)}{P(B)}$$' }],
            works: [{ kind: '论文', title: 'An Essay towards solving a Problem in the Doctrine of Chances', year: '1763' }],
            evidenceSources: [{ kind: '论文', title: 'Bayes 1763', url: 'https://example.org/bayes1763' }],
          },
        },
      })
      expect(r.summary.status).toBe('ok')
      expect(r.summary.data).toMatchObject({ version: 1 })

      const saved = await db.dlCards!.getCurrentByConcept('sp1', 'c-bayes')
      expect(saved).not.toBeNull()
      expect(saved?.status).toBe('draft')
      expect(saved?.sections).toHaveLength(1)
      expect(saved?.works).toHaveLength(1)
      expect(saved?.evidenceSources).toHaveLength(1)

      const concept = await db.dlConcepts!.getById('c-bayes')
      expect(concept?.researchState).toBe('extracted')
      expect(concept?.cardId).toBe(saved?.id)
    })
  })

  it('answer_question：有据存档（answered+source）；答不上登记未解（保持 open）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    const ctx = execCtx(db, 'sp1')

    await runWithUserAsync('u1', async () => {
      // 有据回答
      const ok = await executeDlAction(ctx, {
        type: 'dl_answer_question',
        params: { question: { conceptId: 'c-x', question: '叠加态是什么？', answerMd: '叠加态=状态的线性组合。', answerSource: 'lesson' } },
      })
      expect(ok.summary.data).toMatchObject({ status: 'answered' })
      const list = await db.dlQuestions!.listByProject('sp1')
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ status: 'answered', answerSource: 'lesson' })
      expect(list[0].answerMd).toBe('叠加态=状态的线性组合。')

      // 答不上 → unresolved 登记 open（未解队列）
      const open = await executeDlAction(ctx, {
        type: 'dl_answer_question',
        params: { question: { question: '这个问题现有资料答不上', unresolved: true } },
      })
      expect(open.summary.data).toMatchObject({ status: 'open' })
      expect(await db.dlQuestions!.countOpenByProject('sp1')).toBe(1)
    })
  })

  it('answer_question（未解问题研究）：模型省 questionId 时从 ctx.questionId 兜底回填', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', () =>
      db.dlQuestions!.create({ id: 'q_open1', projectId: 'sp1', conceptId: 'c-x', question: '为什么 A 与 B 矛盾？' }))

    // 开子研究模式：宿主注入 ctx.questionId，模型参数不带 questionId → 回填到该问题
    const ctx: DlAgentExecutionContext = {
      spaceId: 'sp1',
      questionId: 'q_open1',
      db,
      emit: () => {},
    }
    await runWithUserAsync('u1', async () => {
      const r = await executeDlAction(ctx, {
        type: 'dl_answer_question',
        params: {
          question: { conceptId: 'c-x', question: '为什么 A 与 B 矛盾？', answerMd: '有据答案：…', answerSource: 'ai_verified' },
        },
      })
      expect(r.summary.data).toMatchObject({ questionId: 'q_open1', status: 'answered' })
      const saved = await db.dlQuestions!.getById('q_open1')
      expect(saved?.status).toBe('answered')
      expect(saved?.answerMd).toBe('有据答案：…')
      expect(saved?.answerSource).toBe('ai_verified')
    })
  })
})
