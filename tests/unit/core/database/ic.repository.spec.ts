/**
 * 信息搜集仓储集成测试（ic_* 五表；2026-10-07 设计落地）
 * @module tests/unit/core/database/ic.repository.spec
 *
 * 真实 better-sqlite3 + 迁移，钉死三件仓库级契约：
 * 1. 多租户隔离（飞轮 §11.5-8 教训：user_id 兜底不一致会跨租户污染——强制测试）；
 * 2. 幂等台账（照搬 kb_digest_passes：attempt 递增、done 跳过、failed 可复活）；
 * 3. 行级治理（content_hash 分域查重 / 批量确认 / supersede 关旧开新可回溯）。
 */

import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createInfoCollectionTables } from '@core/database/migrations/create-info-collection-tables'
import { IcProjectRepository } from '@core/database/repositories/ic-project.repository'
import { IcTaskRepository } from '@core/database/repositories/ic-task.repository'
import { IcTaskPassRepository } from '@core/database/repositories/ic-task-pass.repository'
import { IcSourceRepository } from '@core/database/repositories/ic-source.repository'
import { IcRowRepository } from '@core/database/repositories/ic-row.repository'
import { contentHash } from '@shared/utils/info-collection-content-hash'
import type { IcBlueprint } from '@shared/types/info-collection.types'

let ds: DataSource | null = null

const ENTITY_IMPORTS = [
  () => import('@core/database/entities/info-collection/ic-project.entity'),
  () => import('@core/database/entities/info-collection/ic-task.entity'),
  () => import('@core/database/entities/info-collection/ic-task-pass.entity'),
  () => import('@core/database/entities/info-collection/ic-source.entity'),
  () => import('@core/database/entities/info-collection/ic-row.entity'),
]

async function buildDs(): Promise<DataSource> {
  const entities = []
  for (const imp of ENTITY_IMPORTS) {
    const mod = await imp()
    entities.push(Object.values(mod)[0] as new () => object)
  }
  const d = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities, synchronize: false })
  await d.initialize()
  await createInfoCollectionTables(d)
  return d
}

function blueprintOver(): IcBlueprint {
  return {
    version: 1,
    goal: '测试主题',
    assumptions: ['时间范围按近 10 年理解'],
    requirements: [{ id: 'R1', question: '逐年数值', form: 'data', priority: 'must', schemaId: 's1' }],
    schemas: [
      {
        id: 's1',
        title: '数值行',
        jsonSchema: { type: 'object', properties: { v: { type: 'number' } } },
        convention: { type: 'measure', map: { value: 'v', unit: 'u', period: 'p', metric: 'm', dims: ['region'] } },
      },
    ],
    sourceStrategy: {
      channels: ['search'],
      minTier: 2,
      languages: ['zh'],
      seedQueries: ['测试主题 数据'],
      primaryHint: [],
    },
    stopRules: {
      coverageTarget: 0.8,
      minIndependentSources: 2,
      marginalRounds: 2,
      budget: { maxToolCalls: 300, maxMinutes: 120 },
    },
    organizationSpec: [{ kind: 'data-table' }],
    autoConfirm: false,
  }
}

let seq = 0
function uid(prefix: string): string {
  seq += 1
  return `${prefix}-${seq}-${Math.random().toString(36).slice(2, 8)}`
}

