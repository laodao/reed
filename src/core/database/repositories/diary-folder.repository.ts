/**
 * 日记目录数据访问层
 * @module database/repositories/diary-folder.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { IsNull, type DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import type {
  DiaryFolder,
  CreateDiaryFolderRequest,
  UpdateDiaryFolderRequest,
} from '@shared/types/diary.types'
import { DiaryFolderEntity } from '../entities/diary-folder.entity'
import { DiaryEntryEntity } from '../entities/diary-entry.entity'
import { BaseRepository } from '../base-repository'

export class DiaryFolderRepository extends BaseRepository<
  DiaryFolderEntity,
  DiaryFolder
> {
  constructor(dataSource: DataSource) {
    super(dataSource, DiaryFolderEntity)
  }

  protected toDto(e: DiaryFolderEntity): DiaryFolder {
    return {
      id: e.id,
      name: e.name,
      parentId: e.parentId || undefined,
      path: e.path,
      sortOrder: e.sortOrder,
      childCount: 0,
      entryCount: 0,
      createdAt: e.createdAt instanceof Date ? e.createdAt : new Date(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt : new Date(e.updatedAt),
    }
  }

  /**
   * 用 QueryBuilder + 子查询补充 child_count / entry_count，再合并到 DTO。
   */
  private async findWithCounts(
    where: 'root' | { parentId?: string; id?: string; path?: string },
    orderBySort = true,
  ): Promise<DiaryFolder[]> {
    const qb = this.scoped.qb('f')
    if (where === 'root') {
      qb.where('f.parent_id IS NULL')
    } else {
      if (where.parentId !== undefined) {
        qb.where('f.parent_id = :pid', { pid: where.parentId })
      }
      if (where.id !== undefined) {
        qb.andWhere('f.id = :id', { id: where.id })
      }
      if (where.path !== undefined) {
        qb.andWhere('f.path = :p', { p: where.path })
      }
    }
    if (orderBySort) {
      qb.orderBy('f.sort_order', 'ASC').addOrderBy('f.created_at', 'DESC')
    }
    const folders = await qb.getMany()
    if (folders.length === 0) return []

    const ids = folders.map(f => f.id)
    const childCounts = new Map<string, number>()
    const entryCounts = new Map<string, number>()

    // 子目录数
    const childRows = await this.repo
      .createQueryBuilder('f')
      .select('f.parent_id', 'parent_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('f.parent_id IN (:...ids)', { ids })
      .groupBy('f.parent_id')
      .getRawMany()
    for (const row of childRows) {
      childCounts.set(row.parent_id, Number(row.cnt))
    }

    // 条目数
    const entryRepo = this.dataSource.getRepository(DiaryEntryEntity)
    const entryRows = await entryRepo
      .createQueryBuilder('e')
      .select('e.folder_id', 'folder_id')
      .addSelect('COUNT(*)', 'cnt')
      .where('e.folder_id IN (:...ids)', { ids })
      .groupBy('e.folder_id')
      .getRawMany()
    for (const row of entryRows) {
      entryCounts.set(row.folder_id, Number(row.cnt))
    }

    return folders.map(f => ({
      ...this.toDto(f),
      childCount: childCounts.get(f.id) ?? 0,
      entryCount: entryCounts.get(f.id) ?? 0,
    }))
  }

  async findRootFolders(): Promise<DiaryFolder[]> {
    return this.findWithCounts('root')
  }

  async findChildren(parentId: string): Promise<DiaryFolder[]> {
    return this.findWithCounts({ parentId })
  }

  async findAll(): Promise<DiaryFolder[]> {
    // 用 scoped.qb 自动按 user_id 过滤
    const qb = this.scoped
      .qb('f')
      .orderBy('f.sort_order', 'ASC')
      .addOrderBy('f.created_at', 'DESC')
    const folders = await qb.getMany()
    if (folders.length === 0) return []

    const ids = folders.map(f => f.id)
    const childCounts = new Map<string, number>()
    const entryCounts = new Map<string, number>()

    const childRows = await this.scoped
      .qb('f')
      .select('f.parent_id', 'parent_id')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('f.parent_id IN (:...ids)', { ids })
      .groupBy('f.parent_id')
      .getRawMany()
    for (const row of childRows) {
      childCounts.set(row.parent_id, Number(row.cnt))
    }

    // 条目数：用 scopedFor(DiaryEntryEntity) 保证按 user_id 过滤
    const entryScoped = this.scopedFor(DiaryEntryEntity)
    const entryRows = await entryScoped
      .qb('e')
      .select('e.folder_id', 'folder_id')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('e.folder_id IN (:...ids)', { ids })
      .groupBy('e.folder_id')
      .getRawMany()
    for (const row of entryRows) {
      entryCounts.set(row.folder_id, Number(row.cnt))
    }

    return folders.map(f => ({
      ...this.toDto(f),
      childCount: childCounts.get(f.id) ?? 0,
      entryCount: entryCounts.get(f.id) ?? 0,
    }))
  }

  async findById(id: string): Promise<DiaryFolder | null> {
    const list = await this.findWithCounts({ id }, false)
    return list[0] ?? null
  }

  async findByPath(path: string): Promise<DiaryFolder | null> {
    const list = await this.findWithCounts({ path }, false)
    return list[0] ?? null
  }

  async existsByName(name: string, parentId?: string): Promise<boolean> {
    const where: any = parentId
      ? { name, parentId }
      : { name, parentId: IsNull() }
    return this.existsByWhere(where)
  }

  async create(
    request: CreateDiaryFolderRequest,
    fullPath: string,
  ): Promise<DiaryFolder> {
    const id = randomUUID()
    const now = new Date()
    const entity = this.repo.create({
      id,
      name: request.name,
      parentId: request.parentId ?? null,
      path: fullPath,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)
    return {
      ...this.toDto(saved),
      childCount: 0,
      entryCount: 0,
    }
  }

  async update(
    id: string,
    request: UpdateDiaryFolderRequest,
    newPath?: string,
  ): Promise<boolean> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return false

    let changed = false
    if (request.name !== undefined) {
      existing.name = request.name
      changed = true
    }
    if (request.sortOrder !== undefined) {
      existing.sortOrder = request.sortOrder
      changed = true
    }
    if (newPath !== undefined) {
      existing.path = newPath
      changed = true
    }

    if (!changed) return false

    existing.updatedAt = new Date()
    await this.scoped.save(existing)
    return true
  }

  async delete(id: string): Promise<boolean> {
    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async count(): Promise<number> {
    return this.scoped.count()
  }
}
