/**
 * 业务包数据访问层（business_packs / business_pack_bindings）
 * @module database/repositories/business-pack
 * @description PackRepository：内置包快照的读写（UPSERT by pack_id，hash 比对在 service 层）。
 *              PackBindingRepository：启用/配置覆写（user_id NULL = 全局默认行）。
 *
 *              两个仓储都走 useRawRepo()（关闭 ALS user_id 自动过滤）：
 *              - business_packs 无 user_id 列，是平台级共享数据；
 *              - business_pack_bindings 的 user_id NULL 全局行不属于任何租户，
 *                若按 ALS 过滤则 Web 端登录用户永远读不到全局行——
 *                user_id 语义由本仓储方法显式处理（findBinding 的 IsNull 匹配）。
 */

import type { DataSource } from 'typeorm'
import { IsNull } from 'typeorm'
import type { PackBindingRecord, PackRecord } from '@shared/types/pack.types'
import { BusinessPackEntity } from '../entities/business-pack.entity'
import { BusinessPackBindingEntity } from '../entities/business-pack-binding.entity'
import { BaseRepository } from '../base-repository'

/** datetime 列 → ISO 字符串（SQLite 驱动返回 Date 或字符串，统一归一） */
function toIso(d: Date | string | null): string {
  if (!d) return ''
  return d instanceof Date ? d.toISOString() : String(d)
}

/** 绑定行确定性代理主键（与 entity 注释一致）：${packId}#${userId ?? '@global'} */
function bindingId(packId: string, userId: string | null): string {
  return `${packId}#${userId ?? '@global'}`
}

export class PackRepository extends BaseRepository<BusinessPackEntity, PackRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, BusinessPackEntity)
    // 平台级共享数据（无 user_id 列）：不做租户过滤
    this.useRawRepo()
  }

  protected toDto(e: BusinessPackEntity): PackRecord {
    return {
      packId: e.packId,
      name: e.name,
      version: e.version,
      manifestJson: e.manifestJson,
      manifestHash: e.manifestHash,
      source: 'builtin',
      enabled: !!e.enabled,
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt),
    }
  }

  async getById(packId: string): Promise<PackRecord | null> {
    const e = await this.repo.findOne({ where: { packId } })
    return e ? this.toDto(e) : null
  }

  async listAll(): Promise<PackRecord[]> {
    const es = await this.repo.find({ order: { packId: 'ASC' } })
    return this.toDtoList(es)
  }

  /** 首次登记快照（service 层已判定不存在；enabled 取 manifest 默认值） */
  async insertSnapshot(rec: PackRecord): Promise<void> {
    const now = new Date()
    await this.repo.insert({
      packId: rec.packId,
      name: rec.name,
      version: rec.version,
      manifestJson: rec.manifestJson,
      manifestHash: rec.manifestHash,
      source: rec.source,
      enabled: rec.enabled ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
  }

  /**
   * 清单内容更新（manifest_hash 已变化时调用）。
   * ⚠️ 不回写 enabled 列：持久化的全局启用态可能被管理员改过，
   *    快照同步只更新清单内容，不重置启用开关。
   */
  async updateSnapshot(
    packId: string,
    fields: { name: string; version: string; manifestJson: string; manifestHash: string },
  ): Promise<void> {
    await this.repo.update({ packId }, { ...fields, updatedAt: new Date() })
  }
}

export class PackBindingRepository extends BaseRepository<BusinessPackBindingEntity, PackBindingRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, BusinessPackBindingEntity)
    // 全局行（user_id NULL）跨租户共享：关闭 ALS 过滤，user_id 语义由方法显式处理
    this.useRawRepo()
  }

  protected toDto(e: BusinessPackBindingEntity): PackBindingRecord {
    return {
      packId: e.packId,
      userId: e.userId,
      enabled: !!e.enabled,
      configJson: e.configJson,
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt),
    }
  }

  /** 查绑定行；userId=null 精确匹配全局默认行（IsNull，避免 'user_id = NULL' 永假） */
  async findBinding(packId: string, userId: string | null): Promise<PackBindingRecord | null> {
    const e = await this.repo.findOne({
      where: { packId, userId: userId ?? IsNull() },
    })
    return e ? this.toDto(e) : null
  }

  /** 按确定性 id UPSERT（重复调用幂等；configJson 未传则保持/置空语义由调用方决定） */
  async upsertBinding(
    packId: string,
    userId: string | null,
    enabled: boolean,
    configJson?: string | null,
  ): Promise<void> {
    const id = bindingId(packId, userId)
    const existing = await this.repo.findOne({ where: { id } })
    if (existing) {
      await this.repo.update(
        { id },
        {
          enabled: enabled ? 1 : 0,
          ...(configJson !== undefined ? { configJson } : {}),
          updatedAt: new Date(),
        },
      )
      return
    }
    const now = new Date()
    await this.repo.insert({
      id,
      packId,
      userId,
      enabled: enabled ? 1 : 0,
      configJson: configJson ?? null,
      createdAt: now,
      updatedAt: now,
    })
  }

  /** 列某包全部绑定行（管理/UI 用；P3 起消费） */
  async listBindings(packId: string): Promise<PackBindingRecord[]> {
    const es = await this.repo.find({ where: { packId } })
    return this.toDtoList(es)
  }
}
