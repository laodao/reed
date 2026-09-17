import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识大脑·卡片 Entity（kb_notes，详细设计 §1.4）
 *
 * L3 卡片层统一实体：思想卡（methodology/insight/synthesis）+ 模式卡
 * （plot-pattern/setting-pattern：骨架+参数槽+变体登记）+ 视角卡（lens：
 * 注意力框架，驱动视角遍重萃取）。AI 产物一律 proposed 起步、人批准才
 * published（Tana proposal 模型）；同题演进靠 version 递增（evergreen）。
 */

export type KbNoteType =
  | 'methodology'
  | 'insight'
  | 'synthesis'
  | 'plot-pattern'
  | 'setting-pattern'
  | 'lens'
  | 'skill-seed'

export type KbNoteStatus = 'proposed' | 'draft' | 'published' | 'archived'

export type KbNoteOrigin = 'ai-distill' | 'human' | 'import'

@Entity({ name: 'kb_notes' })
@Index('idx_kb_notes_kb_type_status', ['knowledgeBaseId', 'type', 'status'])
@Index('idx_kb_notes_kb_status', ['knowledgeBaseId', 'status'])
export class KbNoteEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  /** 论断式标题（"标题即 API"）；视角卡标题=视角名 */
  @Column({ name: 'title', type: 'text' })
  title!: string

  /** 「何时用我」——agent 路由接口（第三人称 ≤200 字，含触发场景与边界） */
  @Column({ name: 'description', type: 'text' })
  description!: string

  /** markdown 正文（人读层） */
  @Column({ name: 'body', type: 'text', default: '' })
  body!: string

  @Column({ name: 'type', type: 'varchar' })
  type!: KbNoteType

  @Column({ name: 'status', type: 'varchar', default: 'proposed' })
  status!: KbNoteStatus

  /** 证据锚点 JSON：[{atomId?,noteId?,quote?,documentId?}]（防幻觉根） */
  @Column({ name: 'evidence', type: 'text', default: '[]' })
  evidence!: string

  @Column({ name: 'origin', type: 'varchar', default: 'ai-distill' })
  origin!: KbNoteOrigin

  /** 同题演进版本（卡片被改写而非堆积） */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number

  /** 模式卡：骨架（阶段/规则序列）+ 参数槽定义（JSON） */
  @Column({ name: 'pattern_skeleton', type: 'text', nullable: true })
  patternSkeleton!: string | null

  /** 模式卡：实例登记 [{documentId,参数取值,变形说明,evidenceAtomIds[]}]（JSON） */
  @Column({ name: 'pattern_instances', type: 'text', nullable: true })
  patternInstances!: string | null

  /** 视角卡：注意力框架 {attendTo:[],questions:[]}（JSON；视角遍 prompt 素材） */
  @Column({ name: 'lens_attention', type: 'text', nullable: true })
  lensAttention!: string | null

  /** 经典性（浮现式判定=实例数×引用×收藏，P4 周期重算） */
  @Column({ name: 'classic_score', type: 'float', default: 0 })
  classicScore!: number

  /** 同题改版血缘：archived 的旧版指向新版本 */
  @Column({ name: 'superseded_note_id', type: 'varchar', nullable: true })
  supersededNoteId!: string | null

  /** 标签 JSON 数组 */
  @Column({ name: 'tags', type: 'text', default: '[]' })
  tags!: string

  /* ---- 学习模式（库开启 learning 才激活；FSRS 当前态缓存，评分历史在 kb_note_reviews）---- */

  @Column({ name: 'fsrs_stability', type: 'float', nullable: true })
  fsrsStability!: number | null

  @Column({ name: 'fsrs_difficulty', type: 'float', nullable: true })
  fsrsDifficulty!: number | null

  @Column({ name: 'last_review_at', type: 'datetime', nullable: true })
  lastReviewAt!: Date | null

  @Column({ name: 'review_count', type: 'integer', default: 0 })
  reviewCount!: number

  @Column({ name: 'lapse_count', type: 'integer', default: 0 })
  lapseCount!: number

  /* ---- 使用信号（创作引用计数——代谢晋升/衰减与消化率仪表的数据源）---- */

  @Column({ name: 'cited_count', type: 'integer', default: 0 })
  citedCount!: number

  @Column({ name: 'last_cited_at', type: 'datetime', nullable: true })
  lastCitedAt!: Date | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
