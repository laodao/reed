/**
 * 信息来源 IPC 处理器测试（infoSource* 通道：校验 / 级联 / 内置保护 / 未分组兜底）
 * @module tests/unit/electron/ipc/info-source-handler
 * @description 用真实仓库 + 内存库跑 handler 业务规则：
 *  - 类别删除级联清空其下分组（含默认分组「未分组」）与来源；内置类别禁删
 *  - 分组删除级联清空来源；默认分组与内置分组禁删
 *  - 来源新建：不选分组 → 落「未分组」（按需创建）；URL 非 http(s) → 报错；内置来源禁删
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../../helpers/create-test-data-source'
import { InfoSourceCategoryRepository } from '@core/database/repositories/info-source-category.repository'
import { InfoSourceTopicRepository } from '@core/database/repositories/info-source-topic.repository'
import { InfoSourceRepository } from '@core/database/repositories/info-source.repository'

let tds: TestDataSource
let categories: InfoSourceCategoryRepository
let topics: InfoSourceTopicRepository
let sources: InfoSourceRepository

vi.mock('@core/database/database-manager.interface', () => ({
  getCoreDatabaseManager: () => ({
    get infoSourceCategories() {
      return categories
    },
    get infoSourceTopics() {
      return topics
    },
    get infoSources() {
      return sources
    },
  }),
}))

import { invokeIpc } from '@core/ipc/ipc-bridge'
import { registerInfoSourceHandlers } from '@electron/ipc/handlers/info-source.handler'

interface Resp<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
const call = <T = unknown>(channel: string, payload?: unknown): Promise<Resp<T>> =>
  invokeIpc(channel, payload === undefined ? [] : [payload]) as Promise<Resp<T>>

describe.each(getTestDialects())('信息来源 IPC 处理器 [%s]', dialect => {
  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    categories = new InfoSourceCategoryRepository(tds.ds)
    topics = new InfoSourceTopicRepository(tds.ds)
    sources = new InfoSourceRepository(tds.ds)
    registerInfoSourceHandlers()
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  it('类别：创建 / 改名 / 删除（级联清空分组与来源，含默认分组）', async () => {
    const created = await call<{ id: string }>('infoSourceCategory:create', { name: '金融信息来源' })
    expect(created.success).toBe(true)
    const categoryId = created.data!.id

    const topic = await call<{ id: string }>('infoSourceTopic:create', { categoryId, name: '行业媒体' })
    expect(topic.success).toBe(true)
    // 不选分组的来源 → 落到「未分组」（handler 按需创建默认分组）
    const src = await call('infoSource:create', { categoryId, name: '站点A', url: 'https://a.example.com' })
    expect(src.success).toBe(true)
    const defaultTopic = (await topics.list({ categoryId })).find(t => t.isDefault)
    expect(defaultTopic).toBeDefined()

    const renamed = await call<{ name: string }>('infoSourceCategory:update', { id: categoryId, name: '金融知识来源' })
    expect(renamed.data?.name).toBe('金融知识来源')

    const deleted = await call('infoSourceCategory:delete', { id: categoryId })
    expect(deleted.success).toBe(true)
    expect(await categories.findById(categoryId)).toBeNull()
    // 级联：分组（含默认分组）与来源全清
    expect(await topics.list({ categoryId })).toEqual([])
    expect(await sources.list({})).toEqual([])
  })

  it('类别：内置类别禁删；空名报错', async () => {
    const builtin = await categories.create({ name: '新闻来源' })
    await tds.ds.query(`UPDATE info_source_categories SET is_builtin = 1, user_id = NULL WHERE id = '${builtin.id}'`)
    const del = await call('infoSourceCategory:delete', { id: builtin.id })
    expect(del.success).toBe(false)
    expect(del.error).toContain('内置类别')

    const empty = await call('infoSourceCategory:create', { name: '   ' })
    expect(empty.success).toBe(false)
  })

  it('分组：删除级联清空来源；默认分组禁删；内置分组有来源禁删', async () => {
    const category = await categories.create({ name: '物理信息来源' })
    const created = await call<{ id: string }>('infoSourceTopic:create', { categoryId: category.id, name: '学术论文' })
    const topicId = created.data!.id
    await call('infoSource:create', { categoryId: category.id, topicId, name: 'arXiv', url: 'https://arxiv.org' })
    expect((await sources.list({ topicId })).length).toBe(1)

    const del = await call('infoSourceTopic:delete', { id: topicId })
    expect(del.success).toBe(true)
    expect(await sources.list({ topicId })).toEqual([])

    const defaultTopic = await topics.ensureDefault(category.id)
    const delDefault = await call('infoSourceTopic:delete', { id: defaultTopic.id })
    expect(delDefault.success).toBe(false)
    expect(delDefault.error).toContain('未分组')

    const builtinTopic = await topics.create({ categoryId: category.id, name: '内置分组' })
    await tds.ds.query(`UPDATE info_source_topics SET is_builtin = 1, user_id = NULL WHERE id = '${builtinTopic.id}'`)
    await call('infoSource:create', { categoryId: category.id, topicId: builtinTopic.id, name: '站点', url: 'https://x.example.com' })
    const delBuiltin = await call('infoSourceTopic:delete', { id: builtinTopic.id })
    expect(delBuiltin.success).toBe(false)
  })

  it('来源：URL 校验、内置来源禁删、编辑移入「未分组」', async () => {
    const category = await categories.create({ name: '数学信息来源' })
    const bad = await call('infoSource:create', { categoryId: category.id, name: '站点', url: 'ftp://x.com' })
    expect(bad.success).toBe(false)
    expect(bad.error).toContain('http')

    const topic = await topics.create({ categoryId: category.id, name: '分组一' })
    const created = await call<{ id: string }>('infoSource:create', {
      categoryId: category.id,
      topicId: topic.id,
      name: '站点A',
      url: 'https://a.example.com',
    })
    const sourceId = created.data!.id

    // 编辑：topicId 传空串 = 移入未分组
    const moved = await call<{ topicId: string }>('infoSource:update', {
      id: sourceId,
      categoryId: category.id,
      topicId: '',
    })
    expect(moved.success).toBe(true)
    const defaultTopic = (await topics.list({ categoryId: category.id })).find(t => t.isDefault)!
    expect(moved.data?.topicId).toBe(defaultTopic.id)

    await tds.ds.query(`UPDATE info_sources SET is_builtin = 1, user_id = NULL WHERE id = '${sourceId}'`)
    const del = await call('infoSource:delete', { id: sourceId })
    expect(del.success).toBe(false)
    expect(del.error).toContain('内置来源')
  })

  it('列表：按类别过滤（跨分组）', async () => {
    const category = await categories.create({ name: '领域来源' })
    const other = await categories.create({ name: '另一个类别' })
    await call('infoSource:create', { categoryId: category.id, name: '站点A', url: 'https://a.example.com' })
    await call('infoSource:create', { categoryId: other.id, name: '站点B', url: 'https://b.example.com' })

    const list = await call<Array<{ name: string; categoryId: string }>>('infoSource:list', { categoryId: category.id })
    expect(list.success).toBe(true)
    expect(list.data!.map(s => s.name)).toEqual(['站点A'])
    expect(list.data![0].categoryId).toBe(category.id)
  })
})
