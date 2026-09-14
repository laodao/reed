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
  getConfirmedSyllabus,
  getDlPlanView,
  proposeDlSyllabus,
  proposeDlUnderstanding,
} from '@core/packs/domain-learning/services/dl-plan.service'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

let ds: DataSource | null = null

const ENTITY_IMPORTS = [
  () => import('@core/database/entities/domain-learning/dl-project.entity'),
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

function buildDb(d: DataSource): ICoreDatabaseManager {
  return {
    dlProjects: new DlProjectRepository(d),
    dlPlans: new DlPlanRepository(d),
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
      expect(confirmed.message).toContain('可以落库知识点')
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
