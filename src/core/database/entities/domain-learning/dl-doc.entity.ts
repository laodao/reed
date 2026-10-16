import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 领域学习文档型内容 Entity（dl_doc，design-v3 §9）
 *
 * 非排程单元：导读（intro，每领域一篇伴读）/ 分支总览（review）/ 手册（manual）。
 * concept_ids 引用涉及概念，便于页面跳转讲义。学习单元=概念，本表不参与排程。
 */
@Entity({ name: 'dl_doc' })
@Index('idx_dl_doc_user', ['userId'])
@Index('idx_dl_doc_project_type', ['projectId', 'docType'])
export class DlDocEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** intro | review | manual */
  @Column({ name: 'doc_type', type: 'varchar' })
  docType!: string

  @Column({ name: 'title', type: 'varchar' })
  title!: string

  /** 涉及概念 id 列表 JSON */
  @Column({ name: 'concept_ids', type: 'text', nullable: true })
  conceptIds!: string | null

  /** 正文 markdown */
  @Column({ name: 'content_md', type: 'text', nullable: true })
  contentMd!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'published_at', type: Date, nullable: true })
  publishedAt!: Date | null
}
