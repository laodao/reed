/**
 * 倒排索引数据访问层
 * @module database/repositories/kb-inverted-index.repository
 * @description 基于 TypeORM 实现，所有方法异步。
 */

import { In, type DataSource } from 'typeorm'
import { KbInvertedIndexEntity } from '../entities/kb-inverted-index.entity'
import { KbChunkEntity } from '../entities/kb-chunk.entity'
import { BaseRepository } from '../base-repository'

interface InvertedIndexItem {
  id: number
  term: string
  chunkId: string
  knowledgeBaseId: string
  termFrequency: number
  positions?: number[]
}

interface UpsertInput {
  term: string
  chunkId: string
  knowledgeBaseId: string
  termFrequency: number
  positions?: number[]
}

export class KbInvertedIndexRepository extends BaseRepository<
  KbInvertedIndexEntity,
  InvertedIndexItem
> {
  constructor(dataSource: DataSource) {
    super(dataSource, KbInvertedIndexEntity)
  }

  protected toDto(e: KbInvertedIndexEntity): InvertedIndexItem {
    return {
      id: e.id,
      term: e.term,
      chunkId: e.chunkId,
      knowledgeBaseId: e.knowledgeBaseId,
      termFrequency: e.termFrequency,
      positions: e.positions ? (JSON.parse(e.positions) as number[]) : undefined,
    }
  }

  /**
   * 模拟 INSERT OR REPLACE：unique(term, chunk_id) 命中则更新；否则插入。
   */
  async upsert(data: UpsertInput): Promise<void> {
    const positionsJson = data.positions ? JSON.stringify(data.positions) : null
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(KbInvertedIndexEntity)
      const existing = await repo.findOne({
        where: { term: data.term, chunkId: data.chunkId } as any,
      })
      if (existing) {
        existing.knowledgeBaseId = data.knowledgeBaseId
        existing.termFrequency = data.termFrequency
        existing.positions = positionsJson
        await repo.save(existing)
      } else {
        await repo.save(
          repo.create({
            term: data.term,
            chunkId: data.chunkId,
            knowledgeBaseId: data.knowledgeBaseId,
            termFrequency: data.termFrequency,
            positions: positionsJson,
          }),
        )
      }
    })
  }

  async insertBatch(items: UpsertInput[]): Promise<void> {
    if (items.length === 0) return
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(KbInvertedIndexEntity)
      for (const item of items) {
        const positionsJson = item.positions
          ? JSON.stringify(item.positions)
          : null
        const existing = await repo.findOne({
          where: { term: item.term, chunkId: item.chunkId } as any,
        })
        if (existing) {
          existing.knowledgeBaseId = item.knowledgeBaseId
          existing.termFrequency = item.termFrequency
          existing.positions = positionsJson
          await repo.save(existing)
        } else {
          await repo.save(
            repo.create({
              term: item.term,
              chunkId: item.chunkId,
              knowledgeBaseId: item.knowledgeBaseId,
              termFrequency: item.termFrequency,
              positions: positionsJson,
            }),
          )
        }
      }
    })
  }

  async findByTerm(
    knowledgeBaseId: string,
    term: string,
  ): Promise<InvertedIndexItem[]> {
    const entities = await this.scoped.find({
      where: { knowledgeBaseId, term } as any,
    })
    return this.toDtoList(entities)
  }

  async findByTerms(
    knowledgeBaseId: string,
    terms: string[],
  ): Promise<Map<string, InvertedIndexItem[]>> {
    if (terms.length === 0) return new Map()
    const entities = await this.scoped.find({
      where: { knowledgeBaseId, term: In(terms) } as any,
    })
    const result = new Map<string, InvertedIndexItem[]>()
    for (const e of entities) {
      const item = this.toDto(e)
      const existing = result.get(item.term) || []
      existing.push(item)
      result.set(item.term, existing)
    }
    return result
  }

  async deleteByChunkId(chunkId: string): Promise<void> {
    await this.scoped.delete({ chunkId } as any)
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    // SELECT chunk ids of document, then delete by IN
    const chunkRepo = this.dataSource.getRepository(KbChunkEntity)
    const chunks = await chunkRepo.find({
      where: { documentId } as any,
      select: ['id'],
    })
    if (chunks.length === 0) return
    await this.repo
      .createQueryBuilder()
      .delete()
      .from(KbInvertedIndexEntity)
      .where('chunk_id IN (:...ids)', { ids: chunks.map(c => c.id) })
      .execute()
  }

  async deleteByKnowledgeBaseId(knowledgeBaseId: string): Promise<void> {
    await this.scoped.delete({ knowledgeBaseId } as any)
  }

  async getDocumentFrequencies(
    knowledgeBaseId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('i')
      .select('i.term', 'term')
      .addSelect('COUNT(DISTINCT i.chunk_id)', 'df')
      .where('i.knowledge_base_id = :kbId', { kbId: knowledgeBaseId })
      .groupBy('i.term')
      .getRawMany()

    const result = new Map<string, number>()
    for (const row of rows) {
      result.set(row.term, Number(row.df))
    }
    return result
  }

  async getChunkCount(knowledgeBaseId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('i')
      .select('COUNT(DISTINCT i.chunk_id)', 'count')
      .where('i.knowledge_base_id = :kbId', { kbId: knowledgeBaseId })
      .getRawOne()
    return Number(row?.count) || 0
  }

  async getAverageChunkLength(knowledgeBaseId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('i')
      .select('SUM(i.term_frequency)', 'total_terms')
      .addSelect('COUNT(DISTINCT i.chunk_id)', 'chunk_count')
      .where('i.knowledge_base_id = :kbId', { kbId: knowledgeBaseId })
      .getRawOne()
    if (!row || Number(row.chunk_count) === 0) return 0
    return Number(row.total_terms) / Number(row.chunk_count)
  }
}
