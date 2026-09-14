/**
 * 信息来源仓库测试（类别 / 分组 / 来源三层）
 * @module tests/unit/repositories/info-source.repository
 * @description 覆盖：
 *  - 类别：有序列表、改名、删除；内置类别禁删禁改
 *  - 分组：默认分组「未分组」按需创建且唯一、排序靠后；内置/默认分组禁改禁删
 *  - 来源：按类别跨分组列表（回填类别）、按分组列表、按 id 批量取（仅启用）、
 *          内置来源禁删禁改、启停切换、分组占用计数与级联删除
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { InfoSourceCategoryRepository } from '@core/database/repositories/info-source-category.repository'
import { InfoSourceTopicRepository } from '@core/database/repositories/info-source-topic.repository'
import { InfoSourceRepository } from '@core/database/repositories/info-source.repository'
import { InfoSourceCategoryEntity } from '@core/database/entities/info-source-category.entity'
import { InfoSourceTopicEntity } from '@core/database/entities/info-source-topic.entity'
import { InfoSourceEntity } from '@core/database/entities/info-source.entity'
import { INFO_SOURCE_NEWS_CATEGORY_ID } from '@shared/types/info-source.types'

describe.each(getTestDialects())('信息来源仓库 [%s]', dialect => {
  let tds: TestDataSource
  let categories: InfoSourceCategoryRepository
  let topics: InfoSourceTopicRepository
  let sources: InfoSourceRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    categories = new InfoSourceCategoryRepository(tds.ds)
    topics = new InfoSourceTopicRepository(tds.ds)
    sources = new InfoSourceRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  /** 把某行改成「内置 + 全局共享」（模拟迁移预置行） */
  async function makeBuiltin(kind: 'category' | 'topic' | 'source', id: string): Promise<void> {
    const entity =
      kind === 'category' ? InfoSourceCategoryEntity : kind === 'topic' ? InfoSourceTopicEntity : InfoSourceEntity
    await tds.ds.getRepository(entity).update({ id } as never, { isBuiltin: 1, userId: null } as never)
  }

  // ==================== 类别 ====================

  it('类别：创建 → 列表 → 改名 → 删除', async () => {
    await categories.create({ name: '金融信息来源' })
    await categories.create({ name: '物理信息来源' })
    expect((await categories.listAll()).map(c => c.name).sort()).toEqual(['物理信息来源', '金融信息来源'].sort())

    const finance = (await categories.listAll()).find(c => c.name === '金融信息来源')!
    expect((await categories.update(finance.id, { name: '金融知识来源' }))?.name).toBe('金融知识来源')
    expect(await categories.delete(finance.id)).toBe(1)
    expect(await categories.findById(finance.id)).toBeNull()
    expect((await categories.listAll()).length).toBe(1)
  })

  it('类别：内置类别禁改禁删（全局共享）', async () => {
    const builtin = await categories.create({ name: '新闻来源' })
    await makeBuiltin('category', builtin.id)
    expect((await categories.update(builtin.id, { name: '改不动' }))?.name).toBe('新闻来源')
    expect(await categories.delete(builtin.id)).toBe(0)
    expect((await categories.findById(builtin.id))?.name).toBe('新闻来源')
  })

  // ==================== 分组 ====================

  it('分组：按类别过滤；默认分组按需创建且唯一、排在命名分组之后', async () => {
    const category = await categories.create({ name: '物理信息来源' })
    const other = await categories.create({ name: '数学信息来源' })
    const named = await topics.create({ categoryId: category.id, name: '学术论文' })
    await topics.create({ categoryId: other.id, name: '另一个类别的分组' })

    const first = await topics.ensureDefault(category.id)
    const again = await topics.ensureDefault(category.id)
    expect(first.id).toBe(again.id)
    expect(first.isDefault).toBe(true)
    expect(first.name).toBe('未分组')

    const list = await topics.list({ categoryId: category.id })
    expect(list.map(t => t.id)).toEqual([named.id, first.id])
    expect((await topics.list({ categoryId: other.id })).length).toBe(1)
  })

  it('分组：默认分组与内置分组不可改名/删除', async () => {
    const category = await categories.create({ name: '领域来源' })
    const def = await topics.ensureDefault(category.id)
    expect((await topics.update(def.id, { name: '改名' }))?.name).toBe('未分组')
    expect(await topics.delete(def.id)).toBe(0)

    const builtin = await topics.create({ categoryId: category.id, name: '人工智能' })
    await makeBuiltin('topic', builtin.id)
    expect((await topics.update(builtin.id, { name: '改不动' }))?.name).toBe('人工智能')
    expect(await topics.delete(builtin.id)).toBe(0)
  })

  // ==================== 来源 ====================

  it('来源：按类别跨分组列表并回填类别；按分组列表；按 id 批量取仅启用', async () => {
    const news = await categories.create({ name: '新闻来源' })
    const finance = await categories.create({ name: '金融信息来源' })
    const newsTopic = await topics.create({ categoryId: news.id, name: '科技' })
    const financeTopic = await topics.ensureDefault(finance.id)

    const s1 = await sources.create({ topicId: newsTopic.id, name: '站A', url: 'https://a.example.com' })
    const s2 = await sources.create({ topicId: financeTopic.id, name: '站B', url: 'https://b.example.com' })
    expect(s1.categoryId).toBe(news.id)
    expect(s2.categoryId).toBe(finance.id)

    const newsList = await sources.list({ categoryId: news.id })
    expect(newsList.map(s => s.id)).toEqual([s1.id])
    expect(newsList[0].categoryId).toBe(news.id)

    expect((await sources.list({ topicId: financeTopic.id })).map(s => s.id)).toEqual([s2.id])
    expect((await sources.listByIds([s1.id, s2.id])).length).toBe(2)

    // 停用后：设置界面列表仍可见，采集（按 id 批量取 / onlyEnabled）忽略
    await sources.update(s1.id, { enabled: false })
    expect((await sources.listByIds([s1.id])).length).toBe(0)
    expect((await sources.list({ categoryId: news.id })).length).toBe(1)
    expect((await sources.list({ categoryId: news.id, onlyEnabled: true })).length).toBe(0)
  })

  it('来源：自有来源可改名/换分组；内置来源禁删禁改', async () => {
    const category = await categories.create({ name: '领域来源' })
    const t1 = await topics.create({ categoryId: category.id, name: '分组一' })
    const t2 = await topics.create({ categoryId: category.id, name: '分组二' })
    const mine = await sources.create({ topicId: t1.id, name: '我的源', url: 'https://mine.example.com' })
    await sources.update(mine.id, { name: '改名后', topicId: t2.id })
    const moved = await sources.findById(mine.id)
    expect(moved?.name).toBe('改名后')
    expect(moved?.topicId).toBe(t2.id)

    const builtin = await sources.create({ topicId: t1.id, name: '内置源', url: 'https://builtin.example.com' })
    await makeBuiltin('source', builtin.id)
    expect((await sources.update(builtin.id, { name: '改不动' }))?.name).toBe('内置源')
    expect(await sources.delete(builtin.id)).toBe(0)
  })

  it('来源：分组占用计数与级联删除（内置来源保留）', async () => {
    const category = await categories.create({ name: '领域来源' })
    const topic = await topics.create({ categoryId: category.id, name: '分组一' })
    await sources.create({ topicId: topic.id, name: '自有源', url: 'https://mine.example.com' })
    const builtin = await sources.create({ topicId: topic.id, name: '内置源', url: 'https://builtin.example.com' })
    await makeBuiltin('source', builtin.id)

    expect(await sources.countByTopic(topic.id)).toBe(2)
    expect(await sources.deleteByTopic(topic.id)).toBe(1)
    expect((await sources.list({ topicId: topic.id })).map(s => s.id)).toEqual([builtin.id])
  })

  it('内置新闻来源类别 id 与共享契约一致', () => {
    expect(INFO_SOURCE_NEWS_CATEGORY_ID).toBe('news')
  })
})
