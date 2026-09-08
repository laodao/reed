import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 领域学习空间 Entity（dl_project，design-v3 §9）
 *
 * 一个 dl_project = 一个「领域共学空间」：学习单元是知识点（非课程），
 * 领域知识体系（概念树 + 关系图 + 掌握度）都挂在 project 之下。
 * 多租户：user_id 由 BaseRepository.scoped 按 ALS 注入/过滤。
 */
@Entity({ name: 'dl_project' })
@Index('idx_dl_project_user', ['userId'])
@Index('idx_dl_project_status', ['status'])
export class DlProjectEntity {
  /** 所属用户 ID（多租户隔离）。Web 端 ALS 注入，Electron 单用户为 null */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 领域名（展示名） */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 学习目标：入门 | 工作应用 | 前沿（design.md v2 §5.1） */
  @Column({ name: 'goal', type: 'varchar' })
  goal!: string

  /** 领域画像预设 id（T1~T7；可空 = 自定义画像走 profileJson） */
  @Column({ name: 'profile_id', type: 'varchar', nullable: true })
  profileId!: string | null

  /** 自定义画像 JSON（design-v3 §4.4：kindLabel/nature/emphasis 等；为空则用预设） */
  @Column({ name: 'profile_json', type: 'text', nullable: true })
  profileJson!: string | null

  /** 空间状态：active | paused | archived */
  @Column({ name: 'status', type: 'varchar', default: 'active' })
  status!: string

  /** 一句话描述 */
  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  /** 绑定的项目知识库 id（kb 包；资料全文落知识库，evidence 只存摘要） */
  @Column({ name: 'kb_id', type: 'varchar', nullable: true })
  kbId!: string | null

  /** 默认模型 JSON：{ providerConfigId?, modelId? } */
  @Column({ name: 'default_model', type: 'text', nullable: true })
  defaultModel!: string | null

  /** 周期推进配置 JSON（DlPaceSettings；M2-C；可空 = 默认关闭） */
  @Column({ name: 'pace_settings', type: 'text', nullable: true })
  paceSettings!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
