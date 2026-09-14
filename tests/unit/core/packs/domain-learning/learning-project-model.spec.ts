/**
 * 空间默认模型读写测试（LearningProjectService.get/setModelSettings，2026-09-14 用户需求：
 * 在空间设置里指定知识生成默认模型，双 null=跟随全局默认）
 * @module tests/unit/core/packs/domain-learning/learning-project-model.spec
 */
import { describe, it, expect, afterEach } from 'vitest'
import { DataSource } from 'typeorm'
import { runWithUserAsync } from '@core/context/user-context'
import { createDomainLearningTables } from '@core/database/migrations/create-domain-learning-tables'
import { DlProjectRepository } from '@core/database/repositories/dl-project.repository'
import { DlConceptRepository } from '@core/database/repositories/dl-concept.repository'
import { LearningProjectService } from '@core/packs/domain-learning/services/learning-project.service'

let ds: DataSource | null = null

const ENTITY_IMPORTS = [
  () => import('@core/database/entities/domain-learning/dl-project.entity'),
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

function buildService(d: DataSource): LearningProjectService {
  return new LearningProjectService(new DlProjectRepository(d), new DlConceptRepository(d))
}

async function seed(d: DataSource, spaceId = 'sp1'): Promise<void> {
  await runWithUserAsync('u1', () =>
    new DlProjectRepository(d).create({ id: spaceId, name: '深度学习', goal: '入门' }))
}

afterEach(async () => {
  if (ds) await ds.destroy()
  ds = null
})

describe('learning-project: 空间默认模型读写', () => {
  it('未设置 → 双 null（跟随全局默认）', async () => {
    ds = await buildDs()
    await seed(ds)
    const svc = buildService(ds)
    const got = await runWithUserAsync('u1', () => svc.getModelSettings('sp1'))
    expect(got).toEqual({ providerConfigId: null, modelId: null })
  })

  it('设置后可读回；null/空串落 null', async () => {
    ds = await buildDs()
    await seed(ds)
    const svc = buildService(ds)
    const saved = await runWithUserAsync('u1', () =>
      svc.setModelSettings('sp1', { providerConfigId: 'pc_vllm', modelId: 'qwen3.8-27b' }))
    expect(saved).toEqual({ providerConfigId: 'pc_vllm', modelId: 'qwen3.8-27b' })
    const got = await runWithUserAsync('u1', () => svc.getModelSettings('sp1'))
    expect(got).toEqual({ providerConfigId: 'pc_vllm', modelId: 'qwen3.8-27b' })
  })

  it('保存为 null → 回到跟随全局默认；空白串被去空白', async () => {
    ds = await buildDs()
    await seed(ds)
    const svc = buildService(ds)
    await runWithUserAsync('u1', () => svc.setModelSettings('sp1', { providerConfigId: ' pc_vllm ', modelId: '' }))
    const got = await runWithUserAsync('u1', () => svc.getModelSettings('sp1'))
    expect(got).toEqual({ providerConfigId: 'pc_vllm', modelId: null })
    await runWithUserAsync('u1', () => svc.setModelSettings('sp1', null))
    expect(await runWithUserAsync('u1', () => svc.getModelSettings('sp1'))).toEqual({
      providerConfigId: null,
      modelId: null,
    })
  })
})