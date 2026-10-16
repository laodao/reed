/**
 * 信息来源类别 Entity（设置界面「信息来源」的顶层：一个类别 = 一个 tab）
 * @module core/database/entities/info-source-category.entity
 * @description 内置类别（user_id=NULL + is_builtin=1，如「新闻来源」）全局共享、禁删禁改；
 *              用户可新增任意类别（金融/物理/数学……），也可改名、删除（级联删分组与来源）。
 */

import { Column, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity({ name: 'info_source_categories' })
@Index('idx_info_source_categories_user', ['userId'])
export class InfoSourceCategoryEntity {
  /** 多租户隔离（BaseRepository 自动注入；PC 单用户为 null） */
  @Index()
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId!: string | null

  @PrimaryColumn({ name: 'id', type: 'varchar' })
  id!: string

  /** 类别显示名（如 新闻来源 / 金融信息来源） */
  @Column({ name: 'name', type: 'varchar' })
  name!: string

  /** 内置类别（1=user_id NULL 全局共享，禁删禁改；0=用户自有） */
  @Column({ name: 'is_builtin', type: 'integer', default: 0, nullable: true })
  isBuiltin!: number | null

  /** 排序权重（升序；内置类别恒在前） */
  @Column({ name: 'sort_order', type: 'integer', default: 0, nullable: true })
  sortOrder!: number | null

  @Column({ name: 'created_at', type: Date, nullable: true })
  createdAt!: Date | null

  @Column({ name: 'updated_at', type: Date, nullable: true })
  updatedAt!: Date | null
}
