import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { AssetRepository } from '@core/database/repositories/asset.repository'
import { AssetEntity } from '@core/database/entities/asset.entity'
import type { AssetCategory, AssetRecord } from '@shared/types/asset.types'

/** 把记录列表折叠成展示卡片键（组 → groupId，单资产 → id），与资产中心前端聚合逻辑一致 */
function cardKeys(items: AssetRecord[]): Set<string> {
  return new Set(items.map(a => (a.groupId ? `group:${a.groupId}` : `asset:${a.id}`)))
}

describe.each(getTestDialects())('AssetRepository [%s]', dialect => {
  let tds: TestDataSource
  let repo: AssetRepository

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
    repo = new AssetRepository(tds.ds)
  })

  afterAll(async () => {
    await tds.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
  })

  /** 直接插资产记录（可控 created_at / is_builtin / 组归属），返回 id */
  async function insertAsset(over: Partial<AssetEntity> = {}): Promise<string> {
    const now = new Date()
    const entity = await tds.ds.getRepository(AssetEntity).save({
      id: `asset_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: null,
      category: 'image',
      subCategory: null,
      name: '资产',
      description: null,
      tags: null,
      kind: 'file',
      storagePath: null,
      url: null,
      textContent: null,
      jsonContent: null,
      mimeType: null,
      sizeBytes: null,
      metadata: null,
      sourceType: null,
      sourceRef: null,
      isBuiltin: 0,
      groupId: null,
      groupRole: null,
      createdAt: now,
      updatedAt: now,
      ...over,
    } as Partial<AssetEntity>)
    return entity.id
  }

  it('listAsset 以卡片为单位分页：组不跨页、每页卡片数=pageSize、total=卡片总数', async () => {
    // 先插 11 个单资产（时间旧），再插组 A 的 5 个成员（时间最新，排第一页）
    // = 12 张卡片 / 16 条记录
    for (let i = 0; i < 11; i++) await insertAsset({})
    for (let i = 0; i < 5; i++) {
      await insertAsset({ groupId: 'ag_a', groupRole: i === 0 ? 'cover' : 'member' })
    }

    const page1 = await repo.listAsset({ page: 1, pageSize: 5 })
    // total = 卡片数（12），而不是记录数（17）——分页器页码才与展示项一致
    expect(page1.total).toBe(12)
    // 每页展示卡片数 = pageSize（组算 1 张卡片）
    expect(cardKeys(page1.items).size).toBe(5)
    // 组 A 的 5 个成员同页返回（组不跨页）
    expect(page1.items.filter(a => a.groupId === 'ag_a')).toHaveLength(5)

    const page2 = await repo.listAsset({ page: 2, pageSize: 5 })
    expect(cardKeys(page2.items).size).toBe(5)

    const page3 = await repo.listAsset({ page: 3, pageSize: 5 })
    expect(cardKeys(page3.items).size).toBe(2)

    // 三页卡片键无重复（同一组不会在多个页面重复出现）
    const all = new Set([...cardKeys(page1.items), ...cardKeys(page2.items), ...cardKeys(page3.items)])
    expect(all.size).toBe(12)
  })

  it('组卡片按组内最新成员时间参与排序（新→旧）', async () => {
    const t1 = new Date('2026-01-01T00:00:00Z')
    const t2 = new Date('2026-01-02T00:00:00Z')
    const t3 = new Date('2026-01-03T00:00:00Z')
    // 组 A：成员时间 t1 / t2（卡片排序键 = 最新 t2）
    await insertAsset({ groupId: 'ag_a', groupRole: 'cover', createdAt: t1 })
    await insertAsset({ groupId: 'ag_a', groupRole: 'member', createdAt: t2 })
    // 单资产 C：t3（最新）；单资产 D：t1.5
    const c = await insertAsset({ createdAt: t3 })
    const d = await insertAsset({ createdAt: new Date('2026-01-01T12:00:00Z') })

    const r = await repo.listAsset({ page: 1, pageSize: 10 })
    const cIdx = r.items.findIndex(a => a.id === c)
    const groupIdx = r.items.findIndex(a => a.groupId === 'ag_a')
    const dIdx = r.items.findIndex(a => a.id === d)
    // C(t3) 最新 → 组(按 t2) → D(t1.5)
    expect(cIdx).toBeGreaterThanOrEqual(0)
    expect(groupIdx).toBeGreaterThanOrEqual(0)
    expect(dIdx).toBeGreaterThanOrEqual(0)
    expect(cIdx).toBeLessThan(groupIdx)
    expect(groupIdx).toBeLessThan(dIdx)
  })

  it('keyword 命中组内任一成员 → 组卡片保留，且只返回匹配成员（过滤语义不变）', async () => {
    await insertAsset({ groupId: 'ag_a', groupRole: 'cover', name: '报告图片A' })
    await insertAsset({ groupId: 'ag_a', groupRole: 'member', name: '杂图B' })
    await insertAsset({ name: '无关单资产' })

    const r = await repo.listAsset({ page: 1, pageSize: 10, keyword: '报告' })
    expect(r.total).toBe(1) // 1 张卡片（组 A）
    const members = r.items.filter(a => a.groupId === 'ag_a')
    expect(members).toHaveLength(1)
    expect(members[0].name).toBe('报告图片A')
  })

  it('category 过滤与组聚合兼容：组内任一成员命中即保留组卡片', async () => {
    await insertAsset({ groupId: 'ag_a', groupRole: 'cover', category: 'image' })
    await insertAsset({ groupId: 'ag_a', groupRole: 'member', category: 'image' })
    await insertAsset({ category: 'video' })

    const r = await repo.listAsset({ page: 1, pageSize: 10, category: 'image' as AssetCategory })
    expect(r.total).toBe(1)
    expect(r.items).toHaveLength(2)
    expect(r.items.every(a => a.groupId === 'ag_a')).toBe(true)
  })

  it('subCategory 过滤与组聚合兼容', async () => {
    await insertAsset({ groupId: 'ag_a', groupRole: 'cover', subCategory: '套图' })
    await insertAsset({ groupId: 'ag_a', groupRole: 'member', subCategory: '套图' })
    await insertAsset({ subCategory: '单图' })

    const r = await repo.listAsset({ page: 1, pageSize: 10, subCategory: '套图' })
    expect(r.total).toBe(1)
    expect(r.items).toHaveLength(2)
  })

  it('page 越界返回空 items 且 total 仍为卡片总数', async () => {
    await insertAsset({})
    const r = await repo.listAsset({ page: 99, pageSize: 10 })
    expect(r.total).toBe(1)
    expect(r.items).toHaveLength(0)
  })
})