describe('ic_* repositories（租户隔离 + 幂等台账 + 行级治理）', () => {
  afterEach(async () => {
    if (ds) {
      await ds.destroy()
      ds = null
    }
  })

  it('多租户隔离：A 建的项目 B 不可见（列表/详情/URL 查重三处）', async () => {
    ds = await buildDs()
    const projects = new IcProjectRepository(ds)
    const sources = new IcSourceRepository(ds)
    const tasks = new IcTaskRepository(ds)

    await runWithUserAsync('user-a', async () => {
      const project = await projects.create({ id: uid('p'), name: 'A 的项目', goal: 'g', blueprint: blueprintOver() })
      const task = await tasks.create({ id: uid('t'), projectId: project.id, blueprintVersion: 1 })
      await sources.create({
        id: uid('s'),
        projectId: project.id,
        taskId: task.id,
        url: 'https://example.com/a',
        urlNormalized: 'https://example.com/a',
      })
    })

    await runWithUserAsync('user-b', async () => {
      expect(await projects.list()).toHaveLength(0)
      expect(await tasks.listByProject('any')).toHaveLength(0)
      expect(await sources.findByUrl('x', 'https://example.com/a')).toBeNull()
    })

    await runWithUserAsync('user-a', async () => {
      expect(await projects.list()).toHaveLength(1)
    })
  })

  it('项目蓝图更新 → blueprintVersion 随之落库；归档可过滤', async () => {
    ds = await buildDs()
    const projects = new IcProjectRepository(ds)

    await runWithUserAsync('user-a', async () => {
      const bp = blueprintOver()
      const project = await projects.create({ id: uid('p'), name: 'n', goal: 'g', blueprint: bp })
      expect(project.blueprintVersion).toBe(1)
      expect(project.blueprint?.requirements[0].id).toBe('R1')

      bp.version = 2
      bp.requirements.push({ id: 'R2', question: '新增需求', form: 'fact', priority: 'should' })
      await projects.patch(project.id, { blueprint: bp })
      const updated = await projects.getById(project.id)
      expect(updated?.blueprintVersion).toBe(2)
      expect(updated?.blueprint?.requirements).toHaveLength(2)

      await projects.patch(project.id, { status: 'archived' })
      expect(await projects.list('active')).toHaveLength(0)
      expect(await projects.list('archived')).toHaveLength(1)
    })
  })

  it('幂等台账：attempt 递增、done 可跳过、failed 可查（重试上限依据）', async () => {
    ds = await buildDs()
    const passes = new IcTaskPassRepository(ds)

    await runWithUserAsync('user-a', async () => {
      const p1 = await passes.startAttempt({ id: uid('pass'), projectId: 'p', taskId: 't1', passKey: 'collect' })
      expect(p1.attempt).toBe(1)
      await passes.finish(p1.id, { stats: { newSources: 3 }, cost: { toolCalls: 12 } })
      expect((await passes.getDone('t1', 'collect'))?.id).toBe(p1.id)

      // 重跑同一遍次 → attempt 2，不覆盖历史
      const p2 = await passes.startAttempt({ id: uid('pass'), projectId: 'p', taskId: 't1', passKey: 'collect' })
      expect(p2.attempt).toBe(2)
      await passes.fail(p2.id, { stats: { reason: '引擎超时' } })
      expect((await passes.getLatestFailed('t1', 'collect'))?.attempt).toBe(2)

      const list = await passes.listByTask('t1')
      expect(list).toHaveLength(2)
      expect(list.map(r => r.status).sort()).toEqual(['done', 'failed'])
    })
  })

  it('源：审阅状态推进 + irHits 回写；URL 查重同项目命中', async () => {
    ds = await buildDs()
    const sources = new IcSourceRepository(ds)

    await runWithUserAsync('user-a', async () => {
      const s = await sources.create({
        id: uid('s'),
        projectId: 'p',
        taskId: 't',
        url: 'https://example.com/x?utm_source=feed',
        urlNormalized: 'https://example.com/x',
        snapshotPath: 'info-collection/snapshots/202610/x.html',
      })
      expect(s.reviewStatus).toBe('staged')
      expect(s.fetchStatus).toBe('ok')

      expect(await sources.findByUrl('p', 'https://example.com/x')).not.toBeNull()
      expect(await sources.findByUrl('other-project', 'https://example.com/x')).toBeNull()

      await sources.patch(s.id, { tier: 1, tierRationale: '官方统计机构域名', irHits: ['R1'], reviewStatus: 'confirmed' })
      const updated = await sources.getById(s.id)
      expect(updated?.tier).toBe(1)
      expect(updated?.tierRationale).toContain('官方')
      expect(updated?.irHits).toEqual(['R1'])
      expect(updated?.reviewStatus).toBe('confirmed')
    })
  })

  it('行：measure 约定列投影落库；content_hash 分域查重；批量确认；supersede 关旧开新可回溯', async () => {
    ds = await buildDs()
    const rows = new IcRowRepository(ds)

    await runWithUserAsync('user-a', async () => {
      const payload = { v: 1465, u: '万人', p: '2019', m: '示例指标', region: '全国' }
      const hash = contentHash(payload, '原文引句')
      const r1 = await rows.create({
        id: uid('r'),
        projectId: 'p',
        taskId: 't',
        schemaId: 's1',
        row: payload,
        measure: { value: 1465, unit: '万人', period: '2019', metric: '示例指标', dims: { region: '全国' } },
        sourceId: 'src-1',
        requirementId: 'R1',
        quote: '原文引句',
        contentHash: hash,
      })
      expect(r1.status).toBe('draft')
      expect(r1.measure.value).toBe(1465)
      expect(r1.measure.dims).toEqual({ region: '全国' })

      // 分域查重：同项目同 hash 命中，换项目为空
      expect((await rows.findByHash('p', 's1', hash))?.id).toBe(r1.id)
      expect(await rows.findByHash('other-project', 's1', hash)).toBeNull()

      // 确认 r1，随后新数据到来 → 确认 r2 并 supersede 关旧开新
      await rows.confirmRows([r1.id])
      const r2 = await rows.create({
        id: uid('r'),
        projectId: 'p',
        taskId: 't',
        schemaId: 's1',
        row: { ...payload, v: 1200 },
        measure: { value: 1200, unit: '万人', period: '2020', metric: '示例指标', dims: { region: '全国' } },
        sourceId: 'src-2',
        contentHash: contentHash({ ...payload, v: 1200 }, '新引句'),
      })
      await rows.confirmRows([r2.id])
      await rows.supersede(r1.id, r2.id)

      const oldRow = await rows.getById(r1.id)
      expect(oldRow?.status).toBe('superseded')
      expect(oldRow?.supersededBy).toBe(r2.id)
      expect((await rows.listByProject('p', { status: 'confirmed' })).map(r => r.id)).toEqual([r2.id])
    })
  })

  it('派生行：无 sourceId 但有 derivedFrom 也可入库（查询时现算是默认，物化是例外）', async () => {
    ds = await buildDs()
    const rows = new IcRowRepository(ds)

    await runWithUserAsync('user-a', async () => {
      const derived = await rows.create({
        id: uid('r'),
        projectId: 'p',
        taskId: 't',
        schemaId: 's1',
        row: { v: 0.25, m: '派生指标' },
        measure: { value: 0.25, unit: null, period: '2024', metric: '派生指标', dims: null },
        derivedFrom: ['base-1', 'base-2'],
        contentHash: contentHash({ derived: ['base-1', 'base-2'] }),
      })
      expect(derived.sourceId).toBeNull()
      expect(derived.derivedFrom).toEqual(['base-1', 'base-2'])
    })
  })
})
