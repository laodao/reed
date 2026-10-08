/**
 * 方案确认服务测试（dl-plan.service；2026-09-13 用户需求）
 * @module tests/unit/core/packs/domain-learning/dl-plan.service.spec
 *
 * 真实 better-sqlite3 + 迁移，钉死固定步骤的状态机：
 * 提交诉求理解 → （未确认时不许提交体系）→ 确认诉求 → 提交体系 → 确认体系（可带编辑后的载荷）
 * → 落库门禁放行；以及版本号递增、旧版本退位、额度依据。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlPlanRepository } from '@core/database/repositories/dl-plan.repository'
import {
  confirmDlPlan,
  getConfirmedLessonSpec,
  getConfirmedSyllabus,
  getDlPlanView,
  proposeDlConceptSplit,
  proposeDlLessonPlan,
  proposeDlSyllabus,
  proposeDlUnderstanding,
} from '@core/packs/domain-learning/services/dl-plan.service'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

let ds: DataSource | null = null

const ENTITY_IMPORTS = [
  () => import('@core/database/entities/domain-learning/dl-project.entity'),
  () => import('@core/database/entities/domain-learning/dl-plan.entity'),
  () => import('@core/database/entities/domain-learning/dl-concept.entity'),
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

function buildDb(d: DataSource): ICoreDatabaseManager {
  return {
    dlProjects: new DlProjectRepository(d),
    dlPlans: new DlPlanRepository(d),
    dlConcepts: new DlConceptRepository(d),
  } as unknown as ICoreDatabaseManager
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

const UNDERSTANDING = {
  goalSummary: '理解金融产品与市场，能听懂并自己看数据',
  coverage: ['股票', '债券', '期货', '美元'],
  notDoing: ['个人记账'],
}

const SYLLABUS = {
  branches: [
    { name: '金融产品', concepts: [{ name: '股票', layer: 0 }, { name: '债券', layer: 0 }] },
    { name: '市场与价格', concepts: [{ name: '汇率与美元', layer: 1, prerequisites: ['股票'] }] },
  ],
}

async function seed(d: DataSource, spaceId = 'sp1'): Promise<ICoreDatabaseManager> {
  await runWithUserAsync('u1', () => new DlProjectRepository(d).create({ id: spaceId, name: '金融理财', goal: '工作应用' }))
  return buildDb(d)
}

/** 造一个概念（讲义方案按概念存，必须先有点） */
async function seedConcept(db: ICoreDatabaseManager, id = 'k1', name = '金融资产的基本类型'): Promise<void> {
  await db.dlConcepts!.create({ id, projectId: 'sp1', nodeType: 'concept', name })
}

/** 一份合法的讲义方案载荷（v6 区序：定义 → 详解 → 案例） */
function lessonPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    essenceType: 'K-concept',
    spec: {
      audience: '没读过金融教材、会看 Excel 的职场人',
      outcomes: ['能说出股权与债权的区别', '能判断一个产品属于哪一类'],
      depth: '入门',
      budget: { sections: 5, charsPerSection: 400 },
      tone: '生活类比先行',
      glossary: [{ term: '衍生品', plain: '价值取决于另一种资产的合约' }],
      notation: [],
      exampleParams: [{ name: '票面利率', value: '3%' }],
      roster: [
        { key: 'meta', layout: 'keypoints', job: '让读者判断自己能不能学', carrier: 'points' },
        { key: 'definition', layout: 'prose', job: '给出金融资产的正式定义' },
        { key: 'detail', layout: 'compare', job: '把五类资产摆成一张对照表', carrier: 'table' },
        { key: 'examples', layout: 'worked', job: '用一只债券算清收益来源', carrier: 'figure' },
      ],
      visualPlan: '五类资产用一张对照表，收益结构用柱状图',
    },
    ...over,
  }
}

