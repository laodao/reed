import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

/**
 * 人像提示词模板 Entity
 * 对齐 portrait_prompt_templates 表 DDL。
 *
 * Quirk：created_at / updated_at 是 Date（DTO 字段是 epoch ms number）。
 * apply_to 用 simple-json（SQLite 存 JSON 字符串 / PG 存 text），
 * 与 portrait_variants.config 现有做法一致。
 */
@Entity({ name: 'portrait_prompt_templates' })
@Index('idx_portrait_prompt_templates_category', ['category'])
export class PortraitPromptTemplateEntity {
  /**
   * 所属用户 ID（多租户隔离）。Web 端通过 ALS 注入，Electron 端单用户为 null。
   */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  @Column({ name: 'name', type: 'varchar' })
  name!: string

  @Column({ name: 'category', type: 'varchar' })
  category!: string

  @Column({ name: 'content', type: 'text' })
  content!: string

  @Column({ name: 'apply_to', type: 'simple-json', nullable: true })
  applyTo!: string[] | null

  @Column({ name: 'builtin', type: 'boolean', default: false })
  builtin!: boolean

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number

  @Column({ name: 'created_at', type: Date })
  createdAt!: Date

  @Column({ name: 'updated_at', type: Date })
  updatedAt!: Date
}
