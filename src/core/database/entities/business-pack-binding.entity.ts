import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 业务包绑定 Entity（business_pack_bindings 表）
 *
 * 一行 = 某包对某用户（或全局）的启用/配置覆写。
 * user_id NULL = 全局默认行（PC 单用户即此形态）；非 NULL = per-user 覆写。
 *
 * 主键说明：user_id 可空，无法做联合主键（TypeORM 主键列不可 nullable；
 * 且 SQLite/PG 的 UNIQUE 约束都把 NULL 视为互不相等，挡不住重复全局行），
 * 故用确定性代理主键 id = `${packId}#${userId ?? '@global'}`，
 * 全局行唯一性由迁移里的表达式唯一索引 (pack_id, COALESCE(user_id,'')) 保证。
 *
 * 多租户：全局行不属于任何租户。PackBindingRepository 构造里 useRawRepo()
 * 关闭 ALS 自动过滤，user_id 语义由仓储方法显式处理（见仓储注释）。
 */
@Entity({ name: 'business_pack_bindings' })
@Index('idx_bpb_pack', ['packId'])
export class BusinessPackBindingEntity {
  /** 确定性代理主键：${packId}#${userId ?? '@global'}（upsert 幂等友好） */
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'pack_id', type: 'varchar' })
  packId!: string

  /** NULL = 全局默认行；非 NULL = 该用户的覆写行 */
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  /** 1=启用 0=禁用 */
  @Column({ name: 'enabled', type: 'integer', default: 1 })
  enabled!: number

  /** 用户级覆写配置 JSON（本期留位，无字段消费） */
  @Column({ name: 'config_json', type: 'text', nullable: true })
  configJson!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
