/**
 * 设置数据访问层
 * @module database/repositories/settings
 * @description 键值对设置存储，value 列以 JSON 字符串保存。
 *              基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *
 * 注意：v2 起方法签名从同步改为异步（返回 Promise）。
 *      所有调用点必须加 await。详见 Spec §1.3。
 */

import type { DataSource } from 'typeorm'
import { SettingsEntity } from '../entities/settings.entity'
import { BaseRepository } from '../base-repository'

interface SettingsDto {
  key: string
  value: unknown
}

export class SettingsRepository extends BaseRepository<
  SettingsEntity,
  SettingsDto
> {
  constructor(dataSource: DataSource) {
    super(dataSource, SettingsEntity)
    // 共享配置类 Repository：所有用户共享数据，不做 user_id 过滤
    this.useRawRepo()
  }

  protected toDto(e: SettingsEntity): SettingsDto {
    return { key: e.key, value: this.parseValue(e.value) }
  }

  private parseValue(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  /**
   * 获取设置值。返回 JSON 反序列化的值；不存在返回 null。
   */
  async get(key: string): Promise<unknown> {
    const entity = await this.repo.findOne({
      where: { key } as any,
      select: ['value'],
    })
    if (!entity) return null
    return this.parseValue(entity.value)
  }

  /**
   * 保存设置值（upsert，value 以 JSON 字符串存储）。
   */
  async set(key: string, value: unknown): Promise<void> {
    await this.repo.save({
      key,
      value: JSON.stringify(value),
    })
  }

  /**
   * 获取所有设置（值已反序列化）。
   */
  async getAll(): Promise<Record<string, unknown>> {
    const entities = await this.repo.find({ select: ['key', 'value'] })
    const out: Record<string, unknown> = {}
    for (const e of entities) {
      out[e.key] = this.parseValue(e.value)
    }
    return out
  }

  /**
   * 删除设置。
   */
  async delete(key: string): Promise<void> {
    await this.deleteByWhere({ key } as any)
  }
}
