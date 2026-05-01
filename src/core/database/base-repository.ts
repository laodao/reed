/**
 * Repository 基类
 * @module core/database/base-repository
 * @description 提供 protected 工具方法（查询/删除/存在性检查）+ 强制 toDto 抽象。
 *              所有工具方法自动按当前 ALS userId 过滤（多租户行级隔离）。
 *
 *              用法约束（重要）：
 *              - 子 Repository 的查询/写入应当走 protected 工具方法（findOneByWhere /
 *                findManyByWhere / countByWhere / deleteByWhere / saveScoped 等）；
 *              - 业务调用 `this.repo.find / save / update / delete` 直接绕过 BaseRepository
 *                的 user_id 注入会导致跨用户数据泄漏，必须避免。
 *
 *              不要 user_id 过滤的 entity 类（共享配置 / 用户表本身），通过
 *              `protected scopedToUser = false` 关闭注入。
 */

import type {
  DataSource,
  EntityTarget,
  FindOptionsWhere,
  Repository,
} from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'
import { createScopedRepository } from './scoped-repository'

export abstract class BaseRepository<TEntity extends object, TDto> {
  /**
   * 暴露给子类的 Repository，已经被 user_id 多租户隔离 Proxy 包过。
   * 子类的 `this.repo.find/save/update/delete` 都会自动注入当前 ALS userId。
   *
   * 若 entity 没声明 userId 列（如 user / settings），proxy 内部会直接透传，
   * 等价于裸 typeorm Repository。
   */
  protected readonly repo: Repository<TEntity>
  protected readonly dataSource: DataSource
  /**
   * 是否对当前 entity 应用 user_id 多租户过滤。默认 true。
   * 共享配置类（user / settings / api-key / provider-config / oss-config /
   * search-engine-config / lw-dictionary-category / lw-global-settings 等）
   * 应在子类构造里设为 false——会拿到不带 user_id 注入的裸 Repository。
   */
  protected scopedToUser = true

  constructor(dataSource: DataSource, target: EntityTarget<TEntity>) {
    this.dataSource = dataSource
    const rawRepo = dataSource.getRepository(target)
    // 默认 wrap scoped；scopedToUser=false 的子类会在构造结束后改 this.scopedToUser，
    // 这里先 wrap，等子类构造结束如果发现关闭了再切回 raw 也行——但成本是子类需要在构造里
    // 写 `this.scopedToUser = false; this.repo = rawRepo`。简化：
    // 我们把 scoped 切换交给 createScopedRepository 自己——它读 entity metadata，
    // 没 userId 列直接透传；scopedToUser=false 的子类必须自己 disable Proxy，方法见下。
    this.repo = createScopedRepository(rawRepo) as Repository<TEntity>
  }

  /**
   * scopedToUser=false 的子类在构造里调一次：拿到不带 user_id 注入的裸 Repository。
   * 用法：
   *   constructor(ds: DataSource) {
   *     super(ds, UserEntity)
   *     this.scopedToUser = false
   *     this.useRawRepo()
   *   }
   */
  protected useRawRepo(): void {
    this.scopedToUser = false
    ;(this as { repo: Repository<TEntity> }).repo = this.dataSource.getRepository(
      this.repo.metadata.target,
    )
  }

  /** 子类必须实现：Entity → DTO */
  protected abstract toDto(entity: TEntity): TDto

  /** 可选：DTO/部分 → Entity；默认抛错（仅简单 save 场景使用） */
  protected fromDto(_dto: Partial<TDto>): Partial<TEntity> {
    throw new Error('fromDto not implemented')
  }

  protected toDtoList(entities: TEntity[]): TDto[] {
    return entities.map(e => this.toDto(e))
  }

  /**
   * 注入当前 ALS userId 到 where 条件。Web 端有 userId 时强制注入；
   * Electron 单用户场景 userId 为 null，按 user_id IS NULL 过滤（避免读到 web 用户数据）。
   * scopedToUser=false 时直接返回原 where。
   */
  protected scopeWhere(
    where: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[] = {},
  ): FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[] {
    if (!this.scopedToUser) return where
    const userId = getCurrentUserId()
    const userScope = { userId } as unknown as FindOptionsWhere<TEntity>
    if (Array.isArray(where)) {
      return where.map(w => ({ ...w, ...userScope }))
    }
    return { ...where, ...userScope }
  }

  /**
   * 把 userId 注入到要写入的实体上（insert / save 时调用）。
   * scopedToUser=false 不动；userId 为 null 也写 null。
   */
  protected scopeEntity<T extends Partial<TEntity>>(entity: T): T {
    if (!this.scopedToUser) return entity
    const userId = getCurrentUserId()
    return { ...entity, userId } as T
  }

  protected async findOneByWhere(
    where: FindOptionsWhere<TEntity>,
  ): Promise<TDto | null> {
    const entity = await this.repo.findOne({ where: this.scopeWhere(where) as FindOptionsWhere<TEntity> })
    return entity ? this.toDto(entity) : null
  }

  protected async findManyByWhere(
    where: FindOptionsWhere<TEntity> = {},
    order?: Record<string, 'ASC' | 'DESC'>,
  ): Promise<TDto[]> {
    const entities = await this.repo.find({
      where: this.scopeWhere(where) as FindOptionsWhere<TEntity>,
      order: order as any,
    })
    return this.toDtoList(entities)
  }

  protected async deleteByWhere(
    where: FindOptionsWhere<TEntity>,
  ): Promise<void> {
    await this.repo.delete(this.scopeWhere(where) as FindOptionsWhere<TEntity>)
  }

  protected async existsByWhere(
    where: FindOptionsWhere<TEntity>,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: this.scopeWhere(where) as FindOptionsWhere<TEntity> })
    return count > 0
  }

  protected async countByWhere(
    where: FindOptionsWhere<TEntity> = {},
  ): Promise<number> {
    return this.repo.count({ where: this.scopeWhere(where) as FindOptionsWhere<TEntity> })
  }
}
