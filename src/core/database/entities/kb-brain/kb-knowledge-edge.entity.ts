import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * 知识大脑·语义边 Entity（kb_knowledge_edges，详细设计 §1.3）
 *
 * L2 网络层边：论断/卡片/实体之间的带类型连线（支持/反驳/细化/示例/同指/
 * 前置/适用/导致/实例）。每条边必须带 evidence（"为什么相关"一句话）——
 * Zettelkasten 铁律：无理由的链接不许存在。
 */

export type KbEdgeNodeKind = 'atom' | 'note' | 'entity'

export type KbEdgeRelation =
  | 'supports'
  | 'refutes'
  | 'refines'
  | 'exemplifies'
  | 'same-as'
  | 'depends-on'
  | 'applies-to'
  /** 事件时序/因果边（情节链骨架，模式归纳的原料） */
  | 'leads-to'
  /** 论断 ↔ 模式卡（该论断是某情节/设定模式的一个实例证据） */
  | 'instance-of'
  /** 伏笔线：source=埋设（承诺），target=回收（兑现）——跨距的作者技法层呼应，与 leads-to 的情节内因果区分 */
  | 'sets-up'
  /** 体系层级（v3 M2 体系树）：source 是 target 的下层/下位（炼气→筑基方向的 requires 区分依赖） */
  | 'sublevel-of'
  /** 体系前置依赖（v3 M2）：突破/解锁 target 需要 source（筑基 requires 炼气圆满） */
  | 'requires'
  /** 体系解锁（v3 M2）：达成 source 解锁 target 的能力/权限 */
  | 'enables'
  /** 实体世界关系（P2 图谱：滚动记忆抽取，source/target 均为 entity） */
  | 'member-of'
  | 'located-in'
  | 'owns'
  | 'wields'
  | 'allied-with'
  | 'enemy-of'
  | 'kin-of'
  | 'mentor-of'
  | 'relates'

@Entity({ name: 'kb_knowledge_edges' })
@Unique('uq_kb_edges_unique', ['sourceKind', 'sourceId', 'relation', 'targetKind', 'targetId'])
@Index('idx_kb_edges_src', ['sourceKind', 'sourceId'])
@Index('idx_kb_edges_tgt', ['targetKind', 'targetId'])
export class KbKnowledgeEdgeEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  @Column({ name: 'source_kind', type: 'varchar' })
  sourceKind!: KbEdgeNodeKind

  @Column({ name: 'source_id', type: 'varchar' })
  sourceId!: string

  @Column({ name: 'relation', type: 'varchar' })
  relation!: KbEdgeRelation

  @Column({ name: 'target_kind', type: 'varchar' })
  targetKind!: KbEdgeNodeKind

  @Column({ name: 'target_id', type: 'varchar' })
  targetId!: string

  /** 「为什么相关」一句话，必填 */
  @Column({ name: 'evidence', type: 'text' })
  evidence!: string

  @Column({ name: 'confidence', type: 'float', default: 0.7 })
  confidence!: number

  @Column({ name: 'origin', type: 'varchar', default: 'ai' })
  origin!: 'ai' | 'human'

  /** 0/1，人审后置 1（Tana proposal 模型） */
  @Column({ name: 'verified', type: 'integer', default: 0 })
  verified!: number

  /** 关系生效起始章（v3 M2 章节区间有效性；NULL=未观察起点/始终有效） */
  @Column({ name: 'valid_from_chapter', type: 'integer', nullable: true })
  validFromChapter!: number | null

  /** 关系失效章（v3 M2：结盟→反目；NULL=未观察终点/仍然有效） */
  @Column({ name: 'valid_until_chapter', type: 'integer', nullable: true })
  validUntilChapter!: number | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
