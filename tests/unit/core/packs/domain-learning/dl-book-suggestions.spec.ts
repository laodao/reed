/**
 * 领域学习「书籍建议」动作测试（dl_save_book_suggestions；2026-10-04 用户需求）
 * @module tests/unit/core/packs/domain-learning/dl-book-suggestions
 *
 * 钉死：全量替换语义（重发覆盖、空数组=显式清空）、title 去重/空标题丢弃、条数封顶、
 * priority 非法值剔除不拒绝、空间不存在拒绝。真实 better-sqlite3 + 迁移，
 * 注入真实仓储 stub（与 dl-agent-actions.spec 同构）。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { executeDlAction } from '@core/packs/domain-learning/services/dl-agent-actions'
import type { DlAgentExecutionContext } from '@core/packs/domain-learning/services/dl-agent.types'
import type { ICoreDatabaseManager } from '@core/database/database-manager.interface'

let ds: DataSource | null = null

const ENTITY_IMPORTS = [
  () => import('@core/database/entities/domain-learning/dl-project.entity'),
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
  return { dlProjects: new DlProjectRepository(d) } as unknown as ICoreDatabaseManager
}

function execCtx(db: ICoreDatabaseManager, spaceId: string): DlAgentExecutionContext {
  return { spaceId, db, emit: () => {} } as DlAgentExecutionContext
}

async function setupSpace(d: DataSource, spaceId = 'sp_book'): Promise<void> {
  await runWithUserAsync('u_book', async () => {
    await new DlProjectRepository(d).create({ id: spaceId, name: '概率论入门', goal: '入门' })
  })
}

describe('dl_save_book_suggestions（书籍建议）', () => {
  it('落库清单：title/author/why/priority 全字段入库，summary 报数', async () => {
    const d = await buildDs()
    ds = d
    await setupSpace(d)
    const db = buildDb(d)

    const res = await runWithUserAsync('u_book', () =>
      executeDlAction(execCtx(db, 'sp_book'), {
        type: 'dl_save_book_suggestions',
        params: {
          books: {
            items: [
              { title: '概率论与数理统计', author: '陈希孺', why: '对应「概率基础」主干', priority: 'essential' },
              { title: 'Introduction to Probability', author: 'Blitzstein', why: '直觉案例多', priority: 'recommended' },
              { title: 'All of Statistics', priority: 'reference' },
            ],
            note: '前两本覆盖主干',
          },
        },
      }),
    )

    expect(res.summary.status).toBe('ok')
    expect(res.summary.message).toContain('共 3 本')
    expect(res.summary.message).toContain('essential 1')
    const project = await runWithUserAsync('u_book', () => db.dlProjects!.getById('sp_book'))
    expect(project?.bookSuggestions).toHaveLength(3)
    expect(project?.bookSuggestions[0]).toMatchObject({
      title: '概率论与数理统计',
      author: '陈希孺',
      why: '对应「概率基础」主干',
      priority: 'essential',
    })
    expect(project?.bookSuggestions[2].priority).toBe('reference')
  })

  it('全量替换：重发新清单覆盖旧清单；空数组=显式清空', async () => {
    const d = await buildDs()
    ds = d
    await setupSpace(d)
    const db = buildDb(d)
    const save = (items: unknown[]) =>
      runWithUserAsync('u_book', () =>
        executeDlAction(execCtx(db, 'sp_book'), { type: 'dl_save_book_suggestions', params: { books: { items } } }),
      )

    await save([
      { title: '旧书 A', priority: 'essential' },
      { title: '旧书 B' },
    ])
    await save([{ title: '新书 X', priority: 'recommended' }])
    let project = await runWithUserAsync('u_book', () => db.dlProjects!.getById('sp_book'))
    expect(project?.bookSuggestions.map((b) => b.title)).toEqual(['新书 X'])

    await save([])
    project = await runWithUserAsync('u_book', () => db.dlProjects!.getById('sp_book'))
    expect(project?.bookSuggestions).toEqual([])
    expect((await save([])).summary.message).toContain('无需书籍')
  })

  it('清洗：空标题/重复书名丢弃，priority 非法值剔除（不拒绝），条数封顶 10', async () => {
    const d = await buildDs()
    ds = d
    await setupSpace(d)
    const db = buildDb(d)

    const res = await runWithUserAsync('u_book', () =>
      executeDlAction(execCtx(db, 'sp_book'), {
        type: 'dl_save_book_suggestions',
        params: {
          books: {
            items: [
              { title: '同一本书', author: 'A' },
              { title: '同一本书', author: 'B' }, // 重复 → 丢弃
              { title: '   ' }, // 空标题 → 丢弃
              { title: '合法书', priority: 'must-read' }, // 非法 priority → 剔除该字段，书保留
              ...Array.from({ length: 12 }, (_, i) => ({ title: `堆砌书 ${i + 1}` })), // 超限
            ],
          },
        },
      }),
    )

    expect(res.summary.status).toBe('ok')
    const project = await runWithUserAsync('u_book', () => db.dlProjects!.getById('sp_book'))
    expect(project?.bookSuggestions).toHaveLength(10)
    expect(project?.bookSuggestions[0].title).toBe('同一本书')
    expect(project?.bookSuggestions[1].title).toBe('合法书')
    expect(project?.bookSuggestions[1].priority).toBeUndefined()
    expect(project?.bookSuggestions.map((b) => b.title)).not.toContain('堆砌书 11')
  })

  it('拒绝：items 缺失/非数组；空间不存在', async () => {
    const d = await buildDs()
    ds = d
    await setupSpace(d)
    const db = buildDb(d)

    await expect(
      runWithUserAsync('u_book', () =>
        executeDlAction(execCtx(db, 'sp_book'), { type: 'dl_save_book_suggestions', params: { books: {} } }),
      ),
    ).rejects.toThrow(/items 必填/)

    await expect(
      runWithUserAsync('u_book', () =>
        executeDlAction(execCtx(db, 'sp_missing'), {
          type: 'dl_save_book_suggestions',
          params: { books: { items: [{ title: 'x' }] } },
        }),
      ),
    ).rejects.toThrow(/学习空间不存在/)
  })
})
