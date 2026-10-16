import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwCharacterRepository } from '@core/database/repositories/lw-character.repository'

describe.each(getTestDialects())('LwCharacterRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwCharacterRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwCharacterRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + 默认值（含 ALTER 列）', async () => {
    const c = await repo.create({
      projectId: 'p1',
      name: '主角',
    } as any)
    expect(c.gender).toBe('male')
    expect(c.age).toBe(25)
    expect(c.rolePosition).toBe('supporting')
    expect(c.importance).toBe('secondary')
    expect(c.sourceType).toBe('longwriting')
  })

  it('create normalizeValue 数组用、连接，对象 JSON 化', async () => {
    const c = await repo.create({
      projectId: 'p1',
      name: '主角',
      appearance: ['英俊', '高大'] as any,
    } as any)
    expect(c.appearance).toBe('英俊、高大')
  })

  it('getByProjectId / getTemporaryByProjectId / getByPortraitId', async () => {
    await repo.create({ projectId: 'p1', name: 'A', portraitId: 'pt1' } as any)
    await repo.create({
      projectId: 'p1', name: 'B', importance: 'temporary' as any,
    } as any)
    expect((await repo.getByProjectId('p1')).length).toBe(2)
    expect((await repo.getTemporaryByProjectId('p1')).length).toBe(1)
    // P2 Task 6 后 lw_story_characters.portrait_id 已从 entity 移除，
    // getByPortraitId 暂返回空数组（消费方应改为从 character_bindings 查询）
    expect((await repo.getByPortraitId('pt1')).length).toBe(0)
  })

  it('update：portraitId 空字符串转 null', async () => {
    const c = await repo.create({
      projectId: 'p1', name: 'A', portraitId: 'pt1',
    } as any)
    await repo.update(c.id, { portraitId: '' } as any)
    expect((await repo.getById(c.id))!.portraitId).toBeUndefined()
  })

  it('Relation: addRelation + getRelations + delete', async () => {
    const a = await repo.create({ projectId: 'p1', name: 'A' } as any)
    const b = await repo.create({ projectId: 'p1', name: 'B' } as any)
    const r = await repo.addRelation(a.id, b.id, 'friend', '至交')
    expect(r.id).toBeTruthy()

    const list = await repo.getRelations(a.id)
    expect(list).toHaveLength(1)
    expect(list[0].relationType).toBe('friend')

    expect(await repo.deleteRelation(r.id)).toBe(true)
    expect((await repo.getRelations(a.id)).length).toBe(0)
  })

  it('getBySourceEpisodeId 过滤', async () => {
    await repo.create({
      projectId: 'p1', name: 'A', sourceEpisodeId: 'e1',
    } as any)
    await repo.create({ projectId: 'p1', name: 'B' } as any)
    expect((await repo.getBySourceEpisodeId('e1')).length).toBe(1)
  })

  it('delete', async () => {
    const c = await repo.create({ projectId: 'p1', name: 'A' } as any)
    await repo.delete(c.id)
    expect(await repo.getById(c.id)).toBeNull()
  })
})
