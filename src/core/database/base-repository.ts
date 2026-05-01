/**
 * Repository 基类
 * @module core/database/base-repository
 *
 * 多租户行级隔离机制：
 * - 每张业务表都有 user_id 列（entity 的 userId 字段）
 * - 子 Repository 必须显式调 `this.scoped.xxx`（findOne / find / save / update /
 *   delete / count / exists / qb）—— 这些方法自动按当前 ALS userId 过滤 / 填充 user_id。
 * - `this.repo` 是裸 typeorm Repository，**不带 scope**——只在确实不需要按用户过滤
 *   的内部场景（共享配置、跨租户管理工具等）使用，必须显式确认安全性。
 * - 共享配置类（user / settings / api-key / provider-config / oss-config /
 *   search-engine-config / lw-dictionary-category / lw-global-settings 等）
 *   在子类构造里调 `this.useRawRepo()`，scope 默认关闭，`this.scoped` 等同于裸操作。
 */

import { IsNull } from 'typeorm'
import type {
  DataSource,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SelectQueryBuilder,
} from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'

/**
 * 创建针对某个 typeorm Repository 的 scoped API。
 * isScopedFn 是函数（不是布尔值）——子类切换 scope 后能动态生效。
 */
function makeScopedApiForRepo<E extends object>(
  repo: Repository<E>,
  isScopedFn: () => boolean,
): ScopedRepoApi<E> {
  // entity 是否有 userId 列。没有就所有 scope 操作直接透传——共享配置类
  // entity（user / settings / api-key / provider-config 等）都属于这种。
  const hasUserIdColumn = !!repo.metadata.findColumnWithPropertyName('userId')

  function shouldScope(): boolean {
    return isScopedFn() && hasUserIdColumn
  }

  function scopeWhere(
    where: FindOptionsWhere<E> | FindOptionsWhere<E>[] = {},
  ): FindOptionsWhere<E> | FindOptionsWhere<E>[] {
    if (!shouldScope()) return where
    const userId = getCurrentUserId()
    // userId 为 null 时统一用 IsNull()，避免 typeorm 把 = null 翻译成
    // SQL 'user_id = NULL'（永远 false）。这影响 update / delete / find 全套。
    const userScope = userId === null ? IsNull() : userId
    const scope = { userId: userScope } as unknown as FindOptionsWhere<E>
    if (Array.isArray(where)) return where.map(w => ({ ...w, ...scope }))
    return { ...where, ...scope }
  }
  function scopeEntity<T extends Partial<E>>(entity: T): T {
    if (!shouldScope()) return entity
    return { ...entity, userId: getCurrentUserId() } as T
  }
  function stripUserId<T extends object>(partial: T): T {
    if (!shouldScope()) return partial
    if (partial && typeof partial === 'object' && 'userId' in partial) {
      const { userId: _omit, ...rest } = partial as any
      void _omit
      return rest as T
    }
    return partial
  }

  return {
    async findOne(where, options) {
      return repo.findOne({
        ...(options ?? {}),
        where: scopeWhere(where) as FindOptionsWhere<E>,
      })
    },
    async find(options = {}) {
      return repo.find({
        ...options,
        where: scopeWhere(options.where as FindOptionsWhere<E>) as FindOptionsWhere<E>,
      })
    },
    async findAndCount(options = {}) {
      return repo.findAndCount({
        ...options,
        where: scopeWhere(options.where as FindOptionsWhere<E>) as FindOptionsWhere<E>,
      })
    },
    async save(entity) {
      return repo.save(scopeEntity(entity) as E)
    },
    async saveMany(entities) {
      return repo.save(entities.map(e => scopeEntity(e)) as E[])
    },
    async insert(entity) {
      const scoped = scopeEntity(entity)
      await repo.insert(scoped as any)
      return scoped as E
    },
    async update(where, partial) {
      const safePartial = stripUserId(partial)
      const result = await repo.update(
        scopeWhere(where) as FindOptionsWhere<E>,
        safePartial as any,
      )
      return result.affected ?? 0
    },
    async delete(where) {
      const result = await repo.delete(scopeWhere(where) as FindOptionsWhere<E>)
      return result.affected ?? 0
    },
    async count(where = {}) {
      return repo.count({ where: scopeWhere(where) as FindOptionsWhere<E> })
    },
    async exists(where) {
      return (await this.count(where)) > 0
    },
    qb(alias) {
      const builder = repo.createQueryBuilder(alias)
      if (shouldScope()) {
        const userId = getCurrentUserId()
        if (userId) {
          builder.andWhere(`${alias}.user_id = :__scopedUserId`, {
            __scopedUserId: userId,
          })
        } else {
          // 没有 ALS userId（PC 单用户测试场景或 anonymous）→ user_id IS NULL
          builder.andWhere(`${alias}.user_id IS NULL`)
        }
      }
      return builder
    },
  }
}

/**
 * Scoped Repository API：暴露给子 Repository 的安全数据访问方法。
 * 内部按 ALS userId 自动过滤；不需要按用户过滤的子 Repository 用 useRawRepo() 关闭。
 */
