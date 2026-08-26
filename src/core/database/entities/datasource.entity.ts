import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * 数据源（第三方数据库连接）Entity
 * 表由 DataSourceRepository.initTable() 创建（同 oss_configs 模式）。
 * 安全：password_enc 是 SecureStorage 加密后的密文，绝不明文落库。
 */
@Entity({ name: 'data_sources' })
export class DataSourceEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 驱动类型：postgres / mysql / sqlserver / clickhouse */
  @Column({ name: 'driver', type: 'varchar' })
  driver!: string

  @Column({ name: 'host', type: 'varchar' })
  host!: string

  @Column({ name: 'port', type: 'integer' })
  port!: number

  @Column({ name: 'database', type: 'varchar' })
  database!: string

  @Column({ name: 'username', type: 'varchar', nullable: true })
  username!: string | null

  /** SecureStorage 加密后的密码密文 */
  @Column({ name: 'password_enc', type: 'text', nullable: true })
  passwordEnc!: string | null

  @Column({ name: 'ssl', type: 'integer', default: 0 })
  ssl!: number

  @Column({ name: 'is_enabled', type: 'integer', default: 1 })
  isEnabled!: number

  @Column({
    name: 'created_at',
    type: 'bigint',
    transformer: {
      to: (v: number | string) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  createdAt!: number

  @Column({
    name: 'updated_at',
    type: 'bigint',
    transformer: {
      to: (v: number | string) => v,
      from: (v: number | string | null) => (v == null ? 0 : Number(v)),
    },
  })
  updatedAt!: number
}