describe('dl-plan.service（方案确认流程）', () => {
  it('提交诉求理解：落 draft，版本递增，旧的 draft 退位', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      const r1 = await proposeDlUnderstanding(db, 'sp1', UNDERSTANDING)
      expect(r1.revision).toBe(1)
      expect(r1.message).toContain('等待用户在弹窗里确认')
      const r2 = await proposeDlUnderstanding(db, 'sp1', { ...UNDERSTANDING, goalSummary: '改过的话' })
      expect(r2.revision).toBe(2)
      const view = await getDlPlanView(db, 'sp1')
      expect(view.understanding?.revision).toBe(2)
      expect(view.understanding?.status).toBe('draft')
      expect(view.understandingConfirmed).toBe(false)
      // 旧版本退位（不双生效）
      const rows = await db.dlPlans!.listVersions('sp1', 'understanding')
      expect(rows.map((r) => r.status)).toEqual(['superseded', 'draft'])
    })
  })

  it('未确认诉求理解时提交知识体系 → 拒绝（顺序不能跳）', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await proposeDlUnderstanding(db, 'sp1', UNDERSTANDING)
      await expect(proposeDlSyllabus(db, 'sp1', SYLLABUS)).rejects.toThrow(/诉求理解还没有被用户确认/)
    })
  })

  it('确认诉求理解 → 才能提交体系；确认体系后落库门禁放行（getConfirmedSyllabus）', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await proposeDlUnderstanding(db, 'sp1', UNDERSTANDING)
      expect(await getConfirmedSyllabus(db, 'sp1')).toBeNull()

      const ok = await confirmDlPlan(db, 'sp1', 'understanding')
      expect(ok.message).toContain('已确认诉求理解')

      const proposed = await proposeDlSyllabus(db, 'sp1', SYLLABUS)
      expect(proposed.message).toContain('3 个知识点')
      // 未确认体系前仍不放行
      expect(await getConfirmedSyllabus(db, 'sp1')).toBeNull()

      const confirmed = await confirmDlPlan(db, 'sp1', 'syllabus')
      expect(confirmed.message).toContain('已确认知识体系')
      expect(confirmed.message).toContain('骨架已直接落库')
      const syllabus = await getConfirmedSyllabus(db, 'sp1')
      expect(syllabus).not.toBeNull()
      expect(syllabus!.branches).toHaveLength(2)

      const view = await getDlPlanView(db, 'sp1')
      expect(view.syllabusConfirmed).toBe(true)
      expect(view.understandingConfirmed).toBe(true)
      expect(view.confirmedConceptCount).toBe(3)
    })
  })

  it('确认体系时可带编辑后的载荷（用户勾选增删/调序的结果）', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await proposeDlUnderstanding(db, 'sp1', UNDERSTANDING)
      await confirmDlPlan(db, 'sp1', 'understanding')
      await proposeDlSyllabus(db, 'sp1', SYLLABUS)
      // 用户取消勾选「债券」，并把「汇率与美元」提到前面
      const edited = {
        branches: [
          { name: '市场与价格', concepts: [{ name: '汇率与美元', layer: 0 }] },
          { name: '金融产品', concepts: [{ name: '股票', layer: 0 }] },
        ],
      }
      const r = await confirmDlPlan(db, 'sp1', 'syllabus', edited, '先讲汇率')
      expect(r.message).toContain('按你的勾选/排序')
      const syllabus = await getConfirmedSyllabus(db, 'sp1')
      expect(syllabus!.branches[0].name).toBe('市场与价格')
      expect(syllabus!.branches.flatMap((b) => b.concepts.map((c) => c.name))).toEqual(['汇率与美元', '股票'])
      const view = await getDlPlanView(db, 'sp1')
      expect(view.confirmedConceptCount).toBe(2)
    })
  })

  it('重复规划：新体系确认后，旧的 confirmed 退位（只保留一份生效方案）', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await proposeDlUnderstanding(db, 'sp1', UNDERSTANDING)
      await confirmDlPlan(db, 'sp1', 'understanding')
      await proposeDlSyllabus(db, 'sp1', SYLLABUS)
      await confirmDlPlan(db, 'sp1', 'syllabus')
      await proposeDlSyllabus(db, 'sp1', {
        branches: [{ name: '重新规划', concepts: [{ name: '黄金' }] }],
      })
      await confirmDlPlan(db, 'sp1', 'syllabus')
      const rows = await db.dlPlans!.listVersions('sp1', 'syllabus')
      expect(rows.filter((r) => r.status === 'confirmed')).toHaveLength(1)
      expect((await getConfirmedSyllabus(db, 'sp1'))!.branches[0].name).toBe('重新规划')
    })
  })

  it('确认失败即拒绝：空分支/缺诉求理解的载荷都不放行', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await expect(confirmDlPlan(db, 'sp1', 'understanding')).rejects.toThrow(/还没有待确认/)
      await proposeDlUnderstanding(db, 'sp1', UNDERSTANDING)
      await confirmDlPlan(db, 'sp1', 'understanding')
      await proposeDlSyllabus(db, 'sp1', SYLLABUS)
      await expect(
        confirmDlPlan(db, 'sp1', 'syllabus', { branches: [{ name: '空分支', concepts: [] }] }),
      ).rejects.toThrow(/空分支/)
    })
  })
})

