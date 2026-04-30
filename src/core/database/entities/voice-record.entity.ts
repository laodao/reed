import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 语音记录 Entity
 * 对齐 voice_records 表 DDL（Repo 内静态 initTable 创建）。
 * created_at 是 TEXT NOT NULL（ISO 字符串）。
 */
@Entity({ name: 'voice_records' })
@Index('idx_voice_records_created_at', ['createdAt'])
@Index('idx_voice_records_type', ['type'])
@Index('idx_voice_records_favorite', ['favorite'])
export class VoiceRecordEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'type', type: 'varchar' })
  type!: string

  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string

  @Column({ name: 'input_text', type: 'text', nullable: true })
  inputText!: string | null

  @Column({ name: 'output_audio_path', type: 'text', nullable: true })
  outputAudioPath!: string | null

  @Column({ name: 'voice_id', type: 'text', nullable: true })
  voiceId!: string | null

  @Column({ name: 'voice_name', type: 'text', nullable: true })
  voiceName!: string | null

  @Column({ name: 'language', type: 'text', nullable: true })
  language!: string | null

  @Column({ name: 'speed', type: 'real', default: 1.0 })
  speed!: number

  @Column({ name: 'pitch', type: 'real', default: 0 })
  pitch!: number

  @Column({ name: 'volume', type: 'real', default: 1.0 })
  volume!: number

  @Column({ name: 'emotion', type: 'text', nullable: true })
  emotion!: string | null

  @Column({ name: 'style', type: 'text', nullable: true })
  style!: string | null

  @Column({ name: 'duration', type: 'integer', nullable: true })
  duration!: number | null

  @Column({ name: 'input_audio_path', type: 'text', nullable: true })
  inputAudioPath!: string | null

  @Column({ name: 'output_text', type: 'text', nullable: true })
  outputText!: string | null

  @Column({ name: 'provider_id', type: 'text', nullable: true })
  providerId!: string | null

  @Column({ name: 'model_id', type: 'text', nullable: true })
  modelId!: string | null

  @Column({ name: 'favorite', type: 'integer', default: 0 })
  favorite!: number

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null

  @Column({ name: 'created_at', type: 'text' })
  createdAt!: string
}
