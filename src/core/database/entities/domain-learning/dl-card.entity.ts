import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 领域学习概念讲义 Entity（dl_card，design-v3 §9 + content-template-design v4 §3）
 *
 * 一概念至多一篇当前版（version 递增，旧版可留档）。内容为块化结构：
 * sections（模板区集）+ works（相关著作），见 content-template-design v4。
 * content_md 由 sections 派生（兼容/导出用）。
 */
@Entity({ name: 'dl_card' })
@Index('idx_dl_card_user', ['userId'])
@Index('idx_dl_card_concept', ['projectId', 'conceptId'])
export class DlCardEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'concept_id', type: 'varchar' })
  conceptId!: string

  /** 知识本质类型：K-concept | K-oper | K-stmt | K-inst | K-agent | K-open（决定模板区集） */
  @Column({ name: 'essence_type', type: 'varchar' })
  essenceType!: string

  /** 模板区集 JSON：[{ key, title?, style?, md, folded? }]（related 区不落库，由关系派生） */
  @Column({ name: 'sections', type: 'text' })
  sections!: string

  /** 相关著作 JSON 可空：[{ kind, title, authors?, year?, url?, note }] */
  @Column({ name: 'works', type: 'text', nullable: true })
  works!: string | null

  /** 由 sections 派生的整篇 md（兼容/导出用） */
  @Column({ name: 'content_md', type: 'text', nullable: true })
  contentMd!: string | null

  /** 证据来源摘要 JSON：[{ kind, title, url?|kbDocId?, quote? }] */
  @Column({ name: 'evidence_sources', type: 'text', nullable: true })
  evidenceSources!: string | null

  /**
   * 讲义设计规格 JSON（DlLessonSpec；2026-09-14 讲义流水线）。
   * 记录「本卡是照哪份已确认规格写的」：渲染层据此出规格条与区导航，
   * 区级重写据此重发规格锁。老卡为 NULL，照常按 sections 渲染。
   */
  @Column({ name: 'spec', type: 'text', nullable: true })
  spec!: string | null

  /** 版本号（同一概念新讲义 +1） */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number

  /** draft | published */
  @Column({ name: 'status', type: 'varchar', default: 'draft' })
  status!: string

  /** 内部核验 JSON（DlCardVerification；M4-UX2 后端自动核验，不向用户展示） */
  @Column({ name: 'verification', type: 'text', nullable: true })
  verification!: string | null

  /** 修订说明（人类可读：改了什么/为什么/依据；2026-09-15 版本管理 P1-1） */
  @Column({ name: 'revision_note', type: 'text', nullable: true })
  revisionNote!: string | null

  /** 变更来源：agent | restore | template | manual（2026-09-15 版本管理 P1-1） */
  @Column({ name: 'change_source', type: 'varchar', nullable: true })
  changeSource!: string | null

  /** 结构化变更清单 JSON：[{key,kind,reason,evidence}]（对接技能 learning-lesson-updater 输出） */
  @Column({ name: 'changed_json', type: 'text', nullable: true })
  changedJson!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
