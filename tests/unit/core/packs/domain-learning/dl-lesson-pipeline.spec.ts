/**
 * 讲义流水线门禁（dl-agent-actions；2026-09-14 用户反馈落地）
 * @module tests/unit/core/packs/domain-learning/dl-lesson-pipeline.spec
 *
 * 用户原话：「生成讲义功能太简陋……不美观，纯粹的堆砌文字，没有对文字做精炼归纳，
 * 没有配图，布局单调简陋」。本 spec 钉死三件事：
 * 1. **视觉质检门禁**：文字墙 / 通篇无图 / 声明版式与正文不符 → 拒绝落卡并给可执行修复；
 * 2. **Plan↔Do 一致**：有已确认讲义方案时，区集/区序/声明的载体必须与大纲一致，否则拒绝；
 * 3. 按大纲落库时把**规格随卡留档**（渲染层据此出规格条与区导航）。
 * 真实 better-sqlite3 + 迁移。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import { DlRelationRepository } from '@core/database/repositories/dl-relation.repository'
import { DlCardRepository } from '@core/database/repositories/dl-card.repository'
import { DlPlanRepository } from '@core/database/repositories/dl-plan.repository'
import { executeDlAction } from '@core/packs/domain-learning/services/dl-agent-actions'
import { confirmDlPlan, proposeDlLessonPlan } from '@core/packs/domain-learning/services/dl-plan.service'
import type { DlAgentExecutionContext } from '@core/packs/domain-learning/services/dl-agent.types'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

let ds: DataSource | null = null

const ENTITY_IMPORTS = [
  () => import('@core/database/entities/domain-learning/dl-project.entity'),
  () => import('@core/database/entities/domain-learning/dl-concept.entity'),
  () => import('@core/database/entities/domain-learning/dl-relation.entity'),
  () => import('@core/database/entities/domain-learning/dl-card.entity'),
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

function buildDb(d: DataSource): ICoreDatabaseManager {
  return {
    dlProjects: new DlProjectRepository(d),
    dlConcepts: new DlConceptRepository(d),
    dlRelations: new DlRelationRepository(d),
    dlCards: new DlCardRepository(d),
    dlPlans: new DlPlanRepository(d),
  } as unknown as ICoreDatabaseManager
}

function execCtx(db: ICoreDatabaseManager, spaceId: string): DlAgentExecutionContext {
  return { spaceId, db, emit: () => {} } as DlAgentExecutionContext
}

/** 最小合法 meta 区（循序渐进门禁要求首区 meta + 前置声明） */
const META = {
  key: 'meta',
  title: '学习前必读',
  md: '- **读者画像**：会四则运算\n- **前置**：无需前置（本讲不涉及进阶记号）',
}

const EVIDENCE = [{ kind: '教材', title: '线性代数入门 第 2 章', url: 'https://example.org/la2' }]

/** 一张"达标"的讲义（要点卡 + 对比表 + 图解 + 自测，有图有表不堆字） */
function goodSections(): Array<Record<string, unknown>> {
  return [
    { ...META, layout: 'keypoints', takeaway: '会四则运算就能学' },
    { key: 'definition', layout: 'prose', md: '张量是带形状的多维数组。', takeaway: '数组 + 形状' },
    {
      key: 'detail',
      layout: 'compare',
      md: '| 运算 | 形状要求 |\n| --- | --- |\n| 加法 | 可广播 |',
    },
    {
      key: 'examples',
      layout: 'figure',
      md: '```figure\n{"type":"shape","dims":[4,3],"labels":["行","列"]}\n```',
    },
    { key: 'selfcheck', layout: 'qa', md: '1. 形状 (4,1) 与 (1,3) 相加后是什么形状？' },
  ]
}

async function seedConcept(db: ICoreDatabaseManager, id = 'c-x', name = '张量'): Promise<void> {
  await db.dlConcepts!.create({ id, projectId: 'sp1', nodeType: 'concept', name })
}

