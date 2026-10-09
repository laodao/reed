import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 领域学习概念节点 Entity（dl_concept，design-v3 §9）
 *
 * 树与图共享本表：node_type='group' 的是目录（大纲树节点，非知识），
 * 其余（concept/theory/method/paper/regulation/case/...）为知识节点。
 * parent_id 指向树父（group 目录）；图（关系边）在 dl_relation。
 * 两个正交维度：research_state（研究引擎维护）× mastery（仅用户行为推进）。
 */
@Entity({ name: 'dl_concept' })
@Index('idx_dl_concept_user', ['userId'])
@Index('idx_dl_concept_project_parent', ['projectId', 'parentId'])
@Index('idx_dl_concept_project_type', ['projectId', 'nodeType'])
export class DlConceptEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  /** 节点类型（§4.2 枚举；'group' = 目录/大纲树节点，非知识节点） */
  @Column({ name: 'node_type', type: 'varchar' })
  nodeType!: string

  /** 概念/术语名（树同级唯一：project + parent 下不重名） */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 英文术语（可空） */
  @Column({ name: 'en', type: 'varchar', nullable: true })
  en!: string | null

  /** 树父 id（null = 根 group） */
  @Column({ name: 'parent_id', type: 'varchar', nullable: true })
  parentId!: string | null

  /** 一句话定义（地图悬停用，可空） */
  @Column({ name: 'definition_short', type: 'text', nullable: true })
  definitionShort!: string | null

  /** 研究状态：未研究 | 研究中 | 已提炼 | 待验证 | 存疑（研究引擎维护） */
  @Column({ name: 'research_state', type: 'varchar', default: 'unresearched' })
  researchState!: string

  /** 掌握度：未接触 | 学习中 | 已理解 | 需复习（仅用户行为推进） */
  @Column({ name: 'mastery', type: 'varchar', default: 'untouched' })
  mastery!: string

  /** 来源：资料 | ai_verified | 人工 */
  @Column({ name: 'source', type: 'varchar', default: 'material' })
  source!: string

  /** 类型专属扩展字段 JSON（如法规效力/施行日期、论文年份/组织） */
  @Column({ name: 'attrs', type: 'text', nullable: true })
  attrs!: string | null

  /** 当前概念讲义 dl_card id（一概念至多一篇当前版，可空） */
  @Column({ name: 'card_id', type: 'varchar', nullable: true })
  cardId!: string | null

  /** 备注 */
  @Column({ name: 'note', type: 'text', nullable: true })
  note!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