describe('确认知识体系 → 骨架确定性落库（2026-10-05 复盘：科幻空间落库轮被 max_steps 掐断，后半分支空置）', () => {
  it('确认即写入：分支目录挂领域根、知识点挂分支、rootConcepts 落根层、前置进 attrs', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await proposeDlUnderstanding(db, 'sp1', UNDERSTANDING)
      await confirmDlPlan(db, 'sp1', 'understanding')
      await proposeDlSyllabus(db, 'sp1', {
        ...SYLLABUS,
        rootConcepts: [{ name: '金融体系总览', definitionShort: '一张图看懂参与者' }],
      })
      const r = await confirmDlPlan(db, 'sp1', 'syllabus')
      expect(r.message).toContain('分支目录 2 个、知识点 4 个')

      const rows = await db.dlConcepts!.listByProject('sp1')
      // 领域根（seed 未建，backfill 按建空间约定补建）
      const root = rows.find((x) => x.nodeType === 'group' && !x.parentId)
      expect(root?.name).toBe('金融理财·领域根')
      const groups = rows.filter((x) => x.nodeType === 'group' && x.parentId === root!.id)
      expect(groups.map((g) => g.name).sort()).toEqual(['市场与价格', '金融产品'])

      const stock = rows.find((x) => x.name === '股票')
      expect(stock?.nodeType).toBe('concept')
      expect(stock?.parentId).toBe(groups.find((g) => g.name === '金融产品')!.id)
      expect(stock?.source).toBe('ai_verified')

      const fx = rows.find((x) => x.name === '汇率与美元')
      expect(fx?.attrs?.prerequisites).toEqual(['股票'])

      const overview = rows.find((x) => x.name === '金融体系总览')
      expect(overview?.parentId).toBeNull()
      expect(overview?.definitionShort).toBe('一张图看懂参与者')
    })
  })

  it('幂等可重跑：同父同名只补缺不重建；异父同名跳过；再确认新版本只增量补', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await proposeDlUnderstanding(db, 'sp1', UNDERSTANDING)
      await confirmDlPlan(db, 'sp1', 'understanding')
      await proposeDlSyllabus(db, 'sp1', SYLLABUS)
      await confirmDlPlan(db, 'sp1', 'syllabus')
      let rows = await db.dlConcepts!.listByProject('sp1')
      expect(rows.filter((x) => x.nodeType === 'concept')).toHaveLength(3)

      // 重跑（模拟修复存量空间）：不翻倍、不报错
      const { backfillConfirmedSyllabus } = await import(
        '@core/packs/domain-learning/services/dl-plan.service'
      )
      const again = await backfillConfirmedSyllabus(db, 'sp1', SYLLABUS)
      expect(again.conceptsCreated).toBe(0)
      expect(again.skipped).toBeGreaterThanOrEqual(3)
      rows = await db.dlConcepts!.listByProject('sp1')
      expect(rows.filter((x) => x.nodeType === 'concept')).toHaveLength(3)

      // 异父同名（根层已有「股票」）→ 方案里再出现不重建
      await db.dlConcepts!.create({ id: 'dup', projectId: 'sp1', nodeType: 'concept', name: '新独有', parentId: null })
      const next = await backfillConfirmedSyllabus(db, 'sp1', {
        branches: [
          ...SYLLABUS.branches,
          { name: '新分支', concepts: [{ name: '新独有' }, { name: '黄金', definitionShort: '避险资产' }] },
        ],
      })
      expect(next.conceptsCreated).toBe(1) // 只建了「黄金」
      expect(next.groupsCreated).toBe(1)
      rows = await db.dlConcepts!.listByProject('sp1')
      expect(rows.filter((x) => x.name === '新独有')).toHaveLength(1)
      // 确认后的版本再走 confirm 也不重复
      await proposeDlSyllabus(db, 'sp1', {
        branches: [...SYLLABUS.branches, { name: '新分支', concepts: [{ name: '新独有' }, { name: '黄金' }] }],
      })
      const r2 = await confirmDlPlan(db, 'sp1', 'syllabus')
      expect(r2.message).toContain('已存在跳过')
      rows = await db.dlConcepts!.listByProject('sp1')
      expect(rows.filter((x) => x.name === '黄金')).toHaveLength(1)
    })
  })

  it('已存在节点只补缺失字段：definitionShort 不覆盖已有值', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      // 模拟被掐断的存量空间：agent 已落了分支目录与部分知识点（带富化过的定义）
      await db.dlConcepts!.create({ id: 'root', projectId: 'sp1', nodeType: 'group', name: '金融理财·领域根' })
      await db.dlConcepts!.create({
        id: 'g1', projectId: 'sp1', nodeType: 'group', name: '金融产品', parentId: 'root',
        definitionShort: '旧定义（agent 富化过）',
      })
      await db.dlConcepts!.create({ id: 'k1', projectId: 'sp1', nodeType: 'concept', name: '股票', parentId: 'g1' })

      const { backfillConfirmedSyllabus } = await import(
        '@core/packs/domain-learning/services/dl-plan.service'
      )
      const r = await backfillConfirmedSyllabus(db, 'sp1', {
        branches: [
          {
            name: '金融产品',
            definitionShort: '方案里的定义',
            concepts: [
              { name: '股票', definitionShort: '新定义' },
              { name: '债券', definitionShort: '固收凭证', layer: 1 },
            ],
          },
        ],
      })
      expect(r.groupsCreated).toBe(0) // 目录已存在
      expect(r.conceptsCreated).toBe(1) // 只补了「债券」
      const rows = await db.dlConcepts!.listByProject('sp1')
      const g1 = rows.find((x) => x.id === 'g1')!
      expect(g1.definitionShort).toBe('旧定义（agent 富化过）') // 不覆盖
      const stock = rows.find((x) => x.name === '股票')!
      expect(stock.definitionShort).toBe('新定义') // 已存在但缺定义 → 补上（不重建）
      const bond = rows.find((x) => x.name === '债券')!
      expect(bond.definitionShort).toBe('固收凭证')
      expect(bond.attrs?.layer).toBe(1)
    })
  })
})

