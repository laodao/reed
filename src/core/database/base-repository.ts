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
    if (!shouldScope()) return builder
    const userId = getCurrentUserId()
    const scopeSql = userId
      ? `${alias}.user_id = :__scopedUserId`
      : // 没有 ALS userId（PC 单用户测试场景或 anonymous）→ user_id IS NULL
        `${alias}.user_id IS NULL`
    const scopeParams = userId ? { __scopedUserId: userId } : {}
    // 急切挂载（既有 andWhere-only 调用点的依赖）
    const applyScope = (b: SelectQueryBuilder<E>): void => {
      b.andWhere(scopeSql, scopeParams)
    }
    applyScope(builder)
    // 租户条件免疫 .where() 覆盖（25 号 M2 review 发现的基座缺陷家族）：TypeORM 的
    // where() 语义是"替换全部条件"，调用方在 scoped.qb 后链 .where() 会把租户过滤
    // 整个冲掉（agent-trajectory 首踩，run-event/app-session/workflow-run/variable
    // 等既有仓储同款潜伏）。代理 where()：先执行调用方替换、再重新挂上租户条件
    // （最终 SQL 租户条件恰好一份）；流式方法返回代理防中途逃逸。
    // orWhere() 同样拦截并重挂（review A5：OR 以 SQL 优先级可翻出租户围栏，
    // 需要跨租户 OR 的查询应使用 useRawRepo() 显式声明）；clone() 代理化克隆。
    const proxy: SelectQueryBuilder<E> = new Proxy(builder, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target)
        if (typeof value !== 'function') return value
        if (prop === 'where' || prop === 'orWhere') {
          return (...args: unknown[]) => {
            const result = (value as (...a: unknown[]) => SelectQueryBuilder<E>).apply(target, args)
            applyScope(result)
            return proxy
          }
        }
        if (prop === 'clone') {
          return () => {
            const cloned = (value as () => SelectQueryBuilder<E>).call(target)
            cloned.andWhere(scopeSql, scopeParams)
            return cloned
          }
        }
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args)
          return result === target ? proxy : result // 流式方法（返回 this）继续走代理
        }
      },
    }) as SelectQueryBuilder<E>
    return proxy
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

  /**
   * 事务内 scoped 数据访问原语（复核修复 P0-3 的机制层解法）。
   *
   * 背景：`dataSource.transaction(manager => ...)` 里 `manager.getRepository(...)`
   * 是裸操作，scope 天然丢失——各仓库只能手工注入 userId（P5-T34 补丁只打在
   * 个别仓库，createMany 家族全部漏打）。本原语把"事务 + scope"合成一件事：
   * 回调里 `tx.for(Entity)` 拿到的 API 与 `this.scoped` 同一套语义（自动注入/
   * 过滤 user_id），且所有语句走同一事务、同生同灭。
   *
   * 用法：
   *   return this.scopedTx(async tx => {
   *     const sbApi = tx.for(StoryboardEntity)
   *     await sbApi.save(sbApi.create({ ... }))
   *   })
   */
  protected scopedTx<T>(
    fn: (tx: { for<E extends object>(target: EntityTarget<E>): ScopedRepoApi<E> }) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async manager => {
      return fn({
        for: <E extends object>(target: EntityTarget<E>) =>
          makeScopedApiForRepo(manager.getRepository(target), () => this.scopedToUser),
      })
    })
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
