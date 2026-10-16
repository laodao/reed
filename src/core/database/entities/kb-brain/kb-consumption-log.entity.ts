import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 知识大脑·消费记账（v3 M3，方案 §9.4）
 *
 * agent 调用大脑取知识的入账——「第一用户是 AI」的可观测性底座：
 * 消化率仪表的「被 agent 用了多少」维度、真机端到端验收的证据源。
 * 只增不改（追加账），失败不阻断消费主链路。
 */
@Entity({ name: 'kb_consumption_log' })
@Index('idx_kb_consumption_kb', ['knowledgeBaseId'])
@Index('idx_kb_consumption_time', ['createdAt'])
export class KbConsumptionLogEntity {
  /** 所属用户 ID（多租户隔离；scoped 自动注入） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'knowledge_base_id', type: 'varchar' })
  knowledgeBaseId!: string

  /** 消费通路：tool=kb_brain_query 工具 / writing=写作工具 / provider=装配注入 */
  @Column({ name: 'tool', type: 'varchar' })
  tool!: string

  /** 取包模式：outline（写前）/ scene（写中）/ flat（平铺回退） */
  @Column({ name: 'mode', type: 'varchar' })
  mode!: string

  /** 场面类型（写中取材时服务端推断结果；写前为空） */
  @Column({ name: 'scene_type', type: 'varchar', nullable: true })
  sceneType!: string | null

  /** 任务描述节选（≤120 字，审计用） */
  @Column({ name: 'task_excerpt', type: 'varchar', default: '' })
  taskExcerpt!: string

  /** 知识包字符数（0=空包/回退） */
  @Column({ name: 'pack_chars', type: 'integer', default: 0 })
  packChars!: number

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null
}
