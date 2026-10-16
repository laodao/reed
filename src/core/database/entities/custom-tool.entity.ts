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

  @Column({ name: 'kind', type: 'varchar' })
  kind!: string

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

  @Column({ name: 'command', type: 'varchar', nullable: true })
  command!: string | null

  @Column({ name: 'args_template', type: 'varchar', nullable: true })
  argsTemplate!: string | null

  @Column({ name: 'cwd', type: 'varchar', nullable: true })
  cwd!: string | null

  @Column({ name: 'timeout_ms', type: 'int', nullable: true })
  timeoutMs!: number | null

  @Column({ name: 'stdout_type', type: 'varchar', nullable: true })
  stdoutType!: string | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
