/**
 * 参考视频解析实体（spec 2026-05-09 ep-redesign §3.2 D5 · P-22）
 * @module core/database/entities/episode-production/reference-video-analysis
 *
 * 用户上传参考视频 → AI 拆分镜骨架。本实体记录一次解析的完整结果。
 * shots JSON 存 ParsedShot[]（每个 shot 含 shotType / cameraAngle / cameraMovement /
 * durationSec / frameDescription / detectedDialogue 等）。
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

export interface ParsedShot {
  shotIndex: number
  startSec: number
  endSec: number
  durationSec: number
  shotType: string
  cameraAngle: string
  cameraMovement: string
  frameDescription: string
  emotion: string
  representativeFramePath: string  // 切片到 temp 目录的代表帧
  detectedDialogue: string | null
}

@Entity({ name: 'reference_video_analyses' })
@Index('idx_rva_user', ['userId'])
export class ReferenceVideoAnalysisEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @Column({ name: 'video_path', type: 'text' })
  videoPath!: string

  @Column({ name: 'video_duration_sec', type: 'real', nullable: true })
  videoDurationSec!: number | null

  @Column({ name: 'status', type: 'varchar' })
  status!: 'pending' | 'analyzing' | 'ready' | 'failed'

  /** ParsedShot[] JSON */
  @Column({ name: 'shots', type: 'simple-json', nullable: true })
  shots!: ParsedShot[] | null

  /** 失败错误信息 / 进度等 */
  @Column({ name: 'metadata', type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null

  @Column({ name: 'created_at', type: 'bigint' })
  createdAt!: number

  @Column({ name: 'updated_at', type: 'bigint' })
  updatedAt!: number
}
