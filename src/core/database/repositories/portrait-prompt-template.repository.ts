/**
 * 人像提示词模板数据访问层
 * @module database/repositories/portrait-prompt-template.repository
 * @description 基于 TypeORM 实现，支持 sqlite / postgres 双方言。
 *              所有读写都走 BaseRepository.scoped.* 实现 user_id 多租户隔离。
 */

import type { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { BaseRepository } from '../base-repository'
import { PortraitPromptTemplateEntity } from '../entities/portrait-prompt-template.entity'
import type {
  PortraitPromptTemplate,
  PromptTemplateCategory,
  PortraitGenerationScene,
} from '@shared/types/portrait.types'

interface CreateTemplateInput {
  name: string
  category: PromptTemplateCategory
  content: string
  applyTo: PortraitGenerationScene[]
  builtin?: boolean
  sortOrder?: number
}

export class PortraitPromptTemplateRepository extends BaseRepository<
  PortraitPromptTemplateEntity,
  PortraitPromptTemplate
> {
  constructor(dataSource: DataSource) {
    super(dataSource, PortraitPromptTemplateEntity)
  }

  private toEpochMs(v: Date | number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    return new Date(v).getTime()
  }

  protected toDto(e: PortraitPromptTemplateEntity): PortraitPromptTemplate {
    return {
      id: e.id,
      name: e.name,
      category: e.category as PromptTemplateCategory,
      content: e.content,
      applyTo: (e.applyTo ?? []) as PortraitGenerationScene[],
      builtin: !!e.builtin,
      sortOrder: e.sortOrder ?? 0,
      createdAt: this.toEpochMs(e.createdAt),
      updatedAt: this.toEpochMs(e.updatedAt),
    }
  }

  async list(category?: PromptTemplateCategory): Promise<PortraitPromptTemplate[]> {
    const es = await this.scoped.find({
      where: (category ? { category } : {}) as Record<string, unknown>,
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    } as Parameters<typeof this.scoped.find>[0])
    return es.map((e) => this.toDto(e))
  }

  async getById(id: string): Promise<PortraitPromptTemplate | null> {
    const e = await this.scoped.findOne({ id } as Record<string, unknown>)
    return e ? this.toDto(e) : null
  }

  async findByName(name: string): Promise<PortraitPromptTemplate | null> {
    const e = await this.scoped.findOne({ name } as Record<string, unknown>)
    return e ? this.toDto(e) : null
  }

  async create(input: CreateTemplateInput): Promise<PortraitPromptTemplate> {
    const now = new Date()
    const saved = await this.scoped.save({
      id: randomUUID(),
      name: input.name,
      category: input.category,
      content: input.content,
      applyTo: input.applyTo,
      builtin: input.builtin ?? false,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    } as Partial<PortraitPromptTemplateEntity>)
    return this.toDto(saved)
  }

  async update(
    id: string,
    patch: Partial<CreateTemplateInput>,
  ): Promise<PortraitPromptTemplate | null> {
    await this.scoped.update(
      { id } as Record<string, unknown>,
      { ...patch, updatedAt: new Date() } as Partial<PortraitPromptTemplateEntity>,
    )
    return this.getById(id)
  }

  async remove(id: string): Promise<void> {
    await this.scoped.delete({ id } as Record<string, unknown>)
  }
}
