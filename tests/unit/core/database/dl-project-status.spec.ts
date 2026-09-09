/**
 * dl_project 状态更新回归测试（M5 排查：set-space-status 抛 RangeError too few parameters）
 * @module tests/unit/core/database/dl-project-status.spec
 *
 * 钉死口径：dl_project.patch({ status }) 必须成功（archive/pause 开关空间用），
 * 真实 better-sqlite3 + 迁移路径下不得抛「Too few parameter values」。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'

let ds: DataSource | null = null

async function buildDs(): Promise<DataSource> {
  const mod = await import('@core/database/entities/domain-learning/dl-project.entity')
  const d = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [Object.values(mod)[0] as new () => object],
    synchronize: false,
  })
  await d.initialize()
  await createDomainLearningTables(d)
  return d
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('dl_project.patch 状态更新', () => {
  it('无主用户(null scope)：patch({ status }) 成功且读回生效', async () => {
    ds = await buildDs()
    await runWithUserAsync(null, async () => {
      const repo = new DlProjectRepository(ds!)
      await repo.create({ id: 'sp-st-null', name: '状态测试', goal: '入门' })
      await expect(repo.patch('sp-st-null', { status: 'archived' })).resolves.not.toThrow()
      const row = await repo.getById('sp-st-null')
      expect(row?.status).toBe('archived')
    })
  })

  it('真实用户 scope：patch({ status }) 成功且读回生效（回归 RangeError too few parameters）', async () => {
    ds = await buildDs()
    await runWithUserAsync('local-default-user', async () => {
      const repo = new DlProjectRepository(ds!)
      await repo.create({ id: 'sp-st1', name: '状态测试', goal: '入门' })
      await expect(repo.patch('sp-st1', { status: 'paused' })).resolves.not.toThrow()
      await expect(repo.patch('sp-st1', { status: 'archived' })).resolves.not.toThrow()
      const row = await repo.getById('sp-st1')
      expect(row?.status).toBe('archived')
    })
  })

  it('真实用户 scope：patch 多个字段(profile/kb/pace/review)不互相丢失', async () => {
    ds = await buildDs()
    await runWithUserAsync('local-default-user', async () => {
      const repo = new DlProjectRepository(ds!)
      await repo.create({ id: 'sp-st2', name: '字段测试', goal: '入门' })
      await repo.patch('sp-st2', { kbId: 'kb-1', profile: { kindLabel: '理论体系', nature: '严谨', emphasis: ['时间线'] } })
      await repo.patch('sp-st2', { pace: { enabled: true, intervalMin: 60, autoResearchConcepts: false, autoResolveOpenQuestions: false } })
      await repo.patch('sp-st2', { status: 'paused' })
      const row = await repo.getById('sp-st2')
      expect(row?.status).toBe('paused')
      expect(row?.kbId).toBe('kb-1')
      expect(row?.profile?.kindLabel).toBe('理论体系')
      expect(row?.pace?.enabled).toBe(true)
    })
  })
})
