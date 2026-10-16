import { Column, Entity, PrimaryColumn, Unique, Index} from 'typeorm'

/**
 * LW 项目步骤模型配置 Entity
 * created_at/updated_at 是 INTEGER（epoch ms）。
 */
@Entity({ name: 'lw_project_model_configs' })
@Unique('uq_lw_project_model_configs', ['projectId', 'stage'])
export class LwProjectModelConfigEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'project_id', type: 'varchar' })
  projectId!: string

  @Column({ name: 'stage', type: 'varchar' })
  stage!: string

  @Column({ name: 'provider_config_id', type: 'varchar' })
  providerConfigId!: string

  @Column({ name: 'model_id', type: 'varchar' })
  modelId!: string

  @Column({
    name: 'created_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  createdAt!: number

  @Column({
    name: 'updated_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  updatedAt!: number
}
