import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { LwChapterRepository } from '@core/database/repositories/lw-chapter.repository'

describe.each(getTestDialects())('LwChapterRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: LwChapterRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new LwChapterRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('create + 字数计算', async () => {
    const c = await repo.create('o1', '你好 hello 世界 world')
    expect(c.wordCount).toBeGreaterThan(0)
  })

  it('updateContent 重新计算字数', async () => {
    const c = await repo.create('o1', 'old')
    await repo.updateContent(c.id, '新的内容更长一些')
    const got = await repo.getById(c.id)
    expect(got!.wordCount).toBeGreaterThan(c.wordCount)
  })

  it('getByOutlineIds Map 批量', async () => {
    await repo.create('o1', 'a')
    await repo.create('o2', 'b')
    const map = await repo.getByOutlineIds(['o1', 'o2', 'o3'])
    expect(map.size).toBe(2)
  })

  // ============ Versions ============

  it('createVersion + getLatestVersion + versionNumber 自增', async () => {
    const c = await repo.create('o1', 'first')
    const v1 = await repo.createVersion(c.id, 'v1', 'manual')
    expect(v1.versionNumber).toBe(1)
    const v2 = await repo.createVersion(c.id, 'v2', 'generated')
    expect(v2.versionNumber).toBe(2)

    const latest = await repo.getLatestVersion(c.id)
    expect(latest!.id).toBe(v2.id)
  })

  it('lockVersion + unlockVersion + 锁定后不可删', async () => {
    const c = await repo.create('o1', 'x')
    const v = await repo.createVersion(c.id, 'v1', 'manual')
    await repo.lockVersion(v.id)
    expect(await repo.deleteVersion(v.id)).toBe(false)
    await repo.unlockVersion(v.id)
    expect(await repo.deleteVersion(v.id)).toBe(true)
  })

  it('restoreVersion 切换内容并新建版本', async () => {
    const c = await repo.create('o1', 'orig')
    const v1 = await repo.createVersion(c.id, '版本1内容', 'manual')
    await repo.updateContent(c.id, '当前最新内容')

    const restored = await repo.restoreVersion(c.id, v1.id)
    expect(restored!.content).toBe('版本1内容')
    // 应该新建一个版本（版本号 v1+1=2，再加 restore = 3）
    const latest = await repo.getLatestVersion(c.id)
    expect(latest!.content).toBe('版本1内容')
  })

  it('cleanupOldVersions: MAX_VERSIONS 之外的非锁定版本被清理', async () => {
    const c = await repo.create('o1', '')
    // 创建 22 个版本
    for (let i = 0; i < 22; i++) {
      await repo.createVersion(c.id, `v${i}`, 'manual')
    }
    const versions = await repo.getVersions(c.id)
    expect(versions.length).toBeLessThanOrEqual(20)
  })
})
