import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 信息搜集「项目」Entity（ic_projects，2026-10-07 设计落地）
 *
 * 蓝图（docs/design/2026-10-07-info-collection-design.md §2.3 / storage §2）：
 * 项目 = 一个长期资料分区 + 当前生效的采集蓝图。蓝图是运行时 AI 对主题现场
 * 起草的计划（快速模式自动确认 / 精调模式人审），**不是预制配置**——
 * 锁定后执行期不可变，改蓝图 = blueprint_version+1 = 允许重跑。
 *
 * 内容不在本表：清洗正文与整理产出落知识库（项目 kb_id 对应），
 * ic_* 只存过程治理元数据（v2 设计裁决：内容唯一存储在 kb）。
 */
@Entity({ name: 'ic_projects' })
@Index('idx_ic_projects_user', ['userId'])
@Index('idx_ic_projects_user_status', ['userId', 'status'])
export class IcProjectEntity {
  /** 所属用户 ID（多租户隔离） */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 主题与边界描述（澄清后的 goal + assumptions 已并入蓝图） */
  @Column({ name: 'goal', type: 'text' })
  goal!: string

  /** 当前生效蓝图 JSON（IcBlueprint） */
  @Column({ name: 'blueprint_json', type: 'text' })
  blueprintJson!: string

  /** 当前蓝图版本（改蓝图 = +1 = 允许重跑） */
  @Column({ name: 'blueprint_version', type: 'integer', default: 1 })
  blueprintVersion!: number

  /** 项目对应的知识库 id（清洗正文与整理产出的唯一内容存储） */
  @Column({ name: 'kb_id', type: 'varchar', nullable: true })
  kbId!: string | null

  /** 刷新策略 JSON（IcRefreshPolicy：manual | cron） */
  @Column({ name: 'refresh_policy_json', type: 'text', nullable: true })
  refreshPolicyJson!: string | null

  /** active | archived */
  @Column({ name: 'status', type: 'varchar', default: 'active' })
  status!: string

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
