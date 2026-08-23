/**
 * 应用定义服务元信息测试（固定到首页 / 分类标签 / 分类继承）
 * @module tests/app/app-definition-meta
 * @description 内存 stub 仓库：setPinned / updateMeta 透传、listAppCategories 聚合、
 *              createFromWorkflow 分类缺省继承工作流分类（发布时可覆盖）。
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { AppDefinitionService } from '@core/modules/app/app-definition.service'
import { APPLICATION_SOURCE_KINDS } from '@shared/types/app.types'

// ---- 内存假仓库（与 app-definition.spec 同构的最小集） ----
class MemAppRepo {
  rows: Map<string, any> = new Map()
  seq = 0
  updateCalls: Array<{ id: string; patch: any }> = []
  async findById(id: string) { return this.rows.get(id) ?? null }
  async findBySource(sourceKind: string, sourceId: string) {
    return [...this.rows.values()].find(r => r.sourceKind === sourceKind && r.sourceId === sourceId) ?? null
  }
  async create(i: any) {
    const id = `app_${++this.seq}`
    const row = { id, userId: 'u1', sourceKind: APPLICATION_SOURCE_KINDS.workflow,
      channelSession: 1, channelShare: 0, channelApi: 1, enabled: 1, shareToken: null,
      category: null, tags: [], pinned: 0, createdAt: new Date(), updatedAt: new Date(), ...i }
    this.rows.set(id, row)
    return { ...row }
  }
  async update(id: string, patch: any) {
    this.updateCalls.push({ id, patch })
    const row = this.rows.get(id)
    if (!row) return null
    Object.assign(row, patch, { updatedAt: new Date() })
    return { ...row }
  }
  async countByCategory() { return [{ category: '新闻资讯', count: 2 }, { category: '视频处理', count: 1 }] }
}
class MemSessionRepo {
  rows: Map<string, any> = new Map()
  async countByAppIds(appIds: string[]) {
    const m = new Map<string, number>()
    for (const id of appIds) m.set(id, 0)
    return m
  }
  async listByApp() { return [] }
  async deleteByApp() { return 0 }
}
class MemDefs {
  rows: Map<string, any> = new Map()
  async getById(id: string) { return this.rows.get(id) ?? null }
}
class MemMessages {
  async deleteByDialogId() { return 0 }
}

describe('AppDefinitionService 元信息（固定/分类/标签）', () => {
  let apps: MemAppRepo
  let service: AppDefinitionService

  beforeEach(() => {
    apps = new MemAppRepo()
    const sessions = new MemSessionRepo()
    const defs = new MemDefs()
    service = new AppDefinitionService(apps as any, sessions as any, defs as any, new MemMessages() as any)
  })

  it('setPinned：pinned=1/0 透传', async () => {
    await apps.create({ name: 'A', sourceId: 'd1' })
    const pinned = await service.setPinned('app_1', true)
    expect(pinned?.pinned).toBe(1)
    expect(apps.updateCalls[0].patch).toMatchObject({ pinned: 1 })
    const unpinned = await service.setPinned('app_1', false)
    expect(unpinned?.pinned).toBe(0)
  })

  it('updateMeta：category/tags 透传（undefined 不覆盖）', async () => {
    await apps.create({ name: 'A', sourceId: 'd1' })
    const upd = await service.updateMeta('app_1', { category: '视频处理', tags: ['视频', '文案'] })
    expect(upd?.category).toBe('视频处理')
    expect(upd?.tags).toEqual(['视频', '文案'])
    const lastCall = apps.updateCalls[apps.updateCalls.length - 1].patch
    expect(lastCall.category).toBe('视频处理')
    expect(lastCall.tags).toEqual(['视频', '文案'])
  })

  it('listAppCategories：分类计数聚合透传', async () => {
    const cats = await service.listAppCategories()
    expect(cats).toEqual([
      { category: '新闻资讯', count: 2 },
      { category: '视频处理', count: 1 },
    ])
  })

  it('createFromWorkflow：分类缺省继承工作流分类，发布时可覆盖', async () => {
    const defs = new MemDefs()
    defs.rows.set('def-news', { id: 'def-news', name: '早报', category: '新闻资讯', publishedVersion: 1 })
    service = new AppDefinitionService(apps as any, new MemSessionRepo() as any, defs as any, new MemMessages() as any)

    const inherited = await service.createFromWorkflow('def-news')
    expect(inherited.category).toBe('新闻资讯')

    const overridden = await service.createFromWorkflow('def-news', { category: '我的分类', tags: ['早报'] })
    expect(overridden.category).toBe('我的分类')
    expect(overridden.tags).toEqual(['早报'])
  })
})
