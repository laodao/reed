import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 设计声音 Entity
 * 对齐 designed_voices 表 DDL。
 * created_at 是 TEXT NOT NULL（ISO 字符串），updated_at 是 TEXT（可空）。
 *
 * 与 ClonedVoiceEntity 类似，但存储 voice_prompt（声音描述）而非 sample_audio_path。
 */
@Entity({ name: 'designed_voices' })
@Index('idx_designed_voices_status', ['status'])
@Index('idx_designed_voices_created_at', ['createdAt'])
export class DesignedVoiceEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 声音描述文本（最多 500 字符）*/
  @Column({ name: 'voice_prompt', type: 'text' })
  voicePrompt!: string

  @Column({ name: 'status', type: 'varchar', default: 'training' })
  status!: string

  /** 服务商返回的声音 ID */
  @Column({ name: 'voice_id', type: 'text', nullable: true })
  voiceId!: string | null

  /** 目标 TTS 模型 */
  @Column({ name: 'target_model', type: 'text', nullable: true })
  targetModel!: string | null

  /** 前缀标识（1-10 小写字母数字）*/
  @Column({ name: 'prefix', type: 'text', nullable: true })
  prefix!: string | null

  /** 本地预览音频路径（相对路径）*/
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