describe('dl-plan.service（讲义方案 lesson 步：规格与区级计划）', () => {
  it('提交讲义方案：按概念落 draft、版本递增、旧方案退位（不跨概念串台）', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db, 'k1', '金融资产的基本类型')
      await seedConcept(db, 'k2', '债券定价')

      const r1 = await proposeDlLessonPlan(db, 'sp1', 'k1', lessonPayload())
      expect(r1.revision).toBe(1)
      expect(r1.message).toContain('等待用户在弹窗里确认')
      expect(r1.message).toContain('K-concept')
      expect(r1.value.essenceType).toBe('K-concept')
      expect(r1.value.spec.roster.map((x) => x.key)).toEqual(['meta', 'definition', 'detail', 'examples'])

      await proposeDlLessonPlan(db, 'sp1', 'k2', lessonPayload())
      const r2 = await proposeDlLessonPlan(db, 'sp1', 'k1', lessonPayload())
      expect(r2.revision).toBe(2)

      const k1Rows = await db.dlPlans!.listVersions('sp1', 'lesson', 'k1')
      expect(k1Rows.map((r) => r.status)).toEqual(['superseded', 'draft'])
      const k2Rows = await db.dlPlans!.listVersions('sp1', 'lesson', 'k2')
      expect(k2Rows.map((r) => r.status)).toEqual(['draft'])
    })
  })

  it('确认讲义方案 → 落库门禁拿到规格（essenceType + spec）；未确认时为空', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await proposeDlLessonPlan(db, 'sp1', 'k1', lessonPayload())
      expect(await getConfirmedLessonSpec(db, 'sp1', 'k1')).toBeNull()

      const confirmed = await confirmDlPlan(db, 'sp1', 'lesson', undefined, null, 'k1')
      expect(confirmed.message).toContain('已确认讲义方案')
      expect(confirmed.message).toContain('逐区精写')

      const plan = await getConfirmedLessonSpec(db, 'sp1', 'k1')
      expect(plan).not.toBeNull()
      expect(plan!.essenceType).toBe('K-concept')
      expect(plan!.spec.audience).toContain('职场人')
      expect(plan!.spec.roster).toHaveLength(4)
    })
  })

  it('确认时可带用户改过版式的载荷（区级计划以用户改后的为准）', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await proposeDlLessonPlan(db, 'sp1', 'k1', lessonPayload())
      const edited = lessonPayload()
      const spec = edited.spec as { roster: Array<{ key: string; layout: string }> }
      spec.roster = spec.roster.map((r) => (r.key === 'detail' ? { ...r, layout: 'figure' } : r))
      const r = await confirmDlPlan(db, 'sp1', 'lesson', { ...edited, conceptId: 'k1' }, '表格看不清，改成图')
      expect(r.message).toContain('按你改后的区级计划')
      const plan = await getConfirmedLessonSpec(db, 'sp1', 'k1')
      expect(plan!.spec.roster.find((x) => x.key === 'detail')!.layout).toBe('figure')
    })
  })

  it('非法规格直接拒绝：缺读者画像 / roster 自造区名 / 概念不属于本空间', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      const noAudience = lessonPayload()
      ;(noAudience.spec as Record<string, unknown>).audience = ''
      await expect(proposeDlLessonPlan(db, 'sp1', 'k1', noAudience)).rejects.toThrow(/audience/)

      const badRoster = lessonPayload()
      ;(badRoster.spec as { roster: unknown }).roster = [{ key: 'practice', layout: 'qa', job: '随便练' }]
      await expect(proposeDlLessonPlan(db, 'sp1', 'k1', badRoster)).rejects.toThrow(/practice/)

      await expect(proposeDlLessonPlan(db, 'sp1', 'nope', lessonPayload())).rejects.toThrow(/概念不存在/)
    })
  })

  it('方案总览按概念返回讲义方案（带 lessonConceptId，前端据此判断属于当前概念）', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await proposeDlLessonPlan(db, 'sp1', 'k1', lessonPayload())
      const view = await getDlPlanView(db, 'sp1', 'k1')
      expect(view.lesson?.revision).toBe(1)
      expect(view.lessonConceptId).toBe('k1')
      expect(view.lessonConfirmed).toBe(false)
      // 不传概念时不给讲义方案（空间级视图不掺概念级数据）
      const spaceView = await getDlPlanView(db, 'sp1')
      expect(spaceView.lesson).toBeNull()
    })
  })
})


