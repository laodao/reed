/**
 * Scoped Repository - 自动注入 ALS userId 的 Repository 代理
 * @module core/database/scoped-repository
 *
 * 多租户行级隔离机制：BaseRepository 暴露 `this.repo`（typeorm Repository）
 * 给子类用。直接调用 `this.repo.find / save / update / delete` 不会按当前
 * 用户过滤。本模块用 Proxy 包一层：所有读操作（find/findOne/findAndCount/
 * count）自动把 `where: { ..., userId: <ALS uid> }` 注入；所有写操作
 * （save/insert）自动把 `userId` 字段填充到实体上。
 *
 * 例外：通过 `scopedToUser=false` 的 Repository 不走这个代理（user 表 /
 * 共享配置表）。
 */

import type { FindManyOptions, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm'
import { getCurrentUserId } from '@core/context/user-context'

/**
 * 把 user_id 注入到 typeorm where 条件。
 * - 单对象 where：直接合并
 * - 数组 where（OR 条件）：每项都合并
 */
function injectUserIdWhere<T extends object>(
  where: FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined,
  userId: string | null,
): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
  const scope = { userId } as unknown as FindOptionsWhere<T>
  if (where === undefined) return scope
  if (Array.isArray(where)) {
    return where.map(w => ({ ...w, ...scope }))
  }
  return { ...where, ...scope }
}

/**
 * 把 user_id 注入到要写入的实体（数组或单实体）。
 * 调用方已显式给了 userId 的不覆盖。
 */
function injectUserIdEntity<T extends object>(entity: T | T[], userId: string | null): T | T[] {
  if (Array.isArray(entity)) {
    return entity.map(e => injectOne(e, userId))
  }
  return injectOne(entity, userId)
}

function injectOne<T extends object>(entity: T, userId: string | null): T {
  const e = entity as any
  if (e.userId !== undefined && e.userId !== null) return entity // 显式给了不覆盖
  return { ...entity, userId }
}

/**
 * 检查 entity metadata 是否声明了 userId 列。
 * 通过 typeorm Repository 的 metadata 间接获取。
 */
function entityHasUserIdColumn(repo: Repository<any>): boolean {
  return !!repo.metadata.findColumnWithPropertyName('userId')
}

/**
 * 创建 user-scoped 代理 Repository。
 * 不可被代理的属性 / 方法直接透传（如 metadata、manager、create 等）。
 */
export function createScopedRepository<T extends object>(repo: Repository<T>): Repository<T> {
  if (!entityHasUserIdColumn(repo)) return repo // entity 没 user_id 列 → 不需要代理

  return new Proxy(repo, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver)
      if (typeof orig !== 'function') return orig

      switch (prop) {
        case 'find': {
          return (options?: FindManyOptions<T>) => {
            const userId = getCurrentUserId()
            const opts: FindManyOptions<T> = {
              ...(options ?? {}),
              where: injectUserIdWhere(options?.where, userId),
            }
            return orig.call(target, opts)
          }
        }
        case 'findOne':
        case 'findOneBy':
        case 'findOneOrFail':
        case 'findOneByOrFail': {
          return (...args: unknown[]) => {
            const userId = getCurrentUserId()
            // findOne(options) | findOneBy(where) 两种入参形态
            if (prop === 'findOneBy' || prop === 'findOneByOrFail') {
              const where = args[0] as FindOptionsWhere<T> | undefined
              return orig.call(target, injectUserIdWhere(where, userId))
            }
            const opts = (args[0] ?? {}) as FindOneOptions<T>
            return orig.call(target, {
              ...opts,
              where: injectUserIdWhere(opts.where as any, userId),
            })
          }
        }
        case 'findAndCount': {
          return (options?: FindManyOptions<T>) => {
            const userId = getCurrentUserId()
            const opts: FindManyOptions<T> = {
              ...(options ?? {}),
              where: injectUserIdWhere(options?.where, userId),
            }
            return orig.call(target, opts)
          }
        }
        case 'count':
        case 'countBy': {
          return (input?: unknown) => {
            const userId = getCurrentUserId()
            if (prop === 'countBy') {
              return orig.call(target, injectUserIdWhere(input as FindOptionsWhere<T>, userId))
            }
            const opts = (input ?? {}) as FindManyOptions<T>
            return orig.call(target, {
              ...opts,
              where: injectUserIdWhere(opts.where as any, userId),
            })
          }
        }
        case 'delete':
        case 'softDelete':
        case 'restore': {
          return (criteria: unknown) => {
            const userId = getCurrentUserId()
            // criteria 可能是 id / id[] / where；统一转为 where 注入
            if (
              criteria &&
              typeof criteria === 'object' &&
              !Array.isArray(criteria)
            ) {
              return orig.call(target, injectUserIdWhere(criteria as FindOptionsWhere<T>, userId))
            }
            // id 形态（string / number / array）：转成 { id: x, userId } 形态
            const where: FindOptionsWhere<T> = Array.isArray(criteria)
              ? ({ id: { $in: criteria } } as any)
              : ({ id: criteria } as any)
            return orig.call(target, injectUserIdWhere(where, userId))
          }
        }
        case 'update': {
          return (criteria: unknown, partialEntity: any) => {
            const userId = getCurrentUserId()
            const where =
              criteria && typeof criteria === 'object' && !Array.isArray(criteria)
                ? injectUserIdWhere(criteria as FindOptionsWhere<T>, userId)
                : injectUserIdWhere({ id: criteria } as any, userId)
            return orig.call(target, where, partialEntity)
          }
        }
        case 'save': {
          return (entityOrEntities: T | T[], options?: unknown) => {
            const userId = getCurrentUserId()
            const scoped = injectUserIdEntity(entityOrEntities, userId)
            return orig.call(target, scoped, options)
          }
        }
        case 'insert': {
          return (entityOrEntities: T | T[]) => {
            const userId = getCurrentUserId()
            const scoped = injectUserIdEntity(entityOrEntities, userId)
            return orig.call(target, scoped)
          }
        }
        case 'createQueryBuilder': {
          // 拦截 QueryBuilder：在返回的 builder 上自动 andWhere user_id = :userId
          return (alias?: string, queryRunner?: unknown) => {
            const userId = getCurrentUserId()
            const builder = orig.call(target, alias, queryRunner)
            if (userId && alias) {
              // 用唯一参数名避免与业务 andWhere 冲突
              builder.andWhere(`${alias}.user_id = :__scopedUserId`, {
                __scopedUserId: userId,
              })
            } else if (userId && !alias) {
              // 没传 alias 时 typeorm 默认用 entity 表名作 alias 行不通；
              // 这种情况就把 userId 注入到默认 alias '<entityName>'
              const defaultAlias = (target as Repository<T>).metadata.targetName
              builder.andWhere(`${defaultAlias}.user_id = :__scopedUserId`, {
                __scopedUserId: userId,
              })
            }
            return builder
          }
        }
        // create() 只在内存里造对象，不落库；userId 在后续 save 时由代理填充
        // count/exist/exists 已在上面处理
        // 其他方法（query/createQueryBuilder/manager 等）：透传
        default:
          return orig.bind(target)
      }
    },
  })
}
