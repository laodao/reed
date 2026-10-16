/**
 * 知识库目录仓库测试（评审 #78：补齐 ab6f1c81 承诺的目录测试）
 * @module tests/repositories/kb-folder.repository
 * @description CRUD + 多租户隔离 + 父子层级；双方言矩阵（PG 视环境）。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { KbFolderRepository } from '@core/database/repositories/kb-folder.repository'
import { runWithUser } from '@core/context/user-context'

describe.each(getTestDialects())('KbFolderRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: KbFolderRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new KbFolderRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + listAll：字段往返、按创建时间升序', async () => {
    const a = await runWithUser('user-a', () => repo.create({ name: '小说' }))
    const b = await runWithUser('user-a', () => repo.create({ name: '资料', parentId: a.id }))
    const all = await runWithUser('user-a', () => repo.listAll())
    expect(all.map(x => x.name)).toEqual(['小说', '资料'])
    expect(b.parentId).toBe(a.id)
    expect(b.sortOrder).toBe(0)
  })

  it('update 改名/改父级；不存在返回 null', async () => {
    const f = await runWithUser('user-a', () => repo.create({ name: '旧名' }))
    const updated = await runWithUser('user-a', () => repo.update(f.id, { name: '新名', parentId: null }))
    expect(updated?.name).toBe('新名')
    expect(await runWithUser('user-a', () => repo.update('nope', { name: 'x' }))).toBeNull()
  })

  it('delete 后列表不再包含', async () => {
    const f = await runWithUser('user-a', () => repo.create({ name: '待删' }))
    expect(await runWithUser('user-a', () => repo.delete(f.id))).toBe(1)
    expect(await runWithUser('user-a', () => repo.findById(f.id))).toBeNull()
  })

  it('多租户隔离：user-b 看不到/改不到 user-a 的目录', async () => {
    const f = await runWithUser('user-a', () => repo.create({ name: 'A 的目录' }))
    expect(await runWithUser('user-b', () => repo.findById(f.id))).toBeNull()
    expect(await runWithUser('user-b', () => repo.update(f.id, { name: '越权改名' }))).toBeNull()
    expect(await runWithUser('user-b', () => repo.listAll())).toHaveLength(0)
    expect(await runWithUser('user-b', () => repo.delete(f.id))).toBe(0)
    // user-a 的目录完好
    expect(await runWithUser('user-a', () => repo.findById(f.id))).not.toBeNull()
  })
})
