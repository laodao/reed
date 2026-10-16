/**
 * QA 问答对仓库（D1 QA 知识库）
 * @module core/database/repositories/kb-qa-pair.repository
 * @description 普通 CRUD + 计数。向量写入/检索走 KbVectorRepository
 *              （chunkId 命名空间 `qa:<pairId>:<variantIndex>`）。
 */

import type { DataSource, FindOptionsWhere } from 'typeorm'
import { KbQaPairEntity } from '../entities/kb-qa-pair.entity'
import { BaseRepository } from '../base-repository'

/** QA 对 DTO（similarQuestions 已解析） */
export interface KbQaPairRecord {
  id: string
  knowledgeBaseId: string
  question: string
  answer: string
  similarQuestions: string[]
  createdAt: Date | null
  updatedAt: Date | null
}

export interface CreateQaPairInput {
  knowledgeBaseId: string
  question: string
  answer: string
  similarQuestions?: string[]
}

export interface UpdateQaPairInput {
  question?: string
  answer?: string
  similarQuestions?: string[]
}

export class KbQaPairRepository extends BaseRepository<KbQaPairEntity, KbQaPairRecord> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbQaPairEntity)
  }

  protected toDto(e: KbQaPairEntity): KbQaPairRecord {
    let similar: string[] = []
    if (e.similarQuestions) {
      try {
        const parsed = JSON.parse(e.similarQuestions)
        if (Array.isArray(parsed)) similar = parsed.filter(x => typeof x === 'string')
      } catch {
        // 损坏数据降级为空
      }
    }
    return {
      id: e.id,
      knowledgeBaseId: e.knowledgeBaseId,
      question: e.question,
      answer: e.answer,
      similarQuestions: similar,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }
  }

  async listByKnowledgeBaseId(knowledgeBaseId: string, keyword?: string): Promise<KbQaPairRecord[]> {
    const qb = this.scoped
      .qb('q')
      // 修复：此前误用未声明的 `{ kbId }` 简写（参数名是 knowledgeBaseId）→
      // 点击 QA tab 即抛 ReferenceError: kbId is not defined
      .where('q.knowledge_base_id = :kbId', { kbId: knowledgeBaseId })
      .orderBy('q.created_at', 'DESC')
    if (keyword?.trim()) {
      qb.andWhere('(LOWER(q.question) LIKE LOWER(:kw) OR LOWER(q.answer) LIKE LOWER(:kw))', {
        kw: `%${keyword.trim()}%`,
      })
    }
    const rows = await qb.getMany()
    return this.toDtoList(rows)
  }

  async findById(id: string): Promise<KbQaPairRecord | null> {
    const e = await this.scoped.findOne({ id } as FindOptionsWhere<KbQaPairEntity>)
    return e ? this.toDto(e) : null
  }

  async create(data: CreateQaPairInput): Promise<KbQaPairRecord> {
    const now = new Date()
    const entity = await this.scoped.save({
      id: this.generateId(),
      knowledgeBaseId: data.knowledgeBaseId,
      question: data.question,
      answer: data.answer,
      similarQuestions: data.similarQuestions?.length ? JSON.stringify(data.similarQuestions) : null,
      createdAt: now,
      updatedAt: now,
    } as Partial<KbQaPairEntity>)
    return this.toDto(entity as KbQaPairEntity)
  }

  async update(id: string, patch: UpdateQaPairInput): Promise<KbQaPairRecord | null> {
    const partial: Partial<KbQaPairEntity> = { updatedAt: new Date() }
    if (patch.question !== undefined) partial.question = patch.question
    if (patch.answer !== undefined) partial.answer = patch.answer
    if (patch.similarQuestions !== undefined) {
      partial.similarQuestions = patch.similarQuestions.length ? JSON.stringify(patch.similarQuestions) : null
    }
    await this.scoped.update({ id } as FindOptionsWhere<KbQaPairEntity>, partial)
    return this.findById(id)
  }

  async delete(id: string): Promise<number> {
    return this.scoped.delete({ id } as FindOptionsWhere<KbQaPairEntity>)
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    return this.scoped.delete({ knowledgeBaseId } as FindOptionsWhere<KbQaPairEntity>)
  }

  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    return this.scoped.count({ knowledgeBaseId } as FindOptionsWhere<KbQaPairEntity>)
  }
}
