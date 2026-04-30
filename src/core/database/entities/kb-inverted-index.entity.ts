import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * 倒排索引 Entity
 * 对齐 kb_inverted_index DDL：
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,    -- 自增主键（与其他 Entity 不同）
 *   term TEXT NOT NULL, chunk_id TEXT NOT NULL,
 *   knowledge_base_id TEXT NOT NULL,
 *   term_frequency INTEGER DEFAULT 1,
 *   positions TEXT,
 *   UNIQUE(term, chunk_id)
 */
@Entity({ name: 'kb_inverted_index' })
@Index('idx_kb_inverted_index_term', ['term'])
@Index('idx_kb_inverted_index_chunk_id', ['chunkId'])
@Unique('idx_kb_inverted_index_unique', ['term', 'chunkId'])
export class KbInvertedIndexEntity {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number

  @Column({ name: 'term', type: 'text' })
  term!: string

  @Column({ name: 'chunk_id', type: 'text' })
  chunkId!: string

  @Column({ name: 'knowledge_base_id', type: 'text' })
  knowledgeBaseId!: string

  @Column({ name: 'term_frequency', type: 'integer', default: 1 })
  termFrequency!: number

  /** positions 存为 TEXT/JSON 字符串 */
  @Column({ name: 'positions', type: 'text', nullable: true })
  positions!: string | null
}
