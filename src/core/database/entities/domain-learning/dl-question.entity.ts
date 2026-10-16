import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 领域学习追问/未解问题 Entity（dl_question，design-v3 §9）
 *
 * 右栏追问的持久化 + 未解问题队列（status='open' 即队列）。
 * answer_source 记录回答来自哪里（kb/讲义/概念图/ai_verified/新研究/未答），
 * 支撑"先验确认入图"与"答不上→新研究方向"两条人机协作路径。
 */
@Entity({ name: 'dl_question' })
@Index('idx_dl_question_user', ['userId'])
@Index('idx_dl_question_project_status', ['projectId', 'status'])
export class DlQuestionEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** 关联概念（可空：与具体概念无关的泛问） */
  @Column({ name: 'concept_id', type: 'varchar', nullable: true })
  conceptId!: string | null

  /** 用户问题原文 */
  @Column({ name: 'question', type: 'text' })
  question!: string

  /** 回答 markdown（未答时为空） */
  @Column({ name: 'answer_md', type: 'text', nullable: true })
  answerMd!: string | null

  /** kb | lesson | graph | ai_verified | new_research | unanswered */
  @Column({ name: 'answer_source', type: 'varchar', nullable: true })
  answerSource!: string | null

  /** open | answered | escalated | resolved（open = 未解队列） */
  @Column({ name: 'status', type: 'varchar', default: 'open' })
  status!: string

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'answered_at', type: Date, nullable: true })
  answeredAt!: Date | null
}
