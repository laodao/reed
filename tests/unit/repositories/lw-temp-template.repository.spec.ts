/**
 * LW 批次 7：lw-temp-character-template + lw-temp-location-template
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwTempCharacterTemplateRepository } from '@core/database/repositories/lw-temp-character-template.repository'
import { LwTempLocationTemplateRepository } from '@core/database/repositories/lw-temp-location-template.repository'

describe.each(getTestDialects())('LwTempCharacterTemplate [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwTempCharacterTemplateRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwTempCharacterTemplateRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('initializeDefaultData 写入 17 个默认模板（仅首次）', async () => {
    await repo.initializeDefaultData()
    expect(await repo.getAll()).toHaveLength(17)
    // 二次调用不重复写
    await repo.initializeDefaultData()
    expect(await repo.getAll()).toHaveLength(17)
  })

  it('upsert 同 type 更新而非新建', async () => {
    await repo.upsert({
      type: 'male_passerby', name: '路人', gender: 'male',
      ageMin: 20, ageMax: 30, basePrompt: 'p1',
      styleVariants: '[]', negativePrompt: '', matchKeywords: '[]',
      sortOrder: 1, isDefault: 0,
    } as any)
    await repo.upsert({
      type: 'male_passerby', name: '路人2', gender: 'male',
      ageMin: 25, ageMax: 35, basePrompt: 'p2',
      styleVariants: '[]', negativePrompt: '', matchKeywords: '[]',
      sortOrder: 2, isDefault: 0,
    } as any)
    const list = await repo.getAll()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('路人2')
    expect(list[0].basePrompt).toBe('p2')
  })

  it('getDefault 返回 isDefault=1 的模板', async () => {
    await repo.initializeDefaultData()
    const def = await repo.getDefault()
    expect(def!.type).toBe('custom')
  })

  it('matchByKeywords 命中关键词返回最高匹配', async () => {
    await repo.initializeDefaultData()
    const result = await repo.matchByKeywords('一个老人路过')
    expect(result).not.toBeNull()
    // 'elderly_male' 关键词命中“老人”
    expect(['elderly_male', 'noble_male']).toContain(result!.template.type)
  })

  it('delete by type', async () => {
    await repo.upsert({
      type: 'male_passerby', name: 'X', gender: 'male',
      ageMin: 20, ageMax: 30, basePrompt: '',
      styleVariants: '[]', negativePrompt: '', matchKeywords: '[]',
      sortOrder: 1, isDefault: 0,
    } as any)
    expect(await repo.delete('male_passerby')).toBe(true)
    expect(await repo.getAll()).toHaveLength(0)
  })
})

describe.each(getTestDialects())('LwTempLocationTemplate [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwTempLocationTemplateRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwTempLocationTemplateRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('initializeDefaultData 写入 10 个默认模板', async () => {
    await repo.initializeDefaultData()
    expect(await repo.getAll()).toHaveLength(10)
  })

  it('upsert / getByType', async () => {
    await repo.upsert({
      type: 'street', name: 'X', basePrompt: 'p',
      styleVariants: '[]', negativePrompt: '', matchKeywords: '[]',
      sortOrder: 1, isDefault: 0,
    } as any)
    const got = await repo.getByType('street')
    expect(got!.name).toBe('X')
  })

  it('matchByKeywords 命中', async () => {
    await repo.initializeDefaultData()
    const result = await repo.matchByKeywords('走在街道上')
    expect(result).not.toBeNull()
    expect(result!.template.type).toBe('street')
  })

  it('getDefault 返回 isDefault=1', async () => {
    await repo.initializeDefaultData()
    expect((await repo.getDefault())!.type).toBe('custom')
  })
})
