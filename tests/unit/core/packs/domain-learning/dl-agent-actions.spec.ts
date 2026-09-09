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

  // ===== 复盘修复（2026-09-09）：归属校验 + saveCard 升版留档（不覆盖旧稿） =====

  it('save_card：再次研究 → 升版新建 v2 留档 v1（旧内容/旧核验不丢，v2 无核验）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-bayes', projectId: 'sp1', nodeType: 'concept', name: '贝叶斯定理' })
      // 首次落 v1
      const ctx = execCtx(db, 'sp1')
      const r1 = await executeDlAction(ctx, {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-bayes',
            essenceType: 'K-stmt',
            sections: [{ key: 'statement', md: 'v1 内容' }],
            evidenceSources: [{ kind: '论文', title: 'S1', url: 'https://e.org/1' }],
          },
        },
      })
      const v1 = await db.dlCards!.getCurrentByConcept('sp1', 'c-bayes')
      expect(r1.summary.data).toMatchObject({ version: 1 })
      // 模拟 v1 已自动核验（旧判定）
      await db.dlCards!.patch(v1!.id, { verification: { status: 'verified', issues: [], checkedAt: '2026-09-09', note: null } })
      // 概念挂 v1
      await db.dlConcepts!.patch('c-bayes', { cardId: v1!.id, researchState: 'extracted' })

      // 再次研究（新证据/新内容）→ 升版新建 v2，不覆盖 v1
      const r2 = await executeDlAction(ctx, {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-bayes',
            essenceType: 'K-stmt',
            sections: [{ key: 'statement', md: 'v2 修订内容' }],
            evidenceSources: [{ kind: '论文', title: 'S2', url: 'https://e.org/2' }],
          },
        },
      })
      expect(r2.summary.data).toMatchObject({ version: 2 })
      const versions = await db.dlCards!.listVersionsByConcept('sp1', 'c-bayes')
      expect(versions).toHaveLength(2)
      const [oldV, newV] = versions
      expect(oldV.sections[0].md).toBe('v1 内容') // 旧稿留档
      expect(oldV.verification?.status).toBe('verified') // 旧核验仍挂在旧稿
      expect(newV.sections[0].md).toBe('v2 修订内容')
      expect(newV.verification).toBeNull() // 新稿核验待重跑，不得继承旧判定
      const current = await db.dlCards!.getCurrentByConcept('sp1', 'c-bayes')
      expect(current?.id).toBe(newV.id)
      const concept = await db.dlConcepts!.getById('c-bayes')
      expect(concept?.cardId).toBe(newV.id) // 概念指向最新稿
    })
  })

  it('save_card/relation/concept：空间与概念归属校验（不落孤儿/跨界数据）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    await seedProject(ds, 'sp2')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-a', projectId: 'sp1', nodeType: 'concept', name: 'A' })
      await db.dlConcepts!.create({ id: 'c-b', projectId: 'sp1', nodeType: 'concept', name: 'B' })
      await db.dlConcepts!.create({ id: 'c-other', projectId: 'sp2', nodeType: 'concept', name: '他空间概念' })
    })
    const ev = (): unknown => ({ ok: true })
    const ctx1 = { spaceId: 'sp1', db, emit: ev } as unknown as DlAgentExecutionContext
    await runWithUserAsync('u1', async () => {
      // card：conceptId 不存在 → 拒绝
      await expect(
        executeDlAction(ctx1, {
          type: 'dl_save_card',
          params: { card: { conceptId: 'ghost', essenceType: 'K-stmt', sections: [{ key: 's', md: 'x' }], evidenceSources: [{ kind: '论文', title: 'S', url: 'https://e.org/1' }] } },
        }),
      ).rejects.toThrow(/不存在|不属/)
      // card：conceptId 属他空间 → 拒绝
      await expect(
        executeDlAction(ctx1, {
          type: 'dl_save_card',
          params: { card: { conceptId: 'c-other', essenceType: 'K-stmt', sections: [{ key: 's', md: 'x' }], evidenceSources: [{ kind: '论文', title: 'S', url: 'https://e.org/1' }] } },
        }),
      ).rejects.toThrow(/不属|不存在/)
      // card：研究模式注入 ctx.conceptId 与落库 conceptId 不一致 → 拒绝（防跨概念写）
      const ctxA = { spaceId: 'sp1', conceptId: 'c-a', db, emit: ev } as unknown as DlAgentExecutionContext
      await expect(
        executeDlAction(ctxA, {
          type: 'dl_save_card',
          params: { card: { conceptId: 'c-b', essenceType: 'K-stmt', sections: [{ key: 's', md: 'x' }], evidenceSources: [{ kind: '论文', title: 'S', url: 'https://e.org/1' }] } },
        }),
      ).rejects.toThrow(/不一致|不是当前/)
      // relation：端点不存在/他空间 → 拒绝
      await expect(
        executeDlAction(ctx1, { type: 'dl_save_relation', params: { relation: { sourceId: 'c-a', targetId: 'ghost' } } }),
      ).rejects.toThrow(/不存在/)
      await expect(
        executeDlAction(ctx1, { type: 'dl_save_relation', params: { relation: { sourceId: 'c-a', targetId: 'c-other' } } }),
      ).rejects.toThrow(/不属/)
      // concept：parentId 不存在 → 拒绝
      await expect(
        executeDlAction(ctx1, { type: 'dl_save_concept', params: { concept: { name: '孤儿子概念', parentId: 'ghost-group' } } }),
      ).rejects.toThrow(/不存在/)
      // concept：parentId 属他空间 → 拒绝
      await expect(
        executeDlAction(ctx1, { type: 'dl_save_concept', params: { concept: { name: '跨空间子概念', parentId: 'c-other' } } }),
      ).rejects.toThrow(/不属/)
      // 合法路径仍可落（回归）
      const okR = await executeDlAction(ctx1, { type: 'dl_save_relation', params: { relation: { sourceId: 'c-a', targetId: 'c-b' } } })
      expect(okR.summary.status).toBe('ok')
      const okC = await executeDlAction(ctx1, { type: 'dl_save_concept', params: { concept: { name: '正常概念', parentId: null } } })
      expect(okC.summary.status).toBe('ok')
    })
  })

  it('save_concept：空间内存在同名（其他父/根层）→ skipped 防重复与防误归属（2026-09-09 复盘）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      // 目录 g1 与 g2；A 已落在 g1
      await db.dlConcepts!.create({ id: 'g1', projectId: 'sp1', nodeType: 'group', name: '目录一' })
      await db.dlConcepts!.create({ id: 'g2', projectId: 'sp1', nodeType: 'group', name: '目录二' })
      await db.dlConcepts!.create({ id: 'c-a1', projectId: 'sp1', nodeType: 'concept', name: '先验概率', parentId: 'g1' })
    })
    const ctx1 = { spaceId: 'sp1', db, emit: () => {} } as unknown as DlAgentExecutionContext
    await runWithUserAsync('u1', async () => {
      // 在另一目录 g2 再建同名 → skipped，不创建、不改动既有行归属
      const dup = await executeDlAction(ctx1, { type: 'dl_save_concept', params: { concept: { name: '先验概率', parentId: 'g2' } } })
      expect(dup.summary.status).toBe('skipped')
      const all = await db.dlConcepts!.listByProject('sp1')
      const named = all.filter((x) => x.name === '先验概率')
      expect(named).toHaveLength(1) // 未产生第二份（根层+目录双份冗余的成因被挡）
      expect(named[0].parentId).toBe('g1')
      // 同父同名仍走幂等更新（不影响原语义）
      const upd = await executeDlAction(ctx1, { type: 'dl_save_concept', params: { concept: { name: '先验概率', parentId: 'g1', definitionShort: '新定义' } } })
      expect(upd.summary.status).toBe('ok')
      const after = await db.dlConcepts!.getById('c-a1')
      expect(after?.definitionShort).toBe('新定义')
    })
  })
})