/** 一份合法的讲义方案（区级计划与 goodSections 对齐） */
function lessonPayload(): Record<string, unknown> {
  return {
    essenceType: 'K-concept',
    spec: {
      audience: '会四则运算、没学过线性代数的新人',
      outcomes: ['能说出张量的形状规则', '能判断两个形状能不能相加'],
      depth: '入门',
      budget: { sections: 5, charsPerSection: 400 },
      glossary: [{ term: '广播', plain: '形状不同也能相加的对齐规则' }],
      notation: [],
      exampleParams: [],
      roster: [
        { key: 'meta', layout: 'keypoints', job: '让读者判断自己能不能学', carrier: 'points', takeaway: '会四则运算就能学' },
        { key: 'definition', layout: 'prose', job: '给出张量的正式定义' },
        { key: 'detail', layout: 'compare', job: '把运算规则摆成对照表', carrier: 'table' },
        { key: 'examples', layout: 'figure', job: '用形状图看懂广播', carrier: 'figure' },
        { key: 'selfcheck', layout: 'qa', job: '检验能否自己判断形状' },
      ],
      visualPlan: '形状用 shape 图，运算规则用对照表',
    },
  }
}

describe('dl_propose_lesson_plan（讲义流水线 Plan 阶段）', () => {
  it('落 draft（按概念），回执说清"等用户确认后逐区精写"', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      const r = await executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_propose_lesson_plan',
        params: { lesson: { conceptId: 'c-x', ...lessonPayload() } },
      })
      expect(r.summary.status).toBe('ok')
      expect(r.summary.message).toContain('讲义方案')
      expect(r.summary.message).toContain('确认')
      const rows = await db.dlPlans!.listVersions('sp1', 'lesson', 'c-x')
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('draft')
    })
  })

  it('缺 conceptId → 拒绝（讲义是按概念写的）', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await expect(
        executeDlAction(execCtx(db, 'sp1'), {
          type: 'dl_propose_lesson_plan',
          params: { lesson: lessonPayload() },
        }),
      ).rejects.toThrow(/conceptId/)
    })
  })
})

