/**
 * 领域学习周期推进调度器测试（dl-pace-scheduler，M2-C）
 * @module tests/unit/core/packs/domain-learning/dl-pace-scheduler.spec
 *
 * 真实 better-sqlite3 + 迁移；runJob 用 stub 记录载荷（agent 真跑留真机验收）。
 * 钉死口径：pace 关闭/非 active 不推进；按 intervalMin 到期才推进；候选=无卡概念
 * （group/有卡除外）、未解问题其次；每空间每 tick 至多 1 任务且概念优先；冷却防
 * 失败风暴；在途不重复发起；pace 仓储读写往返。
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import { DlCardRepository } from '@core/database/repositories/dl-card.repository'
import { DlQuestionRepository } from '@core/database/repositories/dl-question.repository'
import {
  DlPaceSchedulerService,
  normalizePaceSettings,
  type DlPaceJob,
} from '@core/packs/domain-learning/services/dl-pace-scheduler.service'
import type { DlPaceSettings } from '@shared/types/domain-learning.types'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

let ds: DataSource | null = null
let env: Env | null = null

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

function buildDb(d: DataSource): ICoreDatabaseManager {
  return {
    dlProjects: new DlProjectRepository(d),
    dlConcepts: new DlConceptRepository(d),
    dlCards: new DlCardRepository(d),
    dlQuestions: new DlQuestionRepository(d),
  } as unknown as ICoreDatabaseManager
}

interface Env {
  db: ICoreDatabaseManager
  jobs: DlPaceJob[]
  scheduler: DlPaceSchedulerService
  setNow: (n: number) => void
}

/** tick 需要在 ALS 用户作用域内执行（仓储按用户隔离） */
async function tickScheduler(): Promise<number> {
  return runWithUserAsync('u1', () => env!.scheduler.tick())
}

async function tickSchedulerAt(now: number): Promise<number> {
  return runWithUserAsync('u1', () => env!.scheduler.tick(now))
}

beforeEach(async () => {
  ds = await buildDs()
  const db = buildDb(ds)
  let now = 1_000_000
  const jobs: DlPaceJob[] = []
  const scheduler = new DlPaceSchedulerService()
  scheduler.configure({
    db,
    runJob: async (job) => {
      jobs.push(job)
    },
    clock: () => now,
    cooldownMs: 60_000,
    maxConcurrent: 3,
  })
  env = { db, jobs, scheduler, setNow: (n) => (now = n) }
})

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
  env = null
})

function pace(enabled: boolean, extra: Partial<DlPaceSettings> = {}): DlPaceSettings {
  return { enabled, intervalMin: 30, autoResearchConcepts: true, autoResolveOpenQuestions: true, ...extra }
}

async function seedProject(id: string, opts: { pace?: DlPaceSettings; status?: string } = {}): Promise<void> {
  await runWithUserAsync('u1', () =>
    env!.db.dlProjects!.create({ id, name: '测试域', goal: '入门', status: opts.status ?? 'active', pace: opts.pace ?? null }))
}

async function seedConcept(id: string, projectId: string, name: string, nodeType = 'concept'): Promise<void> {
  await runWithUserAsync('u1', () => env!.db.dlConcepts!.create({ id, projectId, nodeType, name }))
}

async function seedCardFor(projectId: string, conceptId: string): Promise<void> {
  await runWithUserAsync('u1', () =>
    env!.db.dlCards!.create({
      id: `card-${conceptId}`,
      projectId,
      conceptId,
      essenceType: 'K-concept',
      sections: [{ key: 'intro', md: 'x' }],
      evidenceSources: [{ kind: '书', title: 'T' }],
    }))
}

async function seedOpenQuestion(id: string, projectId: string, conceptId: string | null, text: string): Promise<void> {
  await runWithUserAsync('u1', () => env!.db.dlQuestions!.create({ id, projectId, conceptId, question: text }))
}

describe('normalizePaceSettings', () => {
  it('缺省/非法值回落到安全默认', () => {
    expect(normalizePaceSettings(null)).toEqual({
      enabled: false, intervalMin: 30, autoResearchConcepts: true, autoResolveOpenQuestions: true,
    })
    expect(
      normalizePaceSettings({ enabled: true, intervalMin: 0, autoResearchConcepts: false, autoResolveOpenQuestions: false }),
    ).toEqual({ enabled: true, intervalMin: 30, autoResearchConcepts: false, autoResolveOpenQuestions: false })
  })
})

