/**
 * 资产版本管理测试（append-only 版本链）
 * @module tests/unit/core/platform/assets/asset-service-version
 * @description 真实 sqlite（assets + asset_versions 表）：
 *              - saveAssetVersion 自动取号（v1/v2/v3 递增）
 *              - 仅文本型资产可入链（file 资产拒绝）
 *              - listVersions 新→旧且不含内容大字段；getVersion 取回全文
 *              - rollback：历史版内容另存为新版本（append-only 不删行）+ 资产当前内容就地更新
 *              - save-asset 节点 versionOfAssetId 分支复用服务层（节点为薄适配器，节点行为另测）
 */
import { describe, it, expect, vi } from 'vitest'
import { DataSource } from 'typeorm'
import { createAssetsTables } from '@core/database/migrations/create-assets-tables'
import { createAssetVersions } from '@core/database/migrations/create-asset-versions'
import { AssetEntity } from '@core/database/entities/asset.entity'
import { AssetCategoryEntity } from '@core/database/entities/asset-category.entity'
import { AssetVersionEntity } from '@core/database/entities/asset-version.entity'
import { AssetRepository } from '@core/database/repositories/asset.repository'
import { AssetCategoryRepository } from '@core/database/repositories/asset-category.repository'
import { AssetVersionRepository } from '@core/database/repositories/asset-version.repository'
import { AssetService } from '@core/platform/assets/asset.service'
import { AssetStorageService } from '@core/platform/assets/asset-storage.service'

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getDataPath: () => 'C:/mock-data',
    toAssetUrl: (p: string) => `file:///C:/mock-data/${p}`,
  }),
}))

async function buildService() {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetEntity, AssetCategoryEntity, AssetVersionEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createAssetsTables(ds)
  await ds.query(`ALTER TABLE assets ADD COLUMN is_builtin INTEGER DEFAULT 0`)
  await createAssetVersions(ds)
  const svc = new AssetService(
    new AssetStorageService(),
    new AssetRepository(ds),
    new AssetCategoryRepository(ds),
    undefined,
    undefined,
    new AssetVersionRepository(ds),
  )
  return { svc, ds }
}

describe('资产版本管理（append-only 版本链）', () => {
  it('文本资产：v1/v2/v3 自动取号，list 新→旧不含正文，getVersion 取回全文', async () => {
    const { svc } = await buildService()
    const a = await svc.createAsset({ category: 'text', name: '长文.md', kind: 'text', textContent: '初稿' })

    const v1 = await svc.saveAssetVersion(a.id, { content: '初稿', feedback: '首次入链', createdBy: 'workflow:save1' })
    expect(v1.version).toBe(1)
    const v2 = await svc.saveAssetVersion(a.id, { content: '二稿', feedback: '按意见修订' })
    const v3 = await svc.saveAssetVersion(a.id, { content: '三稿' })
    expect(v2.version).toBe(2)
    expect(v3.version).toBe(3)

    const list = await svc.listAssetVersions(a.id)
    expect(list.map((x) => x.version)).toEqual([3, 2, 1])
    expect(list[0]).not.toHaveProperty('content')

    const got = await svc.getAssetVersion(a.id, 2)
    expect(got?.content).toBe('二稿')
    expect(got?.feedback).toBe('按意见修订')
  })

  it('非文本资产拒绝入链；回滚 = 另存新版本 + 就地更新内容 + 历史行不动', async () => {
    const { svc, ds } = await buildService()
    const img = await svc.createAsset({ category: 'image', name: 'a.png', kind: 'file', storagePath: 'assets/x.png' })
    await expect(svc.saveAssetVersion(img.id, { content: 'x' })).rejects.toThrow(/仅文本型资产/)

    const a = await svc.createAsset({ category: 'text', name: '文章.md', kind: 'text', textContent: 'v1内容' })
    await svc.saveAssetVersion(a.id, { content: 'v1内容', feedback: '初稿' })
    await svc.saveAssetVersion(a.id, { content: 'v2内容', feedback: '修订' })

    const rb = await svc.rollbackAssetVersion(a.id, 1, 'local-user')
    expect(rb.version).toBe(3)

    // 当前内容已更新为 v1 的内容
    const after = await svc.getAsset(a.id)
    expect(after?.textContent).toBe('v1内容')
    // append-only：3 行都在，回滚行带标记
    const rows = await ds.query(`SELECT version, feedback FROM asset_versions ORDER BY version`)
    expect(rows.length).toBe(3)
    expect(rows[2].feedback).toContain('回滚到 v1')
    expect(rows[2].feedback).toContain('local-user')
    // 历史行内容未被改动
    const v2 = await svc.getAssetVersion(a.id, 2)
    expect(v2?.content).toBe('v2内容')
  })

  it('版本不存在时报错；未装配 versionRepo 时显式报错', async () => {
    const { svc, ds } = await buildService()
    const a = await svc.createAsset({ category: 'text', name: 'x.md', kind: 'text', textContent: 'x' })
    await expect(svc.rollbackAssetVersion(a.id, 9)).rejects.toThrow(/版本不存在/)

    const bare = new AssetService(
      new AssetStorageService(),
      new AssetRepository(ds),
      new AssetCategoryRepository(ds),
    )
    await expect(bare.listAssetVersions(a.id)).rejects.toThrow(/版本仓储未装配/)
  })
})
