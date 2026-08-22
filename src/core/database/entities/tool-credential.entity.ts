import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 第三方凭据 Entity（api_key 密文存 api_key_enc，绝不明文）
 */
@Entity({ name: 'tool_credentials' })
export class ToolCredentialEntity {
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'api_key_enc', type: 'varchar' })
  apiKeyEnc!: string

  @Column({ name: 'base_url', type: 'varchar', nullable: true })
  baseUrl!: string | null

  @Column({ name: 'created_at', type: 'datetime', nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  updatedAt!: Date | null
}
