import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 立绘角色 Entity
 * 对齐现有 portrait_characters 表 DDL（含 FOREIGN KEY 到 portrait_projects）。
 *
 * Quirk：created_at/updated_at 是 epoch ms 数字（DTO 字段也是 number），
 *        Entity 仍用 type: Date，转换在 Repository toDto 处理。
 */
@Entity({ name: 'portrait_characters' })
@Index('idx_portrait_characters_project_id', ['projectId'])
@Index('idx_portrait_characters_created_at', ['createdAt'])
export class PortraitCharacterEntity {
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

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'gender', type: 'varchar', default: 'male' })
  gender!: string

  @Column({ name: 'age', type: 'integer', default: 25 })
  age!: number

  @Column({ name: 'height', type: 'integer', default: 170 })
  height!: number

  @Column({ name: 'weight', type: 'integer', default: 65 })
  weight!: number

  @Column({ name: 'race', type: 'varchar', default: 'asian' })
  race!: string

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null

  @Column({ name: 'prompt', type: 'text', nullable: true })
  prompt!: string | null

  @Column({ name: 'reference_images', type: 'simple-json', nullable: true })
  referenceImages!: string[] | null

  @Column({ name: 'provider_id', type: 'text', nullable: true })
  providerId!: string | null

  @Column({ name: 'model_id', type: 'text', nullable: true })
  modelId!: string | null

  @Column({ name: 'config', type: 'simple-json', nullable: true })
  config!: Record<string, unknown> | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