describe('dl-plan.service（知识点拆分 concept-split 步：agent 提案 → 确认即执行）', () => {
  it('提交拆分方案：按概念落 draft、message 说明代价；目录节点不能拆', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db, 'k1', 'LangChain')
      const r = await proposeDlConceptSplit(db, 'sp1', 'k1', {
        branchName: 'LangChain 体系',
        children: [
          { name: '核心抽象与执行模型', definitionShort: 'Chain/Agent/Runtime 怎么组织' },
          { name: '组件与集成生态', prerequisites: ['核心抽象与执行模型'] },
          { name: '工程实践' },
        ],
        reason: '多主题聚合：原理+架构+生态+使用装不进一份讲义',
      })
      expect(r.revision).toBe(1)
      expect(r.message).toContain('等待用户在弹窗里确认')
      expect(r.message).toContain('退役')
      expect(r.value.children).toHaveLength(3)

      // 目录节点不能拆
      await db.dlConcepts!.create({ id: 'g1', projectId: 'sp1', nodeType: 'group', name: '分支目录' })
      await expect(
        proposeDlConceptSplit(db, 'sp1', 'g1', { children: [{ name: 'A' }, { name: 'B' }] }),
      ).rejects.toThrow(/已是分支目录/)
    })
  })

  it('非法拆分方案直接拒绝：少于 2 个子知识点 / 兄弟前置引用外部 / 前置成环', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await expect(
        proposeDlConceptSplit(db, 'sp1', 'k1', { children: [{ name: '唯一' }] }),
      ).rejects.toThrow(/至少要拆出 2 个/)
      await expect(
        proposeDlConceptSplit(db, 'sp1', 'k1', {
          children: [{ name: 'A', prerequisites: ['外部概念'] }, { name: 'B' }],
        }),
      ).rejects.toThrow(/不在本次拆分/)
      await expect(
        proposeDlConceptSplit(db, 'sp1', 'k1', {
          children: [{ name: 'A', prerequisites: ['B'] }, { name: 'B', prerequisites: ['A'] }],
        }),
      ).rejects.toThrow(/环/)
    })
  })

  it('确认拆分方案 → 注入的 splitConcept 被调用（material 来源），方案置 confirmed', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await proposeDlConceptSplit(db, 'sp1', 'k1', {
        children: [{ name: 'A' }, { name: 'B', prerequisites: ['A'] }],
      })
      const calls: Array<Record<string, unknown>> = []
      const r = await confirmDlPlan(db, 'sp1', 'concept-split', undefined, null, 'k1', {
        splitConcept: async (projectId, conceptId, input) => {
          calls.push({ projectId, conceptId, input })
          return {
            branchId: conceptId,
            branchName: '金融资产的基本类型',
            children: [
              { conceptId: 'n1', name: 'A' },
              { conceptId: 'n2', name: 'B' },
            ],
            removed: { cards: 0, notes: 0, questions: 0 },
            inheritedPrereqs: [],
            droppedRelations: 0,
          }
        },
      })
      expect(r.message).toContain('已确认拆分方案')
      expect(r.message).toContain('已执行拆分')
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ projectId: 'sp1', conceptId: 'k1' })
      expect(calls[0].input).toMatchObject({ source: 'material' })

      const view = await getDlPlanView(db, 'sp1', 'k1')
      expect(view.conceptSplitConfirmed).toBe(true)
      expect(view.conceptSplitConceptId).toBe('k1')
    })
  })

  it('方案总览按概念返回拆分方案（空间级视图不掺概念级数据）', async () => {
    ds = await buildDs()
    const db = await seed(ds)
    await runWithUserAsync('u1', async () => {
      await seedConcept(db)
      await proposeDlConceptSplit(db, 'sp1', 'k1', { children: [{ name: 'A' }, { name: 'B' }] })
      const view = await getDlPlanView(db, 'sp1', 'k1')
      expect(view.conceptSplit?.revision).toBe(1)
      expect(view.conceptSplitConfirmed).toBe(false)
      const spaceView = await getDlPlanView(db, 'sp1')
      expect(spaceView.conceptSplit).toBeNull()
    })
  })
})