describe('dl_save_card 视觉质检门禁（堆砌文字必须被拦下）', () => {
  /**
   * 阻断口径：**走完规划流程（有已确认讲义方案）时**才硬拦文字墙/通篇无图；
   * 快速模式（自动推进/起步轮）只警告，避免"质检把讲义卡死产不出来"。
   * 声明版式不符与大纲载体缺失与模式无关，一律阻断。
   */
  async function confirmPlanFor(db: ICoreDatabaseManager): Promise<void> {
    await proposeDlLessonPlan(db, 'sp1', 'c-x', lessonPayload())
    await confirmDlPlan(db, 'sp1', 'lesson', undefined, null, 'c-x')
  }

  /** 与已确认大纲逐区对齐的区集（把"文字墙"放进 definition，别的区照大纲兑现载体） */
  function sectionsWithWall(wall: string): Array<Record<string, unknown>> {
    return [
      { ...META, layout: 'keypoints', takeaway: '会四则运算就能学' },
      { key: 'definition', layout: 'prose', md: wall },
      { key: 'detail', layout: 'compare', md: '| 运算 | 形状要求 |\n| --- | --- |\n| 加法 | 可广播 |' },
      {
        key: 'examples',
        layout: 'figure',
        md: '```figure\n{"type":"shape","dims":[4,3],"labels":["行","列"]}\n```',
      },
      { key: 'selfcheck', layout: 'qa', md: '1. 形状 (4,1) 与 (1,3) 相加后是什么形状？' },
    ]
  }

  it('文字墙（纯文字长段、无小标题/列表/图/表）→ 拒绝，并给出可执行修复', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await confirmPlanFor(db)
      const wall = '张量的形状规则决定了运算能不能做，'.repeat(60) + '。'
      await expect(
        executeDlAction(execCtx(db, 'sp1'), {
          type: 'dl_save_card',
          params: {
            card: {
              conceptId: 'c-x',
              essenceType: 'K-concept',
              sections: sectionsWithWall(wall),
              evidenceSources: EVIDENCE,
            },
          },
        }),
      ).rejects.toThrow(/质检[\s\S]*要点卡/)
      // 未落库
      expect(await db.dlCards!.getCurrentByConcept('sp1', 'c-x')).toBeNull()
    })
  })

  it('整篇没有任何图/表/公式/代码 → 拒绝（用户要的"配图"硬要求）', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      // 这一版的讲义方案不要求任何载体（纯讲解型知识点），于是"整篇无图"就成了唯一的问题
      await proposeDlLessonPlan(db, 'sp1', 'c-x', {
        essenceType: 'K-concept',
        spec: {
          audience: '会四则运算的新人',
          outcomes: ['能说出张量是什么', '能判断两个形状能不能相加'],
          depth: '入门',
          budget: { sections: 5, charsPerSection: 400 },
          glossary: [],
          notation: [],
          exampleParams: [],
          roster: [
            { key: 'meta', layout: 'keypoints', job: '让读者判断自己能不能学' },
            { key: 'definition', layout: 'prose', job: '用一句话给出直觉 + 正式定义' },
            { key: 'detail', layout: 'prose', job: '用文字说明形状规则' },
            { key: 'selfcheck', layout: 'qa', job: '检验能否判断形状' },
          ],
          visualPlan: '',
        },
      })
      await confirmDlPlan(db, 'sp1', 'lesson', undefined, null, 'c-x')
      await expect(
        executeDlAction(execCtx(db, 'sp1'), {
          type: 'dl_save_card',
          params: {
            card: {
              conceptId: 'c-x',
              essenceType: 'K-concept',
              sections: [
                { ...META, layout: 'keypoints' },
                { key: 'definition', layout: 'prose', md: '张量就是带形状的多维数组；形状是一串整数，逐轴对齐才能运算。' },
                { key: 'detail', layout: 'prose', md: '加法要求同形或可广播，乘法按轴约简。' },
                { key: 'selfcheck', layout: 'qa', md: '1. 形状 (4,1) 与 (1,3) 相加后是什么形状？' },
              ],
              evidenceSources: EVIDENCE,
            },
          },
        }),
      ).rejects.toThrow(/质检[\s\S]*figure/)
    })
  })

  it('快速模式（未走规划）下长文字区/无图只警告、仍落库，但摘要必须让模型看见"呈现提醒"', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      const wall = '张量的形状规则决定了运算能不能做，'.repeat(60) + '。'
      const r = await executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: {
            conceptId: 'c-x',
            essenceType: 'K-concept',
            sections: [META, { key: 'mechanism', layout: 'prose', md: wall }],
            evidenceSources: EVIDENCE,
          },
        },
      })
      expect(r.summary.status).toBe('ok')
      expect(r.summary.message).toContain('呈现提醒')
      // v7：mechanism 并入「详解」并保留「### 机制」小标题 → 不再判"文字墙"；
      // 2026-10-05：详解是重点区（core），长区提醒豁免（该详写）——但仍要点名"缺 takeaway/通篇无图"
      expect(r.summary.message).toContain('takeaway')
      expect(r.summary.message).toContain('没有任何图')
      expect(await db.dlCards!.getCurrentByConcept('sp1', 'c-x')).not.toBeNull()
    })
  })

  it('声明版式与正文形状不符（声明要点卡却写成散文）→ 拒绝', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await expect(
        executeDlAction(execCtx(db, 'sp1'), {
          type: 'dl_save_card',
          params: {
            card: {
              conceptId: 'c-x',
              essenceType: 'K-concept',
              sections: [
                META,
                { key: 'rules', layout: 'keypoints', md: '规则就是形状要能对齐，否则不能相加。' },
              ],
              evidenceSources: EVIDENCE,
            },
          },
        }),
      ).rejects.toThrow(/要点卡/)
    })
  })

  it('达标卡（要点卡 + 对比表 + 图解 + 自测）→ 落库成功，且每区带上确定版式', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      const r = await executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: { conceptId: 'c-x', essenceType: 'K-concept', sections: goodSections(), evidenceSources: EVIDENCE },
        },
      })
      expect(r.summary.status).toBe('ok')
      // 动作摘要报出"看得见"的载体与版式（用户能看到这张卡不再是纯文字）
      expect(r.summary.message).toContain('含图/表/公式/代码的区')
      expect(r.summary.message).toContain('版式')
      const saved = await db.dlCards!.getCurrentByConcept('sp1', 'c-x')
      expect(saved?.sections.map((s) => s.layout)).toEqual(['keypoints', 'prose', 'compare', 'figure', 'qa'])
      expect(saved?.sections[0].takeaway).toBe('会四则运算就能学')
      // 快速模式（未走讲义方案确认）：不写规格，但摘要里说清楚
      expect(saved?.spec).toBeNull()
      expect(r.summary.message).toContain('快速模式')
    })
  })
})

