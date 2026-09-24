import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * 知识大脑·实体 Entity（kb_entities，详细设计 §1.2）
 *
 * L2 网络层节点：从论断 mention 中解析出的实体（人物/地点/概念/情节母题/设定体系…），
 * 带演化摘要（随新证据重写，非追加）。合并用软删（status=merged + target 指针），
 * 边与挂点由 merge 时改指，不物理删。
 */

/** 实体合并状态：active=规范实体；merged=已并入 target_entity_id 指向的规范实体 */
export type KbEntityStatus = 'active' | 'merged'

/** 摘要生成状态（复用章节摘要的调度语义：pending→done/failed，failed 可重试） */
export type KbEntitySummaryStatus = 'pending' | 'done' | 'failed'

@Entity({ name: 'kb_entities' })
@Unique('uq_kb_entities_kb_name', ['knowledgeBaseId', 'name'])
@Index('idx_kb_entities_kb_type', ['knowledgeBaseId', 'entityType'])
export class KbEntityEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  /** 规范名 */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 别名 JSON 数组（消歧合并的产物） */
  @Column({ name: 'aliases', type: 'text', default: '[]' })
  aliases!: string

  /** 自由词表（人物|地点|组织|概念|plot-motif|setting-system|…），分类是独立步骤 */
  @Column({ name: 'entity_type', type: 'varchar', default: 'concept' })
  entityType!: string

  /** 演化摘要（Zep 模式：随新证据重写；代谢整固时凝练=要义强化） */
  @Column({ name: 'summary', type: 'text', nullable: true })
  summary!: string | null

  @Column({ name: 'summary_status', type: 'varchar', default: 'pending' })
  summaryStatus!: KbEntitySummaryStatus

  @Column({ name: 'status', type: 'varchar', default: 'active' })
  status!: KbEntityStatus

  /** merged 时指向规范实体 */
  @Column({ name: 'target_entity_id', type: 'varchar', nullable: true })
  targetEntityId!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
