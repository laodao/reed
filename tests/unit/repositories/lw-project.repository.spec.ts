import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwProjectRepository } from '@core/database/repositories/lw-project.repository'
import { LwStoryOverviewRepository } from '@core/database/repositories/lw-story-overview.repository'
import { LwProjectModelConfigRepository } from '@core/database/repositories/lw-project-model-config.repository'

describe.each(getTestDialects())('LW Project + Overview + ModelConfig [%s]', dialect => {
  let tds: TestDataSource
  let projects: LwProjectRepository
  let overviews: LwStoryOverviewRepository
  let configs: LwProjectModelConfigRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    projects = new LwProjectRepository(tds.ds)
    overviews = new LwStoryOverviewRepository(tds.ds)
    configs = new LwProjectModelConfigRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  // ============ Project ============

  it('Project: create story 默认 stage=overview + epoch ms', async () => {
    const p = await projects.create({ name: 'Story1', type: 'story' } as any)
    expect(p.stage).toBe('overview')
    expect(p.progress).toBe(0)
    expect(typeof p.createdAt).toBe('number')
  })

  it('Project: create comment 默认 stage=topic', async () => {
    const p = await projects.create({ name: 'Cmt1', type: 'comment' } as any)
    expect(p.stage).toBe('topic')
  })

  it('Project: getByType + update + exists + delete', async () => {
    const a = await projects.create({ name: 'A', type: 'story' } as any)
    await projects.create({ name: 'B', type: 'comment' } as any)
    expect((await projects.getByType('story')).length).toBe(1)

    expect(await projects.exists(a.id)).toBe(true)
    const updated = await projects.update(a.id, { name: 'A-new', progress: 50 } as any)
    expect(updated!.name).toBe('A-new')
    expect(updated!.progress).toBe(50)

    expect(await projects.delete(a.id)).toBe(true)
    expect(await projects.exists(a.id)).toBe(false)
  })

  // ============ StoryOverview ============

  it('Overview: create + getByProjectId + 默认值', async () => {
    const ov = await overviews.create('p1')
    expect(ov.projectId).toBe('p1')
    expect(ov.storyType).toBe('other')
    expect(ov.keyCharacters).toEqual([])
    expect(ov.keyLocations).toEqual([])
    expect(ov.enabledFeatures).toEqual([])
    expect(ov.isLocked).toBe(false)

    const got = await overviews.getByProjectId('p1')
    expect(got!.id).toBe(ov.id)
  })

  it('Overview: update 含 ALTER 后扩展列 + JSON', async () => {
    const ov = await overviews.create('p1')
    const updated = await overviews.update(ov.id, {
      title: 'My Story',
      coreIdea: '主题',
      style: '玄幻',
      keyCharacters: ['c1', 'c2'] as any,
      enabledFeatures: ['feat1'] as any,
    } as any)
    expect(updated!.title).toBe('My Story')
    expect(updated!.coreIdea).toBe('主题')
    expect(updated!.style).toBe('玄幻')
    expect(updated!.keyCharacters).toEqual(['c1', 'c2'])
    expect(updated!.enabledFeatures).toEqual(['feat1'])
  })

  it('Overview: setLocked + delete', async () => {
    const ov = await overviews.create('p1')
    await overviews.setLocked(ov.id, true)
    expect((await overviews.getById(ov.id))!.isLocked).toBe(true)
    await overviews.delete(ov.id)
    expect(await overviews.getById(ov.id)).toBeNull()
  })

  // ============ ProjectModelConfig ============

  it('ModelConfig: upsert 创建 + 同 projectId+stage 覆盖', async () => {
    const c1 = await configs.upsert('p1', 'overview' as any, 'pc1', 'm1')
    expect(c1.id).toBe('modelconfig_p1_overview')

    const c2 = await configs.upsert('p1', 'overview' as any, 'pc2', 'm2')
    expect(c2.providerConfigId).toBe('pc2')
    expect(c2.modelId).toBe('m2')

    expect((await configs.getByProjectId('p1')).length).toBe(1)
  })

  it('ModelConfig: upsertMany 事务 + getByProjectAndStage', async () => {
    await configs.upsertMany([
      { projectId: 'p1', stage: 'overview' as any, providerConfigId: 'pc1', modelId: 'm1' },
      { projectId: 'p1', stage: 'character' as any, providerConfigId: 'pc1', modelId: 'm2' },
    ])
    const list = await configs.getByProjectId('p1')
    expect(list.length).toBe(2)

    const got = await configs.getByProjectAndStage('p1', 'overview' as any)
    expect(got!.modelId).toBe('m1')
  })

  it('ModelConfig: delete + deleteByProjectId', async () => {
    await configs.upsert('p1', 'overview' as any, 'pc1', 'm1')
    await configs.upsert('p1', 'character' as any, 'pc1', 'm2')
    expect(await configs.delete('p1', 'overview' as any)).toBe(true)
    expect((await configs.getByProjectId('p1')).length).toBe(1)
    expect(await configs.deleteByProjectId('p1')).toBe(true)
    expect((await configs.getByProjectId('p1')).length).toBe(0)
  })
})