describe('dl_save_card × 已确认讲义方案（Plan 与 Do 同一份口径）', () => {
  it('按大纲落库 → 成功，并把规格随卡留档（渲染层出规格条/区导航）', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await proposeDlLessonPlan(db, 'sp1', 'c-x', lessonPayload())
      await confirmDlPlan(db, 'sp1', 'lesson', undefined, null, 'c-x')

      const r = await executeDlAction(execCtx(db, 'sp1'), {
        type: 'dl_save_card',
        params: {
          card: { conceptId: 'c-x', essenceType: 'K-concept', sections: goodSections(), evidenceSources: EVIDENCE },
        },
      })
      expect(r.summary.status).toBe('ok')
      expect(r.summary.message).toContain('按已确认讲义方案落库')
      const saved = await db.dlCards!.getCurrentByConcept('sp1', 'c-x')
      expect(saved?.spec?.audience).toContain('没学过线性代数')
      expect(saved?.spec?.roster).toHaveLength(5)
      // 区级计划里声明的结论条也进了卡
      expect(saved?.sections[0].takeaway).toBe('会四则运算就能学')
    })
  })

  it('区集与大纲不一致（少一区）→ 拒绝，并列出两边差异', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await proposeDlLessonPlan(db, 'sp1', 'c-x', lessonPayload())
      await confirmDlPlan(db, 'sp1', 'lesson', undefined, null, 'c-x')

      const missingExamples = goodSections().filter((s) => s.key !== 'examples')
      await expect(
        executeDlAction(execCtx(db, 'sp1'), {
          type: 'dl_save_card',
          params: {
            card: { conceptId: 'c-x', essenceType: 'K-concept', sections: missingExamples, evidenceSources: EVIDENCE },
          },
        }),
      ).rejects.toThrow(/大纲[\s\S]*examples/)
      expect(await db.dlCards!.getCurrentByConcept('sp1', 'c-x')).toBeNull()
    })
  })

  it('大纲声明要配图、正文却没图 → 拒绝（roster 载体覆盖）', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await proposeDlLessonPlan(db, 'sp1', 'c-x', lessonPayload())
      await confirmDlPlan(db, 'sp1', 'lesson', undefined, null, 'c-x')

      const noFigure = goodSections().map((s) =>
        s.key === 'examples' ? { key: 'examples', layout: 'worked', md: '举一个例子说明广播怎么对齐形状。' } : s,
      )
      await expect(
        executeDlAction(execCtx(db, 'sp1'), {
          type: 'dl_save_card',
          params: {
            card: { conceptId: 'c-x', essenceType: 'K-concept', sections: noFigure, evidenceSources: EVIDENCE },
          },
        }),
      ).rejects.toThrow(/figure|质检/)
    })
  })

  it('本质类型与已确认方案不一致 → 拒绝（改类型等于换大纲）', async () => {
    ds = await buildDs()
    await runWithUserAsync('u1', () => new DlProjectRepository(ds!).create({ id: 'sp1', name: '测试域', goal: '入门' }))
    const db = buildDb(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await proposeDlLessonPlan(db, 'sp1', 'c-x', lessonPayload())
      await confirmDlPlan(db, 'sp1', 'lesson', undefined, null, 'c-x')

      // 用 K-inst（它同样接受 meta/definition/structure/examples/selfcheck 这套区集，
      // 好让本用例只考察"类型与已确认方案不符"这一条，不被区集契约先拦下）
      await expect(
        executeDlAction(execCtx(db, 'sp1'), {
          type: 'dl_save_card',
          params: {
            card: { conceptId: 'c-x', essenceType: 'K-inst', sections: goodSections(), evidenceSources: EVIDENCE },
          },
        }),
      ).rejects.toThrow(/讲义方案是 K-concept/)
    })
  })
})
