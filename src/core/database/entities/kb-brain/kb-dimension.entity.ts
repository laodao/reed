import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm'

/**
 * 知识大脑·提炼维度库（v3 M1）
 *
 * 维度=提取与归纳的「镜头」——不写死五项诉求，维度从语料归纳生长（schema induction）。
 * 维度库是数据不是代码：加维度不改产线；每库启用自己的维度集（enabled）。
 * source：seed=预置种子（开库即有）/ induced=从语料归纳建议（默认停用待用户启用）/
 * human=用户手填。
 */
@Entity({ name: 'kb_dimensions' })
@Index('idx_kb_dimensions_kb', ['knowledgeBaseId'])
@Unique('uq_kb_dimensions_name', ['knowledgeBaseId', 'name'])
export class KbDimensionEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  /** 维度名（短，如「升级节奏」「对话潜台词」） */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 一句话定义：这个维度看什么 */
  @Column({ name: 'definition', type: 'text', default: '' })
  definition!: string

  /** 提取/归纳 hint：按这个维度归纳时看什么、问什么（注入冶炼提示词） */
  @Column({ name: 'hint', type: 'text', default: '' })
  hint!: string

  @Column({ name: 'enabled', type: 'integer', default: 1 })
  enabled!: number

  @Column({ name: 'source', type: 'varchar', default: 'seed' })
  source!: 'seed' | 'induced' | 'human'

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
