import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 领域学习「方案确认」Entity（dl_plan，2026-09-13 用户需求落地）
 *
 * 背景（用户实测「金融理财」）：首批知识点由模型一次性自由发挥生成，与用户诉求差别较大，
 * 且中途被额度掐断后无人察觉。用户拍板把「生成首批知识」固化成固定步骤：
 * 先对齐诉求（弹窗确认/指令调整）→ 再展示知识体系（可增删调序）→ 确认后才允许落库。
 *
 * 一空间每步保留**全部版本**（revision 递增）：draft=待确认、confirmed=已生效、superseded=被取代。
 * payload 为 JSON（understanding 见 DlPlanUnderstanding / syllabus 见 DlPlanSyllabus）。
 */
@Entity({ name: 'dl_plan' })
@Index('idx_dl_plan_user', ['userId'])
@Index('idx_dl_plan_step', ['projectId', 'step', 'revision'])
export class DlPlanEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /**
   * 关联概念 id（可空；2026-09-14 讲义流水线）。
   * space 级步骤（understanding/syllabus）为 NULL；`lesson`（讲义规格与区级计划）
   * **按概念各存一套**，故读取时按 (projectId, step, conceptId) 定位。
   */
  @Column({ name: 'concept_id', type: 'varchar', nullable: true })
  conceptId!: string | null

  /** understanding（诉求理解）| syllabus（知识体系）| lesson（讲义规格与区级计划） */
  @Column({ name: 'step', type: 'varchar' })
  step!: string

  /** draft | confirmed | superseded */
  @Column({ name: 'status', type: 'varchar', default: 'draft' })
  status!: string

  /** 版本号（同一步骤新提案 +1） */
  @Column({ name: 'revision', type: 'integer', default: 1 })
  revision!: number

  /** 方案载荷 JSON */
  @Column({ name: 'payload', type: 'text' })
  payload!: string

  /** 用户调整指令 / 确认备注 */
  @Column({ name: 'feedback', type: 'text', nullable: true })
  feedback!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
