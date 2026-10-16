import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识大脑·书级过程工件（v4 整书结构化漏斗）
 *
 * 编年段梗概/卷梗概/名册快照/覆盖账本/审校报告等中间产物的统一存放处。
 * 纪律：成品归知识卡（kb_notes），过程归工件（本表）——工件不进知识卡列表、
 * 不进检索供给，只供产线上游→下游取材与诊断面板。
 * UNIQUE(document_id, artifact_key)：替换式更新，重消化不膨胀。
 */
@Entity({ name: 'kb_brain_artifacts' })
@Index('idx_kb_artifacts_document', ['documentId'])
@Index('idx_kb_artifacts_kb', ['knowledgeBaseId'])
export class KbBrainArtifactEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  @Column({ name: 'document_id', type: 'varchar' })
  documentId!: string

  /** 工件键（如 roster / chronicle:3 / volume:第一卷 / coverage / review:plot） */
  @Column({ name: 'artifact_key', type: 'varchar' })
  artifactKey!: string

  /** 内容指纹（输入变化检测；消费方廉价失效判断） */
  @Column({ name: 'content_hash', type: 'varchar', nullable: true })
  contentHash!: string | null

  /** 工件正文（JSON 或 markdown） */
  @Column({ name: 'body', type: 'text', nullable: true })
  body!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
