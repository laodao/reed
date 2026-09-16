/**
 * 长文写作大纲仓库
 * @module database/repositories/lw-outline.repository
 * @description 基于 TypeORM 实现，所有方法异步。含树形结构 + 3 个关联子表。
 */

import { type DataSource } from 'typeorm'
import {
  StoryOutline,
  CreateOutlineRequest,
  UpdateOutlineRequest,
} from '@shared/types/longwriting.types'
import { LwOutlineEntity } from '../entities/lw-outline.entity'
import { LwOutlineCharacterRepository } from './lw-outline-character.repository'
import { LwOutlineLocationRepository } from './lw-outline-location.repository'
import { LwOutlineItemRepository } from './lw-outline-item.repository'
import { BaseRepository } from '../base-repository'

export class LwOutlineRepository extends BaseRepository<
  LwOutlineEntity,
  StoryOutline
> {
  private outlineCharacterRepo: LwOutlineCharacterRepository
  private outlineLocationRepo: LwOutlineLocationRepository
  private outlineItemRepo: LwOutlineItemRepository

  constructor(dataSource: DataSource) {
    super(dataSource, LwOutlineEntity)
    this.outlineCharacterRepo = new LwOutlineCharacterRepository(dataSource)
    this.outlineLocationRepo = new LwOutlineLocationRepository(dataSource)
    this.outlineItemRepo = new LwOutlineItemRepository(dataSource)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: LwOutlineEntity): StoryOutline {
    return {
      id: e.id,
      projectId: e.projectId,
      parentId: e.parentId ?? undefined,
      name: e.name,
      level: e.level,
      nodeType: e.nodeType as StoryOutline['nodeType'],
      summary: e.summary ?? '',
      involvedCharacters: ((e.involvedCharacters as string[] | null) ?? []) as string[],
      involvedLocations: ((e.involvedLocations as string[] | null) ?? []) as string[],
      involvedItems: ((e.involvedItems as string[] | null) ?? []) as string[],
      status: e.status as StoryOutline['status'],
      designStatus: (e.designStatus ?? undefined) as StoryOutline['designStatus'],
      estimatedWords: e.estimatedWords ?? 0,
      orderIndex: e.orderIndex ?? 0,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    } as StoryOutline
  }

  async getByProjectId(projectId: string): Promise<StoryOutline[]> {
    const entities = await this.repo
      .createQueryBuilder('o')
      .where('o.project_id = :pid', { pid: projectId })
      .orderBy('o.order_index', 'ASC')
      .addOrderBy('o.created_at', 'ASC')
      .getMany()
    return this.toDtoList(entities)
  }

  async getTreeByProjectId(projectId: string): Promise<StoryOutline[]> {
    const all = await this.getByProjectId(projectId)
    return this.buildTree(all)
  }

  async getById(id: string): Promise<StoryOutline | null> {
    return this.findOneByWhere({ id } as any)
  }

  async getChildren(parentId: string): Promise<StoryOutline[]> {
    return this.findManyByWhere({ parentId } as any, { orderIndex: 'ASC' })
  }

  async create(data: CreateOutlineRequest): Promise<StoryOutline> {
    const id = this.generateId()
    const now = new Date()
    const level = data.parentId ? await this.calculateLevel(data.parentId) : 1
    const orderIndex = await this.getNextOrderIndex(data.projectId, data.parentId ?? null)

    const entity = this.repo.create({
      id,
      projectId: data.projectId,
      parentId: data.parentId ?? null,
      name: data.name,
      level,
      nodeType: data.nodeType,
      summary: data.summary ?? '',
      involvedCharacters: data.involvedCharacters || [],
      involvedLocations: data.involvedLocations || [],
      involvedItems: data.involvedItems || [],
      status: 'pending',
      estimatedWords: data.estimatedWords ?? 0,
      orderIndex,
      createdAt: now,
      updatedAt: now,
    })
    const saved = await this.scoped.save(entity)

    if (data.involvedCharacters?.length) {
      await this.outlineCharacterRepo.batchAdd(id, data.involvedCharacters)
    }
    if (data.involvedLocations?.length) {
      await this.outlineLocationRepo.batchAdd(id, data.involvedLocations)
    }
    if (data.involvedItems?.length) {
      await this.outlineItemRepo.batchAdd(id, data.involvedItems)
    }

    return this.toDto(saved)
  }

  async update(
    id: string,
    data: UpdateOutlineRequest,
  ): Promise<StoryOutline | null> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return null

    let changed = false
    if (data.name !== undefined) { existing.name = data.name; changed = true }
    if (data.summary !== undefined) { existing.summary = data.summary; changed = true }
    if (data.involvedCharacters !== undefined) {
      existing.involvedCharacters = data.involvedCharacters
      changed = true
    }
    if (data.involvedLocations !== undefined) {
      existing.involvedLocations = data.involvedLocations
      changed = true
    }
    if (data.involvedItems !== undefined) {
      existing.involvedItems = data.involvedItems
      changed = true
    }
    if (data.status !== undefined) { existing.status = data.status; changed = true }
    if (data.estimatedWords !== undefined) { existing.estimatedWords = data.estimatedWords; changed = true }

    if (!changed) return this.toDto(existing)

    existing.updatedAt = new Date()
    const saved = await this.scoped.save(existing)

    if (data.involvedCharacters !== undefined) {
      await this.outlineCharacterRepo.replaceAll(id, data.involvedCharacters)
    }
    if (data.involvedLocations !== undefined) {
      await this.outlineLocationRepo.replaceAll(id, data.involvedLocations)
    }
    if (data.involvedItems !== undefined) {
      await this.outlineItemRepo.replaceAll(id, data.involvedItems)
    }

    return this.toDto(saved)
  }

  async updateOrder(id: string, orderIndex: number): Promise<boolean> {
    const affected = await this.scoped.update({ id } as any, {
      orderIndex,
      updatedAt: new Date(),
    })
    return affected > 0
  }

  /** 设计锁级别流转（2026-09-16 结构化设定 M1）：coarse→detailed（卷设计确认）/→locked（章节落稿，W1 写入） */
  async updateDesignStatus(id: string, designStatus: 'coarse' | 'detailed' | 'locked' | null): Promise<boolean> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return false
    existing.designStatus = designStatus
    existing.updatedAt = new Date()
    await this.scoped.save(existing)
    return true
  }

  /** 按设计锁级别查卷节点（W2 扩展/结算流用） */
  async listByDesignStatus(projectId: string, designStatus: 'coarse' | 'detailed' | 'locked'): Promise<StoryOutline[]> {
    const rows = await this.scoped.find({ where: { projectId, designStatus } as any })
    return this.toDtoList(rows)
  }

  async moveTo(id: string, newParentId: string | null): Promise<boolean> {
    const existing = await this.scoped.findOne({ id } as any)
    if (!existing) return false
    const newLevel = newParentId ? (await this.calculateLevel(newParentId)) + 1 : 1
    const newOrderIndex = await this.getNextOrderIndex(
      existing.projectId,
      newParentId,
    )
    const affected = await this.scoped.update({ id } as any, {
      parentId: newParentId,
      level: newLevel,
      orderIndex: newOrderIndex,
      updatedAt: new Date(),
    })
    return affected > 0
  }

  async delete(id: string): Promise<boolean> {
    // 递归删除子节点
    const children = await this.scoped.find({
      where: { parentId: id } as any,
      select: ['id'],
    })
    for (const c of children) {
      await this.delete(c.id)
    }

    await this.outlineCharacterRepo.deleteByOutlineId(id)
    await this.outlineLocationRepo.deleteByOutlineId(id)
    await this.outlineItemRepo.deleteByOutlineId(id)

    const affected = await this.scoped.delete({ id } as any)
    return affected > 0
  }

  async getCharacterIds(outlineId: string): Promise<string[]> {
    return this.outlineCharacterRepo.getCharacterIdsByOutlineId(outlineId)
  }

  async getLocationIds(outlineId: string): Promise<string[]> {
    return this.outlineLocationRepo.getLocationIdsByOutlineId(outlineId)
  }

  async getItemIds(outlineId: string): Promise<string[]> {
    return this.outlineItemRepo.getItemIdsByOutlineId(outlineId)
  }

  async updateCharacterRelations(
    outlineId: string,
    characterIds: string[],
  ): Promise<void> {
    await this.outlineCharacterRepo.replaceAll(outlineId, characterIds)
  }

  async updateLocationRelations(
    outlineId: string,
    locationIds: string[],
  ): Promise<void> {
    await this.outlineLocationRepo.replaceAll(outlineId, locationIds)
  }

  async updateItemRelations(
    outlineId: string,
    itemIds: string[],
  ): Promise<void> {
    await this.outlineItemRepo.replaceAll(outlineId, itemIds)
  }

  async getCharacterIdsByOutlineIds(
    outlineIds: string[],
  ): Promise<Map<string, string[]>> {
    return this.outlineCharacterRepo.getCharacterIdsByOutlineIds(outlineIds)
  }

  async getLocationIdsByOutlineIds(
    outlineIds: string[],
  ): Promise<Map<string, string[]>> {
    return this.outlineLocationRepo.getLocationIdsByOutlineIds(outlineIds)
  }

  async getItemIdsByOutlineIds(
    outlineIds: string[],
  ): Promise<Map<string, string[]>> {
    return this.outlineItemRepo.getItemIdsByOutlineIds(outlineIds)
  }

  async migrateToRelationTables(
    projectId: string,
  ): Promise<{ characters: number; locations: number }> {
    const characters = await this.outlineCharacterRepo.migrateFromJson(projectId)
    const locations = await this.outlineLocationRepo.migrateFromJson(projectId)
    return { characters, locations }
  }

  private async calculateLevel(parentId: string): Promise<number> {
    const parent = await this.scoped.findOne({ id: parentId } as any)
    return parent ? parent.level : 0
  }

  private async getNextOrderIndex(
    projectId: string,
    parentId: string | null,
  ): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('o')
      .select('MAX(o.order_index)', 'max')
      .where(parentId
        ? 'o.project_id = :pid AND o.parent_id = :ppid'
        : 'o.project_id = :pid AND o.parent_id IS NULL',
        { pid: projectId, ppid: parentId })
      .getRawOne()
    return (Number(row?.max) || 0) + 1
  }

  private buildTree(nodes: StoryOutline[]): StoryOutline[] {
    const nodeMap = new Map<string, StoryOutline & { children?: StoryOutline[] }>()
    const rootNodes: StoryOutline[] = []
    for (const node of nodes) {
      nodeMap.set(node.id, { ...node, children: [] } as any)
    }
    for (const node of nodes) {
      const current = nodeMap.get(node.id)!
      if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!
        if (!parent.children) parent.children = []
        parent.children.push(current)
      } else {
        rootNodes.push(current)
      }
    }
    return rootNodes
  }

  private generateId(): string {
    return `outline_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }
}