export interface ScopedRepoApi<TEntity extends object> {
  findOne(where: FindOptionsWhere<TEntity>, options?: Omit<FindOneOptions<TEntity>, 'where'>): Promise<TEntity | null>
  find(options?: FindManyOptions<TEntity>): Promise<TEntity[]>
  findAndCount(options?: FindManyOptions<TEntity>): Promise<[TEntity[], number]>
  save(entity: Partial<TEntity>): Promise<TEntity>
  saveMany(entities: Partial<TEntity>[]): Promise<TEntity[]>
  insert(entity: Partial<TEntity>): Promise<TEntity>
  update(where: FindOptionsWhere<TEntity>, partial: Partial<TEntity>): Promise<number>
  delete(where: FindOptionsWhere<TEntity>): Promise<number>
  count(where?: FindOptionsWhere<TEntity>): Promise<number>
  exists(where: FindOptionsWhere<TEntity>): Promise<boolean>
  qb(alias: string): SelectQueryBuilder<TEntity>
}

export abstract class BaseRepository<TEntity extends object, TDto> {
  /** 裸 typeorm Repository。仅在明确不需要 user_id 过滤时使用。 */
  protected readonly repo: Repository<TEntity>
  protected readonly dataSource: DataSource
  /** 子类构造里关闭 scope 后，所有 `this.scoped.*` 等同于裸操作。 */
  protected scopedToUser = true

  /** 受 user_id scope 保护的数据访问入口。子类应使用此对象做所有读写。 */
  protected readonly scoped: ScopedRepoApi<TEntity>

  constructor(dataSource: DataSource, target: EntityTarget<TEntity>) {
    this.dataSource = dataSource
    this.repo = dataSource.getRepository(target)
    this.scoped = this.makeScopedApi()
  }

  /** 关闭当前 Repository 的 user_id 过滤（共享配置类调用）。 */
  protected useRawRepo(): void {
    this.scopedToUser = false
  }

  /**
   * 为另一个 entity 创建 scoped API（同样按 ALS userId 过滤/注入 user_id）。
   * 用于一个 Repository 维护多张表的场景（如 LwChapterRepository 同时访问
   * chapters 和 chapter_versions）。target entity 必须有 userId 列。
   */
  protected scopedFor<E extends object>(target: EntityTarget<E>): ScopedRepoApi<E> {
    const repo = this.dataSource.getRepository(target)
    return makeScopedApiForRepo(repo, () => this.scopedToUser)
  }

  /** 子类必须实现：Entity → DTO */
  protected abstract toDto(entity: TEntity): TDto

  protected fromDto(_dto: Partial<TDto>): Partial<TEntity> {
    throw new Error('fromDto not implemented')
  }

  protected toDtoList(entities: TEntity[]): TDto[] {
    return entities.map(e => this.toDto(e))
  }

  // ==================== Scope 实现 ====================

  private scopeWhere(
    where: FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[] = {},
  ): FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[] {
    if (!this.scopedToUser) return where
    const userId = getCurrentUserId()
    const scope = { userId } as unknown as FindOptionsWhere<TEntity>
    if (Array.isArray(where)) return where.map(w => ({ ...w, ...scope }))
    return { ...where, ...scope }
  }

  private scopeEntity<T extends Partial<TEntity>>(entity: T): T {
    if (!this.scopedToUser) return entity
    const userId = getCurrentUserId()
    return { ...entity, userId } as T
  }

  private stripUserIdFromUpdate<T extends object>(partial: T): T {
    if (!this.scopedToUser) return partial
    if (partial && typeof partial === 'object' && 'userId' in partial) {
      const { userId: _omit, ...rest } = partial as any
      void _omit
      return rest as T
    }
    return partial
  }

  private makeScopedApi(): ScopedRepoApi<TEntity> {
    return makeScopedApiForRepo<TEntity>(this.repo, () => this.scopedToUser)
  }

  // ==================== 老 API（已弃用，保留以兼容尚未改造的子类） ====================

  /** @deprecated 用 this.scoped.findOne */
  protected async findOneByWhere(where: FindOptionsWhere<TEntity>): Promise<TDto | null> {
    const e = await this.scoped.findOne(where)
    return e ? this.toDto(e) : null
  }

  /** @deprecated 用 this.scoped.find */
  protected async findManyByWhere(
    where: FindOptionsWhere<TEntity> = {},
    order?: Record<string, 'ASC' | 'DESC'>,
  ): Promise<TDto[]> {
    const es = await this.scoped.find({ where, order: order as any })
    return this.toDtoList(es)
  }

  /** @deprecated 用 this.scoped.delete */
  protected async deleteByWhere(where: FindOptionsWhere<TEntity>): Promise<void> {
    await this.scoped.delete(where)
  }

  /** @deprecated 用 this.scoped.exists */
  protected async existsByWhere(where: FindOptionsWhere<TEntity>): Promise<boolean> {
    return this.scoped.exists(where)
  }

  /** @deprecated 用 this.scoped.count */
  protected async countByWhere(where: FindOptionsWhere<TEntity> = {}): Promise<number> {
    return this.scoped.count(where)
  }
}
