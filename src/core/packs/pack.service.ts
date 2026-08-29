/**
 * 业务包持久化与解析服务
 * @module core/packs/pack.service
 * @description 内核的 DB 侧（registry.ts 是纯内存状态机，本模块管持久化）：
 *              1. 启动物化：内置包 manifest 快照幂等 UPSERT 进 business_packs
 *                 （by pack_id；manifest_hash 未变不更新，不刷新 updated_at）；
 *              2. 启用解析链：binding(per-user) ?? binding(全局行) ?? record.enabled
 *                 ?? manifest.defaultEnabled ?? true；
 *              3. setEnabled：写 binding 并通知 registry 重算。
 *
 *              方法签名按 P3 的 pack:* IPC handler 直接包一层设计（list/setEnabled）。
 */

import { createHash } from 'node:crypto'
import { getCurrentUserId } from '@core/context/user-context'
import type { PackInfo } from '@shared/types/pack.types'
import type {
  PackBindingRepository,
  PackRepository,
} from '@core/database/repositories/business-pack.repositories'
import type { PackRegistry } from './registry'

export interface PackServiceDeps {
  packs: PackRepository
  packBindings: PackBindingRepository
  registry: PackRegistry
}

export class PackService {
  constructor(private readonly deps: PackServiceDeps) {}

  /**
   * 物化内置包快照（幂等 UPSERT）：
   * - 首次登记：INSERT（enabled 取 manifest.defaultEnabled ?? true）；
   * - manifest_hash 变化：更新 name/version/manifest_json/manifest_hash
   *   （⚠️ 不回写 enabled——启用开关可能被管理员改过，快照同步只更新清单内容）；
   * - hash 未变：整行不动（updated_at 也不刷新，重启无 diff）。
   */
  async materializeSnapshot(): Promise<void> {
    for (const def of this.deps.registry.listDefinitions()) {
      const manifest = def.manifest
      const manifestJson = JSON.stringify(manifest)
      // manifest 是代码内字面量，key 序稳定，JSON.stringify 结果可直接做 hash 输入
      const manifestHash = createHash('sha256').update(manifestJson).digest('hex')
      const existing = await this.deps.packs.getById(manifest.id)
      if (!existing) {
        await this.deps.packs.insertSnapshot({
          packId: manifest.id,
          name: manifest.name,
          version: manifest.version,
          manifestJson,
          manifestHash,
          source: 'builtin',
          enabled: manifest.defaultEnabled ?? true,
          createdAt: '',
          updatedAt: '',
        })
      } else if (existing.manifestHash !== manifestHash) {
        await this.deps.packs.updateSnapshot(manifest.id, {
          name: manifest.name,
          version: manifest.version,
          manifestJson,
          manifestHash,
        })
      }
    }
  }

  /**
   * 启用解析链：binding(per-user) ?? binding(全局行) ?? record.enabled ?? manifest.defaultEnabled ?? true。
   * userId 缺省取 ALS 当前用户（Web 请求作用域；PC 为 local-default-user）；
   * 显式传 null = 只走全局链（kernel 恢复启用态用）。
   */
  async resolveEnabled(packId: string, userId?: string | null): Promise<boolean> {
    const uid = userId === undefined ? getCurrentUserId() : userId
    if (uid !== null) {
      const perUser = await this.deps.packBindings.findBinding(packId, uid)
      if (perUser) return perUser.enabled
    }
    const globalRow = await this.deps.packBindings.findBinding(packId, null)
    if (globalRow) return globalRow.enabled
    const record = await this.deps.packs.getById(packId)
    if (record) return record.enabled
    return this.deps.registry.getManifest(packId).defaultEnabled ?? true
  }

  /**
   * 写启用覆写并通知 registry 重算。
   * userId 缺省/显式 null = 写全局默认行（user_id NULL）并切换进程级启用态；
   * 显式传 userId = 写 per-user 覆写行——⚠️ 不影响进程级激活态（registry 只表达
   * 全局启用态；per-user 差异由调用方按 resolveEnabled 渲染入口，见计划 §4-决策5）。
   */
  async setEnabled(packId: string, enabled: boolean, userId?: string | null): Promise<void> {
    const uid = userId ?? null
    await this.deps.packBindings.upsertBinding(packId, uid, enabled)
    if (uid === null) {
      await this.deps.registry.setEnabled(packId, enabled)
    }
  }

  /**
   * 列包（P3 的 pack:list handler 直接包一层）：
   * registry 的运行时状态 + 按解析链叠加的 enabled（用户视角的开关态）。
   */
  async listPacks(userId?: string | null): Promise<PackInfo[]> {
    const infos = this.deps.registry.listPacks()
    for (const info of infos) {
      info.enabled = await this.resolveEnabled(info.id, userId)
    }
    return infos
  }
}
