/**
 * Repository 基类
 * @module core/database/base-repository
 * @description 提供 protected 工具方法（查询/删除/存在性检查）+ 强制 toDto 抽象。
 *              不暴露统一 CRUD API，避免子类被诱导改方法名（破坏对外 API 不变）。
 */

import type {
  DataSource,
  EntityTarget,
  Repository,
  FindOptionsWhere,
} from 'typeorm'

export abstract class BaseRepository<TEntity extends object, TDto> {
  protected readonly repo: Repository<TEntity>
  protected readonly dataSource: DataSource

  constructor(dataSource: DataSource, target: EntityTarget<TEntity>) {
    this.dataSource = dataSource
    this.repo = dataSource.getRepository(target)
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

  protected async findOneByWhere(
    where: FindOptionsWhere<TEntity>,
  ): Promise<TDto | null> {
    const entity = await this.repo.findOne({ where })
    return entity ? this.toDto(entity) : null
  }

  protected async findManyByWhere(
    where: FindOptionsWhere<TEntity>,
    order?: Record<string, 'ASC' | 'DESC'>,
  ): Promise<TDto[]> {
    const entities = await this.repo.find({
      where,
      order: order as any,
    })
    return this.toDtoList(entities)
  }

  protected async deleteByWhere(
    where: FindOptionsWhere<TEntity>,
  ): Promise<void> {
    await this.repo.delete(where)
  }

  protected async existsByWhere(
    where: FindOptionsWhere<TEntity>,
  ): Promise<boolean> {
    const count = await this.repo.count({ where })
    return count > 0
  }
}
