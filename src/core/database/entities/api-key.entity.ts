import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'

/**
 * API 密钥表 Entity
 * 对齐 src/electron/database/index.ts 中现有 api_keys 表 DDL：
 *   provider TEXT PRIMARY KEY,
 *   encrypted_key TEXT NOT NULL,
 *   endpoint TEXT,
 *   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 *   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
 */
@Entity({ name: 'api_keys' })
export class ApiKeyEntity {
  @PrimaryColumn({ name: 'provider', type: 'varchar' })
  provider!: string

  @Column({ name: 'encrypted_key', type: 'text' })
  encryptedKey!: string

  @Column({ name: 'endpoint', type: 'text', nullable: true })
  endpoint!: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
