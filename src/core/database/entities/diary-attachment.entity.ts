import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 日记附件 Entity
 * 对齐 diary_attachments DDL（FK CASCADE 到 diary_entries）。
 */
@Entity({ name: 'diary_attachments' })
export class DiaryAttachmentEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端 web-server 在请求上下文里通过 ALS 注入；
   * Electron 端单用户场景为 null。BaseRepository 会在所有查询/写入前注入 WHERE user_id 与默认 user_id。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'entry_id', type: 'varchar' })
  entryId!: string

  @Column({ name: 'file_name', type: 'varchar' })
  fileName!: string

  @Column({ name: 'file_path', type: 'text' })
  filePath!: string

  @Column({ name: 'file_size', type: 'integer', nullable: true })
  fileSize!: number | null

  @Column({ name: 'mime_type', type: 'text', nullable: true })
  mimeType!: string | null

  /** 视觉模型生成的中文描述（best-effort，可为 NULL）；写进 markdown alt text 作检索上下文 */
  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date
}
