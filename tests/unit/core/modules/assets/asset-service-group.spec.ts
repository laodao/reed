/**
 * 资产分组（套图）与保存开关测试
 * @module tests/core/modules/assets/asset-service-group
 * @description 真实 sqlite（assets + asset_groups 表）：
 *              - createAsset 带 groupName → 自动建组/归组，首成员作封面
 *              - 同来源同名组复用；跨来源不串组
 *              - getGroupDetail 返回组 + 成员
 *              - resolveSourceLink：workflow 来源 → 运行详情；app 来源 → 应用会话
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataSource } from 'typeorm'
import { createAssetsTables } from '@core/database/migrations/create-assets-tables'
import { AssetEntity } from '@core/database/entities/asset.entity'
import { AssetGroupEntity } from '@core/database/entities/asset-group.entity'
import { AssetCategoryEntity } from '@core/database/entities/asset-category.entity'
import { AssetRepository } from '@core/database/repositories/asset.repository'
import { AssetGroupRepository } from '@core/database/repositories/asset-group.repository'
import { AssetCategoryRepository } from '@core/database/repositories/asset-category.repository'
import { AssetService } from '@core/modules/assets/asset.service'
import { AssetStorageService } from '@core/modules/assets/asset-storage.service'
import { createAssetSourceLinkResolver } from '@core/modules/assets/asset-source-link'

vi.mock('@core/interfaces/path.interface', () => ({
  getPathProvider: () => ({
    getDataPath: () => 'C:/mock-data',
    toAssetUrl: (p: string) => `file:///C:/mock-data/${p}`,
  }),
}))

/** 内存版 run/app 仓库（resolveSourceLink 用） */
function mockSourceDeps() {
  const runs = {
    getById: vi.fn(async (id: string) => id === 'run_app'
      ? { id: 'run_app', definitionId: 'd1', triggerInfo: { source: 'app-session', appId: 'app_1', sessionId: 'sess_1' } }
      : { id: 'run_wf', definitionId: 'd2', triggerInfo: {} }),
  }
  const apps = {
    findById: vi.fn(async () => ({ id: 'app_1', name: '电商商品套图' })),
  }
  return { runs, apps }
}

async function buildService() {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [AssetEntity, AssetGroupEntity, AssetCategoryEntity],
    synchronize: false,
  })
  await ds.initialize()
  await createAssetsTables(ds)
  // is_builtin 列由 create-builtin-apps 迁移补（本测试聚焦分组，手动补齐）
  await ds.query(`ALTER TABLE assets ADD COLUMN is_builtin INTEGER DEFAULT 0`)
  const { runs, apps } = mockSourceDeps()
  const svc = new AssetService(
    new AssetStorageService(),
    new AssetRepository(ds),
    new AssetCategoryRepository(ds),
    new AssetGroupRepository(ds),
    createAssetSourceLinkResolver({ runs: runs as never, apps: apps as never }),
  )
  return { svc, ds, runs, apps }
}

describe('资产分组（套图）', () => {
  let svc: AssetService
  let ds: DataSource

  beforeEach(async () => {
    vi.clearAllMocks()
    const built = await buildService()
    svc = built.svc
    ds = built.ds
  })

  it('createAsset 带 groupName：自动建组，首成员作封面，第二成员归入', async () => {
    const a1 = await svc.createAsset({
      content: { kind: 'text', text: '图1' }, category: 'image', name: 'main-0',
      sourceType: 'workflow', sourceRef: 'run_1', groupName: '套图A',
    })
    const a2 = await svc.createAsset({
      content: { kind: 'text', text: '图2' }, category: 'image', name: 'scene-1',
      sourceType: 'workflow', sourceRef: 'run_1', groupName: '套图A',
    })
    // 同组
    expect(a1.groupId).toBeTruthy()
    expect(a2.groupId).toBe(a1.groupId)
    // 首成员封面
    expect(a1.groupRole).toBe('cover')
    expect(a2.groupRole).toBe('member')
    // 组详情
    const detail = await svc.getGroupDetail(a1.groupId!)
    expect(detail).not.toBeNull()
    expect(detail!.members.length).toBe(2)
    expect(detail!.group.coverAssetId).toBe(a1.id)
  })

  it('跨来源同名组不串组', async () => {
    const a1 = await svc.createAsset({
      content: { kind: 'text', text: 'x' }, category: 'image', name: 'm1',
      sourceType: 'workflow', sourceRef: 'run_1', groupName: '套图A',
    })
    const a2 = await svc.createAsset({
      content: { kind: 'text', text: 'y' }, category: 'image', name: 'm2',
      sourceType: 'workflow', sourceRef: 'run_2', groupName: '套图A',
    })
    expect(a2.groupId).not.toBe(a1.groupId)
  })
})

describe('资产来源跳转（resolveSourceLink）', () => {
  let svc: AssetService
  let ds: DataSource
  let runs: ReturnType<typeof mockSourceDeps>['runs']
  let apps: ReturnType<typeof mockSourceDeps>['apps']

  beforeEach(async () => {
    vi.clearAllMocks()
    const built = await buildService()
    svc = built.svc
    ds = built.ds
    runs = built.runs
    apps = built.apps
  })

  it('app 会话来源 → 应用跳转（appId/sessionId + 应用名）', async () => {
    const asset = await svc.createAsset({
      content: { kind: 'text', text: 'x' }, category: 'text', name: '清单',
      sourceType: 'app', sourceRef: 'run_app',
    })
    const link = await svc.resolveSourceLink(asset)
    expect(link).not.toBeNull()
    expect(link!.type).toBe('app')
    expect(link!.appId).toBe('app_1')
    expect(link!.sessionId).toBe('sess_1')
    expect(link!.label).toBe('电商商品套图')
    expect(apps.findById).toHaveBeenCalledWith('app_1')
  })

  it('workflow 来源 → 运行详情跳转', async () => {
    const asset = await svc.createAsset({
      content: { kind: 'text', text: 'x' }, category: 'text', name: '报告',
      sourceType: 'workflow', sourceRef: 'run_wf',
    })
    const link = await svc.resolveSourceLink(asset)
    expect(link).not.toBeNull()
    expect(link!.type).toBe('workflow')
    expect(link!.runId).toBe('run_wf')
    expect(link!.definitionId).toBe('d2')
  })

  it('manual 来源 → null（无可跳转）', async () => {
    const asset = await svc.createAsset({
      content: { kind: 'text', text: 'x' }, category: 'text', name: '手工',
      sourceType: 'manual', sourceRef: 'whatever',
    })
    const link = await svc.resolveSourceLink(asset)
    expect(link).toBeNull()
  })
})
