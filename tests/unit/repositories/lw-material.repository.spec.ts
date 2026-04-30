/**
 * LW 批次 10：lw-material
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwMaterialRepository } from '@core/database/repositories/lw-material.repository'

describe.each(getTestDialects())('LwMaterial [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwMaterialRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwMaterialRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + getById', async () => {
    const m = await repo.create({
      projectId: 'p1', name: 'M1', type: 'url' as any,
      source: 'http://x', content: 'c',
    })
    expect(m.status).toBe('pending')
    expect(m.used).toBe(false)
    const got = await repo.getById(m.id)
    expect(got!.name).toBe('M1')
  })

  it('getByProjectId 排序按 created_at DESC', async () => {
    const m1 = await repo.create({
      projectId: 'p1', name: 'A', type: 'url' as any,
    })
    await new Promise(r => setTimeout(r, 5))
    const m2 = await repo.create({
      projectId: 'p1', name: 'B', type: 'url' as any,
    })
    const list = await repo.getByProjectId('p1')
    expect(list.map(m => m.id)).toEqual([m2.id, m1.id])
  })

  it('update 多字段 + used boolean 转换', async () => {
    const m = await repo.create({
      projectId: 'p1', name: 'X', type: 'url' as any,
    })
    const updated = await repo.update(m.id, {
      name: 'Y', used: true, retryCount: 3,
    })
    expect(updated!.name).toBe('Y')
    expect(updated!.used).toBe(true)
    expect(updated!.retryCount).toBe(3)
  })

  it('updateStatus + 错误信息', async () => {
    const m = await repo.create({
      projectId: 'p1', name: 'X', type: 'url' as any,
    })
    expect(await repo.updateStatus(m.id, 'failed' as any, 'e1')).toBe(true)
    const got = await repo.getById(m.id)
    expect(got!.status).toBe('failed')
    expect(got!.errorMessage).toBe('e1')
  })

  it('incrementRetryCount 自增', async () => {
    const m = await repo.create({
      projectId: 'p1', name: 'X', type: 'url' as any,
    })
    expect(await repo.incrementRetryCount(m.id)).toBe(1)
    expect(await repo.incrementRetryCount(m.id)).toBe(2)
  })

  it('markAsUsed', async () => {
    const m = await repo.create({
      projectId: 'p1', name: 'X', type: 'url' as any,
    })
    expect(await repo.markAsUsed(m.id)).toBe(true)
    expect((await repo.getById(m.id))!.used).toBe(true)
  })

  it('delete + deleteByProjectId', async () => {
    const a = await repo.create({
      projectId: 'p1', name: 'A', type: 'url' as any,
    })
    await repo.create({ projectId: 'p1', name: 'B', type: 'url' as any })
    expect(await repo.delete(a.id)).toBe(true)
    expect((await repo.getByProjectId('p1'))).toHaveLength(1)
    expect(await repo.deleteByProjectId('p1')).toBe(1)
  })
})
