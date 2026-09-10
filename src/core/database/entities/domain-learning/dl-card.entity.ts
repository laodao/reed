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

  /** 版本号（同一概念新讲义 +1） */
  @Column({ name: 'version', type: 'integer', default: 1 })
  version!: number

  /** draft | published */
  @Column({ name: 'status', type: 'varchar', default: 'draft' })
  status!: string

  /** 内部核验 JSON（DlCardVerification；M4-UX2 后端自动核验，不向用户展示） */
  @Column({ name: 'verification', type: 'text', nullable: true })
  verification!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
