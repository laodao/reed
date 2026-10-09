import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 领域学习关系边 Entity（dl_relation，design-v3 §9）
 *
 * 概念图 = dl_concept 节点 + 本表有向边。relation_type 分层：
 * 概念-概念（前置依赖/特例/包含/对比/因果）、概念-载体（定义出自/方法应用了/受…约束）、
 * 载体-载体（论文引用/标准兼容/规范更新）。
 * 「前置依赖」边（source→target）驱动学习门控；其余供 Atlas 呈现与 related 区派生。
 */
@Entity({ name: 'dl_relation' })
@Index('idx_dl_relation_user', ['userId'])
@Index('idx_dl_relation_project_source', ['projectId', 'sourceId'])
@Index('idx_dl_relation_project_target', ['projectId', 'targetId'])
export class DlRelationEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** 起点节点（被依赖/被约束方语义依 relation_type 而定） */
  @Column({ name: 'source_id', type: 'varchar' })
  sourceId!: string

  /** 终点节点 */
  @Column({ name: 'target_id', type: 'varchar' })
  targetId!: string

  /** 关系类型（§4.2 关系枚举；'前置依赖' 等中文值 or 英文 key 见 domain-learning.types） */
  @Column({ name: 'relation_type', type: 'varchar' })
  relationType!: string

  /** 证据/来源说明（可空：AI 抽取建议待人工确认时为空） */
  @Column({ name: 'evidence', type: 'text', nullable: true })
  evidence!: string | null

  /** 是否已验证（0/1；地图人审/人工确认后置 1） */
  @Column({ name: 'verified', type: 'integer', default: 0 })
  verified!: number

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
