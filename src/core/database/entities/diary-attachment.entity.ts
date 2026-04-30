import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 日记附件 Entity
 * 对齐 diary_attachments DDL（FK CASCADE 到 diary_entries）。
 */
@Entity({ name: 'diary_attachments' })
export class DiaryAttachmentEntity {
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

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date
}
