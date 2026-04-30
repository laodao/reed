import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 图像 Entity
 * 对齐 images 表 DDL（FK CASCADE 到 dialogs/messages）。
 */
@Entity({ name: 'images' })
export class ImageEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'dialog_id', type: 'text', nullable: true })
  dialogId!: string | null

  @Column({ name: 'message_id', type: 'text', nullable: true })
  messageId!: string | null

  @Column({ name: 'file_path', type: 'text' })
  filePath!: string

  @Column({ name: 'file_name', type: 'text', nullable: true })
  fileName!: string | null

  @Column({ name: 'file_size', type: 'integer', nullable: true })
  fileSize!: number | null

  @Column({ name: 'mime_type', type: 'text', nullable: true })
  mimeType!: string | null

  @Column({ name: 'width', type: 'integer', nullable: true })
  width!: number | null

  @Column({ name: 'height', type: 'integer', nullable: true })
  height!: number | null

  @Column({ name: 'prompt', type: 'text', nullable: true })
  prompt!: string | null

  @Column({ name: 'negative_prompt', type: 'text', nullable: true })
  negativePrompt!: string | null

  @Column({ name: 'style', type: 'text', nullable: true })
  style!: string | null

  @Column({ name: 'quality', type: 'text', nullable: true })
  quality!: string | null

  @Column({ name: 'provider_id', type: 'text', nullable: true })
  providerId!: string | null

  @Column({ name: 'model_id', type: 'text', nullable: true })
  modelId!: string | null

  @Column({ name: 'generation_params', type: 'simple-json', nullable: true })
  generationParams!: Record<string, unknown> | null

  @Column({ name: 'seed', type: 'integer', nullable: true })
  seed!: number | null

  @Column({ name: 'task_id', type: 'text', nullable: true })
  taskId!: string | null

  @Column({ name: 'status', type: 'varchar', default: 'completed' })
  status!: string

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null

  @Column({ name: 'favorite', type: 'integer', default: 0 })
  favorite!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date
}
