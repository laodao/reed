import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 翻译记录 Entity
 * 对齐 translations 表 DDL（Repo 内静态 initTable 创建）。
 */
@Entity({ name: 'translations' })
@Index('idx_translations_created_at', ['createdAt'])
@Index('idx_translations_type', ['type'])
@Index('idx_translations_favorite', ['favorite'])
export class TranslationEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'type', type: 'varchar' })
  type!: string

  @Column({ name: 'source_language', type: 'varchar' })
  sourceLanguage!: string

  @Column({ name: 'target_language', type: 'varchar' })
  targetLanguage!: string

  @Column({ name: 'source_text', type: 'text', nullable: true })
  sourceText!: string | null

  @Column({ name: 'target_text', type: 'text', nullable: true })
  targetText!: string | null

  @Column({ name: 'source_file', type: 'text', nullable: true })
  sourceFile!: string | null

  @Column({ name: 'source_file_name', type: 'text', nullable: true })
  sourceFileName!: string | null

  @Column({ name: 'target_file', type: 'text', nullable: true })
  targetFile!: string | null

  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string

  @Column({ name: 'favorite', type: 'integer', default: 0 })
  favorite!: number

  @Column({ name: 'word_count', type: 'integer', default: 0 })
  wordCount!: number

  @Column({ name: 'provider_id', type: 'text', nullable: true })
  providerId!: string | null

  @Column({ name: 'model_id', type: 'text', nullable: true })
  modelId!: string | null

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null

  /**
   * 现有 DDL 是 TEXT NOT NULL（ISO 字符串），与一般 datetime 列不同。
   * Entity 用 'text' 类型保持跨方言一致；Repository 转换为 Date 输出 DTO。
   */
  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string
}
