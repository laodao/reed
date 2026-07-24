import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 立绘变体 Entity
 * 对齐现有 portrait_variants 表 DDL（FK CASCADE 到 portrait_characters）。
 *
 * Quirk：created_at 是 epoch ms（DTO 字段也是 number）。
 */
@Entity({ name: 'portrait_variants' })
@Index('idx_portrait_variants_character_id', ['characterId'])
@Index('idx_portrait_variants_type', ['type'])
@Index('idx_portrait_variants_created_at', ['createdAt'])
export class PortraitVariantEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   * BaseRepository 在所有查询 / 写入前注入 WHERE user_id 与默认 user_id 值。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'character_id', type: 'varchar' })
  characterId!: string

  @Column({ name: 'type', type: 'varchar' })
  type!: string

  @Column({ name: 'parent_id', type: 'text', nullable: true })
  parentId!: string | null

  @Column({ name: 'angle', type: 'varchar' })
  angle!: string

  @Column({ name: 'framing', type: 'varchar', nullable: true })
  framing!: string | null

  @Column({ name: 'image_path', type: 'text' })
  imagePath!: string

  @Column({ name: 'prompt', type: 'text' })
  prompt!: string

  @Column({ name: 'config', type: 'simple-json', nullable: true })
  config!: Record<string, unknown> | null

  @Column({ name: 'variant_info', type: 'simple-json', nullable: true })
  variantInfo!: Record<string, unknown> | null

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date
}
