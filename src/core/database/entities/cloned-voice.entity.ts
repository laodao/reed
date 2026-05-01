import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 复刻声音 Entity
 * 对齐 cloned_voices 表 DDL。
 * created_at 是 TEXT NOT NULL（ISO 字符串），updated_at 是 TEXT（可空）。
 */
@Entity({ name: 'cloned_voices' })
@Index('idx_cloned_voices_status', ['status'])
@Index('idx_cloned_voices_created_at', ['createdAt'])
export class ClonedVoiceEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'status', type: 'varchar', default: 'training' })
  status!: string

  @Column({ name: 'sample_audio_path', type: 'text', nullable: true })
  sampleAudioPath!: string | null

  @Column({ name: 'sample_duration', type: 'integer', nullable: true })
  sampleDuration!: number | null

  @Column({ name: 'voice_id', type: 'text', nullable: true })
  voiceId!: string | null

  @Column({ name: 'preview_audio_path', type: 'text', nullable: true })
  previewAudioPath!: string | null

  @Column({ name: 'provider_id', type: 'text', nullable: true })
  providerId!: string | null

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string

  @Column({ name: 'updated_at', type: 'text', nullable: true })
  updatedAt!: string | null
}
