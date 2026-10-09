/**
 * 资产版本仓库
 * @module core/database/repositories/asset-version.repository
 * @description asset_versions 表 append-only 读写：nextVersion 取号 + 追加 + 按 asset 列表。
 *              回滚不删行——回滚本身也是一次追加（服务层组装）。
 */

import type { DataSource } from 'typeorm'
import { AssetVersionEntity } from '../entities/asset-version.entity'
import { BaseRepository } from '../base-repository'
import { getCurrentUserId } from '@core/context/user-context'

export interface AssetVersionRecord {
  id: string
  assetId: string
  version: number
  content: string
  feedback: string | null
  createdBy: string | null
  createdAt: string
}

export interface AppendVersionInput {
  assetId: string
  version: number
  content: string
  feedback?: string | null
  createdBy?: string | null
}

export class AssetVersionRepository extends BaseRepository<AssetVersionEntity, AssetVersionRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, AssetVersionEntity)
  }

  private generateId(): string {
    return `asv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  protected toDto(e: AssetVersionEntity): AssetVersionRecord {
    return {
      id: e.id,
      assetId: e.assetId,
      version: e.version,
      content: e.content,
      feedback: e.feedback,
      createdBy: e.createdBy,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
    }
  }

  /** 同一资产内的下一个版本号（从 1 起；空链返回 1） */
  async nextVersion(assetId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('v')
      .select('MAX(v.version)', 'maxv')
      .where('v.asset_id = :assetId', { assetId })
      .getRawOne()
    const maxv = row?.maxv ? Number(row.maxv) : 0
    return maxv + 1
  }

  /** 追加一个版本（append-only；版本号由调用方经 nextVersion 取号） */
  async appendVersion(input: AppendVersionInput): Promise<AssetVersionRecord> {
    const e = new AssetVersionEntity()
    e.id = this.generateId()
    e.userId = getCurrentUserId()
    e.assetId = input.assetId
    e.version = input.version
    e.content = input.content
    e.feedback = input.feedback ?? null
    e.createdBy = input.createdBy ?? null
    e.createdAt = Date.now()
    await this.repo.insert(e)
    return this.toDto(e)
  }

  /** 按资产列全部版本（新→旧；不含 content 大字段以省流量） */
  async listByAsset(assetId: string): Promise<Array<Omit<AssetVersionRecord, 'content'>>> {
    const rows = await this.repo
      .createQueryBuilder('v')
      .select(['v.id', 'v.assetId', 'v.version', 'v.feedback', 'v.createdBy', 'v.createdAt'])
      .where('v.asset_id = :assetId', { assetId })
      .orderBy('v.version', 'DESC')
      .getMany()
    return rows.map((e) => ({
      id: e.id,
      assetId: e.assetId,
      version: e.version,
      feedback: e.feedback,
      createdBy: e.createdBy,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
    }))
  }

  /** 取指定版本（含内容） */
  async findByVersion(assetId: string, version: number): Promise<AssetVersionRecord | null> {
    const e = await this.repo.findOne({ where: { assetId, version } as never })
    return e ? this.toDto(e) : null
  }
}
