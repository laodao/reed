/**
 * 知识库目录仓库（kb_folders）
 * @module core/database/repositories/kb-folder.repository
 * @description 目录 CRUD + 排序（多租户 scoped）。
 */
import type { DataSource, FindOptionsWhere } from 'typeorm'
import { randomUUID } from 'crypto'
import { KbFolderEntity } from '../entities/kb-folder.entity'
import { KnowledgeBaseEntity } from '../entities/knowledge-base.entity'
import { BaseRepository } from '../base-repository'

/** 目录 DTO */
export interface KbFolderRecord {
  id: string
  userId: string | null
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: Date | null
  updatedAt: Date | null
}

export interface CreateKbFolderInput {
  name: string
  parentId?: string | null
}

export class KbFolderRepository extends BaseRepository<KbFolderEntity, KbFolderRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbFolderEntity)
  }

  protected toDto(e: KbFolderEntity): KbFolderRecord {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      parentId: e.parentId ?? null,
      sortOrder: e.sortOrder ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  /** 全部目录（按创建时间升序 = 用户创建顺序） */
  async listAll(): Promise<KbFolderRecord[]> {
    return this.findManyByWhere({} as any, { createdAt: 'ASC' })
  }

  async findById(id: string): Promise<KbFolderRecord | null> {
    return this.findOneByWhere({ id } as any)
  }

  async create(data: CreateKbFolderInput): Promise<KbFolderRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: randomUUID(),
      userId: null, // BaseRepository 注入
      name: data.name,
      parentId: data.parentId ?? null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as Partial<KbFolderEntity>)
    return this.toDto(entity as KbFolderEntity)
  }

  async update(id: string, patch: { name?: string; parentId?: string | null }): Promise<KbFolderRecord | null> {
    const existing = await this.scoped.findOne({ id } as FindOptionsWhere<KbFolderEntity>)
    if (!existing) return null
    if (patch.name !== undefined) existing.name = patch.name
    if (patch.parentId !== undefined) existing.parentId = patch.parentId
    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)
    return this.toDto(saved)
  }

  async delete(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<KbFolderEntity>)
  }

  /** 目录下的知识库数量（删除目录时提示用） */
  async countKnowledgeBases(folderId: string): Promise<number> {
    return this.dataSource
      .getRepository(KnowledgeBaseEntity)
      .count({ where: { folderId } as FindOptionsWhere<KnowledgeBaseEntity> })
  }
}