describe('dl-pace-scheduler.tick', () => {
  it('pace 未启用 / 空间非 active：不发起任务', async () => {
    await seedProject('sp-off', { pace: pace(false) })
    await seedProject('sp-paused', { pace: pace(true), status: 'paused' })
    await seedConcept('c1', 'sp-off', '概念A')
    await seedConcept('c2', 'sp-paused', '概念B')
    expect(await tickScheduler()).toBe(0)
    expect(env!.jobs).toHaveLength(0)
  })

  it('到期推进：优先研究「无卡片概念」，任务带概念上下文；未到期不重复', async () => {
    await seedProject('sp1', { pace: pace(true) })
    await seedConcept('g1', 'sp1', '根', 'group')
    await seedConcept('c-a', 'sp1', '先验概率')

    expect(await tickSchedulerAt(1_000_000)).toBe(1)
    expect(env!.jobs).toHaveLength(1)
    expect(env!.jobs[0]).toMatchObject({ kind: 'concept', spaceId: 'sp1', conceptId: 'c-a' })
    expect(env!.jobs[0].message).toContain('先验概率')

    // 同一周期内不重复
    expect(await tickSchedulerAt(1_000_100)).toBe(0)

    // 超过 intervalMin 后再次推进（冷却 60s 已过 → 仍优先最老无卡概念 c-a）
    env!.setNow(1_000_000 + 31 * 60_000)
    expect(await tickScheduler()).toBe(1)
    expect(env!.jobs[1].conceptId).toBe('c-a')
  })

  it('候选排除 group 与已有卡片的同父概念', async () => {
    await seedProject('sp2', { pace: pace(true) })
    await seedConcept('g1', 'sp2', '目录', 'group')
    await seedConcept('c-done', 'sp2', '已研究概念')
    await seedCardFor('sp2', 'c-done')
    expect(await tickScheduler()).toBe(0)
    expect(env!.jobs).toHaveLength(0)
  })

  it('无概念候选时对未解问题开子研究（携带 questionId；空间级问题 conceptId=null）', async () => {
    await seedProject('sp3', { pace: pace(true) })
    await seedOpenQuestion('q1', 'sp3', null, '为什么 A 与 B 矛盾？')
    expect(await tickScheduler()).toBe(1)
    expect(env!.jobs[0]).toMatchObject({ kind: 'question', spaceId: 'sp3', conceptId: null, questionId: 'q1' })
    expect(env!.jobs[0].message).toContain('为什么 A 与 B 矛盾？')
  })

  it('概念候选优先：概念与未解问题同时存在 → 只推进概念', async () => {
    await seedProject('sp4', { pace: pace(true) })
    await seedConcept('c-a', 'sp4', '先验概率')
    await seedOpenQuestion('q1', 'sp4', 'c-a', '疑问？')
    expect(await tickScheduler()).toBe(1)
    expect(env!.jobs[0].kind).toBe('concept')
  })

  it('冷却：某候选冷却期内不重复发起 → 推进另一无卡候选', async () => {
    await seedProject('sp5', { pace: pace(true) })
    await seedConcept('c-fail', 'sp5', '冷却中的概念')
    await seedConcept('c-ok', 'sp5', '正常概念')
    // 预热 c-fail 的冷却（模拟上一轮自动研究失败/无产出）
    ;(env!.scheduler as unknown as { lastLaunch: Map<string, number> }).lastLaunch.set('concept:sp5:c-fail', 1_000_000)
    expect(await tickSchedulerAt(1_000_001)).toBe(1)
    expect(env!.jobs).toHaveLength(1)
    expect(env!.jobs[0].conceptId).toBe('c-ok')
  })

  it('在途任务不重复发起（running 集合去重）', async () => {
    await seedProject('sp6', { pace: pace(true) })
    await seedConcept('c-a', 'sp6', '概念A')
    let release: () => void = () => {}
    env!.scheduler.configure({
      db: env!.db,
      runJob: () => new Promise<void>((resolve) => { release = resolve }),
      clock: () => 2_000_000,
      cooldownMs: 60_000,
    })
    expect(await tickSchedulerAt(2_000_000)).toBe(1)
    expect(env!.scheduler.runningCount()).toBe(1)
    expect(await tickSchedulerAt(2_000_001)).toBe(0)
    release()
  })

  it('pace 仓储读写往返：patch 后可读回归一化配置', async () => {
    await seedProject('sp7')
    await runWithUserAsync('u1', () =>
      env!.db.dlProjects!.patch('sp7', {
        pace: { enabled: true, intervalMin: 45, autoResearchConcepts: true, autoResolveOpenQuestions: false },
      }))
    const row = await runWithUserAsync('u1', () => env!.db.dlProjects!.getById('sp7'))
    expect(row?.pace).toEqual({ enabled: true, intervalMin: 45, autoResearchConcepts: true, autoResolveOpenQuestions: false })
  })
})
