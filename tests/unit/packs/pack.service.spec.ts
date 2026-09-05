/**
 * PackService 持久化与解析测试（双方言）
 * @module tests/packs/pack.service
 * @description create-test-data-source 惯例（sqlite :memory: + PG 临时 schema）：
 *              快照 UPSERT 幂等（manifest_hash 未变不刷新）、hash 变化才更新且不重置启用态、
 *              启用解析优先级链（per-user binding ?? 全局行 ?? record.enabled ?? manifest 默认）、
 *              setEnabled 覆写（全局行联动 registry；per-user 行不影响进程级状态）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import {
  createTestDataSource,
  getTestDialects,
  type TestDataSource,
} from '../helpers/create-test-data-source'
import { PackRegistry, type PackDefinition } from '@core/packs/registry'
import { PackService } from '@core/packs/pack.service'
import {
  PackBindingRepository,
  PackRepository,
} from '@core/database/repositories/business-pack.repositories'

function makePack(
  id: string,
  overrides?: { version?: string; defaultEnabled?: boolean; dependencies?: string[] },
): PackDefinition {
  return {
    manifest: {
      id,
      name: `测试包 ${id}`,
      version: overrides?.version ?? '1.0.0',
      ...(overrides?.defaultEnabled !== undefined ? { defaultEnabled: overrides.defaultEnabled } : {}),
      ...(overrides?.dependencies ? { dependencies: overrides.dependencies } : {}),
    },
  }
}

describe.each(getTestDialects())('PackService（%s）', (dialect) => {
  let tds: TestDataSource
  let registry: PackRegistry
  let packs: PackRepository
  let bindings: PackBindingRepository
  let service: PackService

  beforeAll(async () => {
    tds = await createTestDataSource(dialect)
  })

  afterAll(async () => {
    await tds?.close()
  })

  beforeEach(async () => {
    await tds.truncateAll()
    registry = new PackRegistry()
    packs = new PackRepository(tds.ds)
    bindings = new PackBindingRepository(tds.ds)
    service = new PackService({ packs, packBindings: bindings, registry })
  })

  it('快照 UPSERT 幂等：两次物化行数稳定，hash 未变不刷新 updated_at', async () => {
    await registry.registerPack(makePack('alpha'))
    await registry.registerPack(makePack('beta', { defaultEnabled: false }))
    await service.materializeSnapshot()
    const first = await packs.listAll()
    expect(first.map((r) => r.packId)).toEqual(['alpha', 'beta'])
    expect(first.every((r) => r.source === 'builtin')).toBe(true)
    // 首次登记：enabled 取 manifest 默认
    expect(first.find((r) => r.packId === 'alpha')!.enabled).toBe(true)
    expect(first.find((r) => r.packId === 'beta')!.enabled).toBe(false)
    expect(first.every((r) => r.manifestHash.length === 64)).toBe(true)

    await service.materializeSnapshot()
    const second = await packs.listAll()
    expect(second.length).toBe(2)
    // 未变化不刷新 updated_at（幂等无 diff）
    expect(second).toEqual(first)
  })

  it('manifest_hash 变化才更新清单内容，且不重置持久化启用态', async () => {
    await registry.registerPack(makePack('alpha', { version: '1.0.0' }))
    await service.materializeSnapshot()
    // 模拟管理员改启用态（直接改 record.enabled 兜底值）
    await tds.ds.query(`UPDATE business_packs SET enabled = 0 WHERE pack_id = 'alpha'`)

    // 版本升级（hash 变化）→ 更新清单列
    const registry2 = new PackRegistry()
    await registry2.registerPack(makePack('alpha', { version: '1.0.1' }))
    const service2 = new PackService({ packs, packBindings: bindings, registry: registry2 })
    await service2.materializeSnapshot()

    const rec = await packs.getById('alpha')
    expect(rec!.version).toBe('1.0.1')
    expect(JSON.parse(rec!.manifestJson).version).toBe('1.0.1')
    expect(rec!.enabled).toBe(false) // 启用态不被快照同步重置
  })

  it('启用解析链：binding(per-user) ?? binding(全局行) ?? record.enabled ?? manifest.defaultEnabled ?? true', async () => {
    await registry.registerPack(makePack('alpha'))
    // 无任何记录（快照都未物化）→ manifest 默认（缺省 true）
    expect(await service.resolveEnabled('alpha')).toBe(true)

    await service.materializeSnapshot()
    await registry.registerPack(makePack('beta', { defaultEnabled: false }))
    // 未物化 + defaultEnabled=false → false
    expect(await service.resolveEnabled('beta')).toBe(false)

    // record.enabled=false → 覆盖 manifest 默认
    await tds.ds.query(`UPDATE business_packs SET enabled = 0 WHERE pack_id = 'alpha'`)
    expect(await service.resolveEnabled('alpha')).toBe(false)

    // 全局行 → 覆盖 record
    await bindings.upsertBinding('alpha', null, true)
    expect(await service.resolveEnabled('alpha')).toBe(true)

    // per-user 行 → 覆盖全局行（仅对该用户）
    await bindings.upsertBinding('alpha', 'user-1', false)
    expect(await service.resolveEnabled('alpha', 'user-1')).toBe(false)
    expect(await service.resolveEnabled('alpha', 'user-2')).toBe(true)
    expect(await service.resolveEnabled('alpha', null)).toBe(true) // 显式全局链
  })

  it('setEnabled 全局：写全局 binding 行并联动 registry 状态', async () => {
    await registry.registerPack(makePack('alpha'))
    await service.materializeSnapshot()
    expect(registry.getPackState('alpha')).toBe('enabled')

    await service.setEnabled('alpha', false)
    expect(registry.getPackState('alpha')).toBe('disabled')
    const row = await bindings.findBinding('alpha', null)
    expect(row).not.toBeNull()
    expect(row!.enabled).toBe(false)
    expect(await service.resolveEnabled('alpha')).toBe(false)

    // 重复写幂等（确定性 id UPSERT）
    await service.setEnabled('alpha', false)
    expect((await bindings.listBindings('alpha')).length).toBe(1)

    await service.setEnabled('alpha', true)
    expect(registry.getPackState('alpha')).toBe('enabled')
    expect((await bindings.listBindings('alpha')).length).toBe(1)
  })

  it('setEnabled per-user：只写覆写行，不影响进程级启用态', async () => {
    await registry.registerPack(makePack('alpha'))
    await service.materializeSnapshot()

    await service.setEnabled('alpha', false, 'user-1')
    expect(registry.getPackState('alpha')).toBe('enabled') // registry 只表达全局启用态
    expect(await service.resolveEnabled('alpha', 'user-1')).toBe(false)
    expect(await service.resolveEnabled('alpha', 'user-2')).toBe(true)
    const rows = await bindings.listBindings('alpha')
    expect(rows.length).toBe(1)
    expect(rows[0].userId).toBe('user-1')
  })

  it('listPacks：registry 运行时状态 + 解析链叠加的 enabled', async () => {
    await registry.registerPack(makePack('alpha'))
    await registry.registerPack(makePack('beta', { dependencies: ['ghost-dep'] }))
    await service.materializeSnapshot()
    await service.setEnabled('alpha', false)

    const list = await service.listPacks(null)
    const alpha = list.find((p) => p.id === 'alpha')!
    const beta = list.find((p) => p.id === 'beta')!
    expect(alpha.state).toBe('disabled')
    expect(alpha.enabled).toBe(false)
    expect(beta.state).toBe('pending')
    expect(beta.missingDependencies).toEqual(['ghost-dep'])
    expect(beta.enabled).toBe(true) // 期望态启用（解析链），但运行时 pending
  })
})
