import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * OSS 配置 Entity
 * 表由 Repository.initTable() 创建（不在 DatabaseManager.initTables 中）。
 * Quirk: created_at / updated_at 是 INTEGER（epoch ms 数字）。
 */
@Entity({ name: 'oss_configs' })
export class OSSConfigEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'provider', type: 'varchar' })
  provider!: string

  @Column({ name: 'access_key_id', type: 'text' })
  accessKeyId!: string

  @Column({ name: 'access_key_secret', type: 'text' })
  accessKeySecret!: string

  @Column({ name: 'region', type: 'varchar' })
  region!: string

  @Column({ name: 'bucket', type: 'varchar' })
  bucket!: string

  @Column({ name: 'endpoint', type: 'text', nullable: true })
  endpoint!: string | null

  @Column({ name: 'custom_domain', type: 'text', nullable: true })
  customDomain!: string | null

  @Column({ name: 'path_prefix', type: 'text', nullable: true })
  pathPrefix!: string | null

  @Column({ name: 'is_enabled', type: 'integer', default: 1 })
  isEnabled!: number

  @Column({ name: 'is_default', type: 'integer', default: 0 })
  isDefault!: number

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
