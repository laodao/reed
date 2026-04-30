import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * 设置表 Entity
 * 对齐 src/electron/database/index.ts 中现有 settings 表 DDL：
 *   key TEXT PRIMARY KEY,
 *   value TEXT NOT NULL,
 *   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
 */
@Entity({ name: 'settings' })
export class SettingsEntity {
  @PrimaryColumn({ name: 'key', type: 'varchar' })
  key!: string

  @Column({ name: 'value', type: 'text' })
  value!: string

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
