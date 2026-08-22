import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 自定义工具 Entity（请求定义 + 参数 schema，JSON 列序列化）
 */
@Entity({ name: 'custom_tools' })
export class CustomToolEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'description', type: 'varchar', nullable: true })
  description!: string | null

  @Column({ name: 'method', type: 'varchar' })
  method!: string

  @Column({ name: 'url', type: 'varchar' })
  url!: string

  @Column({ name: 'headers_json', type: 'varchar' })
  headersJson!: string

  @Column({ name: 'params_schema_json', type: 'varchar' })
  paramsSchemaJson!: string

  @Column({ name: 'auth_type', type: 'varchar' })
  authType!: string

  @Column({ name: 'credential_id', type: 'varchar', nullable: true })
  credentialId!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
