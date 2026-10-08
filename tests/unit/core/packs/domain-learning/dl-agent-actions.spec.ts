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
import { DlPlanRepository } from '@core/database/repositories/dl-plan.repository'
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
  () => import('@core/database/entities/domain-learning/dl-plan.entity'),
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
    dlPlans: new DlPlanRepository(d),
  } as unknown as ICoreDatabaseManager
}

function execCtx(db: ICoreDatabaseManager, spaceId: string): DlAgentExecutionContext {
  return { spaceId, db, emit: () => {} } as DlAgentExecutionContext
}

/**
 * 最小合法 meta 区（2026-09-12 循序渐进门禁要求）：
 * 讲义首区必须是 meta 且交代前置声明，否则 dl_save_card 会被拒绝。
 */
const META = {
  key: 'meta',
  title: '学习前必读',
  md: '### 读者画像\n会四则运算。\n\n### 前置\n无需前置（本讲不涉及进阶记号）。',
}

async function seedProject(d: DataSource, id: string): Promise<void> {
  await runWithUserAsync('u1', () => new DlProjectRepository(d).create({ id, name: '测试域', goal: '入门' }))
}

describe('dl-agent-actions', () => {
  it('save_concept：新建概念草稿（source=material，2026-09-25 语义修正：ai_verified 留给核验流水线）；同父同名幂等更新', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)

    await runWithUserAsync('u1', async () => {
      const ctx = execCtx(db, 'sp1')
      const r1 = await executeDlAction(ctx, { type: 'dl_save_concept', params: { concept: { name: '注意力', definitionShort: '关注重要部分', nodeType: 'concept' } } })
      expect(r1.summary.status).toBe('ok')
      const saved = await db.dlConcepts!.listByProject('sp1')
      expect(saved).toHaveLength(1)
      expect(saved[0]).toMatchObject({ name: '注意力', source: 'material', researchState: 'extracted' })

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
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-prob', projectId: 'sp1', nodeType: 'concept', name: '概率基础' })
      await db.dlConcepts!.create({ id: 'c-bayes', projectId: 'sp1', nodeType: 'concept', name: '贝叶斯定理' })
      await db.dlRelations!.create({ id: 'r-prob', projectId: 'sp1', sourceId: 'c-prob', targetId: 'c-bayes', relationType: PREREQUISITE_TYPE })
    })
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
            sections: [META, { key: 'statement', title: '表述', md: '$$P(A|B)=\\frac{P(B|A)P(A)}{P(B)}$$' }],
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
      expect(saved?.sections).toHaveLength(2)
      expect(saved?.works).toHaveLength(1)
      expect(saved?.evidenceSources).toHaveLength(1)

      const concept = await db.dlConcepts!.getById('c-bayes')
      expect(concept?.researchState).toBe('extracted')
      expect(concept?.cardId).toBe(saved?.id)
    })
  })

  it('save_card：先验产出（零证据 + needsVerification=true）可落库，attrs 标 evidenceLevel；两者都不给仍拒绝', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-prior', projectId: 'sp1', nodeType: 'concept', name: '交换律' })
    })
    const ctx = execCtx(db, 'sp1')

    await runWithUserAsync('u1', async () => {
      // 零证据但显式声明先验 → 允许落库（2026-10-06 用户口径：是否检索由模型判断）
      const r = await executeDlAction(ctx, {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-prior',
            essenceType: 'K-concept',
            sections: [META, { key: 'definition', title: '定义', md: '交换律：运算次序不影响结果。' }],
            evidenceSources: [],
            needsVerification: true,
          },
        },
      })
      expect(r.summary.status).toBe('ok')

      const saved = await db.dlCards!.getCurrentByConcept('sp1', 'c-prior')
      expect(saved).not.toBeNull()
      expect(saved?.evidenceSources).toHaveLength(0)
      expect((await db.dlConcepts!.getById('c-prior'))?.attrs).toMatchObject({
        needsVerification: true,
        evidenceLevel: 'prior_needs_verification',
      })

      // 零证据且未声明 → 仍拒绝（防"不检索又不声明"的偷懒产出）
      await expect(
        executeDlAction(ctx, {
          type: 'dl_save_card',
          params: {
            card: {
              conceptId: 'c-prior',
              essenceType: 'K-concept',
              sections: [{ key: 'definition', md: '无声明版' }],
              evidenceSources: [],
            },
          },
        }),
      ).rejects.toThrow(/needsVerification/)
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
      await db.dlConcepts!.create({ id: 'c-prob', projectId: 'sp1', nodeType: 'concept', name: '概率基础' })
      await db.dlConcepts!.create({ id: 'c-bayes', projectId: 'sp1', nodeType: 'concept', name: '贝叶斯定理' })
      await db.dlRelations!.create({ id: 'r-prob', projectId: 'sp1', sourceId: 'c-prob', targetId: 'c-bayes', relationType: PREREQUISITE_TYPE })
      // 首次落 v1
      const ctx = execCtx(db, 'sp1')
      const r1 = await executeDlAction(ctx, {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-bayes',
            essenceType: 'K-stmt',
            sections: [META, { key: 'statement', md: 'v1 内容' }],
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
            sections: [META, { key: 'statement', md: 'v2 修订内容' }],
            evidenceSources: [{ kind: '论文', title: 'S2', url: 'https://e.org/2' }],
          },
        },
      })
      expect(r2.summary.data).toMatchObject({ version: 2 })
      const versions = await db.dlCards!.listVersionsByConcept('sp1', 'c-bayes')
      expect(versions).toHaveLength(2)
      const [oldV, newV] = versions
      expect(oldV.sections[1].md).toBe('v1 内容') // 旧稿留档
      expect(oldV.verification?.status).toBe('verified') // 旧核验仍挂在旧稿
      expect(newV.sections[1].md).toBe('v2 修订内容')
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

  // ===== 复盘修复（2026-09-09）：难度门禁（用户拍板"遇超纲先补前置基础卡"）+ 数值自检 =====

  it('save_card：入门目标 + 未做教学的进阶记号 → 拒绝并要求先补前置基础卡', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1') // goal=入门
    const db = buildDb(ds)
    await runWithUserAsync('u1', () =>
      db.dlConcepts!.create({ id: 'c-eb', projectId: 'sp1', nodeType: 'method', name: '经验贝叶斯' }))
    const ctx = execCtx(db, 'sp1')
    await runWithUserAsync('u1', async () => {
      // 研究生级内容、零记号教学 → 门禁拦下，并给出"先建前置概念+关系、为最基础者先出讲义"的路径
      await expect(
        executeDlAction(ctx, {
          type: 'dl_save_card',
          params: {
            card: {
              conceptId: 'c-eb',
              essenceType: 'K-stmt',
              sections: [{ key: 'statement', md: '用 ∫ f(x|θ)dG(θ) 估计先验 G，假定 iid，做边际极大似然。' }],
              evidenceSources: [{ kind: '论文', title: 'S', url: 'https://e.org/1' }],
            },
          },
        }),
      ).rejects.toThrow(/先补前置|记号热身/)

      // 做了记号热身（meta 区给读法）→ 门禁放行（只挡"未解释就使用"）
      const ok = await executeDlAction(ctx, {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-eb',
            essenceType: 'K-stmt',
            sections: [
              {
                key: 'meta',
                title: '学习前必读',
                md:
                  '### 前置\n无需前置，会四则运算即可。\n\n### 记号热身\n' +
                  '∫ 读作"把……加起来"，例：∫x dx 表示把细条面积相加；' +
                  'iid 读作"独立同分布"，例：两次抛硬币的两次结果互不影响、且正面概率都是 0.5。',
              },
              { key: 'statement', title: '正式陈述', md: '于是 ∫ f(x|θ)dG(θ) 表示按先验加权求和，iid 假定下可做边际极大似然。' },
            ],
            evidenceSources: [{ kind: '论文', title: 'S', url: 'https://e.org/1' }],
          },
        },
      })
      expect(ok.summary.status).toBe('ok')
    })
  })

  it('save_card：数值自检发现算式不一致 → 落库但提示核对（不阻断）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', () =>
      db.dlConcepts!.create({ id: 'c-num', projectId: 'sp1', nodeType: 'concept', name: '筛检概率' }))
    const ctx = execCtx(db, 'sp1')
    await runWithUserAsync('u1', async () => {
      const r = await executeDlAction(ctx, {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-num',
            essenceType: 'K-concept',
            sections: [META, { key: 'examples', md: '分子 0.99×0.01=0.00099，分母 0.0594。' }],
            evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/2' }],
          },
        },
      })
      expect(r.summary.status).toBe('ok')
      expect(r.summary.message).toContain('数值自检')
      const issues = (r.summary.data as { numericIssues?: string[] } | undefined)?.numericIssues ?? []
      expect(issues).toHaveLength(1)
      expect(issues[0]).toContain('不一致')
    })
  })

  // ===== 2026-09-12 用户反馈：知识点要循序渐进（门禁对所有目标生效） =====

  it('save_card：工作应用目标下 张量→自动微分 跳步 → 拒绝并给出补前置路径', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () =>
      new DlProjectRepository(ds!).create({ id: 'sp-dl', name: '深度学习', goal: '工作应用' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'k-tensor', projectId: 'sp-dl', nodeType: 'concept', name: '张量' })
      await db.dlConcepts!.create({ id: 'k-ad', projectId: 'sp-dl', nodeType: 'concept', name: '自动微分与反向传播' })
      await db.dlRelations!.create({ id: 'r1', projectId: 'sp-dl', sourceId: 'k-tensor', targetId: 'k-ad', relationType: PREREQUISITE_TYPE })
    })
    const ctx = execCtx(db, 'sp-dl')
    await runWithUserAsync('u1', async () => {
      await expect(
        executeDlAction(ctx, {
          type: 'dl_save_card',
          params: {
            card: {
              conceptId: 'k-ad',
              essenceType: 'K-concept',
              sections: [
                { key: 'meta', title: '学习前必读', md: '### 前置\n已掌握：张量。' },
                { key: 'mechanism', title: '机制', md: '以计算图为骨架，用链式法则从输出向输入逐层求参数梯度。' },
              ],
              evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/ad' }],
            },
          },
        }),
      ).rejects.toThrow(/先补前置|dl_save_concept/)
    })
  })

  it('save_card：首区不是 meta（无前置声明）→ 拒绝（章节结构与门槛说明是硬要求）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', () =>
      db.dlConcepts!.create({ id: 'c-x', projectId: 'sp1', nodeType: 'concept', name: '甲概念' }))
    const ctx = execCtx(db, 'sp1')
    await runWithUserAsync('u1', async () => {
      await expect(
        executeDlAction(ctx, {
          type: 'dl_save_card',
          params: {
            card: {
              conceptId: 'c-x',
              essenceType: 'K-concept',
              sections: [{ key: 'definition', title: '定义', md: '甲是……' }],
              evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/1' }],
            },
          },
        }),
      ).rejects.toThrow(/key=meta/)
    })
  })

  it('save_card：前置概念尚无讲义 → 落库但提示先补前置讲义（不阻断）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-deriv', projectId: 'sp1', nodeType: 'concept', name: '导数与链式法则' })
      await db.dlConcepts!.create({ id: 'c-ad', projectId: 'sp1', nodeType: 'concept', name: '反向传播' })
      await db.dlRelations!.create({ id: 'r1', projectId: 'sp1', sourceId: 'c-deriv', targetId: 'c-ad', relationType: PREREQUISITE_TYPE })
    })
    const ctx = execCtx(db, 'sp1')
    await runWithUserAsync('u1', async () => {
      const r = await executeDlAction(ctx, {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-ad',
            essenceType: 'K-concept',
            sections: [
              { key: 'meta', title: '学习前必读', md: '### 前置\n已掌握：导数与链式法则。' },
              { key: 'mechanism', title: '机制', md: '用链式法则逐层求梯度。' },
            ],
            evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/2' }],
          },
        },
      })
      expect(r.summary.status).toBe('ok')
      expect(r.summary.message).toContain('尚无讲义')
      expect((r.summary.data as { progressionWarnings?: string[] }).progressionWarnings?.length).toBeGreaterThan(0)
    })
  })

  // ===== 2026-09-12 用户需求：主题级 + 知识点级前置要求 =====

  it('save_concept：声明前置写入 attrs.prerequisites；已在图上的前置提示建关系边', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', () =>
      db.dlConcepts!.create({ id: 'c-tensor', projectId: 'sp1', nodeType: 'concept', name: '张量' }))
    const ctx = execCtx(db, 'sp1')
    await runWithUserAsync('u1', async () => {
      const r = await executeDlAction(ctx, {
        type: 'dl_save_concept',
        params: {
          concept: {
            name: '自动微分与反向传播',
            definitionShort: '链式法则逐层求梯度',
            prerequisites: ['张量', '导数与链式法则'],
          },
        },
      })
      expect(r.summary.status).toBe('ok')
      const saved = await db.dlConcepts!.listByProject('sp1')
      const ad = saved.find((c) => c.name === '自动微分与反向传播')!
      expect((ad.attrs as { prerequisites?: string[] }).prerequisites).toEqual(['张量', '导数与链式法则'])
      // 已在图上的前置 → 提示建关系边；没有落点的前置 → 明确要求补
      expect(r.summary.message).toContain('dl_save_relation')
      expect(r.summary.message).toContain('导数与链式法则')
      expect(r.summary.message).toContain('dl_save_space_prereqs')
      const data = r.summary.data as { linkablePrereqs?: unknown[]; missingPrerequisites?: string[] }
      expect(data.linkablePrereqs).toEqual([{ name: '张量', conceptId: 'c-tensor' }])
      expect(data.missingPrerequisites).toEqual(['导数与链式法则'])
      // 幂等更新路径同样保留前置声明
      await executeDlAction(ctx, {
        type: 'dl_save_concept',
        params: { concept: { name: '自动微分与反向传播', definitionShort: '更新版' } },
      })
      const again = (await db.dlConcepts!.listByProject('sp1')).find((c) => c.name === '自动微分与反向传播')!
      expect((again.attrs as { prerequisites?: string[] }).prerequisites).toEqual(['张量', '导数与链式法则'])
      expect(again.definitionShort).toBe('更新版')
    })
  })

  it('save_concept：前置名与"概念名"同名/为空/重复 → 规范化（去自己、去空、去重）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    const ctx = execCtx(db, 'sp1')
    await runWithUserAsync('u1', async () => {
      await executeDlAction(ctx, {
        type: 'dl_save_concept',
        params: {
          concept: { name: '张量', prerequisites: ['张量', '  ', '线性代数基础', '线性代数基础'] },
        },
      })
      const saved = (await db.dlConcepts!.listByProject('sp1')).find((c) => c.name === '张量')!
      expect((saved.attrs as { prerequisites?: string[] }).prerequisites).toEqual(['线性代数基础'])
    })
  })

  it('save_space_prereqs：落库主题学习前置要求（inSpace 按空间实际概念反推），全量替换', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', () =>
      db.dlConcepts!.create({ id: 'c-linalg', projectId: 'sp1', nodeType: 'concept', name: '线性代数基础' }))
    const ctx = execCtx(db, 'sp1')
    await runWithUserAsync('u1', async () => {
      // items 必须显式给（哪怕空数组）
      await expect(
        executeDlAction(ctx, { type: 'dl_save_space_prereqs', params: { spacePrereqs: {} } }),
      ).rejects.toThrow(/items/)

      const r = await executeDlAction(ctx, {
        type: 'dl_save_space_prereqs',
        params: {
          spacePrereqs: {
            items: [
              { name: '线性代数基础', why: '矩阵乘法与转置' },
              { name: 'Python 基础', why: '写训练脚本', level: '能用 NumPy 索引即可', inSpace: true },
              { name: '', why: '空名应被丢弃' },
              { name: '线性代数基础', why: '重复应被丢弃' },
            ],
            note: '线性代数基础会在本空间内教',
          },
        },
      })
      expect(r.summary.status).toBe('ok')
      const project = await db.dlProjects!.getById('sp1')
      expect(project?.prerequisites.map((p) => p.name)).toEqual(['线性代数基础', 'Python 基础'])
      // 空间里有同名概念 → inSpace 反推为 true（不信模型自报）
      expect(project?.prerequisites[0].inSpace).toBe(true)
      expect(project?.prerequisites[0].why).toBe('矩阵乘法与转置')
      // 空间里没有 Python 基础 → inSpace=false，即便模型写了 true
      expect(project?.prerequisites[1].inSpace).toBe(false)
      expect(r.summary.message).toContain('主题学习前置要求已更新')
      expect(r.summary.message).toContain('Python 基础')

      // 全量替换：清空 = 明确无前置
      const cleared = await executeDlAction(ctx, {
        type: 'dl_save_space_prereqs',
        params: { spacePrereqs: { items: [] } },
      })
      expect(cleared.summary.message).toContain('已清空')
      expect((await db.dlProjects!.getById('sp1'))?.prerequisites).toEqual([])
    })
  })

  it('save_card：前置能力已被主题前置要求覆盖 → 不强制图上有对应知识点（门禁放行）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-ad2', projectId: 'sp1', nodeType: 'concept', name: '反向传播' })
      // 先落主题前置：导数与链式法则属"需自备"
      await executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_space_prereqs',
        params: { spacePrereqs: { items: [{ name: '导数与链式法则', why: '求梯度要用' }] } },
      })
      const r = await executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-ad2',
            essenceType: 'K-concept',
            sections: [
              { key: 'meta', title: '学习前必读', md: '### 前置\n已掌握：导数与链式法则（主题前置已声明，需自备）。' },
              { key: 'mechanism', title: '机制', md: '用链式法则逐层求梯度。' },
            ],
            evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/3' }],
          },
        },
      })
      expect(r.summary.status).toBe('ok')
    })
  })

  // 2026-09-13 用户反馈：同一主题下不同知识点结构/标题/答案形态各不相同
  it('save_card：区集按本质类型模板归一（同义区名改名、标题派生、正文 ## 降到 ###、答案拆独立区）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-tensor', projectId: 'sp1', nodeType: 'concept', name: '张量' })
    })
    const r = await runWithUserAsync('u1', () =>
      executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-tensor',
            essenceType: 'K-concept',
            sections: [
              { key: 'meta', title: '导读：前置、记号与目标', md: '## 前置\n无需前置（本讲只用四则运算）。' },
              { key: 'worked', title: '手算两例（含回算校验）', md: '## 例 1\n正文' },
              { key: 'checks', title: '自测与检验清单', md: '**Q1** 题目\n\n**答案**\n\n**A1** 解答' },
            ],
            evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/t' }],
          },
        },
      }),
    )
    expect(r.summary.status).toBe('ok')
    expect(r.summary.message).toContain('结构已按 K-concept 模板归一')
    await runWithUserAsync('u1', async () => {
      const saved = await db.dlCards!.getCurrentByConcept('sp1', 'c-tensor')
      expect(saved?.sections.map((s) => s.key)).toEqual(['meta', 'examples', 'selfcheck', 'answers'])
      // 标题由模板派生（不再"每张卡自己起大标题"）
      expect(saved?.sections[0].title).toBe('学习前必读')
      expect(saved?.sections[1].title).toBe('案例')
      expect(saved?.sections[2].title).toBe('自测')
      // 正文标题层级统一（区标题已占二级语义）
      expect(saved?.sections[0].md).toContain('### 前置')
      // 答案已拆到独立区，题面里看不到答案
      expect(saved?.sections[2].md).not.toContain('A1')
      expect(saved?.sections[3].md).toContain('A1')
    })
  })

  it('save_card：v9 自造区缺 role（practice）→ 拒绝并说明五选一（带齐 title+role 则合法）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-ad', projectId: 'sp1', nodeType: 'concept', name: '自动微分' })
    })
    await runWithUserAsync('u1', async () => {
      const err = await executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-ad',
            essenceType: 'K-concept',
            sections: [
              { key: 'meta', md: '### 前置\n无需前置。' },
              { key: 'examples', md: '正文' },
              { key: 'practice', title: '上手练习', md: '落到代码' },
            ],
            evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/t' }],
          },
        },
      }).catch((e: Error) => e)
      expect(err).toBeInstanceOf(Error)
      const message = (err as Error).message
      expect(message).toContain('practice')
      expect(message).toContain('role')
    })

    // v9：自造区带齐 title + role → 正常落库（复杂主题可自造章节）
    const ok = await runWithUserAsync('u1', () =>
      executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-ad',
            essenceType: 'K-concept',
            sections: [
              { key: 'meta', md: '### 前置\n无需前置。' },
              { key: 'definition', md: '严格定义。' },
              { key: 'architecture', title: '整体架构', role: 'core', md: '架构正文。' },
              { key: 'practice', title: '上手练习', role: 'support', md: '落到代码' },
              { key: 'selfcheck', md: '**Q1** 题' },
            ],
            evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/t' }],
          },
        },
      }),
    )
    expect(ok.summary.status).toBe('ok')
    await runWithUserAsync('u1', async () => {
      const saved = await db.dlCards!.getCurrentByConcept('sp1', 'c-ad')
      const arch = saved?.sections.find((s) => s.key === 'architecture')
      expect(arch?.title).toBe('整体架构')
      expect(arch?.role).toBe('core')
    })
  })

  it('save_card：v9 正文区顺序自由（案例写在定义之前不再重排），锚点仍归位（meta 首、selfcheck 尾）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-x', projectId: 'sp1', nodeType: 'concept', name: 'X' })
    })
    const r = await runWithUserAsync('u1', () =>
      executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-x',
            essenceType: 'K-concept',
            sections: [
              { key: 'examples', md: '案例正文' },
              { key: 'meta', md: '### 前置\n无需前置。' },
              { key: 'definition', md: '定义正文' },
              { key: 'selfcheck', md: '**Q1** 题' },
            ],
            evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/t' }],
          },
        },
      }),
    )
    expect(r.summary.status).toBe('ok')
    expect(r.summary.message).toContain('区序已归位')
    await runWithUserAsync('u1', async () => {
      const saved = await db.dlCards!.getCurrentByConcept('sp1', 'c-x')
      // 正文区保持模型给的相对顺序（先例后律合法），meta 归位到首、selfcheck 收尾
      expect(saved?.sections.map((s) => s.key)).toEqual(['meta', 'examples', 'definition', 'selfcheck'])
    })
  })

  // 2026-10-06 v9：老卡重存仍做无损合并（内容一字不删），但正文相对顺序保持原样（不再按模板重排）
  it('save_card：v5 旧序老卡（示例在前、规则单列）→ 归一化合并进详解（内容不丢），相对顺序保持 v5 原序', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-legacy', projectId: 'sp1', nodeType: 'concept', name: '旧序卡' })
    })
    const r = await runWithUserAsync('u1', () =>
      executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-legacy',
            essenceType: 'K-concept',
            sections: [
              { key: 'meta', title: '学习前必读', md: '### 前置\n无需前置。' },
              { key: 'essence', title: '本质', md: '一句话直觉。' },
              { key: 'examples', title: '示例', md: '先看两个例子。' },
              { key: 'definition', title: '定义', md: '严格定义。' },
              { key: 'rules', title: '规则', md: '### 规则一\n逐条规则正文。' },
              { key: 'selfcheck', md: '**Q1** 题目' },
            ],
            evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/t' }],
          },
        },
      }),
    )
    expect(r.summary.status).toBe('ok')
    expect(r.summary.message).toContain('并入')
    await runWithUserAsync('u1', async () => {
      const saved = await db.dlCards!.getCurrentByConcept('sp1', 'c-legacy')
      // v9：essence 并入 definition、rules 并入 detail（内容保留）；正文相对顺序保持 v5 原序（示例在前）
      expect(saved?.sections.map((s) => s.key)).toEqual(['meta', 'definition', 'examples', 'detail', 'selfcheck'])
      const definition = saved!.sections.find((s) => s.key === 'definition')!
      expect(definition.md).toContain('一句话直觉') // 原 essence 内容
      expect(definition.md).toContain('严格定义')
      const detail = saved!.sections.find((s) => s.key === 'detail')!
      expect(detail.md).toContain('逐条规则正文') // 原 rules 内容
      expect(detail.md).toContain('### 规则') // 原区标题作为小标题保留
    })
  })

  it('save_card：重点区过简 → 落库成功但附"重点提醒"（非阻断，模型据此补写重发）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await db.dlConcepts!.create({ id: 'c-thin', projectId: 'sp1', nodeType: 'concept', name: '薄卡' })
    })
    const r = await runWithUserAsync('u1', () =>
      executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-thin',
            essenceType: 'K-concept',
            sections: [
              { key: 'meta', title: '学习前必读', md: '### 前置\n无需前置。' },
              { key: 'definition', title: '定义', md: '一句话定义。' },
            ],
            evidenceSources: [{ kind: '教材', title: 'T', url: 'https://e.org/t' }],
          },
        },
      }),
    )
    expect(r.summary.status).toBe('ok')
    expect(r.summary.message).toContain('重点提醒')
    expect(r.summary.message).toContain('定义')
  })

  // 2026-09-13 用户需求：首批知识点必须"先对齐诉求 → 确认知识体系 → 才允许落库"
  it('规划轮门禁：没有已确认的知识体系方案 → 拒绝建点（非规划轮不受影响）', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      const planningCtx = { ...execCtx(db, 'sp1'), planningRound: true }
      const err = await executeDlAction(planningCtx, {
        type: 'dl_save_concept',
        params: { concept: { name: '股票', definitionShort: '公司所有权凭证' } },
      }).catch((e: Error) => e)
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toContain('已确认的知识体系方案')
      expect(await db.dlConcepts!.listByProject('sp1')).toHaveLength(0)

      // 同一动作在非规划轮（如单个概念的普通研究轮）不受此门禁约束
      const r = await executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_concept',
        params: { concept: { name: '股票', definitionShort: '公司所有权凭证' } },
      })
      expect(r.summary.status).toBe('ok')
    })
  })

  it('规划轮门禁：诉求理解→体系 确认后放行，且提案动作本身可用', async () => {
    ds = await buildDs()
    await seedProject(ds, 'sp1')
    const db = buildDb(ds)
    const { confirmDlPlan } = await import('@core/packs/domain-learning/services/dl-plan.service')
    await runWithUserAsync('u1', async () => {
      const ctx = { ...execCtx(db, 'sp1'), planningRound: true }
      const u = await executeDlAction(ctx, {
        type: 'dl_propose_understanding',
        params: {
          understanding: {
            goalSummary: '想搞懂金融产品与市场，能自己看数据',
            coverage: ['股票', '债券', '期货', '美元'],
            notDoing: ['个人记账'],
          },
        },
      })
      expect(u.summary.status).toBe('ok')
      expect(u.summary.message).toContain('等待用户在弹窗里确认')

      // 未确认诉求理解就提体系 → 拒绝（顺序不能跳）
      await expect(
        executeDlAction(ctx, {
          type: 'dl_propose_syllabus',
          params: { syllabus: { branches: [{ name: '金融产品', concepts: [{ name: '股票' }] }] } },
        }),
      ).rejects.toThrow(/诉求理解还没有被用户确认/)

      await confirmDlPlan(db, 'sp1', 'understanding')
      const s = await executeDlAction(ctx, {
        type: 'dl_propose_syllabus',
        params: {
          syllabus: {
            branches: [
              { name: '金融产品', concepts: [{ name: '股票', layer: 0 }, { name: '债券', layer: 0 }] },
              { name: '市场与价格', concepts: [{ name: '汇率与美元', layer: 1, prerequisites: ['股票'] }] },
            ],
          },
        },
      })
      expect(s.summary.message).toContain('3 个知识点')
      // 体系未确认 → 仍拒绝建点
      await expect(
        executeDlAction(ctx, { type: 'dl_save_concept', params: { concept: { name: '股票' } } }),
      ).rejects.toThrow(/已确认的知识体系方案/)

      await confirmDlPlan(db, 'sp1', 'syllabus')
      // 2026-10-05：确认时骨架已由系统确定性落库（领域根 + 分支目录 + 全部知识点）
      const afterConfirm = (await db.dlConcepts!.listByProject('sp1')).map((c) => c.name).sort()
      expect(afterConfirm).toEqual(
        ['市场与价格', '债券', '汇率与美元', '金融产品', '测试域·领域根', '股票'].sort(),
      )
      // agent 落库轮再落同名点（同父）→ 幂等更新（不重复建）；门禁已放行不再拒绝
      const rows = await db.dlConcepts!.listByProject('sp1')
      const stockParent = rows.find((c) => c.name === '股票')!.parentId
      const saved = await executeDlAction(ctx, {
        type: 'dl_save_concept',
        params: { concept: { name: '股票', definitionShort: '公司所有权凭证', parentId: stockParent } },
      })
      expect(saved.summary.status).toBe('ok')
      expect(saved.summary.message).toContain('已存在')
      expect((await db.dlConcepts!.listByProject('sp1')).filter((c) => c.name === '股票')).toHaveLength(1)
    })
  })
})
